import Listr from 'listr';
import inquirer from 'inquirer';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';

export default (cwd_?: string) => {
  const cwd = cwd_ || process.cwd();

  const job = new Listr([
    {
      title: `Deleting file '.ark-test-user.json'`,
      task: () => {
        const filePath = path.join(cwd, '.ark-test-user.json');
        if (fs.existsSync(filePath)) {
          fs.rmSync(filePath);
        }
      },
    },
  ]);

  return Promise.resolve()
    .then(() =>
      inquirer.prompt([
        {
          name: 'confirm',
          message:
            '[THIS WILL DELETE THE TEST USER FILE AND ITS CONTENTS] Do you want to logout of the simulated user environment?',
          type: 'confirm',
          default: 'false',
        },
      ])
    )
    .then((input) => {
      if (input.confirm === true) {
        return job
          .run({
            cwd,
            ...input,
          })
          .then(() => {
            console.log('');
            console.log(
              chalk.green(
                'Simulated user removed, now you will be logged off from the dev environment.'
              )
            );
            return Promise.resolve(true);
          });
      }
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
};
