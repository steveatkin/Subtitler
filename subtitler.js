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
                    return 'Enter the BCP source language code or customization id';
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
                return callback(err, filename, answers.source);
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
        model = 'js-JP_BroadbandModel';
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
        smart_formatting: true
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

function formatSubtitles(resultsArray) {
    var srtJSON = [];

    for (var i = 0; i < resultsArray.length; ++i) {
        var result = resultsArray[i].results[0];

        var alternatives = result.alternatives;
        var timeStamps = alternatives[0].timestamps;
        var textItem = alternatives[0].transcript;
        var confidence = alternatives[0].confidence;

        if (confidence > 0.0) {

            var subtitle = {
                'id': '0',
                'startTime': '',
                'endTime': '',
                'text': ''
            };

            subtitle.id = String(i + 1);
            subtitle.text = textItem;
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
        }

    }
    return srtJSON;
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

    processVideo(function (err, filename, source) {
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
                    var srtJSON = formatSubtitles(response);
                    // Take the JSON objects and write them in SRT format
                    var srtSubs = parser.toSrt(srtJSON);
                    files.write(files.name(filename) + '.srt', srtSubs);
                    console.log('Finished generating subtitles file: ' + files.name(filename) + '.srt');
                }
            });
        }
    });


} else {
    console.log(chalk.red('Speech to text credentials missing'));
}