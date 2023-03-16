import { ApplicationContext, ControllerContext } from '@skyslit/ark-core';
import { createAuthMiddleware, Security } from '../index';

test('should allow bearer token with decodeUri', async () => {
  const jwtSecretKey = 'SECRET_123';
  const app = new ApplicationContext();
  // eslint-disable-next-line new-cap
  const { jwt } = Security('default', new ControllerContext(app), app);

  const token = jwt.sign({}, jwtSecretKey);

  let isNextCalled: boolean = false;
  const req: any = {
    cookies: {
      authorization: `Bearer%20${token}`,
    },
    headers: {},
  };

  await createAuthMiddleware({
    jwtSecretKey,
  })(req, null, () => (isNextCalled = true));

  expect(isNextCalled).toEqual(true);
  expect(req.isAuthenticated).toStrictEqual(true);
});

test('fieldFromDB should be falsy as the desierializer is not implemented', async () => {
  const jwtSecretKey = 'SECRET_123';
  const app = new ApplicationContext();
  // eslint-disable-next-line new-cap
  const { jwt } = Security('default', new ControllerContext(app), app);

  const token = jwt.sign(
    {
      _id: 'sample-mongo-id',
      name: 'Test User',
      emailAddress: 'test@example.com',
    },
    jwtSecretKey
  );

  let isNextCalled: boolean = false;
  const req: any = {
    cookies: {
      authorization: `Bearer%20${token}`,
    },
    headers: {},
  };

  await createAuthMiddleware({
    jwtSecretKey,
  })(req, null, () => (isNextCalled = true));

  expect(isNextCalled).toEqual(true);
  expect(req.isAuthenticated).toStrictEqual(true);
  expect(req.user.emailAddress).toStrictEqual('test@example.com');
  expect(req.user.fieldFromDB).toBeFalsy();
});

test('deserializeUser should populate fieldFromDB', async () => {
  const jwtSecretKey = 'SECRET_123';
  const app = new ApplicationContext();
  // eslint-disable-next-line new-cap
  const { jwt } = Security('default', new ControllerContext(app), app);

  const token = jwt.sign(
    {
      _id: 'sample-mongo-id',
      name: 'Test User',
      emailAddress: 'test@example.com',
    },
    jwtSecretKey
  );

  let isNextCalled: boolean = false;
  const req: any = {
    cookies: {
      authorization: `Bearer%20${token}`,
    },
    headers: {},
  };

  await createAuthMiddleware({
    jwtSecretKey,
    deserializeUser: (input) =>
      new Promise((resolve, reject) => {
        setTimeout(() => {
          resolve(
            Object.assign({}, input, {
              fieldFromDB: `custom-${input.emailAddress}`,
            })
          );
        }, 100);
      }),
  })(req, null, () => (isNextCalled = true));

  expect(isNextCalled).toEqual(true);
  expect(req.isAuthenticated).toStrictEqual(true);
  expect(req.user.emailAddress).toStrictEqual('test@example.com');
  expect(req.user.fieldFromDB).toStrictEqual('custom-test@example.com');
});
