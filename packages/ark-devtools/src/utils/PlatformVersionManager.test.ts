import { PlatformVersionManager } from './PlatformVersionManager';

test('should succesfully complete registration', () => {
  const manager = new PlatformVersionManager();
  manager.registerPlatformVersionDefinition({
    name: 'v1.0.0',
    code: 1,
    dependencies: {
      react: '^16.0.0',
    },
    devDependencies: {},
  });

  const t1 = () =>
    manager.registerPlatformVersionDefinition({
      name: 'v1.0.1',
      code: 2,
      dependencies: {
        react: '^16.0.0',
      },
      devDependencies: {},
    });

  expect(t1).not.toThrowError();
});

test('should throw error on duplicate registration', () => {
  const manager = new PlatformVersionManager();
  manager.registerPlatformVersionDefinition({
    name: 'v1.0.0',
    code: 1,
    dependencies: {
      react: '^16.0.0',
    },
    devDependencies: {},
  });

  const t1 = () =>
    manager.registerPlatformVersionDefinition({
      name: 'v1.0.1',
      code: 1,
      dependencies: {
        react: '^16.0.0',
      },
      devDependencies: {},
    });

  const t2 = () =>
    manager.registerPlatformVersionDefinition({
      name: 'v1.0.0',
      code: 2,
      dependencies: {
        react: '^16.0.0',
      },
      devDependencies: {},
    });

  expect(t1).toThrowError();
  expect(t2).toThrowError();
});

test('getPlatformVersionDefinition() should return matched version', async () => {
  const manager = new PlatformVersionManager();
  manager.registerPlatformVersionDefinition({
    name: 'v1.0.0',
    code: 1,
    dependencies: {
      react: '^16.0.0',
    },
    devDependencies: {},
  });

  manager.registerPlatformVersionDefinition({
    name: 'v1.0.1',
    code: 2,
    dependencies: {
      react: '^16.0.0',
    },
    devDependencies: {},
  });

  const result1 = await manager.getPlatformVersionDefinition('v1.0.1');
  expect(result1.code).toBe(2);

  const result2 = await manager.getPlatformVersionDefinition('v1.0.2');
  expect(result2).toBeFalsy();

  const result3 = await manager.getPlatformVersionDefinition(1);
  expect(result3.code).toBe(1);

  const result4 = await manager.getPlatformVersionDefinition(2);
  expect(result4.code).toBe(2);

  const result5 = await manager.getPlatformVersionDefinition(3);
  expect(result5).toBeFalsy();
});
