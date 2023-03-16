import commandLineArgs from 'command-line-args';
import commandLineUsage from 'command-line-usage';
import chalk from 'chalk';

import addModuleTask from '../tasks/add-module.task';

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
            content: 'package name is required',
          },
          {
            header: 'Sample Usage',
            content: '$ fpz add <package-name>',
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
          header: 'Add Freepizza module',
          content: 'Integrates Freepizza module to the current project',
        },
        {
          header: 'Usage',
          content: '$ fpz add <package-name>',
        },
        {
          header: 'Options List',
          optionList: optionDefs,
        },
      ])
    );
  } else {
    console.log(
      commandLineUsage([
        {
          header: 'Add Freepizza module',
          content: 'Integrates Freepizza module to the current project',
        },
      ])
    );
    addModuleTask(options.command)
      .then(() => {
        process.exit(0);
      })
      .catch((err) => {
        console.error(err);
        process.exit(1);
      });
  }
};
