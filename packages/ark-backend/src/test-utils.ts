import {
  ContextScope,
  ApplicationContext,
  setRuntimeVars,
} from '@skyslit/ark-core';
import { Data, resolveServiceUrl } from './index';
import { MongoMemoryServer } from 'mongodb-memory-server';
import supertest from 'supertest';

/* -------------------------------------------------------------------------- */
/*                                 Test Utils                                 */
/* -------------------------------------------------------------------------- */

export type BackendTestContextOptions = {
  defaultModuleId?: string;
  defaultDBId?: string;
  module: ContextScope<void>;
  dbConnString: string;
};

export type TestContextType = {
  instance: ApplicationContext;
  app: Express.Application;
  invokeService: (refId: string, body?: any) => supertest.Test;
};

/**
 * Invokes service for testing
 * @param {Express.Application} app
 * @param {string} moduleId
 * @param {string} refId
 * @param {any} body
 * @return {supertest.Test}
 */
export function invokeService(
  app: Express.Application,
  moduleId: string,
  refId: string,
  body: any = {}
): supertest.Test {
  return supertest(app).post(resolveServiceUrl(refId, moduleId)).send(body);
}

/**
 * Run test application in singleton context
 * @param {ContextScope<T> | BackendTestContextOptions} fn
 * @param {Partial<BackendTestContextOptions>} opts_
 * @return {Promise<any>}
 */
export function createTestContext(
  fn: ContextScope<void> | BackendTestContextOptions,
  opts_?: Partial<BackendTestContextOptions>
): Promise<TestContextType> {
  let activator: Promise<any> = null;

  const context = new ApplicationContext();
  let opts: BackendTestContextOptions = Object.assign<
    BackendTestContextOptions,
    Partial<BackendTestContextOptions>
  >(
    {
      module: null,
      dbConnString: null,
      defaultDBId: 'default',
      defaultModuleId: 'main',
    },
    opts_
  );

  if (typeof fn === 'object') {
    opts = Object.assign<
      BackendTestContextOptions,
      Partial<BackendTestContextOptions>
    >(opts, fn);

    if (!opts.module) {
      throw new Error('module to test not provided');
    }

    activator = context.activate(({ useModule, use }) => {
      const { useDatabase } = use(Data);
      useDatabase(opts.defaultDBId as any, opts.dbConnString);
      useModule(opts.defaultModuleId, opts.module);
    }, 'default');
  } else {
    activator = context.activate(fn, 'default');
  }

  return activator.then(() => {
    const throwExpressNotInitalisedError = () => {
      throw new Error('Test server requires useBackend() fn');
    };

    try {
      if (!context.data.default.express) {
        throwExpressNotInitalisedError();
      }
    } catch (err) {
      throwExpressNotInitalisedError();
    }
    return {
      app: context.data.default.express,
      instance: context,
      invokeService: (refId, body) =>
        invokeService(
          context.data.default.express,
          opts.defaultModuleId,
          refId,
          body
        ),
    };
  });
}

/**
 * Run
 * @param {ContextScope<void>} app
 * @param {any} env
 * @return {Promise<TestContextType>}
 */
export function runAppForTesting(
  app: ContextScope<void>,
  env: any = {}
): Promise<TestContextType> {
  const context = new ApplicationContext();
  process.env = Object.assign({}, process.env, env);

  setRuntimeVars({
    RUNTIME_MODE: 'TEST',
  });

  const activator = context.activate(app, 'default');
  return activator.then(() => {
    return {
      app: context.data.default.express,
      instance: context,
      invokeService: (refId, body) =>
        invokeService(context.data.default.express, 'default', refId, body),
    };
  });
}

/**
 * Creates test DB
 * @return {any}
 */
export function createTestDb() {
  const mongod = new MongoMemoryServer();
  return {
    mongod,
    getDbConnectionString: async (otherDbNames?: string) => {
      return await mongod.getUri(otherDbNames);
    },
    stop: async () => {
      await mongod.stop();
    },
  };
}
