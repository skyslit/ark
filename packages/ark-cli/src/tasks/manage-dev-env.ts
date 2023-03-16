import Listr from 'listr';
import fs from 'fs';
import path from 'path';
import ini from 'ini';
import chalk from 'chalk';
import gitP from 'simple-git/promise';
import inquirer from 'inquirer';
import runCommand from '../utils/run-command';
import ensureDir from '../utils/ensure-dir';

export const createDevEnv = (cwd_?: string) => {
  const cwd = cwd_ || process.cwd();

  if (
    ['docker-compose.yml', 'Dockerfile.dev'].some((p) =>
      fs.existsSync(path.join(cwd, p))
    )
  ) {
    console.log('');
    console.log(chalk.red('Directory is not empty'));
    console.log('');
    return Promise.resolve(true);
  }

  const job = new Listr([
    {
      title: `create Dockerfile.dev`,
      task: () =>
        fs.copyFileSync(
          path.join(__dirname, '../../assets/local-dev/Dockerfile.dev'),
          path.join(cwd, 'Dockerfile.dev')
        ),
    },
    {
      title: `create docker-compose.yml`,
      task: () =>
        fs.copyFileSync(
          path.join(__dirname, '../../assets/local-dev/docker-compose.yml'),
          path.join(cwd, 'docker-compose.yml')
        ),
    },
    {
      title: `create .vscode-server > ... > settings.json`,
      task: () => {
        const settingsFilePath = path.join(
          cwd,
          'root',
          '.vscode-server',
          'data',
          'Machine',
          'settings.json'
        );

        ensureDir(settingsFilePath);

        fs.writeFileSync(
          settingsFilePath,
          JSON.stringify(
            {
              'remote.containers.copyGitConfig': false,
              'remote.containers.gitCredentialHelperConfigLocation': 'none',
            },
            undefined,
            ' '
          )
        );
      },
    },
    {
      title: 'create .env file',
      task: (ctx) =>
        fs.writeFileSync(
          path.join(cwd, '.env'),
          [
            `TITLE=${ctx.title}`,
            `APP_PORT=3000`,
            'MONGO_PORT=37017',
            'IP_PREFIX=172.20',
          ].join('\n'),
          { encoding: 'utf-8' }
        ),
    },
  ]);

  return inquirer
    .prompt([
      {
        name: 'title',
        message: 'Environment title',
        type: 'input',
        default: path.basename(cwd),
      },
    ])
    .then((v) => job.run(v));
};

export const startDevStack = (cwd_?: string) => {
  const cwd = cwd_ || process.cwd();

  if (
    ['docker-compose.yml', 'Dockerfile.dev'].every((p) =>
      fs.existsSync(path.join(cwd, p))
    )
  ) {
    // We have necessary file to proceed
    const job = new Listr([
      {
        title: 'docker-compose up',
        task: () =>
          runCommand('launching stack...', 'docker-compose up -d; exit', {
            cwd,
          }),
      },
      {
        title: 'launch VS Code',
        task: () =>
          runCommand('launching VS Code', `code "${cwd}" -n; exit`, { cwd }),
      },
    ]);

    return inquirer
      .prompt([
        {
          name: 'confirm',
          message: `Start ${path.basename(cwd)}?`,
          type: 'confirm',
          default: false,
        },
      ])
      .then((val) => {
        if (val.confirm === false) {
          console.log('');
          console.log(chalk.gray('Aborted!'));
          console.log('');
          return true;
        }
        return job.run().then(() => {
          console.log('');
          console.log(chalk.green('Stack launched!'));
          console.log('');
          return true;
        });
      });
  } else {
    console.log('');
    console.log(chalk.red('Directory is empty'));
    console.log('');
    return Promise.resolve(true);
  }
};

export const stopDevStack = (cwd_?: string) => {
  const cwd = cwd_ || process.cwd();

  if (
    ['docker-compose.yml', 'Dockerfile.dev'].every((p) =>
      fs.existsSync(path.join(cwd, p))
    )
  ) {
    // We have necessary file to proceed
    const job = new Listr([
      {
        title: 'docker-compose down',
        task: () =>
          runCommand(
            'tearing down...',
            'docker-compose down --remove-orphans; exit',
            { cwd }
          ),
      },
    ]);

    return inquirer
      .prompt([
        {
          name: 'confirm',
          message: `Stop ${path.basename(cwd)}?`,
          type: 'confirm',
          default: false,
        },
      ])
      .then((val) => {
        if (val.confirm === false) {
          console.log('');
          console.log(chalk.gray('Aborted!'));
          console.log('');
          return true;
        }
        return job.run().then(() => {
          console.log('');
          console.log(chalk.green('Stack down!'));
          console.log('');
          return true;
        });
      });
  } else {
    console.log('');
    console.log(chalk.red('Directory is empty'));
    console.log('');
    return Promise.resolve(true);
  }
};

export const updateGit = (cwd_?: string) => {
  const cwd = cwd_ || process.cwd();
  const git = gitP(cwd);

  return git.listConfig().then((gitConfigList) => {
    let gitDefaultName: string = null;
    let gitDefaultEmail: string = null;

    try {
      let i = 0;
      for (i = 0; i < gitConfigList.files.length; i++) {
        const fPath: string = gitConfigList.files[i];

        if (!gitDefaultName) {
          if (gitConfigList.values[fPath]['user.name']) {
            gitDefaultName = gitConfigList.values[fPath]['user.name'] as any;
          }
        }

        if (!gitDefaultEmail) {
          if (gitConfigList.values[fPath]['user.email']) {
            gitDefaultEmail = gitConfigList.values[fPath]['user.email'] as any;
          }
        }
      }
    } catch (e) {
      /** Do nothing */
    }

    return inquirer
      .prompt([
        {
          name: 'name',
          message: 'Your name',
          type: 'input',
          default: gitDefaultName,
        },
        {
          name: 'email',
          message: 'Your Email',
          type: 'input',
          default: gitDefaultEmail,
        },
      ])
      .then((v) => {
        const gitconfigFilePath = path.join(cwd, 'root', '.gitconfig');
        ensureDir(gitconfigFilePath);

        let config: any = {};

        try {
          if (fs.existsSync(gitconfigFilePath)) {
            config = ini.parse(fs.readFileSync(gitconfigFilePath, 'utf-8'));
          }
        } catch (e) {
          /** Do nothing */
        }

        if (!config.core) {
          config.core = {};
        }

        config.core.ignorecase = false;

        if (!config.credential) {
          config.credential = {};
        }

        config.credential.helper = '!aws codecommit credential-helper $@';
        config.credential.UseHttpPath = true;

        if (!config.user) {
          config.user = {};
        }

        config.user.name = v.name;
        config.user.email = v.email;

        fs.writeFileSync(gitconfigFilePath, ini.stringify(config));

        console.log('');
        console.log(chalk.green('Git Update successful!'));
        console.log(
          chalk.yellow('Please restart the stack to see this change in effect')
        );
        console.log('');

        return true;
      });
  });
};

export const updateAws = (cwd_?: string) => {
  const cwd = cwd_ || process.cwd();
  const awsConfigFilePath = path.join(cwd, 'root', '.aws', 'config');
  const awsCredentialFilePath = path.join(cwd, 'root', '.aws', 'credentials');

  let defaultAwsAccessKeyId = null;
  let defaultSecretAccessKey = null;
  let defaultRegionName = null;
  let defaultOutputFormat = null;

  try {
    if (fs.existsSync(awsCredentialFilePath)) {
      const existingCredentials = ini.parse(
        fs.readFileSync(awsCredentialFilePath, 'utf-8')
      );
      if (existingCredentials && existingCredentials.default) {
        defaultAwsAccessKeyId = existingCredentials.default.aws_access_key_id;
        defaultSecretAccessKey =
          existingCredentials.default.aws_secret_access_key;
      }
    }
  } catch (e) {
    console.error(e);
    /** Do nothing */
  }

  try {
    if (fs.existsSync(awsConfigFilePath)) {
      const existingConfig = ini.parse(
        fs.readFileSync(awsConfigFilePath, 'utf-8')
      );
      if (existingConfig && existingConfig.default) {
        defaultRegionName = existingConfig.default.region;
        defaultOutputFormat = existingConfig.default.output;
      }
    }
  } catch (e) {
    /** Do nothing */
  }

  return inquirer
    .prompt([
      {
        name: 'accessKeyID',
        message: 'AWS Access Key ID',
        type: 'input',
        default: defaultAwsAccessKeyId,
      },
      {
        name: 'secretAccessKey',
        message: 'AWS Secret Access Key',
        type: 'input',
        default: defaultSecretAccessKey,
      },
      {
        name: 'regionName',
        message: 'Default region name',
        type: 'input',
        default: defaultRegionName,
      },
      {
        name: 'outputFormat',
        message: 'Default output format',
        type: 'input',
        default: defaultOutputFormat,
        when: () => false,
      },
    ])
    .then((v) => {
      ensureDir(awsConfigFilePath);

      let config: any = {};
      let credentials: any = {};

      try {
        if (fs.existsSync(awsConfigFilePath)) {
          config = ini.parse(fs.readFileSync(awsConfigFilePath, 'utf-8'));
        }
        if (fs.existsSync(awsCredentialFilePath)) {
          credentials = ini.parse(
            fs.readFileSync(awsCredentialFilePath, 'utf-8')
          );
        }
      } catch (e) {
        /** Do nothing */
      }

      /* --------------------------------- Config --------------------------------- */

      if (!config.default) {
        config.default = {};
      }

      config.default.region = v.regionName;

      // Ouput (Disabled for now)
      // config.default.output = v.outputFormat;

      /* ------------------------------- Credential ------------------------------- */

      if (!credentials.default) {
        credentials.default = {};
      }

      credentials.default.aws_access_key_id = v.accessKeyID;
      credentials.default.aws_secret_access_key = v.secretAccessKey;

      fs.writeFileSync(awsConfigFilePath, ini.stringify(config));
      fs.writeFileSync(awsCredentialFilePath, ini.stringify(credentials));

      console.log('');
      console.log(chalk.green('AWS Update successful!'));
      console.log(
        chalk.yellow('Please restart the stack to see this change in effect')
      );
      console.log('');

      return true;
    });
};
