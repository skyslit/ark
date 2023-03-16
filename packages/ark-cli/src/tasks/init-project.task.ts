import Listr from 'listr';
import inquirer from 'inquirer';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { Observable } from 'rxjs';
import gitP from 'simple-git/promise';
import runCommand from '../utils/run-command';
import ensureDir from '../utils/ensure-dir';
import ejs from 'ejs';
import formatCode, { formatJson } from '../utils/format-code';

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
            const packageName: string = ctx.projectName;

            // @ts-ignore
            ctx.projectType = {
              'full-stack application': 'solution',
              'freepizza module': 'module',
            }[ctx.projectType];

            if (!packageName) {
              throw new Error(`Project name is required`);
            }

            fs.writeFileSync(
              packageJsonPath,
              JSON.stringify(
                {
                  name: packageName,
                  description: 'Cloud Application powered by Skyslit Ark',
                  version: '0.0.1',
                  scripts: {
                    start: 'fpz start',
                    build: 'fpz build',
                    ['build-image']: `docker build . -t ${ctx.projectName.replace(
                      ' ',
                      '-'
                    )}:latest`,
                    lint: 'eslint .',
                    test: 'echo "Error: no test specified" && exit 1',
                  },
                  license: 'ISC',
                  dependencies: {},
                  devDependencies: {},
                  fpz: {
                    type: ctx.projectType,
                  },
                },
                undefined,
                ' '
              )
            );
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
      title: 'install and configure typescript',
      skip: () => skipDepInstalls,
      task: () =>
        runCommand(
          `using ${packager}...`,
          `${packager} install typescript@3.9.7; exit;`,
          {
            cwd,
          }
        ),
    },
    {
      title: 'install and configure git hook with prettier',
      task: () =>
        new Listr([
          {
            title: 'install prettier (exact)',
            skip: () => skipDepInstalls,
            task: () =>
              runCommand(
                `using ${packager}...`,
                `${packager} install prettier --save-dev --save-exact; exit;`,
                {
                  cwd,
                }
              ),
          },
          {
            title: 'install husky, lint-staged',
            skip: () => skipDepInstalls,
            task: () =>
              runCommand(
                `using ${packager}...`,
                `${packager} install husky lint-staged --save-dev; exit;`,
                {
                  cwd,
                }
              ),
          },
          {
            title: 'setup husky',
            skip: () => skipDepInstalls,
            task: () =>
              runCommand(
                `using ${packager}...`,
                `npx husky install; npm set-script prepare "husky install"; npx husky add .husky/pre-commit "npx lint-staged"; exit;`,
                {
                  cwd,
                }
              ),
          },
          {
            title: 'update package.json',
            task: (ctx: any) => {
              const { cwd } = ctx;

              // Check if package.json exists
              const packageJsonPath = path.join(cwd, 'package.json');
              const doesPackageJsonFileExists = fs.existsSync(packageJsonPath);

              if (doesPackageJsonFileExists === true) {
                fs.writeFileSync(
                  packageJsonPath,
                  (() => {
                    const packageInJson = JSON.parse(
                      fs.readFileSync(packageJsonPath, 'utf-8')
                    );

                    packageInJson['lint-staged'] = {
                      '*.{ts,tsx,js,css,md,scss}':
                        'prettier --write --ignore-unknown',
                    };

                    return formatJson(JSON.stringify(packageInJson));
                  })()
                );
              }
            },
          },
        ]),
    },
    {
      title: 'configure .eslint',
      task: (ctx: any, task: any) => {
        return new Listr([
          {
            title: 'install .eslintrc dependencies',
            skip: () => skipDepInstalls,
            task: () => {
              const deps = [
                'eslint@^7.14.0',
                'eslint-config-google@^0.14.0',
                'eslint-config-prettier@^7.2.0',
                '@typescript-eslint/parser@^4.14.1',
                '@typescript-eslint/eslint-plugin@^4.14.1',
              ];
              return runCommand(
                `using ${packager}...`,
                `${packager} install ${deps.join(' ')} --save-dev; exit;`,
                {
                  cwd,
                }
              );
            },
          },
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
            title: 'install jest',
            skip: () => skipDepInstalls,
            task: () => {
              const deps = [
                '@types/jest@^26.0.22',
                'jest@^26.6.3',
                'identity-obj-proxy@^3.0.0',
              ];
              return runCommand(
                `using ${packager}...`,
                `${packager} install ${deps.join(' ')} --save-dev; exit;`,
                {
                  cwd,
                }
              );
            },
          },
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
      title: 'install dependencies',
      skip: () => skipDepInstalls,
      task: () => {
        const deps = [
          // Backend
          'express@^4.17.1',
          'joi@^17.3.0',
          'mongoose@^5.10.15',
          'react@^16.0.1',
          'react-dom@^16.0.1',
          'react-helmet-async@^1.0.7',
          'react-router-dom@^5.2.0',

          // Frontend
          'axios@^0.21.1',
          'antd@^4.11.2',
          '@ant-design/icons@^4.4.0',

          // Core
          '@skyslit/ark-core@^2.0.0',
          '@skyslit/ark-backend@^2.0.0',
          '@skyslit/ark-frontend@^2.0.0',
          'fpz@^2.0.0',
        ];
        return runCommand(
          `using ${packager}...`,
          `${packager} install ${deps.join(' ')} --save; exit;`,
          {
            cwd,
          }
        );
      },
    },
    {
      title: 'configure dev deps in packages',
      task: () =>
        new Listr([
          {
            title: 'install dev deps declarations',
            skip: () => skipDepInstalls,
            task: () => {
              const deps = [
                // @types
                '@types/cookie-parser@^1.4.2',
                '@types/express@^4.17.9',
                '@types/mongoose@^5.10.0',
                '@types/react@^16.0.1',
                '@types/react-dom@^16.0.1',
                '@types/react-router-dom@^5.1.6',
                '@types/jest@^26.0.15',
                '@types/supertest@^2.0.10',
                // backend
                'jest@^26.0.1',
                'mongodb-memory-server@^6.9.2',
                'supertest@^6.0.1',
                // frontend
                '@testing-library/react@^11.2.2',
                // @babel
                '@babel/core@^7.12.3',
                '@babel/plugin-proposal-class-properties@^7.12.1',
                '@babel/plugin-syntax-dynamic-import@^7.8.3',
                '@babel/preset-env@^7.12.1',
                '@babel/preset-react@^7.12.7',
                '@babel/preset-typescript@^7.12.1',
              ];
              return runCommand(
                `using ${packager}...`,
                `${packager} install ${deps.join(' ')} --save-dev; exit;`,
                {
                  cwd,
                }
              );
            },
          },
          {
            title: 'create ark-env.d.ts with type reference',
            task: (ctx: any, task: any) => {
              return new Observable((observer) => {
                const { cwd } = ctx;

                // Check if ark-env.d.ts exists
                const filePath = path.join(cwd, 'src', 'ark-env.d.ts');

                ensureDir(filePath);

                const doesFileExists = fs.existsSync(filePath);

                if (doesFileExists === true) {
                  task.skip('ark-env.d.ts already exists');
                  observer.complete();
                } else {
                  fs.writeFileSync(
                    filePath,
                    [
                      '/* eslint-disable-next-line */',
                      '/// <reference types="fpz/typings" />',
                    ].join('\n')
                  );
                  observer.complete();
                }
              });
            },
          },
        ]),
    },
    {
      title: 'scaffolding a full stack application',
      enabled: (ctx) => ctx.projectType === 'solution',
      task: () =>
        new Listr([
          {
            title: 'create main module with api and ui entry points',
            task: () => {
              const apiEntryPointFilePath = path.join(
                cwd,
                'src',
                'modules',
                'main',
                'api.module.ts'
              );
              const uiEntryPointFilePath = path.join(
                cwd,
                'src',
                'modules',
                'main',
                'ui.module.tsx'
              );

              const apiEntryPointTemplatePath = path.join(
                __dirname,
                '../../assets/modules/api.module.txt'
              );

              const uiEntryPointTemplatePath = path.join(
                __dirname,
                '../../assets/modules/ui.module.txt'
              );

              ensureDir(apiEntryPointFilePath);
              ensureDir(uiEntryPointFilePath);

              fs.writeFileSync(
                apiEntryPointFilePath,
                formatCode(
                  ejs.render(
                    fs.readFileSync(apiEntryPointTemplatePath, 'utf-8'),
                    {}
                  )
                )
              );

              fs.writeFileSync(
                uiEntryPointFilePath,
                formatCode(
                  ejs.render(
                    fs.readFileSync(uiEntryPointTemplatePath, 'utf-8'),
                    {}
                  )
                )
              );
            },
          },
          {
            title: 'create admin client application',
            skip: (ctx) => ctx.requireAdminDashboard === false,
            task: (ctx: any, task: any) => {
              return new Observable((observer) => {
                const { cwd } = ctx;

                // Check if ark-env.d.ts exists
                const filePath = path.join(cwd, 'src', 'web.client.tsx');

                ensureDir(filePath);

                const doesFileExists = fs.existsSync(filePath);

                if (doesFileExists === true) {
                  task.skip('file already exists');
                  observer.complete();
                } else {
                  const templatePath = path.join(
                    __dirname,
                    '../../assets/frontend/main.client.txt'
                  );

                  fs.writeFileSync(
                    filePath,
                    formatCode(
                      ejs.render(fs.readFileSync(templatePath, 'utf-8'), {
                        moduleImport: [
                          `import MainUIModule from './modules/main/ui.module';`,
                        ],
                        reactAppPropDeps: ['use', 'useModule'],
                        runAppSnippets: [`useModule('main', MainUIModule);`],
                      })
                    )
                  );
                  observer.complete();
                }
              });
            },
          },
          {
            title: 'write main server application',
            task: (ctx: any, task: any) => {
              return new Observable((observer) => {
                const { cwd } = ctx;
                const requireAdminDashboard: boolean =
                  ctx.requireAdminDashboard || false;

                // Check if ark-env.d.ts exists
                const filePath = path.join(cwd, 'src', 'server', 'main.app.ts');

                ensureDir(filePath);

                const doesFileExists = fs.existsSync(filePath);

                if (doesFileExists === true) {
                  task.skip('file already exists');
                  observer.complete();
                } else {
                  const templatePath = path.join(
                    __dirname,
                    '../../assets/backend/main.server.ejs'
                  );

                  fs.writeFileSync(
                    filePath,
                    formatCode(
                      ejs.render(fs.readFileSync(templatePath, 'utf-8'), {
                        /**
                         * Module imports
                         */
                        moduleImport: [
                          (() => {
                            if (requireAdminDashboard === true) {
                              return `import { createContext, useEnv, setDefaultEnv } from '@skyslit/ark-core';`;
                            }
                            return `import { createContext } from '@skyslit/ark-core';`;
                          })(),
                          (() => {
                            if (requireAdminDashboard === true) {
                              return `import { Backend, Data } from '@skyslit/ark-backend';`;
                            }
                            return `import { Backend } from '@skyslit/ark-backend';`;
                          })(),
                          `import MainAPIModule from '../modules/main/api.module';`,
                          (() => {
                            if (requireAdminDashboard === true) {
                              return `import webAppCreator from '../web.client';`;
                            }
                          })(),
                        ].filter(Boolean),
                        /**
                         * runApp(props) props imports
                         */
                        runAppPropDeps: ['use', 'useModule'],
                        /**
                         * use(Data) imports
                         */
                        dataImports: [
                          (() => {
                            if (requireAdminDashboard === true) {
                              return 'useDatabase';
                            }
                          })(),
                        ].filter(Boolean),
                        /**
                         * use(Backend) imports
                         */
                        backendImports: [
                          'useServer',
                          'useRoute',
                          (() => {
                            if (requireAdminDashboard === true) {
                              return 'useWebApp';
                            }
                          })(),
                        ].filter(Boolean),
                        /**
                         * Creates a DB connection
                         */
                        shouldConnectDB: true,
                        defaultEnv: {
                          MONGO_CONNECTION_STRING: `mongodb://localhost:27017/${ctx.projectName.replace(
                            ' ',
                            '_'
                          )}`,
                          NODE_PORT: '3000',
                        },
                        /**
                         * code that goes inside runApp
                         */
                        runAppSnippets: [
                          `useModule('main', MainAPIModule);`,
                          // useRoute (for index)
                          (() => {
                            if (requireAdminDashboard === true) {
                              return `useRoute('get', '/*', useWebApp('web', webAppCreator).render());`;
                            }

                            return `useRoute('get', '/', (req, res) => {
                            res.json({
                                message: 'Hello World!'
                            })
                          });`;
                          })(),
                        ].filter(Boolean),
                      })
                    )
                  );
                  observer.complete();
                }
              });
            },
          },
          {
            title: 'write main server runner',
            task: (ctx: any, task: any) => {
              return new Observable((observer) => {
                const { cwd } = ctx;

                // Check if ark-env.d.ts exists
                const filePath = path.join(
                  cwd,
                  'src',
                  'server',
                  'main.server.ts'
                );

                ensureDir(filePath);

                const doesFileExists = fs.existsSync(filePath);

                if (doesFileExists === true) {
                  task.skip('main.server.ts already exists');
                  observer.complete();
                } else {
                  fs.writeFileSync(
                    filePath,
                    formatCode(
                      ejs.render(
                        `
                      import { runApp } from "@skyslit/ark-core";
                      import App from './main.app';

                      runApp(App);
                      `,
                        {}
                      )
                    )
                  );
                  observer.complete();
                }
              });
            },
          },
        ]),
    },
    {
      title: 'scaffolding a module',
      enabled: (ctx) => ctx.projectType === 'module',
      task: () =>
        new Listr([
          {
            title: 'create backend.module',
            task: (ctx, task) => {
              return new Observable((observer) => {
                const { cwd } = ctx;
                // Check if ark-env.d.ts exists
                const filePath = path.join(
                  cwd,
                  'src',
                  'modules',
                  'main',
                  'backend.module.ts'
                );

                ensureDir(filePath);

                const doesFileExists = fs.existsSync(filePath);

                if (doesFileExists === true) {
                  task.skip('backend.module.ts already exists');
                  observer.complete();
                } else {
                  const templatePath = path.join(
                    __dirname,
                    '../../assets/backend/backend.module.ejs'
                  );

                  fs.writeFileSync(
                    filePath,
                    formatCode(
                      ejs.render(fs.readFileSync(templatePath, 'utf-8'), {})
                    )
                  );
                  observer.complete();
                }
              });
            },
          },
          {
            title: 'create frontend.module',
            task: (ctx, task) => {
              return new Observable((observer) => {
                const { cwd } = ctx;
                // Check if ark-env.d.ts exists
                const filePath = path.join(
                  cwd,
                  'src',
                  'modules',
                  'main',
                  'frontend.module.ts'
                );

                ensureDir(filePath);

                const doesFileExists = fs.existsSync(filePath);

                if (doesFileExists === true) {
                  task.skip('frontend.module.ts already exists');
                  observer.complete();
                } else {
                  const templatePath = path.join(
                    __dirname,
                    '../../assets/frontend/frontend.module.ejs'
                  );

                  fs.writeFileSync(
                    filePath,
                    formatCode(
                      ejs.render(fs.readFileSync(templatePath, 'utf-8'), {})
                    )
                  );
                  observer.complete();
                }
              });
            },
          },
          {
            title: 'write main client application',
            task: (ctx: any, task: any) => {
              return new Observable((observer) => {
                const { cwd } = ctx;

                const filePath = path.join(cwd, 'src', 'main.client.tsx');

                ensureDir(filePath);

                const doesFileExists = fs.existsSync(filePath);

                if (doesFileExists === true) {
                  task.skip('file already exists');
                  observer.complete();
                } else {
                  const templatePath = path.join(
                    __dirname,
                    '../../assets/frontend/main.client.txt'
                  );

                  fs.writeFileSync(
                    filePath,
                    formatCode(
                      ejs.render(fs.readFileSync(templatePath, 'utf-8'), {
                        moduleImport: [
                          `import createMainModule from './modules/main/frontend.module';`,
                        ],
                        reactAppPropDeps: ['use', 'useModule'],
                        runAppSnippets: [
                          `useModule('main', createMainModule);`,
                        ],
                      })
                    )
                  );
                  observer.complete();
                }
              });
            },
          },
          {
            title: 'write main server application',
            task: (ctx: any, task: any) => {
              return new Observable((observer) => {
                const { cwd } = ctx;

                // Check if ark-env.d.ts exists
                const filePath = path.join(
                  cwd,
                  'src',
                  'server',
                  'main.server.ts'
                );

                ensureDir(filePath);

                const doesFileExists = fs.existsSync(filePath);

                if (doesFileExists === true) {
                  task.skip('main.server.ts already exists');
                  observer.complete();
                } else {
                  const templatePath = path.join(
                    __dirname,
                    '../../assets/backend/main.server.ejs'
                  );

                  fs.writeFileSync(
                    filePath,
                    formatCode(
                      ejs.render(fs.readFileSync(templatePath, 'utf-8'), {
                        /**
                         * Module imports
                         */
                        moduleImport: [
                          `import { runApp } from '@skyslit/ark-core';`,
                          `import { Backend } from '@skyslit/ark-backend';`,
                          `import createMainModule from '../modules/main/backend.module';`,
                        ],
                        /**
                         * runApp(props) props imports
                         */
                        runAppPropDeps: ['use', 'useModule'],
                        /**
                         * use(Data) imports
                         */
                        dataImports: [],
                        /**
                         * use(Backend) imports
                         */
                        backendImports: ['useServer'],
                        /**
                         * code that goes inside runApp
                         */
                        runAppSnippets: [
                          `useModule('main', createMainModule);`,
                        ],
                      })
                    )
                  );
                  observer.complete();
                }
              });
            },
          },
        ]),
    },
    {
      title: 'commit changes',
      task: () =>
        git.add('./*').then(() => git.commit('chore: initial commit')),
    },
  ]);

  if (fs.existsSync(path.join(cwd, 'package.json')) === true) {
    console.log(
      chalk.redBright('This directory already initialized with a package')
    );
    return Promise.resolve();
  }

  return Promise.resolve()
    .then(() =>
      inquirer.prompt([
        {
          name: 'projectName',
          message: 'Name of this project?',
          type: 'input',
          default: path.basename(cwd),
        },
        {
          name: 'projectType',
          message: 'Choose project type',
          type: 'list',
          choices: ['full-stack application', 'freepizza module'],
          default: 0,
        },
        {
          name: 'requireAdminDashboard',
          message: 'Do you need admin dashboard?',
          type: 'confirm',
          default: true,
          when: (v) => v.projectType === 'full-stack application',
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
