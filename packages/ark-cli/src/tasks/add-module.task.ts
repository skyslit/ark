import Listr from 'listr';
import inquirer from 'inquirer';
import path from 'path';
import fs from 'fs';
import ensureDir from '../utils/ensure-dir';
import { Observable } from 'rxjs';
import ncp from 'ncp';
import runCommand from '../utils/run-command';
import chalk from 'chalk';
import semver from 'semver';

type DiffItem = {
  packageId: string;
  version: string;
  state: 'compatible' | 'incompatible';
  message?: string;
};

type DepMap = { [key: string]: string };

export const diff = (source: DepMap, target: DepMap): Array<DiffItem> => {
  const results: Array<DiffItem> = [];
  if (typeof source !== 'object') {
    source = {};
  }

  if (typeof target !== 'object') {
    target = {};
  }

  Object.keys(source).forEach((packageId) => {
    if (target[packageId] === undefined) {
      results.push({
        packageId,
        state: 'compatible',
        version: source[packageId],
      });
    } else {
      // Calculate semver
      const isCompatible = semver.satisfies(
        String(semver.minVersion(source[packageId])),
        target[packageId]
      );
      if (!isCompatible) {
        results.push({
          packageId,
          state: 'incompatible',
          version: source[packageId],
          message: `source dependency '${packageId} (${source[packageId]})' does not satisfies the version installed in target (${target[packageId]})`,
        });
      }
    }
  });

  return results;
};

export default (packageId: string, cwd_?: string) => {
  const packager: 'npm' | 'yarn' = 'npm';
  const cwd = cwd_ || process.cwd();
  const isNotAPath = packageId === path.basename(packageId);

  let moduleSourceRootDir: string = null;

  if (isNotAPath === true) {
    moduleSourceRootDir = path.join(cwd, '.ark', 'temp');
  } else {
    moduleSourceRootDir = packageId;
  }

  const sourcePackageRootDir = path.join(cwd, moduleSourceRootDir);

  const sourcePackageJsonPath = path.join(sourcePackageRootDir, 'package.json');
  const targetPackageJsonPath = path.join(cwd, 'package.json');
  let targetPackageJson: any = null;

  moduleSourceRootDir = path.join(
    cwd,
    moduleSourceRootDir,
    'src',
    'modules',
    'main'
  );

  if (!fs.existsSync(moduleSourceRootDir)) {
    console.log(chalk.red(`directory does not exist: ${moduleSourceRootDir}`));
    return Promise.resolve(false);
  } else {
    if (!fs.existsSync(sourcePackageJsonPath)) {
      console.log('');
      console.log(chalk.red(`Aborted. Source is not an npm package`));
      console.log('');
      return Promise.resolve(false);
    }

    if (!fs.existsSync(targetPackageJsonPath)) {
      console.log('');
      console.log(chalk.red(`Aborted. Target is not an npm package`));
      console.log('');
      return Promise.resolve(false);
    }

    // Check package.json
    try {
      const packageJson = JSON.parse(
        fs.readFileSync(sourcePackageJsonPath, 'utf-8')
      );
      if (packageJson.fpz.type !== 'module') {
        console.log('');
        console.log(
          chalk.red(`Aborted. Source package is not a Freepizza module`)
        );
        console.log('');
        return Promise.resolve(false);
      }
    } catch (e) {
      console.log('');
      console.log(chalk.red(`Aborted. Read failed: source > package.json`));
      console.log('');
      console.error(e);
      return Promise.resolve(false);
    }
  }

  const getModuleDir = (id: string) => {
    return path.join(cwd, 'src', 'modules', id);
  };

  const job = new Listr([
    {
      title: 'downloading module...',
      enabled: () => isNotAPath,
      task: (ctx, task) => {
        throw new Error('Freepizza not implemented');
      },
    },
    {
      title: 'copy files',
      task: (ctx) =>
        new Observable((observer) => {
          const moduleTargetPath = getModuleDir(ctx.moduleId);

          ensureDir(moduleTargetPath, false, true);

          ncp(moduleSourceRootDir, moduleTargetPath, (err) => {
            if (err) {
              observer.error(err);
            } else {
              observer.complete();
            }
          });
        }),
    },
    {
      title: 'install dependencies',
      task: (ctx) => {
        const depDiff: Array<DiffItem> = ctx.depDiff;
        const devDepDiff: Array<DiffItem> = ctx.devDepDiff;

        targetPackageJson.dependencies = depDiff
          .filter((d) => d.state === 'compatible')
          .reduce((acc, item) => {
            acc[item.packageId] = item.version;
            return acc;
          }, targetPackageJson.dependencies);

        targetPackageJson.devDependencies = devDepDiff
          .filter((d) => d.state === 'compatible')
          .reduce((acc, item) => {
            acc[item.packageId] = item.version;
            return acc;
          }, targetPackageJson.devDependencies);

        fs.writeFileSync(
          targetPackageJsonPath,
          JSON.stringify(targetPackageJson, null, ' ')
        );

        try {
          if (process.env.skipDepInstalls === 'true') {
            return;
          }
        } catch (e) {
          /** Do nothing */
        }

        return runCommand(
          'installing dependencies',
          `${packager} install; exit`
        );
      },
    },
  ]);

  return Promise.resolve()
    .then(() =>
      inquirer.prompt([
        {
          name: 'moduleId',
          message: 'Please specify the module id',
          type: 'input',
        },
      ])
    )
    .then((input) => {
      const modulePath = getModuleDir(input.moduleId);

      // Check if module already exists
      const moduleExists = fs.existsSync(modulePath);
      if (moduleExists) {
        console.log('');
        console.log(
          chalk.red(`Aborted. Module '${input.moduleId}' already exists`)
        );
        console.log('');
        return false;
      }

      // Get dependency
      const sourcePackageJson = JSON.parse(
        fs.readFileSync(sourcePackageJsonPath, 'utf-8')
      );
      targetPackageJson = JSON.parse(
        fs.readFileSync(targetPackageJsonPath, 'utf-8')
      );

      const sourceDeps = sourcePackageJson.dependencies;
      const targetDeps = targetPackageJson.dependencies;

      const sourceDevDeps = sourcePackageJson.devDependencies;
      const targetDevDeps = targetPackageJson.devDependencies;

      const depDiff = diff(sourceDeps, targetDeps);
      const devDepDiff = diff(sourceDevDeps, targetDevDeps);

      input.depDiff = depDiff;
      input.devDepDiff = devDepDiff;

      const incompatibleDeps = depDiff.filter(
        (d) => d.state === 'incompatible'
      );
      const incompatibleDevDeps = devDepDiff.filter(
        (d) => d.state === 'incompatible'
      );

      const showIncompatibilityNotice = (
        title: string,
        deps: Array<DiffItem>
      ) => {
        console.log(' ');
        console.log(chalk.yellow(title));
        console.log(' ');
        deps.forEach((dep, index) => {
          console.log(chalk.red(`${index + 1}. ${dep.message}`));
        });
        console.log(' ');
        console.log(chalk.red('Aborted'));
        console.log(' ');
      };

      if (incompatibleDeps.length > 0 || incompatibleDeps.length > 0) {
        if (incompatibleDeps.length > 0) {
          showIncompatibilityNotice(
            'Module Incompatible (Dependencies)',
            incompatibleDeps
          );
        }

        if (incompatibleDevDeps.length > 0) {
          showIncompatibilityNotice(
            'Module Incompatible (Dev Dependencies)',
            incompatibleDevDeps
          );
        }

        return false;
      }

      return input;
    })
    .then((input) => {
      if (input) {
        return job
          .run({
            cwd,
            ...input,
          })
          .then(() => {
            console.log('');
            console.log(chalk.green('Integration successful'));
            console.log('');
            return true;
          });
      } else {
        return false;
      }
    });
};
