import chalk from 'chalk';
import Listr from 'listr';
import inquirer from 'inquirer';
import fs from 'fs';
import path from 'path';
import ensureDir from '../utils/ensure-dir';
import gitP from 'simple-git/promise';

/**
 * Copy modified template file
 * @param {any} ctx
 * @param {any} task
 * @param {string} srcPath
 * @param {string} destPath
 * @param {string} mod
 */
function copyTemplate(
  ctx: any,
  task: any,
  srcPath: string,
  destPath: string,
  mod: (content: any) => any
) {
  if (fs.existsSync(destPath)) {
    task.skip(`'${path.basename(destPath)}' already exists`);
    return;
  }

  let content: any = fs.readFileSync(srcPath, 'utf-8');

  if (mod) {
    content = mod(content);
  }

  ensureDir(destPath, false);

  // Write template: ./target/devops-template.json
  fs.writeFileSync(destPath, content, { encoding: 'utf-8' });
}

export default (cwd_?: string) => {
  const cwd = cwd_ || process.cwd();
  const git = gitP(cwd);
  const job = new Listr([
    {
      title: `write 'devops-template.json'`,
      task: (ctx, task) =>
        copyTemplate(
          ctx,
          task,
          path.join(
            __dirname,
            '../../aws/cloud-formation/devops-template.json'
          ),
          path.join(cwd, 'aws', 'devops-template.json'),
          (c) => {
            try {
              const packageJson = JSON.parse(
                fs.readFileSync(path.join(cwd, 'package.json'), 'utf-8')
              );
              const content = JSON.parse(c);
              content.Parameters.ProjectName.Default = packageJson.name;
              return JSON.stringify(content, undefined, ' ');
            } catch (e) {
              /** Do nothing */
            }
            return c;
          }
        ),
    },
    {
      title: `write 'full-env-template.json'`,
      task: (ctx, task) =>
        copyTemplate(
          ctx,
          task,
          path.join(
            __dirname,
            '../../aws/cloud-formation/full-env-template.json'
          ),
          path.join(cwd, 'aws', 'full-env-template.json'),
          (c) => {
            try {
              const packageJson = JSON.parse(
                fs.readFileSync(path.join(cwd, 'package.json'), 'utf-8')
              );
              const content = JSON.parse(c);
              content.Parameters.ProjectName.Default = packageJson.name;
              return JSON.stringify(content, undefined, ' ');
            } catch (e) {
              /** Do nothing */
            }
            return c;
          }
        ),
    },
    {
      title: `write 'standard-env-template.json'`,
      task: (ctx, task) =>
        copyTemplate(
          ctx,
          task,
          path.join(
            __dirname,
            '../../aws/cloud-formation/standard-env-template.json'
          ),
          path.join(cwd, 'aws', 'standard-env-template.json'),
          (c) => {
            try {
              const packageJson = JSON.parse(
                fs.readFileSync(path.join(cwd, 'package.json'), 'utf-8')
              );
              const content = JSON.parse(c);
              content.Parameters.ProjectName.Default = packageJson.name;
              return JSON.stringify(content, undefined, ' ');
            } catch (e) {
              /** Do nothing */
            }
            return c;
          }
        ),
    },
    {
      title: `write 'buildspec.yml'`,
      task: (ctx, task) =>
        copyTemplate(
          ctx,
          task,
          path.join(__dirname, '../../aws/code-build/buildspec.yml'),
          path.join(cwd, 'buildspec.yml'),
          (c) => c
        ),
    },
    {
      title: `commit changes`,
      task: async (ctx, task) => {
        const status = await git.status();
        if (status.files.length > 0) {
          await git.add('./*');
          await git.commit(
            'refactor(deployment): updated with aws devops support'
          );
        } else {
          task.skip('no changes to commit');
        }
      },
    },
  ]);

  if (!fs.existsSync(path.join(cwd, 'package.json')) === true) {
    console.log(
      chalk.redBright(
        'This directory has not been initialised as an npm package'
      )
    );
    return Promise.resolve();
  }

  return git.status().then((result) => {
    if (result.files.length > 0) {
      console.log('');
      console.log(
        chalk.yellow(
          'Aborted. Please commit your existing changes and try again.'
        )
      );
      return false;
    }

    return inquirer
      .prompt([
        {
          name: 'confirmation',
          message: 'Do you need to setup DevOps based on AWS?',
          type: 'confirm',
          default: false,
        },
      ])
      .then((input) => {
        if (input.confirmation === true) {
          console.log('');
          return job.run({
            cwd,
            ...input,
          });
        } else {
          console.log('');
          console.log(chalk.yellow('Aborted.'));
          return false;
        }
      });
  });
};
