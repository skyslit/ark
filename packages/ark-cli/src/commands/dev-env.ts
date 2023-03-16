import chalk from 'chalk';
import commandLineArgs from 'command-line-args';
import commandLineUsage from 'command-line-usage';
import {
  createDevEnv,
  startDevStack,
  stopDevStack,
  updateGit,
  updateAws,
} from '../tasks/manage-dev-env';

const optionDefs = [
  {
    name: 'command',
    type: String,
    defaultOption: true,
  },
  {
    name: 'help',
    alias: 'h',
    type: Boolean,
    description: 'Display help information about this command',
  },
];

/**
 * Prints help message
 */
function printHelp() {
  console.log(
    commandLineUsage([
      {
        header: 'Local Development Environment',
        content: 'Creates and manage containerised development environment',
      },
      {
        header: 'Usage',
        content: '$ fpz dev-env <command> <options>',
      },
      {
        header: 'Command List',
        content: [
          {
            name: 'create',
            summary: 'Creates new local dev environment in this directory',
          },
          {
            name: 'start',
            summary: 'Starts the development stack',
          },
          {
            name: 'stop',
            summary: 'Stops the development stack',
          },
          {
            name: 'update-aws',
            summary: 'Updates AWS specific profile',
          },
          {
            name: 'update-git',
            summary: 'Updates Git specific configuration',
          },
        ],
      },
      {
        header: 'Options List',
        optionList: optionDefs,
      },
    ])
  );
}

export default (argv?: string[]) => {
  const options = commandLineArgs(optionDefs, {
    argv: argv || [],
    stopAtFirstUnknown: true,
  });

  if (!options.command || typeof options.command !== 'string') {
    printHelp();
    process.exit(1);
  }

  if (options.help) {
    printHelp();
  } else {
    switch (options.command) {
      case 'create': {
        createDevEnv(process.cwd())
          .then(() => updateGit(process.cwd()))
          .then(() => updateAws(process.cwd()))
          .then(() => {
            // Do nothing, so it will exit after completion
          })
          .catch((err) => {
            console.error(err);
            process.exit(1);
          });
        break;
      }
      case 'start': {
        startDevStack(process.cwd())
          .then(() => {
            // Do nothing
          })
          .catch((err) => {
            console.error(err);
            process.exit(1);
          });
        break;
      }
      case 'stop': {
        stopDevStack(process.cwd())
          .then(() => {
            // Do nothing
          })
          .catch((err) => {
            console.error(err);
            process.exit(1);
          });
        break;
      }
      case 'update-aws': {
        updateAws(process.cwd())
          .then(() => {
            // Do nothing
          })
          .catch((err) => {
            console.error(err);
            process.exit(1);
          });
        break;
      }
      case 'update-git': {
        updateGit(process.cwd())
          .then(() => {
            // Do nothing
          })
          .catch((err) => {
            console.error(err);
            process.exit(1);
          });
        break;
      }
      default: {
        console.log('');
        console.log(chalk.red('Unknown command'));
        console.log('');
        printHelp();
        break;
      }
    }
  }
};
