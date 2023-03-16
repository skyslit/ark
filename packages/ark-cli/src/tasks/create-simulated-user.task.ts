import Listr from 'listr';
import inquirer from 'inquirer';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';

export default (cwd_?: string) => {
  const cwd = cwd_ || process.cwd();

  const job = new Listr([
    {
      title: 'Writing user simulator identity',
      task: (ctx) => {
        const { jwtKey, email } = ctx;
        const user: any = {
          name: 'John Doe',
          emailAddress: email,
          policies: [],
          groups: [],
        };

        fs.writeFileSync(
          path.join(cwd, '.ark-test-user.json'),
          JSON.stringify(
            {
              token: jwt.sign(user, jwtKey),
              user: user,
            },
            undefined,
            '\t'
          ),
          {
            encoding: 'utf-8',
          }
        );
      },
    },
  ]);

  return Promise.resolve()
    .then(() =>
      inquirer.prompt([
        {
          name: 'jwtKey',
          message: 'Please enter a JWT secret key',
          type: 'input',
          default: 'test-key-800',
        },
        {
          name: 'email',
          message: "Please enter user's email address",
          type: 'input',
          default: 'john.doe@test.skyslit.com',
        },
      ])
    )
    .then((input) => {
      return job
        .run({
          cwd,
          ...input,
        })
        .then(() => {
          console.log('');
          console.log(
            chalk.green(
              'Simulated user created. Now you can perform login from your dev environment'
            )
          );
          return Promise.resolve(true);
        });
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
};
