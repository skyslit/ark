import initProjectTask from './init-project.task';
import path from 'path';
import fs from 'fs';
import rimraf from 'rimraf';
import inquirer from 'inquirer';

const testDir = path.join(
  __dirname,
  '../../../../../__ark_automated_test_artifacts__/init-project'
);

jest.mock('inquirer');

beforeEach(() => {
  if (fs.existsSync(testDir)) {
    rimraf.sync(testDir);
  }

  fs.mkdirSync(testDir, { recursive: true });
});

test(
  'should scaffold a full stack project with dashboard',
  (done) => {
    // @ts-ignore
    inquirer.prompt = jest.fn().mockResolvedValue({
      projectName: 'cool-project',
      requireAdminDashboard: true,
      projectType: 'full-stack application',
    });

    const log = console.log;
    console.log = () => {};

    initProjectTask(testDir)
      .then(() => {
        const packageJsonFile = JSON.parse(
          fs.readFileSync(path.join(testDir, 'package.json'), 'utf-8')
        );

        // Assert package name
        expect(packageJsonFile.name).toEqual('cool-project');

        console.log = log;
        done();
      })
      .catch((err) => {
        console.log = log;
        done(err);
      });
  },
  1800 * 1000
);
