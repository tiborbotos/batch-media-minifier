import express, {Express, Request, Response} from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

const validVideoFormats = ['.MOV', '.MP4', '.AVI', '.MTS'];
const logHistory: Array<string> = [];
let filesConverted = 0;
let allFilesToBeConverted = 0;
let currentFileToConvert = '-';
let dataLog = '';
let errorLog = '';

const log = async (msg: string, err?: unknown) => {
  try {
    const fullMsg = `${new Date().toISOString()} | ${msg}${ err !== undefined ? ` | ${(err as Error).toString()}`: ''}`;
    if (err) {
      console.error(msg, err);
    } else {
      console.log(msg);
    }
    logHistory.unshift(fullMsg);
    if (logHistory.length > 1000) {
      logHistory.pop();
    }
    await fs.promises.appendFile('media-minifier.log', `${fullMsg}\n`);
  } catch (err) {
    console.error('Failed to append log', msg);
  }
}

const findDirectories = async (folder: string, result: Array<string>) => {
  const list = await fs.promises.readdir(folder);
  for(let i = 0; i < list.length; i++) {
    const item = list[i];
    const fileOrDirectory = path.join(folder, item);
    try {
      const z = await fs.promises.lstat(fileOrDirectory);
      // console.log(path.extname(fileOrDirectory));
      if (fs.existsSync(fileOrDirectory) && z.isDirectory()) {
        result.push(fileOrDirectory);
        await findDirectories(fileOrDirectory, result);
      }
    } catch (err) {
      log(`Failed to find directories(folder=${folder})!`, err);
    }
  }
  return result;
};

type MediaStat = {
  fileName: string;
  convertStarted?: Date;
  convertFinished?: Date;
  failedAt?: Date;
  originalSize?: number;
  convertedSize?: number;
}

const updateStatInFolder = async (folder: string, data: Array<MediaStat>): Promise<Array<MediaStat>> => {
  await fs.promises.writeFile(path.join(folder, '.media-minifer-stats.json'), JSON.stringify(data));
  return data;
};

const loadOrCreateStatForFolder = async (folder: string): Promise<Array<MediaStat>> => {
  try {
    const stat = (await fs.promises.readFile(path.join(folder, '.media-minifer-stats.json'))).toString();
    const data = JSON.parse(stat);
    log(`Stat loaded in folder=${folder}`);
    return data as Array<MediaStat>;
  } catch (err) {
    log(`Stat file doesn't exists in folder=${folder}`);

    let ignoreList: Array<string> = [];
    try {
      const ignoreFile = await fs.promises.readFile(path.join(folder, '.media-minifier-ignore.json'));
      ignoreList = JSON.parse(ignoreFile.toString()).map((_: string) => _.toUpperCase());
      console.log('Ignore list', ignoreList);
    } catch (err) {
    }

    const files = await fs.promises.readdir(folder);
    const res:Array<MediaStat> = [];
    for(let i = 0; i < files.length; i++) {
      const item = files[i];
      const fileOrDirectory = path.join(folder, item);
      try {
        const fileStat = await fs.promises.lstat(fileOrDirectory);
        console.log('->', item);
        if (fileStat.isFile() && !ignoreList.includes(item.toUpperCase())) {
          const extension = path.extname(fileOrDirectory).toUpperCase();
          if (validVideoFormats.includes(extension.toUpperCase())) {
            res.push({
              fileName: item,
              originalSize: fileStat.size,
            } as MediaStat);
          }
        }
      } catch (err) {
        log(`Failed to load media file=${item} in folder=${folder}`, err);
      }
    }
    return (await updateStatInFolder(folder, res));
  }
};

const convertFile = async (file: string): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    dataLog = '';
    errorLog = '';
    const onFileConvertExit = (code: number) => {
      log(`File conversion done(${file}) with exit ${code}`);
      instance.off('close', onFileConvertExit);
      instance.kill(0);
      currentFileToConvert = '-';
      if (code === 0) {
        resolve(true);
      } else {
        log(`File conversion result: \nLog=${dataLog}\nError=${errorLog}`);
        reject();
      }
    };

    const instance = spawn('bash', ['encode.sh', file]);

    instance.stdout.on('data', (data) => {
      // console.log('DATA', data.toString());
      dataLog += data.toString();
    });
    instance.stderr.on('data', (data) => {
      // console.error('ERROR', data.toString());
      errorLog += data.toString();
    });

    instance.on('close', onFileConvertExit);
  });
};

const getBaseFilename = (file: string) => {
  return file.substring(0, file.length - path.extname(file).length);
};

const removeOldRenameNew = async (file: string): Promise<void> => {
  const baseFileName = getBaseFilename(file);
  try {
    await fs.promises.rename(file, `${baseFileName}.old.mp4`);
    await fs.promises.rename(`${baseFileName}.new.mp4`, `${baseFileName}.mp4`);
    await fs.promises.rm(`${baseFileName}.old.mp4`, { maxRetries: 2});
  } catch (err) {
    throw err;
  }
}

const getStat = async (folders: Array<string>) => {
  allFilesToBeConverted = 0;
  for(let i = 0; i < folders.length; i++) {
    const folder = folders[i];
    const stat = await loadOrCreateStatForFolder(folder);
    allFilesToBeConverted += stat.filter(_ => !_.convertFinished && !_.failedAt).length;
  }
  return allFilesToBeConverted;
};

const convertFolders = async (folders: Array<string>) => {
  for(let i = 0; i < folders.length; i++) {
    const folder = folders[i];
    const stat = await loadOrCreateStatForFolder(folder);

    for(let c = 0; c < stat.length; c++) {
      log(`Found media=${stat[c].fileName}, converted=${!!stat[c].convertFinished}`);
      if (!stat[c].convertFinished && !stat[c].failedAt) {
        const fullPath = path.join(folder, stat[c].fileName);
        try {
          stat[c].convertStarted = new Date();
          log(`Convert file ${stat[c].fileName}`);
          currentFileToConvert = stat[c].fileName;
          await convertFile(fullPath);
          stat[c].convertFinished = new Date();

          await updateStatInFolder(folder, stat);

          try {
            await removeOldRenameNew(fullPath);

            try {
              const updatedFileStat = await fs.promises.lstat(`${getBaseFilename(fullPath)}.mp4`);
              stat[c].convertedSize = updatedFileStat.size;
              await updateStatInFolder(folder, stat);
            } catch (err) {
              log(`Failed to update converted file new size stat(${fullPath})`, err);
            }
          } catch (err) {
            log(`Failed to remove old and rename new file=${fullPath}`, err);
            try {
              stat[c].failedAt = new Date();
              await updateStatInFolder(folder, stat);
            } catch (err) {
              log(`Failed to update failed convert for stat=${fullPath}`, err);
            }
          }
        } catch (err) {
          log(`Failed to convert file=${fullPath}`, err);
        } finally {
          filesConverted += 1;
        }
      } else {
        if (stat[c].convertFinished) {
          log(`File is already converted(${path.join(folder, stat[c].fileName)})`)
        }
        if (stat[c].failedAt) {
          log(`File is already failed(${path.join(folder, stat[c].fileName)})`)
        }
      }
    }
  }
};

const startServer = async (pStartDir: string) => {
  const startDir = path.normalize(pStartDir);
  log(`Starting with directory ${startDir}`);

  const directoryList = await findDirectories(startDir, [startDir]);
  await getStat(directoryList);
  console.log(`directoryList`, directoryList);

  convertFolders(directoryList);

  const app: Express = express();
  const port = 3000;

  app.get('/details', (req: Request, res: Response)=>{
    res.send(`<html><body><div style="font-family: monospace;font-size: 12px;white-space: pre-wrap;">${dataLog}<br/>${errorLog}</div></body></html>`)
  });

  app.get('/', (req: Request, res: Response)=>{
    res.send(`<html><body>
<table style="padding: 0;border: none;font-family: monospace;font-size: 12px">
 
  ${(allFilesToBeConverted === 0 || filesConverted === allFilesToBeConverted) ?
    `<tr style="font-weight: bold"><td>All done!</td></tr>` :
    `<tr style="font-weight: bold"><td>Converting file: ${currentFileToConvert}</td></tr>
<tr style="font-weight: bold"><td>Files converted: ${filesConverted}/${allFilesToBeConverted} (${Math.floor((filesConverted * 100) / allFilesToBeConverted)}%)</td></tr>
<tr><td><a href="/details" target="_blank">Conversion details</a></td></tr>`
  }
  
  ${logHistory.map(_ => `<tr><td>${_}</td></tr>`).join('\n')}
</table></body></html>`);
  });

  app.listen(port, ()=> {
    console.log(`[Server]: I am running at http://localhost:${port}`);
  });
};

if (!process.argv[2]) {
  console.log('Missing start directory!');
  process.exit(1);
} else {
  startServer(process.argv[2]);
}
