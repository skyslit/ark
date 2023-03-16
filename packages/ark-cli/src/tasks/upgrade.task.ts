import Listr from 'listr';
import inquirer from 'inquirer';
import chalk from 'chalk';
import runCommand from '../utils/run-command';

export default (cwd_?: string) => {
  const packager: 'npm' | 'yarn' = 'npm';
  const cwd = cwd_ || process.cwd();

  const job = new Listr([
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
      title: 'upgrade fpz',
      task: () =>
        runCommand('upgrading...', `${packager} update fpz; exit`, {
          cwd: cwd,
        }),
    },
  ]);

  return Promise.resolve()
    .then(() =>
      inquirer.prompt([
        {
          name: 'confirmation',
          message: 'Do you want to upgrade to the latest possible version?',
          type: 'confirm',
          default: false,
        },
      ])
    )
    .then((input) => {
      if (input.confirmation === true) {
        return job
          .run({
            cwd,
            ...input,
          })
          .then(() => {
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
