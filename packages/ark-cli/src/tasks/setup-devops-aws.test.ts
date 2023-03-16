import path from 'path';
import fs from 'fs';
import rimraf from 'rimraf';
// import inquirer from 'inquirer';
// import runCommand from '../utils/run-command';
// import setupDevopsAws from '../tasks/setup-devops-aws';
// import gitP from 'simple-git/promise';

const testDir = path.join(
  __dirname,
  '../../../../../__ark_automated_test_artifacts__/setup-devops-aws-test'
);

jest.mock('inquirer');

beforeEach(() => {
  if (fs.existsSync(testDir)) {
    rimraf.sync(testDir);
  }

  fs.mkdirSync(testDir, { recursive: true });
});

test('setup-devops-aws', () => {
  // // @ts-ignore
  // inquirer.prompt = jest.fn().mockResolvedValue({});
  // const log = console.log;
  // console.log = () => {};
  // Promise.resolve(true)
  //   .then(async () => {
  //     const git = gitP(testDir);
  //     await runCommand('npm init -y', 'npm init -y; exit', {
  //       cwd: testDir,
  //     }).toPromise();
  //     await git.add('/*');
  //     await git.commit('initial commit');
  //   })
  //   // .then(() => setupDevopsAws(testDir))
  //   .then(() => {
  //     const devopsTemplate: any = JSON.parse(
  //       fs.readFileSync(
  //         path.join(testDir, 'aws', 'devops-template.json'),
  //         'utf-8'
  //       )
  //     );
  //     expect(devopsTemplate.Parameters.ProjectName.Default).toEqual(
  //       path.basename(testDir)
  //     );
  //     return true;
  //   })
  //   .then(() => done())
  //   .catch((err) => {
  //     console.log = log;
  //     done(err);
  //   });
});
