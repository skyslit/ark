import commandLineArgs from 'command-line-args';
import commandLineUsage from 'command-line-usage';
import chalk from 'chalk';

import setupAwsDevops from '../tasks/setup-devops-aws';

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
            content: 'provider name is required',
          },
          {
            header: 'Sample Usage',
            content: '$ fpz setup-devops <provider-name>',
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
    if (options.command === 'aws') {
      console.log(
        commandLineUsage([
          {
            header: 'AWS CloudFormation Setup Wizard',
            content: chalk.gray(
              'Creates CloudFormation template and buildspec file that can be used to streamline deployment'
            ),
          },
        ])
      );

      setupAwsDevops()
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
      console.log(chalk.red(`Provider '${options.command}' not supported yet`));
      console.log('');
    }
  }
};
