import commandLineArgs from 'command-line-args';
import commandLineUsage from 'command-line-usage';

import glob from 'tiny-glob';
import path from 'path';
import stripIndent from 'strip-indent';
import chalk from 'chalk';
import { BackendBuilder, SPABuilder } from '@skyslit/ark-devtools';
import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import rimraf from 'rimraf';
import { BuilderMonitor } from '@skyslit/ark-devtools/build/utils/BuilderBase';

const clear = require('console-clear');

type BuilderSnapshotItem = {
  errors: any[];
  warnings: any[];
};

type BuilderSnapshot = {
  [key: string]: BuilderSnapshotItem;
};

const run = async (cwd: string, mode: 'development' | 'production') => {
  const state: BuilderSnapshot = {};
  let backendRunning: boolean = false;
  let frontendRunning: boolean = false;

  const updateSnapshot = (key: string, item: BuilderSnapshotItem) => {
    state[key] = item;
  };

  const isInteractive: boolean = mode === 'development';

  /**
   * Clears console
   */
  const clearConsole = () => {
    if (isInteractive === true) {
      clear();
    }
  };

  const renderTargets = () => {
    console.log(
      chalk.gray(
        `Targets: ${[
          ...serverEntries.map((e) => `${path.basename(e)} (express)`),
          ...clientEntries.map((e) => `${path.basename(e)} (client)`),
        ].join(', ')}`
      )
    );
  };

  const renderSnapshot = () => {
    clearConsole();
    let hasErrors: boolean = false;
    let hasWarnings: boolean = false;
    let error: any = null;
    let warnings: any[] = [];

    Object.keys(state).forEach((k) => {
      if (hasErrors === false) {
        if (state[k].errors.length > 0) {
          hasErrors = true;
          if (!error) {
            error = state[k].errors[0];
          }
        }
      }

      if (hasWarnings === false) {
        if (state[k].warnings.length > 0) {
          hasWarnings = true;
        }
      }

      if (state[k].warnings.length > 0) {
        warnings = state[k].warnings;
      }
    });

    if (hasErrors) {
      console.log(
        stripIndent(`
				${chalk.red('Failed to compile.')}
			`).trim()
      );
      console.log('');
      renderTargets();
      console.log('');
      console.log(error);
    } else if (hasWarnings) {
      console.log(
        stripIndent(`
				${chalk.yellow('Compiled with warnings')}
			`).trim()
      );
      console.log('');
      renderTargets();
      console.log('');
      console.log(warnings.join('\n'));
    } else {
      console.log(
        stripIndent(`
				${chalk.green('Compiled successfully')}
			`).trim()
      );
      console.log('');
      renderTargets();
    }
  };

  let appProcess: ChildProcess = null;

  const targetBuildDir = path.join(cwd, 'build');
  const cleanBuildDir = () => {
    if (fs.existsSync(targetBuildDir)) {
      rimraf.sync(targetBuildDir);
    }
  };

  const runApp = () => {
    if (mode === 'development') {
      if (appProcess) {
        appProcess.kill('SIGTERM');
      }
      const appPath: string = path.join(cwd, 'build', 'server', 'main.js');
      if (!fs.existsSync(appPath)) {
        console.log('');
        console.log(chalk.yellow('Waiting for output...'));
        return false;
      }
      appProcess = spawn('node', [appPath], {
        stdio: 'inherit',
      });
    }
  };

  const buildBackend = (entryFilePaths: string[]) => {
    if (backendRunning === true) {
      return;
    }
    backendRunning = true;
    entryFilePaths.forEach((entryFilePath, index) => {
      const builder = new BackendBuilder(path.join(cwd, entryFilePath));
      builder.attachMonitor((err, result) => {
        if (!err) {
          updateSnapshot(`server-${index}`, {
            errors: result.compilation.errors,
            warnings: result.compilation.warnings,
          });

          renderSnapshot();
          runApp();
        } else {
          console.log(err);
        }
      });
      builder.build({
        cwd: cwd,
        mode,
        watchMode: mode === 'development',
      });
    });
  };

  const buildFrontend = (
    clientEntryFilePaths: string[],
    serverEntryFilePaths: string[]
  ) => {
    if (frontendRunning === true) {
      return;
    }
    frontendRunning = true;
    clientEntryFilePaths.forEach((entryFilePath, index) => {
      const builder = new SPABuilder(
        path.basename(entryFilePath).split('.')[0],
        path.join(cwd, entryFilePath)
      );
      builder.attachMonitor((err, result) => {
        if (!err) {
          updateSnapshot(`client-${index}`, {
            errors: result.compilation.errors,
            warnings: result.compilation.warnings,
          });

          renderSnapshot();
          runApp();

          buildBackend(serverEntryFilePaths);
        } else {
          console.log(err);
        }
      });
      builder.build({
        cwd: cwd,
        mode,
        watchMode: mode === 'development',
      });
    });
  };

  const clientEntries = await glob('src/*.client.tsx', { cwd: cwd });
  const serverEntries = await glob('src/server/main.server.ts', {
    cwd: cwd,
  });

  clearConsole();
  if (mode === 'development') {
    console.log(chalk.blueBright('Starting compilation...'));
    cleanBuildDir();
    if (serverEntries.length > 0) {
      if (clientEntries.length > 0) {
        buildFrontend(clientEntries, serverEntries);
      } else {
        buildBackend(serverEntries);
      }
    } else {
      console.log('0 server build target(s) found');
      process.exit(0);
    }
  } else {
    console.log('Creating production build...');
    console.log(' ');
    renderTargets();
    console.log(' ');
    cleanBuildDir();
    [
      ...serverEntries.map((e) => ({
        path: e,
        type: 'server',
      })),
      ...clientEntries.map((e) => ({
        path: e,
        type: 'client',
      })),
    ]
      .reduce((acc, item) => {
        return acc.then(() => {
          return new Promise<any>((resolve, reject) => {
            const monitor: BuilderMonitor = (err, result) => {
              console.log(' ');
              if (err) {
                reject(err);
              } else {
                if (result.hasErrors() === true) {
                  console.log(chalk.red(`${item.path} compiled with errors`));
                  reject(result.compilation.errors[0]);
                } else if (result.hasWarnings() === true) {
                  console.log(
                    chalk.yellow(`${item.path} compiled with warnings`)
                  );
                  console.warn(result.compilation.warnings[0]);
                  resolve(true);
                } else {
                  console.log(chalk.gray(result.toString()));
                  console.log(' ');
                  console.log(
                    chalk.green(`${item.path} compiled successfully`)
                  );
                  resolve(true);
                }
              }
              console.log(' ');
            };

            if (item.type === 'server') {
              const builder = new BackendBuilder(path.join(cwd, item.path));
              builder.attachMonitor(monitor);
              console.log(
                chalk.blueBright(
                  `Compilation started for server app: ${path.basename(
                    item.path
                  )}...`
                )
              );
              builder.build({
                cwd: cwd,
                mode: 'production',
                watchMode: false,
              });
            } else if (item.type === 'client') {
              const builder = new SPABuilder(
                path.basename(item.path).split('.')[0],
                path.join(cwd, item.path)
              );
              builder.attachMonitor(monitor);
              console.log(
                chalk.blueBright(
                  `Compilation started for client app: ${path.basename(
                    item.path
                  )}...`
                )
              );
              builder.build({
                cwd: cwd,
                mode: 'production',
                watchMode: false,
              });
            } else {
              reject(new Error(`Unknown type: ${item.type}`));
            }
          });
        });
      }, Promise.resolve())
      .then(() => {
        console.log(chalk.greenBright('All process completed successfully'));
        process.exit(0);
      })
      .catch((err) => {
        console.error(err);
        process.exit(1);
      });
  }
};

export const runStart = (argv?: string[]) => {
  const options = commandLineArgs(
    [
      {
        name: 'help',
        alias: 'h',
        type: Boolean,
      },
    ],
    {
      argv: argv || [],
      stopAtFirstUnknown: true,
    }
  );

  if (options.help) {
    console.log(
      commandLineUsage([
        {
          header: 'Runs the project localy',
          content: 'Starts the application in this folder',
        },
        {
          header: 'Usage',
          content: '$ fpz start',
        },
      ])
    );
  } else {
    run(process.cwd(), 'development')
      .then(() => {
        // Do nothing, so it will keep on running
      })
      .catch((err) => {
        console.error(err);
        process.exit(1);
      });
  }
};

export const runBuild = (argv?: string[]) => {
  const options = commandLineArgs(
    [
      {
        name: 'help',
        alias: 'h',
        type: Boolean,
      },
    ],
    {
      argv,
      stopAtFirstUnknown: true,
    }
  );

  if (options.help) {
    console.log(
      commandLineUsage([
        {
          header: 'Production Build',
          content:
            'Builds an optimized production ready version of the project',
        },
        {
          header: 'Usage',
          content: '$ fpz build',
        },
      ])
    );
  } else {
    run(process.cwd(), 'production')
      .then(() => {
        // Do nothing, so it will exit after completion
      })
      .catch((err) => {
        console.error(err);
        process.exit(1);
      });
  }
};
