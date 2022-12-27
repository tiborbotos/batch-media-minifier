# Batch media minifier

> TLDR;
> 
> __This tool replaces uncompressed video files with compressed ones__

Do you also have terabytes of uncompressed video files? Are you overwhelmed by the fact that
you won't watch those raw files ever again, because you already made a nice home video with after effects? 
You are unable to delete these files, because what if something happens and you need that
39th take of dropping a bomb in the pool?

## What it does

The application will scan a folder and find every video in it recursively. It's looking for
* MP4
* MOV
* AVI
* MTS

extensions.

After scan is completed it starts convert one by one using ffmpeg. Failures, errors will be written to a log file. 
__On success the video file will be replaced with the compressed one, so you will loose the uncompressed one!__

You can track progress using a browser. The application logs will be available at [http://localhost:3000](http://localhost:3000). 

## Conversion 

By default, ffmpeg will create x264 mp4 high compression files, but you can tweak the settings in the `encode.sh`. 
You just need to make sure output file extension is `.mp4`.

## Prerequisites

You'll need ffmpeg, bash and NodeJS and npm.

* [ffmpeg](https://ffmpeg.org/)
* [NodeJS](https://nodejs.org/)

(On windows you'll need to install Bash as well...) 

## Configuration

You can start the application:
```bash
npm install
npm start -- <relative or absolute path of the scanned directory>
```

### Ignore

You can tell the app to ignore files in folders. To do that you'll need
to place a `.media-minifer-ignore.json` where the files are you want to skip compress. 
The ignore file should contain a list of files:

```json
["christmas2018_compressed_final.avi", "christmas2018_preview.avi"]
```

Additionally, you can use javascript regex as well if you start the pattern with `^`. E.g. ignore all files in a folder:

```json
["^.*"]
```
