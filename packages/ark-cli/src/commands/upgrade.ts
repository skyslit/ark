import commandLineArgs from 'command-line-args';
import commandLineUsage from 'command-line-usage';

import upgrade from '../tasks/upgrade.task';

const optionDefs = [
  {
    name: 'help',
    alias: 'h',
    type: Boolean,
    description: 'Display help information about this command',
  },
  {
    name: 'toolkit',
    alias: 't',
    type: Boolean,
    description: 'Upgrade toolkit to latest',
  },
];

export default (argv?: string[]) => {
  const options = commandLineArgs(optionDefs, {
    argv: argv || [],
    stopAtFirstUnknown: true,
  });

  const shouldUpgradeToolkit = options?.toolkit === true;

  if (options.help) {
    console.log(
      commandLineUsage([
        {
          header: 'Upgrade Ark',
          content:
            'Upgrade to latest version of Ark (within the specified semver)',
        },
        {
          header: 'Usage',
          content: '$ ark -u <option>',
        },
        {
          header: 'Options List',
          optionList: optionDefs,
        },
      ])
    );
  } else {
    upgrade(undefined, shouldUpgradeToolkit)
      .then(() => {
        process.exit(0);
      })
      .catch((err) => {
        console.error(err);
        process.exit(1);
      });
  }
};
