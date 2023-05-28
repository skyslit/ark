#!/usr/bin/env node
import commandLineArgs from 'command-line-args';
import commandLineUsage from 'command-line-usage';

import runInit from './commands/init';
import { runStart, runBuild } from './commands/builders';
import runAdd from './commands/add';
import runUpgrade from './commands/upgrade';
import setupDevops from './commands/setup-devops';
import manageDevEnv from './commands/dev-env';
import utils from './commands/utils';

const mainCommand = commandLineArgs(
  [
    {
      name: 'command',
      type: String,
      defaultOption: true,
    },
    {
      name: 'version',
      alias: 'v',
      type: Boolean,
    },
    {
      name: 'upgrade',
      alias: 'u',
      type: Boolean,
    },
  ],
  {
    stopAtFirstUnknown: true,
  }
);

switch (mainCommand.command) {
  case 'init': {
    runInit(mainCommand._unknown);
    break;
  }
  case 'start': {
    runStart(mainCommand._unknown);
    break;
  }
  case 'build': {
    runBuild(mainCommand._unknown);
    break;
  }
  case 'add': {
    runAdd(mainCommand._unknown);
    break;
  }
  case 'setup-devops': {
    setupDevops(mainCommand._unknown);
    break;
  }
  case 'dev-env': {
    manageDevEnv(mainCommand._unknown);
    break;
  }
  case 'utils': {
    utils(mainCommand._unknown);
    break;
  }
  default: {
    if (mainCommand.version === true) {
      console.log(`v${require('../package.json').version}`);
      break;
    } else if (mainCommand.upgrade === true) {
      runUpgrade(mainCommand._unknown);
      break;
    }

    console.log(
      commandLineUsage([
        {
          header: `FreePizza Developer Tools (v${
            require('../package.json').version
          })`,
          content:
            'CLI tools for developing modular business applications using Ark Framework',
        },
        {
          header: 'Usage',
          content: '$ ark <options> <command>',
        },
        {
          header: 'Command List',
          content: [
            {
              name: 'init',
              summary: 'Setup the current directory with a blank Ark project',
            },
            {
              name: 'start',
              summary: 'Run this command from Ark project to run in local',
            },
            {
              name: 'build',
              summary:
                'Creates an optimized production build of your application',
            },
            {
              name: 'add',
              summary: 'Integrates an ark module with this project',
            },
            { name: 'publish', summary: 'Publish Ark Module to FreePizza.io' },
            {
              name: 'setup-devops',
              summary:
                'Sets up code repo, image repo, pipeline and environments',
            },
            {
              name: 'dev-env',
              summary:
                'Creates and manage containerised development environment',
            },
            {
              name: 'utils',
              summary: 'Utilities for development and testing',
            },
          ],
        },
        {
          header: 'Options List',
          optionList: [
            {
              name: 'help',
              alias: 'h',
              description: 'Display help information about FPZ (CLI) Devtools',
              type: Boolean,
            },
            {
              name: 'version',
              alias: 'v',
              description: 'Prints the version information',
              type: Boolean,
            },
            {
              name: 'upgrade',
              alias: 'u',
              description: 'Upgrade this project to the latest version of Ark',
              type: Boolean,
            },
          ],
        },
      ])
    );
    break;
  }
}
