/* eslint-disable require-jsdoc */
import {
  ApplicationContext,
  ControllerContext,
  createContext,
  createController,
  createPointer,
  extractRef,
  useEnv,
  setDefaultEnv,
} from '..';

interface TestDataPointerType {
  useData: () => {
    useModel: (id: string) => void;
  };
}

declare global {
  // eslint-disable-next-line no-unused-vars
  namespace Ark {
    // eslint-disable-next-line no-unused-vars
    interface Pointers extends TestDataPointerType {}
  }
}

describe('useEnv', () => {
  test('useEnv should return default val', () => {
    setDefaultEnv({
      TEST_KEY_1: 'TEST_VAL_1',
    });

    const result = useEnv('TEST_KEY_1');
    expect(result).toStrictEqual('TEST_VAL_1');
  });

  test('useEnv should return val from process.env', () => {
    process.env['TEST_KEY_2'] = 'TEST_VAL_2_FROM_ENV';

    setDefaultEnv({
      TEST_KEY_2: 'TEST_VAL_2',
    });

    const result = useEnv('TEST_KEY_2');
    expect(result).toStrictEqual('TEST_VAL_2_FROM_ENV');
  });
});

describe('application context', () => {
  test('get / set data', () => {
    const context = new ApplicationContext();
    context.setData('test_module', 'test_key', 'test_value');

    const testKeyResult = context.getData('test_module', 'test_key');
    const noKeyResult = context.getData('test_module', 'test_key2', 'no_match');
    const noIdResult = context.getData(
      'test_module',
      'test_key3',
      'no_id_match'
    );

    expect(testKeyResult).toBe('test_value');
    expect(noKeyResult).toBe('no_match');
    expect(noIdResult).toBe('no_id_match');
  });

  test('getData() default should set value', () => {
    const context = new ApplicationContext();

    const ref1 = context.getData('test_module', 'test_key2', 'result1');
    const ref2 = context.getData('test_module', 'test_key2', 'result2');

    expect(ref1).toBe('result1');
    expect(ref2).toBe('result1');
  });

  test('pointer registration and usage (with promise)', (done) => {
    const context = new ApplicationContext();

    const TestDataPointer = createPointer<TestDataPointerType>((id) => ({
      useData: () => ({
        useModel: (modelId: string) => `${modelId} - ${id}`,
      }),
    }));

    // Register pointer
    context.registerPointer('testPointer', TestDataPointer);

    context.activate(({ useData }) => {
      const { useModel } = useData();
      const modelId = useModel('hello');
      expect(modelId).toBe('hello - default');

      context.activate(({ useData }) => {
        const { useModel } = useData();

        const modelId = useModel('hello');
        expect(modelId).toBe('hello - semi');

        (() =>
          new Promise((resolve) => {
            setTimeout(resolve, 300);
          }))().finally(() => {
          const modelId = useModel('hello');
          expect(modelId).toBe('hello - semi');
          done();
        });
      }, 'semi');
    });
  });

  test('prevent duplicate pointer registration', () => {
    const context = new ApplicationContext();

    const TestDataPointer = createPointer<TestDataPointerType>((id) => ({
      useData: () => ({
        useModel: (modelId: string) => `${modelId} - ${id}`,
      }),
    }));

    // Register pointer
    context.registerPointer('testPointer', TestDataPointer);
    const t = () => context.registerPointer('testPointer', () => ({}));
    expect(t).toThrowError();
  });

  test('extend registred pointers', () => {
    const context = new ApplicationContext();

    const testDataPointer = createPointer<any>((id) => ({
      sayHello: () => 'hello',
    }));

    // Register pointer
    context.registerPointer('testPointer', testDataPointer);
    context.extendPointer('testPointer', (orginal: any) => {
      return () => ({
        sayHello: () => `${orginal.sayHello()}-modified`,
      });
    });

    const pointers: any = context.getPointers(
      'default',
      new ControllerContext(context)
    );

    expect(pointers.sayHello()).toBe('hello-modified');
  });

  test('use() fn', () => {
    const context = new ApplicationContext();

    // eslint-disable-next-line no-unused-vars
    const TestDataPointer = createPointer<TestDataPointerType>((id) => ({
      useData: () => ({
        useModel: (modelId: string) => `${modelId} - ${id}`,
      }),
    }));

    context.activate(({ use }) => {
      const { useData } = use(TestDataPointer);
      const modelId = useData().useModel('use');
      expect(modelId).toBe('use - default');

      context.activate(({ use }) => {
        const { useData } = use(TestDataPointer);
        const modelId = useData().useModel('use');
        expect(modelId).toBe('use - sub');
      }, 'sub');
    }, 'default');
  });
});

describe('controller', () => {
  const SampleController = createController(({ getInput, setOutput }) => {
    const inputA = getInput('inputA', 'defA');
    const inputB = getInput('inputB', 'defB');
    setOutput('outputA', `${inputA}-O`);
    setOutput('outputB', `${inputB}-O`);
  });

  test('invoke() get / set input / output', (done) => {
    const context = new ApplicationContext();
    context.activate(() => {
      context.activate(({ invoke }) => {
        invoke(
          SampleController,
          {
            inputB: 'myB',
          },
          (v: any) =>
            Object.assign(v, { modifiedResponse: `${v.outputA}-${v.outputB}` })
        ).then((v: any) => {
          expect(v.outputA).toBe('defA-O');
          expect(v.outputB).toBe('myB-O');
          expect(v.modifiedResponse).toBe('defA-O-myB-O');
          done();
        });
      }, 'module_1');
    }, 'default');
  });
});

describe('context run / runOn', () => {
  test('get / set / exist data', (done) => {
    let existTestData: boolean = false;
    let existMockData: boolean = false;
    const appPackage = createContext(({ useModule }) => {
      useModule('sample', ({ setData, getData }) => {
        setData('testData', 'good');
      });
      useModule('sample', ({ existData, getData }) => {
        existTestData = existData('testData');
        existMockData = existData('mockData');
      });
    });
    const context = new ApplicationContext();
    context.activate(appPackage).finally(() => {
      expect(existTestData).toEqual(true);
      expect(existMockData).toEqual(false);
      done();
    });
  });

  test('multiple runs', (done) => {
    const output: number[] = [];
    const appPackage = createContext(({ run }) => {
      run(() => output.push(1));
      run(() => output.push(2));
      run(() => output.push(3));
      run(() => output.push(5));
      run(() => output.push(4));
    });
    const context = new ApplicationContext();
    context.activate(appPackage).finally(() => {
      expect(output).toEqual([1, 2, 3, 5, 4]);
      expect(output).not.toEqual([1, 2, 3, 4, 5]);
      done();
    });
  });

  test('runOn fn', (done) => {
    const output: number[] = [];
    const appPackage = createContext(({ run, useModule }) => {
      run(() => output.push(1));
      run(() => output.push(2));

      useModule('testModule', (testModuleProps) => {
        testModuleProps.setData('testModuleIndexNumber', 420);
      });

      useModule('diffModule', (diffModule) => {
        diffModule.run(() => {
          output.push(11);
        });
        diffModule.runOn('testModule', (testModuleProps) => {
          const dataFromRemoteModule = <number>(
            testModuleProps.getData('testModuleIndexNumber')
          );
          output.push(dataFromRemoteModule);
        });
      });

      run(() => output.push(3));
      run(() => output.push(5));
      run(() => output.push(4));
    });
    const context = new ApplicationContext();
    context.activate(appPackage).finally(() => {
      expect(output).toEqual([1, 2, 11, 420, 3, 5, 4]);
      expect(output).not.toEqual([1, 2, 3, 5, 4]);
      done();
    });
  });
});

describe('failover', () => {
  test('async run / runOn command execution', (done) => {
    let flag = 100;
    const context = new ApplicationContext();
    context
      .activate(({ runOn, run, useModule }) => {
        useModule('test', () => {
          return new Promise((resolve) => {
            setTimeout(() => {
              flag = 200;
              resolve(null);
            }, 800);
          });
        });
      })
      .catch(done)
      .finally(() => {
        expect(flag).toEqual(200);
        done();
      });
  });
  test('prevent usage of run command after initialization', async () => {
    const output: number[] = [];
    const context = new ApplicationContext();
    let error: any = null;
    try {
      await context.activate(({ run }) => {
        run(() => {
          output.push(12);
          run(() => {
            output.push(13);
          });
        });
      });
    } catch (e) {
      error = e;
    }
    expect(error).not.toEqual(null);
    expect(output).toEqual([12]);
  });

  test('useModule() should not accept slash / backslash', () => {
    const context = new ApplicationContext();
    context.activate(({ useModule }) => {
      const t = () => useModule('/test', () => {});
      expect(t).toThrowError();
    });
  });
});

describe('utils', () => {
  test('extractRef() should extract info from relative address', () => {
    const data = extractRef('hello', 'default');
    expect(data.moduleName).toBe('default');
    expect(data.refId).toBe('hello');
  });

  test('extractRef() should extract info from absolute address', () => {
    const data = extractRef('test/hello', 'default');
    expect(data.moduleName).toBe('test');
    expect(data.refId).toBe('hello');
  });

  // eslint-disable-next-line max-len
  test('extractRef() should extract info from absolute address (with multiple parts)', () => {
    const data = extractRef('test/hello/sample', 'default');
    expect(data.moduleName).toBe('test');
    expect(data.refId).toBe('hello/sample');
  });

  test('extractRef() should attach groupKey in refId', () => {
    const data = extractRef('hello', 'default', 'sample_group');
    expect(data.moduleName).toBe('default');
    expect(data.refId).toBe('sample_group_hello');
  });
});

describe('useDataFromContext()', () => {
  let context: ApplicationContext;

  beforeEach(() => {
    context = new ApplicationContext();
  });

  test(`useDataFromContext('test') should put to current module`, () => {
    context.activate(({ useDataFromContext }) => {
      const item = useDataFromContext('test', 'hello', false, 'demo_group');
      expect(item).toBe('hello');
      expect(context.getData('default', 'demo_group_test')).toBe('hello');
    });
  });

  test(`useDataFromContext('mod1/test') should put to mod1`, () => {
    context.activate(({ useDataFromContext }) => {
      const item = useDataFromContext('mod1/test', 'hello');
      expect(item).toBe('hello');
      expect(context.getData('mod1', 'test')).toBe('hello');
    });
  });

  test(`useDataFromContext('mod1/test') should take from mod1`, (done) => {
    context
      .activate(({ useModule }) => {
        useModule('mod1', ({ useDataFromContext }) => {
          const item = useDataFromContext('test', 'hello', false, 'demo_group');
          expect(item).toBe('hello');
          expect(context.getData('mod1', 'demo_group_test')).toBe('hello');
        });

        useModule('mod2', ({ useDataFromContext }) => {
          const item = useDataFromContext(
            'mod1/test',
            undefined,
            undefined,
            'demo_group'
          );
          expect(item).toBe('hello');
          expect(context.getData('mod1', 'demo_group_test')).toBe('hello');
        });
      })
      .then(() => done())
      .catch(done);
  });

  test(`useDataFromContext('mod1/test') should throw overrite error`, (done) => {
    context
      .activate(({ useModule }) => {
        useModule('mod1', ({ useDataFromContext }) => {
          const item = useDataFromContext('test', 'hello');
          expect(item).toBe('hello');
          expect(context.getData('mod1', 'test')).toBe('hello');
        });

        useModule('mod2', ({ useDataFromContext }) => {
          const t = () => useDataFromContext('mod1/test', 'hello again');
          expect(t).toThrowError();
        });

        useModule('mod2', ({ useDataFromContext }) => {
          const item = useDataFromContext('mod1/test', 'hello again', true);
          expect(item).toBe('hello again');
        });
      })
      .then(() => done())
      .catch(done);
  });
});
