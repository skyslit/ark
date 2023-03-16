import commandLineArgs from 'command-line-args';
import commandLineUsage from 'command-line-usage';
import chalk from 'chalk';

import createSimulatedUser from '../tasks/create-simulated-user.task';
import deleteSimulatedUser from '../tasks/delete-simulated-user.task';

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

export default (argv?: string[]) => {
  const options = commandLineArgs(optionDefs, {
    argv: argv || [],
    stopAtFirstUnknown: true,
  });

  if (!options.command || typeof options.command !== 'string') {
    console.log(
      chalk.redBright(
        commandLineUsage([
          {
            content: 'command is required',
          },
          {
            header: 'Sample Usage',
            content: '$ fpz utils <command>',
          },
        ])
      )
    );
    process.exit(1);
  }

  if (options.help) {
    console.log(
      commandLineUsage([
        {
          header: 'Setup DevOps',
          content:
            'Creates cloud templates and instructions for deploying DevOps stack',
        },
        {
          header: 'Usage',
          content: '$ fpz setup-devops <provider-name>',
        },
        {
          header: 'Options List',
          optionList: optionDefs,
        },
      ])
    );
  } else {
    if (options.command === 'login-test-user') {
      console.log(
        commandLineUsage([
          {
            header: 'User Login Simulation',
            content: chalk.gray(
              'Creates a file in the current directory which activates simulated user in the Ark project. Please note the simulated user only works in test or dev environment.'
            ),
          },
        ])
      );

      createSimulatedUser()
        .then(() => {
          console.log('');
          process.exit(0);
        })
        .catch((err) => {
          console.error(err);
          process.exit(1);
        });
    } else if (options.command === 'logout-test-user') {
      console.log(
        commandLineUsage([
          {
            header: 'Logout Simulation User',
            content: chalk.gray(
              "Deletes '.ark-test-user.json' file from the current directory, which causes the simulated user to log out from dev environment"
            ),
          },
        ])
      );

      deleteSimulatedUser()
        .then(() => {
          console.log('');
          process.exit(0);
        })
        .catch((err) => {
          console.error(err);
          process.exit(1);
        });
    } else {
      console.log('');
      console.log(chalk.red(`Command '${options.command}' not supported yet`));
      console.log('');
    }
  }
};
