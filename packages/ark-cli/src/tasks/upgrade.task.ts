import Listr from 'listr';
import inquirer from 'inquirer';
import chalk from 'chalk';
import runCommand from '../utils/run-command';
import ensureDir from '../utils/ensure-dir';
import path from 'path';
import fs from 'fs';
import fetch from 'node-fetch';
import tar from 'tar-fs';
import gunzip from 'gunzip-maybe';
import rimraf from 'rimraf';
import ncp from 'ncp';

export default (cwd_?: string, shouldUpgradeToolkit: boolean = false) => {
  const packager: 'npm' | 'yarn' = 'npm';
  const cwd = cwd_ || process.cwd();

  const steps: Listr.ListrTask<any>[] = [
    {
      title: 'upgrade @skyslit/ark-core',
      task: () =>
        runCommand(
          'upgrading...',
          `${packager} update @skyslit/ark-core; exit`,
          {
            cwd: cwd,
          }
        ),
    },
    {
      title: 'upgrade @skyslit/ark-backend',
      task: () =>
        runCommand(
          'upgrading...',
          `${packager} update @skyslit/ark-backend; exit`,
          {
            cwd: cwd,
          }
        ),
    },
    {
      title: 'upgrade @skyslit/ark-frontend',
      task: () =>
        runCommand(
          'upgrading...',
          `${packager} update @skyslit/ark-frontend; exit`,
          {
            cwd: cwd,
          }
        ),
    },
    {
      title: 'upgrade @skyslit/ark',
      task: () =>
        runCommand('upgrading...', `${packager} update @skyslit/ark; exit`, {
          cwd: cwd,
        }),
    },
  ];

  if (shouldUpgradeToolkit === true) {
    steps.push({
      title: 'upgrade toolkit',
      skip(ctx) {
        return shouldUpgradeToolkit === false;
      },
      task: () => {
        return new Listr([
          {
            title: 'downloading boilerplate',
            task: async (ctx) => {
              const tarFilePath = path.join(cwd, 'temp.tar');
              const tarExtractFilePath = path.join(cwd, 'temp-ext');

              ensureDir(tarExtractFilePath, true, true);

              await new Promise((resolve, reject) => {
                const file = fs.createWriteStream(tarFilePath);
                fetch('https://api.github.com/repos/skyslit/ark-base/tarball')
                  .then((res) => {
                    res.body.pipe(file);
                    res.body.on('error', reject);
                    file.on('finish', () => {
                      file.close();
                      resolve(true);
                    });
                  })
                  .catch(reject);
              });

              await new Promise<void>((resolve, reject) => {
                fs.createReadStream(tarFilePath)
                  .pipe(gunzip())
                  .pipe(tar.extract(tarExtractFilePath, {}))
                  .on('error', reject)
                  .on('finish', () => {
                    resolve();
                  });
              });
            },
          },
          {
            title: 'copying files',
            task: async (ctx) => {
              const tarExtractFilePath = path.join(cwd, 'temp-ext');
              const dirName = fs
                .readdirSync(tarExtractFilePath)
                .find((d) => d.indexOf('skyslit-ark-base') > -1);
              const sourceBaseDir = path.join(tarExtractFilePath, dirName);
              ensureDir(sourceBaseDir, false, true);

              // Copying toolkit
              let targetDir = path.join(
                cwd,
                'src',
                'modules',
                'main',
                'toolkit'
              );

              ensureDir(targetDir, false, true);

              await new Promise<void>((resolve, reject) => {
                ncp(
                  path.join(sourceBaseDir, 'src', 'modules', 'main', 'toolkit'),
                  targetDir,
                  (err) => {
                    if (err) {
                      reject(err);
                    } else {
                      resolve();
                    }
                  }
                );
              });

              // Copying auth
              targetDir = path.join(cwd, 'src', 'modules', 'auth');

              ensureDir(targetDir, false, true);

              await new Promise<void>((resolve, reject) => {
                ncp(
                  path.join(sourceBaseDir, 'src', 'modules', 'auth'),
                  targetDir,
                  (err) => {
                    if (err) {
                      reject(err);
                    } else {
                      resolve();
                    }
                  }
                );
              });
            },
          },
          {
            title: 'cleaning up',
            task: async (ctx) => {
              const tarExtractFilePath = path.join(cwd, 'temp-ext');
              const tarFilePath = path.join(cwd, 'temp.tar');
              await new Promise<void>((resolve, reject) => {
                rimraf(tarExtractFilePath, (err) => {
                  if (err) {
                    reject(err);
                  } else {
                    resolve();
                  }
                });
              });

              await new Promise<void>((resolve, reject) => {
                rimraf(tarFilePath, (err) => {
                  if (err) {
                    reject(err);
                  } else {
                    resolve();
                  }
                });
              });
            },
          },
        ]);
      },
    });
  }

  const job = new Listr(steps);

  return Promise.resolve()
    .then(() =>
      inquirer.prompt(
        [
          (() => {
            if (shouldUpgradeToolkit === true) {
              return {
                name: 'toolkit_confirmation',
                message:
                  '[Imp.] Do you want to upgrade toolkit and AUTH module along with the framework?',
                type: 'confirm',
                default: false,
              };
            }
            return undefined;
          })(),
          {
            name: 'confirmation',
            message: 'Do you want to upgrade to the latest possible version?',
            type: 'confirm',
            default: false,
          },
        ].filter(Boolean)
      )
    )
    .then((input) => {
      if (input.toolkit_confirmation === false) {
        shouldUpgradeToolkit = false;
      }

      if (input.confirmation === true) {
        return job
          .run({
            cwd,
            ...input,
          })
          .then(() => {
            if (shouldUpgradeToolkit === true) {
              console.log(
                chalk.yellow(
                  'You may need to manualy install new dependencies used in the latest version of toolkit and auth module.'
                )
              );
            }
            console.log(
              chalk.green(
                'Upgrade success. Please restart any development process to take effect.'
              )
            );
            return Promise.resolve(true);
          });
      }

      console.log(chalk.gray(`Upgrade cancelled!`));
      return Promise.resolve(true);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
};
