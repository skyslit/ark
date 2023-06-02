import Listr from 'listr';
import inquirer from 'inquirer';
import fs from 'fs';
import ncp from 'ncp';
import rimraf from 'rimraf';
import path from 'path';
import chalk from 'chalk';
import { Observable } from 'rxjs';
import gitP from 'simple-git';
import runCommand from '../utils/run-command';
import ensureDir from '../utils/ensure-dir';
import ejs from 'ejs';
import formatCode, { formatJson } from '../utils/format-code';
import fetch from 'node-fetch';
import tar from 'tar-fs';
import gunzip from 'gunzip-maybe';

const skipDepInstalls: boolean = false;

// type ProjectType = 'solution' | 'module';

export default (cwd_?: string) => {
  const packager: 'npm' | 'yarn' = 'npm';
  const cwd = cwd_ || process.cwd();
  const git = gitP(cwd);
  const job = new Listr([
    {
      title: 'initialize npm package',
      task: (ctx: any, task: any) => {
        return new Observable((observer) => {
          const { cwd } = ctx;

          // Check if package.json exists
          const packageJsonPath = path.join(cwd, 'package.json');
          const doesPackageJsonFileExists = fs.existsSync(packageJsonPath);

          if (doesPackageJsonFileExists === true) {
            task.skip('Package already initialized');
            observer.complete();
          } else {
            ctx.projectName = String(ctx.projectName)
              .trim()
              .replace(/\W+(?!$)/g, '_')
              .toLowerCase()
              .replace(/\W$/, '');
            const packageName: string = ctx.projectName;

            // @ts-ignore
            ctx.projectType = 'solution';
            ctx.requireAdminDashboard = true;

            if (!packageName) {
              throw new Error(`Project name is required`);
            }

            observer.complete();
          }
        });
      },
    },
    {
      title: 'add .gitignore',
      task: (ctx: any, task: any) => {
        return new Observable((observer) => {
          const { cwd } = ctx;

          // Check if .gitignore exists
          const filePath = path.join(cwd, '.gitignore');
          const doesFileExists = fs.existsSync(filePath);

          if (doesFileExists === true) {
            task.skip('.gitignore already exists');
            observer.complete();
          } else {
            fs.writeFileSync(
              filePath,
              [
                '# Dependencies',
                'node_modules',
                '',
                '# Test',
                'coverage',
                '',
                '# Logs',
                'logs',
                '*.log',
                'npm-debug.log*',
                'yarn-debug.log*',
                'yarn-error.log*',
                'lerna-debug.log*',
                '',
                '# Cache',
                '.npm',
                '.eslintcach',
                '',
                '# Build',
                'build',
                '',
                '# Utils',
                '.DS_Store',
                '.fpz',
                '',
                '# Ark',
                'user-uploads',
                '.ark-test-user.json',
              ].join('\n')
            );
            observer.complete();
          }
        });
      },
    },
    {
      title: 'add docker',
      task: () => {
        fs.copyFileSync(
          path.join(__dirname, '../../assets/docker/dockerignore'),
          path.join(cwd, '.dockerignore')
        );
        fs.copyFileSync(
          path.join(__dirname, '../../assets/docker/Dockerfile'),
          path.join(cwd, 'Dockerfile')
        );
      },
    },
    {
      title: 'setup git',
      task: () => git.init().then(() => git.add('./*')),
    },
    {
      title: 'configure .eslint',
      task: (ctx: any, task: any) => {
        return new Listr([
          {
            title: 'write .eslintrc.json',
            task: () =>
              new Observable((observer) => {
                const { cwd } = ctx;

                // Check if .gitignore exists
                const filePath = path.join(cwd, '.eslintrc.json');
                const doesFileExists = fs.existsSync(filePath);

                if (doesFileExists === true) {
                  task.skip('.eslintrc.json already exists');
                  observer.complete();
                } else {
                  fs.writeFileSync(
                    filePath,
                    JSON.stringify(
                      {
                        root: true,
                        parser: '@typescript-eslint/parser',
                        plugins: ['@typescript-eslint'],
                        extends: [
                          'google',
                          'prettier',
                          'prettier/@typescript-eslint',
                          'prettier/react',
                        ],
                      },
                      null,
                      ' '
                    )
                  );
                  observer.complete();
                }
              }),
          },
        ]);
      },
    },
    {
      title: 'configure babel and jest',
      task: (ctx: any, task: any) => {
        return new Listr([
          {
            title: 'write __mocks__/fileMock.js',
            task: () =>
              new Observable((observer) => {
                const { cwd } = ctx;

                // Check if file exists
                const filePath = path.join(cwd, '__mocks__', 'fileMock.js');
                const doesFileExists = fs.existsSync(filePath);

                if (doesFileExists === true) {
                  task.skip('file already exists');
                  observer.complete();
                } else {
                  ensureDir(filePath);
                  fs.writeFileSync(
                    filePath,
                    formatCode(`
                      module.exports = 'test-file-stub';
                    `)
                  );
                  observer.complete();
                }
              }),
          },
          {
            title: 'write jest.config.js',
            task: () =>
              new Observable((observer) => {
                const { cwd } = ctx;

                // Check if file exists
                const filePath = path.join(cwd, 'jest.config.js');
                const doesFileExists = fs.existsSync(filePath);

                if (doesFileExists === true) {
                  task.skip('jest.config.js already exists');
                  observer.complete();
                } else {
                  fs.writeFileSync(
                    filePath,
                    formatCode(`
                      module.exports = {
                        testEnvironment: 'node',
                        moduleNameMapper: {
                          "\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$": "<rootDir>/__mocks__/fileMock.js",
                          "\\.(css|less|scss|sass)$": "identity-obj-proxy"
                        }
                      }
                    `)
                  );
                  observer.complete();
                }
              }),
          },
          {
            title: 'write babel.config.js',
            task: () =>
              new Observable((observer) => {
                const { cwd } = ctx;

                // Check if file exists
                const filePath = path.join(cwd, 'babel.config.js');
                const doesFileExists = fs.existsSync(filePath);

                if (doesFileExists === true) {
                  task.skip('babel.config.js already exists');
                  observer.complete();
                } else {
                  fs.writeFileSync(
                    filePath,
                    formatCode(`
                      module.exports = {
                        presets: [
                          ['@babel/preset-env', { targets: { node: 'current' } }],
                          ['@babel/preset-typescript', { allowNamespaces: true }],
                          ['@babel/preset-react'],
                        ],
                        plugins: [
                          '@babel/plugin-proposal-class-properties',
                          '@babel/plugin-syntax-dynamic-import',
                        ],
                      };
                    `)
                  );
                  observer.complete();
                }
              }),
          },
        ]);
      },
    },
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
        const targetDir = path.join(cwd, 'src');

        ensureDir(sourceBaseDir, false, true);
        ensureDir(targetDir, false, true);

        await new Promise<void>((resolve, reject) => {
          ncp(path.join(sourceBaseDir, 'src'), targetDir, (err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        });

        await new Promise<void>((resolve, reject) => {
          ncp(
            path.join(sourceBaseDir, 'package.json'),
            path.join(targetDir, '../package.json'),
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
      title: 'updating files',
      task: (ctx) => {
        return new Listr([
          {
            title: 'updating database connection string',
            task: () => {
              const filePath = path.join(cwd, 'src', 'server', 'main.app.ts');
              let file = fs.readFileSync(filePath, 'utf-8');

              file = file.replace(
                'mongodb://localhost:27017/dynamics-base',
                `mongodb://localhost:27017/${ctx.projectName}`
              );

              fs.writeFileSync(filePath, file, { encoding: 'utf-8' });
            },
          },
          {
            title: 'updating package.json',
            task: () => {
              const filePath = path.join(cwd, 'package.json');
              let file = fs.readFileSync(filePath, 'utf-8');

              file = file.replace(
                '"name": "dynamics-base"',
                `"name": "${ctx.projectName}"`
              );
              file = file.replace(
                'dynamics-base:latest',
                `${ctx.projectName}:latest`
              );

              fs.writeFileSync(filePath, file, { encoding: 'utf-8' });
            },
          },
          {
            title: 'updating product name',
            task: () => {
              const filePath = path.join(
                cwd,
                'src',
                'modules',
                'main',
                'layouts',
                'sidebar.tsx'
              );
              let file = fs.readFileSync(filePath, 'utf-8');

              file = file.replace('%COMP_NAME%', ctx.projectName);

              fs.writeFileSync(filePath, file, { encoding: 'utf-8' });
            },
          },
        ]);
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
    {
      title: 'installing dependencies',
      task: () =>
        runCommand(
          `using ${packager}... may take a while...`,
          `${packager} install; exit;`,
          {
            cwd,
          }
        ),
    },
    {
      title: 'commit changes',
      task: () =>
        git.add('./*').then(() => git.commit('chore: initial commit')),
    },
  ]);

  // if (fs.existsSync(path.join(cwd, 'package.json')) === true) {
  //   console.log(
  //     chalk.redBright('This directory already initialized with a package')
  //   );
  //   return Promise.resolve();
  // }

  return Promise.resolve()
    .then(() =>
      inquirer.prompt([
        {
          name: 'projectName',
          message: 'Name of this project?',
          type: 'input',
          default: path.basename(cwd),
        },
      ])
    )
    .then((input) =>
      job.run({
        cwd,
        ...input,
      })
    );
};
