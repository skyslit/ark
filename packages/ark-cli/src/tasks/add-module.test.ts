import addModuleTask, { diff } from './add-module.task';
import path from 'path';
import fs from 'fs';
import rimraf from 'rimraf';
import inquirer from 'inquirer';

const testDir = path.join(
  __dirname,
  '../../../../../__ark_automated_test_artifacts__/add-module-test'
);

jest.mock('inquirer');

process.env.skipDepInstalls = 'true';

const smallModulePackageJson = {
  name: 'test',
  description: 'Cloud Application powered by Skyslit Ark',
  version: '0.0.1',
  scripts: {
    start: 'fpz start',
    build: 'fpz build',
    lint: 'eslint .',
    test: 'echo "Error: no test specified" && exit 1',
  },
  license: 'ISC',
  dependencies: {
    '@ant-design/icons': '^4.5.0',
    '@skyslit/ark-backend': '^2.3.0',
    '@skyslit/ark-core': '^2.2.0',
    '@skyslit/ark-frontend': '^2.3.0',
    antd: '^4.12.3',
    axios: '^0.21.1',
    express: '^4.17.1',
    fpz: '^2.3.0',
    joi: '^17.4.0',
    mongoose: '^5.11.16',
    react: '^16.14.0',
    'react-dom': '^16.14.0',
    'react-helmet-async': '^1.0.7',
    'react-router-dom': '^5.2.0',
    typescript: '^3.9.7',
  },
  devDependencies: {
    '@types/cookie-parser': '^1.4.2',
    '@types/express': '^4.17.11',
    '@types/mongoose': '^5.10.3',
    '@types/react': '^16.14.4',
    '@types/react-dom': '^16.9.11',
    '@types/react-router-dom': '^5.1.7',
    '@typescript-eslint/eslint-plugin': '^4.15.1',
    '@typescript-eslint/parser': '^4.15.1',
    eslint: '^7.20.0',
    'eslint-config-google': '^0.14.0',
    'eslint-config-prettier': '^7.2.0',
    husky: '^5.0.9',
    prettier: '2.2.1',
    'pretty-quick': '^3.1.0',
  },
  husky: {
    hooks: {
      'pre-commit': 'pretty-quick --staged',
    },
  },
  // @ts-ignore
  fpz: null,
};

beforeEach(() => {
  if (fs.existsSync(testDir)) {
    rimraf.sync(testDir);
  }

  fs.mkdirSync(testDir, { recursive: true });
});

describe('dependency diff()', () => {
  test('should add react-dom to target', () => {
    const sourceDeps: any = {
      react: '16.0.0',
      'react-dom': '16.0.0',
    };
    const targetDeps: any = {
      react: '16.0.0',
    };

    const results = diff(sourceDeps, targetDeps);

    expect(results).toHaveLength(1);
    expect(results[0].packageId).toEqual('react-dom');
    expect(results[0].version).toEqual('16.0.0');
    expect(results[0].state).toEqual('compatible');
  });

  test('should not add anything to target', () => {
    const sourceDeps: any = {
      react: '16.0.0',
      'react-dom': '16.0.0',
    };
    const targetDeps: any = {
      react: '16.0.0',
      'react-dom': '16.0.0',
    };

    const results = diff(sourceDeps, targetDeps);

    expect(results).toHaveLength(0);
  });

  test('should generate incompatibility notice', () => {
    const sourceDeps: any = {
      react: '16.0.0',
      'react-dom': '16.0.0',
    };
    const targetDeps: any = {
      react: '16.1.0',
      'react-dom': '16.0.0',
    };

    const results = diff(sourceDeps, targetDeps);

    expect(results).toHaveLength(1);
    expect(results[0].packageId).toEqual('react');
    expect(results[0].version).toEqual('16.0.0');
    expect(results[0].state).toEqual('incompatible');
  });

  test('should not generate incompatibility notice on satisfied range', () => {
    const sourceDeps: any = {
      react: '16.1.0',
      'react-dom': '16.0.0',
    };
    const targetDeps: any = {
      react: '^16.0.0',
      'react-dom': '16.0.0',
    };

    const results = diff(sourceDeps, targetDeps);

    expect(results).toHaveLength(0);
  });

  test('(with source as range) should not generate incompatibility notice on satisfied range', () => {
    const sourceDeps: any = {
      react: '^16.1.0',
      'react-dom': '16.0.0',
    };
    const targetDeps: any = {
      react: '^16.0.0',
      'react-dom': '16.0.0',
    };

    const results = diff(sourceDeps, targetDeps);

    expect(results).toHaveLength(0);
  });
});

test('integrates module to project', (done) => {
  const coolProjectPath = path.join(testDir, 'cool-project');
  const smallModulePath = path.join(testDir, 'small-module');

  // @ts-ignore
  inquirer.prompt = jest.fn().mockResolvedValue({
    moduleId: 'auth',
  });

  const log = console.log;
  console.log = () => {};

  Promise.resolve(true)
    // Prepare the project directories
    .then(async () => {
      // Create directories - cool-project
      if (fs.existsSync(coolProjectPath)) {
        rimraf.sync(coolProjectPath);
      }

      fs.mkdirSync(coolProjectPath, { recursive: true });

      // Create directories - small-module
      if (fs.existsSync(smallModulePath)) {
        rimraf.sync(smallModulePath);
      }

      fs.mkdirSync(smallModulePath, { recursive: true });
    })
    // Setup small-module
    .then(() => {
      // Write package.json
      fs.writeFileSync(
        path.join(smallModulePath, 'package.json'),
        JSON.stringify(
          Object.assign({}, smallModulePackageJson, {
            fpz: {
              type: 'module',
            },
          })
        )
      );

      // Create directory
      fs.mkdirSync(path.join(smallModulePath, 'src', 'modules', 'main'), {
        recursive: true,
      });

      // Write backend.module.ts
      fs.writeFileSync(
        path.join(
          smallModulePath,
          'src',
          'modules',
          'main',
          'backend.module.ts'
        ),
        `console.log('backend module');`
      );

      // Write frontend.module.ts
      fs.writeFileSync(
        path.join(
          smallModulePath,
          'src',
          'modules',
          'main',
          'frontend.module.ts'
        ),
        `console.log('frontend module');`
      );

      return true;
    })
    // Setup cool-project
    .then(() => {
      // Write package.json
      fs.writeFileSync(
        path.join(coolProjectPath, 'package.json'),
        JSON.stringify(
          Object.assign({}, smallModulePackageJson, {
            fpz: {
              type: 'solution',
            },
          })
        )
      );

      return true;
    })
    .then(() => {
      return addModuleTask('../small-module', coolProjectPath);
    })
    .then(() => {
      // Assertion
      // Read backend.module.ts
      const backendModuleFileContent = fs.readFileSync(
        path.join(
          coolProjectPath,
          'src',
          'modules',
          'auth',
          'backend.module.ts'
        ),
        'utf-8'
      );

      // Read frontend.module.ts
      const frontendModuleFileContent = fs.readFileSync(
        path.join(
          coolProjectPath,
          'src',
          'modules',
          'auth',
          'frontend.module.ts'
        ),
        'utf-8'
      );

      expect(backendModuleFileContent).toContain(
        `console.log('backend module');`
      );
      expect(frontendModuleFileContent).toContain(
        `console.log('frontend module');`
      );

      return true;
    })
    .then(() => {
      console.log = log;
      done();
    })
    .catch((err) => {
      console.log = log;
      done(err);
    });
});

test('incompatibility notice should show', (done) => {
  const coolProjectPath = path.join(testDir, 'cool-project');
  const smallModulePath = path.join(testDir, 'small-module');

  // @ts-ignore
  inquirer.prompt = jest.fn().mockResolvedValue({
    moduleId: 'auth',
  });

  const logs: Array<string> = [];
  const log = console.log;
  console.log = (...args: any[]) => logs.push(...args);

  Promise.resolve(true)
    // Prepare the project directories
    .then(async () => {
      // Create directories - cool-project
      if (fs.existsSync(coolProjectPath)) {
        rimraf.sync(coolProjectPath);
      }

      fs.mkdirSync(coolProjectPath, { recursive: true });

      // Create directories - small-module
      if (fs.existsSync(smallModulePath)) {
        rimraf.sync(smallModulePath);
      }

      fs.mkdirSync(smallModulePath, { recursive: true });
    })
    // Setup small-module
    .then(() => {
      // Write package.json
      fs.writeFileSync(
        path.join(smallModulePath, 'package.json'),
        JSON.stringify(
          Object.assign({}, smallModulePackageJson, {
            dependencies: Object.assign(
              {},
              smallModulePackageJson.dependencies,
              {
                react: '^16.14.0',
              }
            ),
            fpz: {
              type: 'module',
            },
          })
        )
      );

      // Create directory
      fs.mkdirSync(path.join(smallModulePath, 'src', 'modules', 'main'), {
        recursive: true,
      });

      // Write backend.module.ts
      fs.writeFileSync(
        path.join(
          smallModulePath,
          'src',
          'modules',
          'main',
          'backend.module.ts'
        ),
        `console.log('backend module');`
      );

      // Write frontend.module.ts
      fs.writeFileSync(
        path.join(
          smallModulePath,
          'src',
          'modules',
          'main',
          'frontend.module.ts'
        ),
        `console.log('frontend module');`
      );

      return true;
    })
    // Setup cool-project
    .then(() => {
      // Write package.json
      fs.writeFileSync(
        path.join(coolProjectPath, 'package.json'),
        JSON.stringify(
          Object.assign({}, smallModulePackageJson, {
            dependencies: Object.assign(
              {},
              smallModulePackageJson.dependencies,
              {
                react: '^17.14.0',
              }
            ),
            fpz: {
              type: 'solution',
            },
          })
        )
      );

      return true;
    })
    .then(() => {
      return addModuleTask('../small-module', coolProjectPath);
    })
    .then(() => {
      const joinedLogs = logs.join(', ');
      expect(joinedLogs).toContain(
        `source dependency 'react (^16.14.0)' does not satisfies the version installed in target (^17.14.0)`
      );
      return true;
    })
    .then(() => {
      console.log = log;
      done();
    })
    .catch((err) => {
      console.log = log;
      done(err);
    });
});

test('should throw module already exist error', (done) => {
  const coolProjectPath = path.join(testDir, 'cool-project');
  const smallModulePath = path.join(testDir, 'small-module');

  // @ts-ignore
  inquirer.prompt = jest.fn().mockResolvedValue({
    moduleId: 'auth',
  });

  const logs: Array<string> = [];
  const log = console.log;
  console.log = (...args: any[]) => logs.push(...args);

  Promise.resolve(true)
    // Prepare the project directories
    .then(async () => {
      // Create directories - cool-project
      if (fs.existsSync(coolProjectPath)) {
        rimraf.sync(coolProjectPath);
      }

      fs.mkdirSync(coolProjectPath, { recursive: true });

      // Create directories - small-module
      if (fs.existsSync(smallModulePath)) {
        rimraf.sync(smallModulePath);
      }

      fs.mkdirSync(smallModulePath, { recursive: true });
    })
    // Setup small-module
    .then(() => {
      // Write package.json
      fs.writeFileSync(
        path.join(smallModulePath, 'package.json'),
        JSON.stringify(
          Object.assign({}, smallModulePackageJson, {
            fpz: {
              type: 'module',
            },
          })
        )
      );

      // Create directory
      fs.mkdirSync(path.join(smallModulePath, 'src', 'modules', 'main'), {
        recursive: true,
      });

      // Write backend.module.ts
      fs.writeFileSync(
        path.join(
          smallModulePath,
          'src',
          'modules',
          'main',
          'backend.module.ts'
        ),
        `console.log('backend module');`
      );

      // Write frontend.module.ts
      fs.writeFileSync(
        path.join(
          smallModulePath,
          'src',
          'modules',
          'main',
          'frontend.module.ts'
        ),
        `console.log('frontend module');`
      );

      return true;
    })
    // Setup cool-project
    .then(() => {
      // Write package.json
      fs.writeFileSync(
        path.join(coolProjectPath, 'package.json'),
        JSON.stringify(
          Object.assign({}, smallModulePackageJson, {
            fpz: {
              type: 'solution',
            },
          })
        )
      );

      fs.mkdirSync(path.join(coolProjectPath, 'src', 'modules', 'auth'), {
        recursive: true,
      });

      return true;
    })
    .then(() => {
      return addModuleTask('../small-module', coolProjectPath);
    })
    .then(() => {
      const joinedLogs = logs.join(', ');
      expect(joinedLogs).toContain(`Aborted. Module 'auth' already exists`);
      return true;
    })
    .then(() => {
      console.log = log;
      done();
    })
    .catch((err) => {
      console.log = log;
      done(err);
    });
});

test('should throw source is not an npm package', (done) => {
  const coolProjectPath = path.join(testDir, 'cool-project');
  const smallModulePath = path.join(testDir, 'small-module');

  // @ts-ignore
  inquirer.prompt = jest.fn().mockResolvedValue({
    moduleId: 'auth',
  });

  const logs: Array<string> = [];
  const log = console.log;
  console.log = (...args: any[]) => logs.push(...args);

  Promise.resolve(true)
    // Prepare the project directories
    .then(async () => {
      // Create directories - cool-project
      if (fs.existsSync(coolProjectPath)) {
        rimraf.sync(coolProjectPath);
      }

      fs.mkdirSync(coolProjectPath, { recursive: true });

      // Create directories - small-module
      if (fs.existsSync(smallModulePath)) {
        rimraf.sync(smallModulePath);
      }

      fs.mkdirSync(smallModulePath, { recursive: true });
    })
    // Setup small-module
    .then(() => {
      // Create directory
      fs.mkdirSync(path.join(smallModulePath, 'src', 'modules', 'main'), {
        recursive: true,
      });

      // Write backend.module.ts
      fs.writeFileSync(
        path.join(
          smallModulePath,
          'src',
          'modules',
          'main',
          'backend.module.ts'
        ),
        `console.log('backend module');`
      );

      // Write frontend.module.ts
      fs.writeFileSync(
        path.join(
          smallModulePath,
          'src',
          'modules',
          'main',
          'frontend.module.ts'
        ),
        `console.log('frontend module');`
      );

      return true;
    })
    // Setup cool-project
    .then(() => {
      // Write package.json
      fs.writeFileSync(
        path.join(coolProjectPath, 'package.json'),
        JSON.stringify(
          Object.assign({}, smallModulePackageJson, {
            fpz: {
              type: 'solution',
            },
          })
        )
      );

      return true;
    })
    .then(() => {
      return addModuleTask('../small-module', coolProjectPath);
    })
    .then(() => {
      const joinedLogs = logs.join(', ');
      expect(joinedLogs).toContain(`Source is not an npm package`);
      return true;
    })
    .then(() => {
      console.log = log;
      done();
    })
    .catch((err) => {
      console.log = log;
      done(err);
    });
});

test('should throw source package is not a Freepizza module', (done) => {
  const coolProjectPath = path.join(testDir, 'cool-project');
  const smallModulePath = path.join(testDir, 'small-module');

  // @ts-ignore
  inquirer.prompt = jest.fn().mockResolvedValue({
    moduleId: 'auth',
  });

  const logs: Array<string> = [];
  const log = console.log;
  console.log = (...args: any[]) => logs.push(...args);

  Promise.resolve(true)
    // Prepare the project directories
    .then(async () => {
      // Create directories - cool-project
      if (fs.existsSync(coolProjectPath)) {
        rimraf.sync(coolProjectPath);
      }

      fs.mkdirSync(coolProjectPath, { recursive: true });

      // Create directories - small-module
      if (fs.existsSync(smallModulePath)) {
        rimraf.sync(smallModulePath);
      }

      fs.mkdirSync(smallModulePath, { recursive: true });
    })
    // Setup small-module
    .then(() => {
      // Write package.json
      fs.writeFileSync(
        path.join(smallModulePath, 'package.json'),
        JSON.stringify(
          Object.assign({}, smallModulePackageJson, {
            fpz: {
              type: 'solution',
            },
          })
        )
      );

      // Create directory
      fs.mkdirSync(path.join(smallModulePath, 'src', 'modules', 'main'), {
        recursive: true,
      });

      // Write backend.module.ts
      fs.writeFileSync(
        path.join(
          smallModulePath,
          'src',
          'modules',
          'main',
          'backend.module.ts'
        ),
        `console.log('backend module');`
      );

      // Write frontend.module.ts
      fs.writeFileSync(
        path.join(
          smallModulePath,
          'src',
          'modules',
          'main',
          'frontend.module.ts'
        ),
        `console.log('frontend module');`
      );

      return true;
    })
    // Setup cool-project
    .then(() => {
      // Write package.json
      fs.writeFileSync(
        path.join(coolProjectPath, 'package.json'),
        JSON.stringify(
          Object.assign({}, smallModulePackageJson, {
            fpz: {
              type: 'solution',
            },
          })
        )
      );

      return true;
    })
    .then(() => {
      return addModuleTask('../small-module', coolProjectPath);
    })
    .then(() => {
      const joinedLogs = logs.join(', ');
      expect(joinedLogs).toContain(
        `Aborted. Source package is not a Freepizza module`
      );
      return true;
    })
    .then(() => {
      console.log = log;
      done();
    })
    .catch((err) => {
      console.log = log;
      done(err);
    });
});

test('should throw when non-existend module dir is provided', (done) => {
  const coolProjectPath = path.join(testDir, 'cool-project');
  const smallModulePath = path.join(testDir, 'small-module');

  // @ts-ignore
  inquirer.prompt = jest.fn().mockResolvedValue({
    moduleId: 'auth',
  });

  const logs: Array<string> = [];
  const log = console.log;
  console.log = (...args: any[]) => logs.push(...args);

  Promise.resolve(true)
    // Prepare the project directories
    .then(async () => {
      // Create directories - cool-project
      if (fs.existsSync(coolProjectPath)) {
        rimraf.sync(coolProjectPath);
      }

      fs.mkdirSync(coolProjectPath, { recursive: true });

      // Create directories - small-module
      if (fs.existsSync(smallModulePath)) {
        rimraf.sync(smallModulePath);
      }

      // Don't create dir for module
    })
    // Setup cool-project
    .then(() => {
      // Write package.json
      fs.writeFileSync(
        path.join(coolProjectPath, 'package.json'),
        JSON.stringify(
          Object.assign({}, smallModulePackageJson, {
            fpz: {
              type: 'solution',
            },
          })
        )
      );

      return true;
    })
    .then(() => {
      return addModuleTask('../small-module', coolProjectPath);
    })
    .then(() => {
      const joinedLogs = logs.join(', ');
      expect(joinedLogs).toContain(`directory does not exist`);
      return true;
    })
    .then(() => {
      console.log = log;
      done();
    })
    .catch((err) => {
      console.log = log;
      done(err);
    });
});

test('should throw if target package.json cannot be read', (done) => {
  const coolProjectPath = path.join(testDir, 'cool-project');
  const smallModulePath = path.join(testDir, 'small-module');

  // @ts-ignore
  inquirer.prompt = jest.fn().mockResolvedValue({
    moduleId: 'auth',
  });

  const logs: Array<string> = [];
  const log = console.log;
  console.log = (...args: any[]) => logs.push(...args);

  Promise.resolve(true)
    // Prepare the project directories
    .then(async () => {
      // Create directories - cool-project
      if (fs.existsSync(coolProjectPath)) {
        rimraf.sync(coolProjectPath);
      }

      fs.mkdirSync(coolProjectPath, { recursive: true });

      // Create directories - small-module
      if (fs.existsSync(smallModulePath)) {
        rimraf.sync(smallModulePath);
      }

      fs.mkdirSync(smallModulePath, { recursive: true });
    })
    // Setup small-module
    .then(() => {
      // Write package.json
      fs.writeFileSync(
        path.join(smallModulePath, 'package.json'),
        JSON.stringify(
          Object.assign({}, smallModulePackageJson, {
            fpz: {
              type: 'module',
            },
          })
        )
      );

      // Create directory
      fs.mkdirSync(path.join(smallModulePath, 'src', 'modules', 'main'), {
        recursive: true,
      });

      // Write backend.module.ts
      fs.writeFileSync(
        path.join(
          smallModulePath,
          'src',
          'modules',
          'main',
          'backend.module.ts'
        ),
        `console.log('backend module');`
      );

      // Write frontend.module.ts
      fs.writeFileSync(
        path.join(
          smallModulePath,
          'src',
          'modules',
          'main',
          'frontend.module.ts'
        ),
        `console.log('frontend module');`
      );

      return true;
    })
    // Setup cool-project
    .then(() => {
      // DON'T Write package.json
      return true;
    })
    .then(() => {
      return addModuleTask('../small-module', coolProjectPath);
    })
    .then(() => {
      const joinedLogs = logs.join(', ');
      expect(joinedLogs).toContain(`Aborted. Target is not an npm package`);
      return true;
    })
    .then(() => {
      console.log = log;
      done();
    })
    .catch((err) => {
      console.log = log;
      done(err);
    });
});
