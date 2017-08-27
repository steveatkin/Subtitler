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

var fs = require('fs');
var path = require('path');

module.exports = {
    
    fileExists: function (filePath) {
        try {
            return fs.statSync(filePath).isFile();
        } catch (err) {
            return false;
        }
    },

    size: function (filePath) {
        try {
            var units = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
            var size = fs.statSync(filePath).size;
            var exponent = Math.floor(Math.log(size) / Math.log(1024));
            return (size / Math.pow(1024, exponent)).toFixed(2) + ' ' + units[exponent];
        }
        catch (err) {
            throw err;
        }
    },

    read: function (filePath) {
        try {
            return fs.readFileSync(filePath, 'utf8');
        } catch (err) {
            throw err;
        }
    },

    write: function (filePath, content) {
        try {
            return fs.writeFileSync(filePath, content, 'utf8');
        } catch (err) {
            throw err;
        }
    },

    stream: function (filePath) {
        try {
            return fs.createReadStream(filePath);
        } catch(err) {
            throw err;
        }
    },

    name: function (filePath) {
        return path.parse(filePath).name;
    },

    ext: function (filePath) {
        return path.parse(filePath).ext;
    }
};