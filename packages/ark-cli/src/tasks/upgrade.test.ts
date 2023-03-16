import upgradeTask from './upgrade.task';
import path from 'path';
import fs from 'fs';
import rimraf from 'rimraf';
import inquirer from 'inquirer';
import runCommand from '../utils/run-command';

const testDir = path.join(
  __dirname,
  '../../../../../__ark_automated_test_artifacts__/upgrade-project'
);

jest.mock('inquirer');

beforeEach(() => {
  if (fs.existsSync(testDir)) {
    rimraf.sync(testDir);
  }

  fs.mkdirSync(testDir, { recursive: true });
});

test(
  'upgrades ark dependencies to latest version',
  (done) => {
    const referenceList = {
      ['@skyslit/ark-core']: '^2.1.0',
      ['@skyslit/ark-backend']: '^2.1.0',
      ['@skyslit/ark-frontend']: '^2.1.0',
      ['fpz']: '^2.1.0',
    };

    // @ts-ignore
    inquirer.prompt = jest.fn().mockResolvedValue({
      projectName: 'cool-project',
      requireAdminDashboard: false,
      confirmation: true,
    });

    const log = console.log;
    console.log = () => {};

    Promise.resolve(true)
      .then(async () => {
        await runCommand('npm init -y', 'npm init -y; exit', {
          cwd: testDir,
        }).toPromise();
      })
      .then(async () => {
        const packageJsonFile = JSON.parse(
          fs.readFileSync(path.join(testDir, 'package.json'), 'utf-8')
        );

        packageJsonFile.dependencies = {};
        packageJsonFile.dependencies['@skyslit/ark-core'] = '2.1.0';
        packageJsonFile.dependencies['@skyslit/ark-backend'] = '2.1.0';
        packageJsonFile.dependencies['@skyslit/ark-frontend'] = '2.1.0';
        packageJsonFile.dependencies['fpz'] = '2.1.0';

        fs.writeFileSync(
          path.join(testDir, 'package.json'),
          JSON.stringify(packageJsonFile, null, ' ')
        );

        await runCommand('npm install', 'npm install; exit', {
          cwd: testDir,
        }).toPromise();
      })
      .then(() => {
        const packageJsonFile = JSON.parse(
          fs.readFileSync(path.join(testDir, 'package.json'), 'utf-8')
        );

        packageJsonFile.dependencies['@skyslit/ark-core'] =
          referenceList['@skyslit/ark-core'];
        packageJsonFile.dependencies['@skyslit/ark-backend'] =
          referenceList['@skyslit/ark-backend'];
        packageJsonFile.dependencies['@skyslit/ark-frontend'] =
          referenceList['@skyslit/ark-frontend'];
        packageJsonFile.dependencies['fpz'] = referenceList['fpz'];

        fs.writeFileSync(
          path.join(testDir, 'package.json'),
          JSON.stringify(packageJsonFile, null, ' ')
        );

        return true;
      })
      .then(() => upgradeTask(testDir))
      .then(() => {
        console.log = log;

        // Expect

        const packageJsonFile = JSON.parse(
          fs.readFileSync(path.join(testDir, 'package.json'), 'utf-8')
        );

        expect(
          packageJsonFile.dependencies['@skyslit/ark-core']
        ).not.toStrictEqual(referenceList['@skyslit/ark-core']);
        expect(
          packageJsonFile.dependencies['@skyslit/ark-backend']
        ).not.toStrictEqual(referenceList['@skyslit/ark-backend']);
        expect(
          packageJsonFile.dependencies['@skyslit/ark-frontend']
        ).not.toStrictEqual(referenceList['@skyslit/ark-frontend']);
        expect(packageJsonFile.dependencies['fpz']).not.toStrictEqual(
          referenceList['fpz']
        );

        done();
      })
      .catch((err) => {
        console.log = log;
        done(err);
      });
  },
  1800 * 1000
);
