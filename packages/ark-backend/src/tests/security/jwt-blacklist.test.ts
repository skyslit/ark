import { ApplicationContext } from '@skyslit/ark-core';
import { Backend, Data, defineService, Security } from '../../index';
import { MongoMemoryServer } from 'mongodb-memory-server';
import supertest from 'supertest';
import mongodb from 'mongodb';

const mongod = new MongoMemoryServer();
let testDbConnectionString: string = '';

beforeAll(async () => {
  testDbConnectionString = await mongod.getUri();
}, 60000);

afterAll(async () => {
  await mongod.stop();
}, 60000);

test('useModel() fn as remote function', (done) => {
  const appContext = new ApplicationContext();
  appContext
    .activate(({ use, useModule, useDataFromContext }) => {
      const {} = use(Backend);
      const { useDatabase } = use(Data);
      const { enableAuth } = use(Security);

      useDatabase('default', testDbConnectionString);

      enableAuth({
        jwtSecretKey: 'SECRET-100',
        jwtSignOptions: {
          expiresIn: '24h',
        },
        async blacklistToken(token, issuedAt) {
          // @ts-ignore
          const BlacklistedTokenModel: any = useDataFromContext(
            'default/BlacklistedToken',
            undefined,
            undefined,
            'model'
          );
          await BlacklistedTokenModel.updateOne(
            {
              token,
            },
            {
              $set: {
                token,
                issuedAt,
              },
            },
            { upsert: true }
          );

          return true;
        },
        async isTokenBlacklisted(token) {
          // @ts-ignore
          const BlacklistedTokenModel: any = useDataFromContext(
            'default/BlacklistedToken',
            undefined,
            undefined,
            'model'
          );
          const t = await BlacklistedTokenModel.findOne({
            token,
          });

          return Boolean(t);
        },
      });

      useModule('default', ({ use }) => {
        const { useService } = use(Backend);
        const { useModel } = use(Data);

        useModel('BlacklistedToken', {
          token: {
            type: String,
            required: true,
            index: true,
          },
          issuedAt: {
            type: Number,
            required: true,
          },
        });

        useService(
          defineService('login', (opts) => {
            opts.defineLogic((opts) => {
              opts.login(
                opts.security.jwt.sign({
                  _id: 'u-100',
                  name: 'Test User',
                  emailAddress: 'mail@example.com',
                  policies: [],
                })
              );

              return opts.success({ status: 'success' });
            });
          })
        );

        useService(
          defineService('me', (opts) => {
            opts.defineRule((opts) => {
              if (opts.args.isAuthenticated === true) {
                opts.allow();
              }
            });

            opts.defineLogic((opts) => {
              return opts.success({
                isAuthenticated: opts.args.isAuthenticated,
                user: opts.args.user,
              });
            });
          })
        );

        useService(
          defineService('logout', (opts) => {
            opts.defineLogic(async (opts) => {
              await opts.logout();
              return opts.success({ status: 'success' });
            });
          })
        );
      });
    })
    .then(() => {
      // Perform assertion
      const app = appContext.getData('default', 'express');

      // Try accessing protected route and expect 401
      return supertest(app)
        .post('/___service/default/me')
        .expect(401)
        .then((res) => {
          // Login and generate token
          return supertest(app)
            .post('/___service/default/login')
            .expect(200)
            .then((res) => {
              expect(res.headers['set-cookie'][0]).toMatch(
                /^authorization=Bearer/
              );

              const authCookie = res.headers['set-cookie'][0];

              // Again try accessing the protected route and expect 200
              return supertest(app)
                .post('/___service/default/me')
                .set('Cookie', authCookie)
                .expect(200)
                .then((res) => {
                  expect(res.body.meta.isAuthenticated).toStrictEqual(true);

                  // Logout and expect authorization to be reset
                  return supertest(app)
                    .post('/___service/default/logout')
                    .set('Cookie', authCookie)
                    .expect(200)
                    .then((res) => {
                      expect(res.headers['set-cookie'][0]).toMatch(
                        /^authorization=/
                      );
                    })
                    .catch(done);
                })
                .catch(done);
            })
            .catch(done);
        })
        .catch(done);
    })
    .then(async () => {
      const connection = await mongodb.connect(testDbConnectionString, {
        useUnifiedTopology: true,
      });

      expect(
        (
          await connection
            .db()
            .collection('default_blacklistedtokens')
            .find()
            .toArray()
        )[0].token
      ).toBeTruthy();
      expect(
        (
          await connection
            .db()
            .collection('default_blacklistedtokens')
            .find()
            .toArray()
        )[0]._id
      ).toBeTruthy();

      await connection.close();
    })
    .then(() => {
      return appContext
        .deactivate()
        .then(() => done())
        .catch(done);
    })
    .catch(done)
    .finally(async () => {
      await appContext.deactivate();
      done();
    });
});
