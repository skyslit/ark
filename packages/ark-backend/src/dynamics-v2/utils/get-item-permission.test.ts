import { extractPaths, getItemPermission } from './get-item-permission';

describe('extractPaths fn', () => {
  test('common usage', () => {
    let paths = extractPaths();
    expect(paths.length).toStrictEqual(1);
    expect(paths[0]).toStrictEqual('/');

    paths = extractPaths('');
    expect(paths.length).toStrictEqual(1);
    expect(paths[0]).toStrictEqual('/');

    paths = extractPaths('/');
    expect(paths.length).toStrictEqual(1);
    expect(paths[0]).toStrictEqual('/');

    paths = extractPaths('/test');
    expect(paths.length).toStrictEqual(2);
    expect(paths[0]).toStrictEqual('/');
    expect(paths[1]).toStrictEqual('/test');

    paths = extractPaths('/test/');
    expect(paths.length).toStrictEqual(2);
    expect(paths[0]).toStrictEqual('/');
    expect(paths[1]).toStrictEqual('/test');

    paths = extractPaths('/test/123');
    expect(paths.length).toStrictEqual(3);
    expect(paths[0]).toStrictEqual('/');
    expect(paths[1]).toStrictEqual('/test');
    expect(paths[2]).toStrictEqual('/test/123');

    paths = extractPaths('/test/123/');
    expect(paths.length).toStrictEqual(3);
    expect(paths[0]).toStrictEqual('/');
    expect(paths[1]).toStrictEqual('/test');
    expect(paths[2]).toStrictEqual('/test/123');
  });
});

function getItemsByPaths(paths: string[], items: any[]) {
  return paths.reduce((acc, path) => {
    const item = items.find((item) => item.path === path);
    if (item) {
      acc.push(item);
    }
    return acc;
  }, []);
}

test('common usage > user > read access: should', async () => {
  const permission = await getItemPermission(
    'default',
    '/test/hello',
    { emailAddress: 'dz@skyslit.com' },
    {
      async getItems(paths) {
        return getItemsByPaths(paths, [
          {
            path: '/',
            security: {
              permissions: [],
            },
          },
          {
            path: '/test/hello',
            security: {
              permissions: [
                {
                  type: 'user', // user | policy | public
                  policy: '',
                  userEmail: 'dz@skyslit.com',
                  access: 'read', // none | read | write | owner
                },
              ],
            },
          },
          {
            path: '/test',
            security: {
              permissions: [],
            },
          },
          {
            path: '/test/hello/123',
            security: {
              permissions: [],
            },
          },
        ]);
      },
    }
  );

  expect(permission.claims.owner).toBeFalsy();
  expect(permission.claims.write).toBeFalsy();
  expect(permission.claims.read).toBeTruthy();
});

test('common usage > user > read access: should not', async () => {
  const permission = await getItemPermission(
    'default',
    '/test/hello',
    { emailAddress: 'dz@skyslit.com' },
    {
      async getItems(paths) {
        return getItemsByPaths(paths, [
          {
            path: '/',
            security: {
              permissions: [],
            },
          },
          {
            path: '/test/hello',
            security: {
              permissions: [
                {
                  type: 'user', // user | policy | public
                  policy: '',
                  userEmail: 'another-user@skyslit.com',
                  access: 'read', // none | read | write | owner
                },
              ],
            },
          },
          {
            path: '/test',
            security: {
              permissions: [],
            },
          },
          {
            path: '/test/hello/123',
            security: {
              permissions: [],
            },
          },
        ]);
      },
    }
  );

  expect(permission.claims.owner).toBeFalsy();
  expect(permission.claims.write).toBeFalsy();
  expect(permission.claims.read).toBeFalsy();
});

test('inherited usage > policy > write access: should', async () => {
  const permission = await getItemPermission(
    'default',
    '/test/hello',
    {
      emailAddress: 'dz@skyslit.com',
      policies: ['sample-policy', 'test-policy'],
    },
    {
      async getItems(paths) {
        return getItemsByPaths(paths, [
          {
            path: '/',
            security: {
              permissions: [],
            },
          },
          {
            path: '/test/hello',
            security: {
              permissions: [],
            },
          },
          {
            path: '/test',
            security: {
              permissions: [
                {
                  type: 'policy', // user | policy | public
                  policy: 'test-policy',
                  userEmail: null,
                  access: 'write', // none | read | write | owner
                },
              ],
            },
          },
          {
            path: '/test/hello/123',
            security: {
              permissions: [],
            },
          },
        ]);
      },
    }
  );

  expect(permission.claims.owner).toBeFalsy();
  expect(permission.claims.write).toBeTruthy();
  expect(permission.claims.read).toBeTruthy();
});

test('inherited usage > public > write access: should', async () => {
  const permission = await getItemPermission(
    'default',
    '/test/hello',
    {
      emailAddress: 'dz@skyslit.com',
      policies: ['sample-policy', 'test-policy'],
    },
    {
      async getItems(paths) {
        return getItemsByPaths(paths, [
          {
            path: '/',
            security: {
              permissions: [],
            },
          },
          {
            path: '/test/hello',
            security: {
              permissions: [],
            },
          },
          {
            path: '/test',
            security: {
              permissions: [
                {
                  type: 'public', // user | policy | public
                  policy: null,
                  userEmail: null,
                  access: 'write', // none | read | write | owner
                },
              ],
            },
          },
          {
            path: '/test/hello/123',
            security: {
              permissions: [],
            },
          },
        ]);
      },
    }
  );

  expect(permission.claims.owner).toBeFalsy();
  expect(permission.claims.write).toBeTruthy();
  expect(permission.claims.read).toBeTruthy();
});

test('common usage > super admin > owner access: should', async () => {
  const permission = await getItemPermission(
    'default',
    '/test/hello',
    {
      emailAddress: 'dz@skyslit.com',
      policies: ['sample-policy', 'test-policy', 'SUPER_ADMIN'],
    },
    {
      async getItems(paths) {
        return getItemsByPaths(paths, [
          {
            path: '/',
            security: {
              permissions: [],
            },
          },
          {
            path: '/test/hello',
            security: {
              permissions: [],
            },
          },
          {
            path: '/test',
            security: {
              permissions: [],
            },
          },
          {
            path: '/test/hello/123',
            security: {
              permissions: [],
            },
          },
        ]);
      },
    }
  );

  expect(permission.claims.owner).toBeTruthy();
  expect(permission.claims.write).toBeTruthy();
  expect(permission.claims.read).toBeTruthy();
});

test('common usage > null user > write access: should', async () => {
  const permission = await getItemPermission('default', '/test/hello', null, {
    async getItems(paths) {
      return getItemsByPaths(paths, [
        {
          path: '/',
          security: {
            permissions: [],
          },
        },
        {
          path: '/test/hello',
          security: {
            permissions: [],
          },
        },
        {
          path: '/test',
          security: {
            permissions: [
              {
                type: 'public', // user | policy | public
                policy: null,
                userEmail: null,
                access: 'write', // none | read | write | owner
              },
            ],
          },
        },
        {
          path: '/test/hello/123',
          security: {
            permissions: [],
          },
        },
      ]);
    },
  });

  expect(permission.claims.owner).toBeFalsy();
  expect(permission.claims.write).toBeTruthy();
  expect(permission.claims.read).toBeTruthy();
});
