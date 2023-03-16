import createSimulatedUser from './create-simulated-user.task';
import path from 'path';
import fs from 'fs';
import rimraf from 'rimraf';
import inquirer from 'inquirer';

const testDir = path.join(
  __dirname,
  '../../../../../__ark_automated_test_artifacts__/ark-simulated-user'
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
    // @ts-ignore
    inquirer.prompt = jest.fn().mockResolvedValue({
      jwtKey: 'hello-123',
      email: 'test.john.doe@skyslit.net',
    });

    const log = console.log;
    console.log = () => {};

    Promise.resolve(true)
      .then(() => createSimulatedUser(testDir))
      .then(() => {
        console.log = log;

        // Expect
        const obj = JSON.parse(
          fs.readFileSync(path.join(testDir, '.ark-test-user.json'), 'utf-8')
        );

        expect(obj.user.emailAddress).toStrictEqual(
          'test.john.doe@skyslit.net'
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
