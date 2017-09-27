#!/usr/bin/env node

/*	
 * Copyright IBM Corp. 2017
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var chalk = require('chalk');
var clear = require('clear');
var CLI = require('clui');
var figlet = require('figlet');
var inquirer = require('inquirer');
var Spinner = CLI.Spinner;
var _ = require('lodash');
var files = require('./lib/files');
var optional = require('optional');
var ffmpeg = require('fluent-ffmpeg');
var moment = require('moment');
require("moment-duration-format");
var SpeechToTextV1 = require('watson-developer-cloud/speech-to-text/v1');
var trim = require('trim');

function processVideo(callback) {

    var argv = require('minimist')(process.argv.slice(2));

    var questions = [{
            name: 'filename',
            type: 'input',
            message: 'Enter the file name of the video:',
            default: argv._[0] || null,
            validate: function (value) {
                if (value.length) {
                    return true;
                } else {
                    return 'Please enter the file name of the video';
                }
            }
        },
        {
            name: 'source',
            type: 'input',
            message: 'Enter the BCP source language code or customization id:',
            default: argv._[1] || 'en',
            validate: function (value) {
                if (value.length) {
                    return true;
                } else {
                    return 'Please enter the BCP source language code or customization id';
                }
            },
        },
        {
            name: 'casing',
            type: 'list',
            message: 'Indicate whether subtitles should be sentence cased:',
            choices: ['yes', "no"],
            default: argv._[2] || 'yes',
            validate: function (value) {
                if (value.length) {
                    return true;
                } else {
                    return 'Please indicate whether the captions should be sentence cased';
                }
            },
        }
    ];

    inquirer.prompt(questions).then(function (answers) {
        var status = new Spinner(chalk.green('Extracting audio...'));
        status.start();

        extractAudio(answers.filename, function (err, filename) {
            if (err) {
                console.log(err.message);
                status.stop();
                return callback(err);
            } else {
                status.stop();
                return callback(err, filename, answers.source, answers.casing);
            }
        });

    });
}


function extractAudio(filename, callback) {
    var conversion_process =

        new ffmpeg({
            source: filename,
            timeout: 0
        }).withAudioCodec('libmp3lame')
        .withAudioBitrate(128)
        .withAudioChannels(2)
        .withAudioFrequency(44100)
        .withAudioQuality(5)
        .withAudioFilters('highpass=f=200', 'lowpass=f=3000')
        .toFormat('mp3')

        .on('start', function (commandLine) {
            console.log("Generating audio file from video");
        })

        .on('error', function (err, stdout, stderr) {
            return callback(err);
        })

        .on('progress', function (progress) {
            console.log(progress.percent.toFixed(0) + '%');
        })

        .on('end', function () {
            console.log("Finished generating audio file: " + files.name(filename) + '.mp3');
            return callback(null, files.name(filename) + '.mp3');
        })
        .saveToFile(files.name(filename) + '.mp3');
}

function getSubtitles(creds, filename, source, callback) {
    var speech_to_text = new SpeechToTextV1(creds.credentials);
    var model = '';
    var customization = '';

    if (source === 'en') {
        model = 'en-US_BroadbandModel';
    } else if (source === 'en-GB') {
        model = 'en-GB_BroadbandModel';
    } else if (source === 'ar') {
        model = 'ar-AR_BroadbandModel';
    } else if (source === 'es') {
        model = 'es-ES_BroadbandModel';
    } else if (source === 'fr') {
        model = 'fr-FR_BroadbandModel';
    } else if (source === 'ja') {
        model = 'ja-JP_BroadbandModel';
    } else if (source === 'pt-BR') {
        model = 'pt-BR_BroadbandModel';
    } else if (source === 'zh-Hans') {
        model = 'zh-CN_BroadbandModel';
    } else {
        customization = source;
    }

    var params = {
        content_type: 'audio/mp3; rate=44100',
        timestamps: true,
        continuous: true,
        interim_results: true,
        max_alternatives: 1,
        smart_formatting: false
    };

    if (model != '') {
        params.model = model;
        console.log("Using model: " + model);
    } else if (customization != '') {
        params.customization_id = customization;
        console.log("Using customization: " + customization);
    }

    var size = files.size(filename);
    console.log("Size of audio file: " + size);

    var status = new Spinner(chalk.green('Extracting subtitle line number: '));
    var results = [];

    var recognizeStream = speech_to_text.createRecognizeStream(params);

    files.stream(filename).pipe(recognizeStream);
    recognizeStream.setEncoding('utf8');

    status.start();

    recognizeStream.on('results', function (data) {
        if (data.results[0].final) {
            results.push(data);
            // Show the status as each subtitle is generated
            console.log(data.result_index + 1);
        }
    });

    recognizeStream.on('error', function (err) {
        status.stop()
        callback(err);
    });

    recognizeStream.on('close', function () {
        status.stop();
        callback(null, results);
    });

}

function countWords(s) {
    s = s.replace(/\n/g, ' '); // newlines to space
    s = s.replace(/(^\s*)|(\s*$)/gi, ''); // remove spaces from start + end
    s = s.replace(/[ ]{2,}/gi, ' '); // 2 or more spaces to 1
    return s.split(' ').length;
}

function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

function formatSubtitles(resultsArray, casing) {
    var srtJSON = [];
    var speechEvents = [];

    for (var i = 0; i < resultsArray.length; ++i) {
        var result = resultsArray[i].results[0];

        var alternatives = result.alternatives;
        var timeStamps = alternatives[0].timestamps;
        var textItem = alternatives[0].transcript;
        var confidence = alternatives[0].confidence;

        if (confidence > 0.0) {

            // This is used to record the raw speech events 
            var event = {
                'id': 0,
                'text': '',
                'words': []
            };

            // This used for the subtitles
            var subtitle = {
                'id': '0',
                'startTime': '',
                'endTime': '',
                'text': ''
            };

            event.id = String(i + 1);
            event.text = textItem;

            /* 
            We need to do a special check to see if there are multiple words in any of
            the timeStamps. We break them up into multiple words. 
            */

            var correctedTimeStamps = [];

            for (j = 0; j < timeStamps.length; ++j) {

                if (countWords(timeStamps[j][0]) == 1) {
                    correctedTimeStamps.push(timeStamps[j]);
                } else {
                    // grab each word and create a separate entry
                    var start = timeStamps[j][1];
                    var end = timeStamps[j][2];

                    var words = timeStamps[j][0].split(' ');
                    for (k = 0; k < words.length; ++k) {
                        correctedTimeStamps.push([words[k], start, end]);
                    }
                }
            }

            event.words = correctedTimeStamps;

            subtitle.id = String(i + 1);

            if (casing === 'yes') {
                subtitle.text = capitalizeFirstLetter(trim(textItem)) + '.';
            } else {
                subtitle.text = textItem;
            }
            // The timestamps entry is an array of 3 items ['word', 'start time', 'end time']

            // Get the start time for when the first word is spoken in the segment
            subtitle.startTime = moment.duration(timeStamps[0][1], 'seconds').format('hh:mm:ss,SSS', {
                trim: false
            });
            // Get the end time for when the last word is spoken in the segment
            subtitle.endTime = moment.duration(timeStamps[timeStamps.length - 1][2], 'seconds').format('hh:mm:ss,SSS', {
                trim: false
            });

            srtJSON.push(subtitle);
            speechEvents.push(event);
        }

    }
    return ({
        'subtitles': srtJSON,
        'events': speechEvents
    });
}

clear();
console.log(
    chalk.yellow(
        figlet.textSync('Subtitle Generator', {
            horizontalLayout: 'full'
        })
    )
);

if (files.fileExists('./speech-credentials.json')) {

    var creds = optional('./speech-credentials.json');

    processVideo(function (err, filename, source, casing) {
        if (err) {
            console.log("Failed to generate audio file from video");
        } else {
            getSubtitles(creds, filename, source, function (err, response) {
                if (err) {
                    console.log('Could not extract subtitles from audio file');
                    console.log(JSON.stringify(err, null, 2));
                } else {
                    console.log('Generating subtitles file');
                    var parser = require('subtitles-parser');
                    var speechData = formatSubtitles(response, casing);
                    // Take the JSON objects and write them in SRT format
                    var srtSubs = parser.toSrt(speechData.subtitles);
                    files.write(files.name(filename) + '.srt', srtSubs);
                    console.log('Finished generating subtitles file: ' + files.name(filename) + '.srt');

                    // Write out all the raw speech events
                    files.write(files.name(filename) + '_events.json', JSON.stringify(speechData.events, null, 2));
                    console.log('Finished generating speech events file: ' + files.name(filename) + '_Events.json');
                }
            });
        }
    });


} else {
    console.log(chalk.red('Speech to text credentials missing'));
}