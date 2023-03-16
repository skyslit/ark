import {
  resolveEnvironmentVar,
  useEnv,
  setDefaultEnv,
  createEnvVariableResolver,
} from '../index';

test('common usage', async () => {
  setDefaultEnv({
    TEST_KEY: 'TEST_VALUE',
  });

  const TEST_RESOLVER = createEnvVariableResolver({
    id: 'test-resolver',
    test: () => true,
    getValueByKeys: async (keys) => {
      return keys.reduce<{ [key: string]: string }>((acc, item) => {
        switch (item.transformed) {
          case 'TEST_KEY': {
            acc[item.original] = 'TEST_VALUE_FROM_RESOLVER';
            break;
          }
        }
        return acc;
      }, {});
    },
  });

  let testEnv = useEnv('TEST_KEY');

  expect(testEnv).toStrictEqual('TEST_VALUE');

  await resolveEnvironmentVar([
    {
      resolver: TEST_RESOLVER,
      keys: ['TEST_KEY'],
    },
  ]);

  testEnv = useEnv('TEST_KEY');
  expect(testEnv).toStrictEqual('TEST_VALUE_FROM_RESOLVER');
});
