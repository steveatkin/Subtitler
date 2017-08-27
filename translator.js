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
var gpClient = null;


function processSubtitles(callback) {
    var argv = require('minimist')(process.argv.slice(2));

    var questions = [{
            name: 'filename',
            type: 'input',
            message: 'Enter the name of the subtitle file',
            default: argv._[0] || null,
            validate: function (value) {
                if (value.length) {
                    return true;
                } else {
                    return 'Please enter the name of the subtitle file';
                }
            }
        }, {
            name: 'source',
            type: 'input',
            message: 'Enter the BCP source language code:',
            default: argv._[1] || 'en',
            validate: function (value) {
                if (value.length) {
                    return true;
                } else {
                    return 'Please enter the BCP source language code';
                }
            }
        },
        {
            name: 'target',
            type: 'input',
            message: 'Enter the BCP target language code:',
            default: argv._[2] || null,
            validate: function (value) {
                if (value.length) {
                    return true;
                } else {
                    return 'Please enter the BCP target language';
                }
            }
        },
        {
            name: 'direction',
            type: 'input',
            message: 'Enter upload or download',
            default: argv._[3] || 'upload',
            validate: function (value) {
                if (value.length) {
                    return true;
                } else {
                    return 'Please enter upload or download';
                }
            }
        }
    ];

    inquirer.prompt(questions).then(function (answers) {
        var parser = require('subtitles-parser');
        var status = new Spinner('Running Subtitle Translator...');
        var srt = '';
        var subtitles = '';
        status.start();

        try {
            srt = files.read(answers.filename);
            subtitles = parser.fromSrt(srt);
        }
        catch(err) {
            console.log(err.message);
            status.stop();
            return;
        }

        if (answers.direction === 'download') {
            var bundle = gpClient.bundle(answers.filename);
            bundle.getStrings({
                'languageId': answers.target
            }, function (err, result) {
                if (!err) {
                    var translation = result.resourceStrings;
                    for (var i = 0; i < subtitles.length; ++i) {
                        subtitles[i].text = translation[subtitles[i].id];
                    }
                    // Write the translated subtitles 
                    var translatedSubs = parser.toSrt(subtitles);

                    files.write(files.name(answers.filename) +
                        '_' + answers.target + files.ext(answers.filename),
                        translatedSubs);

                    status.stop();

                    return callback(null, 'Translated subtitles file created');
                } else {
                    err.msg = 'Could not get the translated subtitles';
                    status.stop();
                    return callback(err);
                }
            });
        }
        // upload for translation 
        else if(answers.direction === 'upload'){
            // Get the list of bundles from the pipeline service

            gpClient.bundles({}, function (err, bundles) {
                if (!err) {
                    var keys = Object.keys(bundles);
                    // see if the bundle is in the map
                    if (keys.includes(answers.filename)) {
                        // Make sure the target language is available
                        var bundle = bundles[answers.filename];
                        bundle.update({
                            'targetLanguages': [answers.target]
                        }, function (err, data) {
                            // Translate the subtitles
                            if (!err) {
                                var content = {};

                                // Check the number of subtitles, must be less than 1000
                                if(subtitles.length > 1000) {
                                    err.msg = 'Too many subtitles in the file, must be less than 1000';
                                    status.stop();
                                    return callback(err);
                                }

                                for (var i = 0; i < subtitles.length; ++i) {
                                    content[subtitles[i].id] = subtitles[i].text;
                                }

                                bundle.uploadStrings({
                                    'languageId': answers.source,
                                    'strings': content
                                }, function (err, results) {
                                    if (!err) {
                                        status.stop();
                                        return callback(null, 'Subtitles uploaded for translation');
                                    }
                                });
                            } else {
                                err.msg = 'Subtitles could not be translated';
                                status.stop();
                                return callback(err);
                            }
                        });
                    }
                    // create a new bundle and upload strings
                    else {
                        var bundle = gpClient.bundle(answers.filename);
                        bundle.create({
                            'sourceLanguage': answers.source,
                            'targetLanguages': [answers.target]
                        }, function (err, data) {
                            if (!err) {
                                var content = {};
                                for (var i = 0; i < subtitles.length; ++i) {
                                    content[subtitles[i].id] = subtitles[i].text;
                                }

                                // Check the number of subtitles, must be less than 1000
                                if(subtitles.length > 1000) {
                                    err.msg = 'Too many subtitles in the file, must be less than 1000';
                                    status.stop();
                                    return callback(err);
                                }

                                bundle.uploadStrings({
                                    'languageId': answers.source,
                                    'strings': content
                                }, function (err, results) {
                                    if (!err) {
                                        status.stop();
                                        return callback(null, 'Subtitles uploaded for translation');
                                    }
                                });
                            } else {
                                err.msg = 'Subtitles could not be translated';
                                status.stop();
                                return callback(err);
                            }
                        });
                    }
                } else {
                    err.msg = 'Could not connect to Globalization Pipeline to get bundles';
                    status.stop();
                    return callback(err);
                }
            });
        }

    });
}

clear();
console.log(
    chalk.yellow(
        figlet.textSync('Subtitle Translator', {
            horizontalLayout: 'full'
        })
    )
);

if (files.fileExists('./g11n-credentials.json')) {
    gpClient = require('g11n-pipeline').getClient(
        optional('./g11n-credentials.json')
    );

    processSubtitles(function (err, response) {
        if (err) {
            console.log(chalk.red(err.msg));
        } else {
            console.log(chalk.green(response));
        }
    });
} else {
    console.log(chalk.red('Globalization Pipeline credentials missing'));
}