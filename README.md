Subtitle Generator and Translator for Videos Using IBM Watson Speech to Text and Globalization Pipeline Services
============================================
This is a set of command line utilties that you can use to generate a SubRip .srt file from an .mp4 video by using the [IBM Watson Speech to Text](https://www.ibm.com/watson/services/speech-to-text/) service on [IBM Bluemix](https://www.ibm.com/cloud-computing/bluemix/what-is-bluemix). Once you have generated the SubRip file you can then translate it into multiple languages by using the [IBM Globalization Pipeline](https://console.bluemix.net/docs/services/GlobalizationPipeline/index.html) service on IBM Bluemix. 
## Prerequistes
In order to be able to use these utilities, make sure you have [ffmpeg](http://www.ffmpeg.org) installed on your system (including all necessary encoding libraries like libmp3lame or libx264).

The Subtitle Generator uses the [fluent-ffmpeg](https://github.com/fluent-ffmpeg/node-fluent-ffmpeg) package and this package requires that you have a version greater than 0.9 of ffmpeg be installed. The fluent-ffmpeg package will call `ffmpeg` and `ffprobe` so you need to have these in your `PATH` or set in the `FFMPEG_PATH` environment variable and the `FFPROBE_PATH` environment variable.

You must also establish an [IBM Bluemix](https://console.bluemix.net/registration/?Target=https%3A//idaas.iam.ibm.com/idaas/oidc/endpoint/default/authorize%3Fresponse_type%3Dcode%26client_id%3DtkM810HLsH%26state%3D001503942815445TM22MNlNu%26redirect_uri%3Dhttps%253A%252F%252Flogin.ng.bluemix.net%252Foidcclient%252Fredirect%252FtkM810HLsH%26scope%3Dopenid) account and create service instances for [Watson Speech to Text](https://console.bluemix.net/catalog/services/speech-to-text?env_id=ibm:yp:us-south) and [Globalization Pipeline](https://console.bluemix.net/catalog/services/globalization-pipeline?env_id=ibm:yp:us-south).

## Installing
Using npm:

```sh
$ npm install
```
## Setting The Credential Files for Services

* Create a `speech-credentials.json` file with the credentials
from your instance of Watson Speech to Text:
```

    {
        "credentials": {
            "username": "……",
            "password": "……"
        }
    }

```

* Create a `g11n-credentials.json` file with the credentials
for a user of your instance of Globalization Pipeline. Be certain to create a user in Globalization Pipeline that has read write capabilities:
```
    {
        "credentials": {
            "url": "……",
            "userId": "……",
            "password": "……",
            "instanceId": "……"
        }
    }
```
## Using the Utilities
### Generating Subtitles
When calling `subtitler` you can specify either the BCP language code that corresponds to the language being used in the video or you can use a customized speech engine by specifying the customization id. In all cases `subtitler` allways uses the broadband speech engines in order to obtain the best results.

This is the general syntax for using `subtitler`

```
node subtitler filename source-language | customization-id
```

Currently only the following language codes are supported: en, en-GB, ar, es, fr ja, pt-BR, and zh-Hans. 
```
node subtitler myVideo.mp4 en
```
or with a customization id
```
node subtitler myVideo.mp4 xxxxxx-xxxxx
```

Once `subtitler` finishes it will create a file named the same as the video filename except with the .srt extension.

### Translating Subtitles
When calling `translator` you need to specify both the BCP source language and the target language for the subtitle files. To use the `translator` you must first upload the content for translation. Once translation is completed you can then download it. You can check the status of your translation in the Globalization Pipeline service dashboard. Once `translator` has finished downloading your content it will create a file that has the same name as the source file with the target language code appended to the filename.

This is the general syntax for using `translator`

```
node translator filename source-language target-language upload | download
```

For example if you wanted to translate your English SubRip file into Spanish you would use the following command:
```
node translator myVideo.srt en es upload
```

Once the translation is completed you would download it using the following command:

```
node translator myVideo.srt en es download
```

License
===
Apache 2.0. See [license.txt](license.txt)

> Licensed under the Apache License, Version 2.0 (the "License");
> you may not use this file except in compliance with the License.
> You may obtain a copy of the License at
> 
> http://www.apache.org/licenses/LICENSE-2.0
> 
> Unless required by applicable law or agreed to in writing, software
> distributed under the License is distributed on an "AS IS" BASIS,
> WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
> See the License for the specific language governing permissions and
> limitations under the License.