import { ApplicationContext } from '@skyslit/ark-core';
import { Backend, defineService, Security } from '../../index';
import supertest from 'supertest';

describe('Response Security', () => {
  test('no X-Powered-By', (done) => {
    const appContext = new ApplicationContext();
    appContext
      .activate(({ use }) => {
        const { useService } = use(Backend);
        const { enableAuth } = use(Security);

        enableAuth({
          jwtSecretKey: 'SECRET-100',
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
            opts.defineLogic((opts) => {
              opts.logout();
              return opts.success({ status: 'success' });
            });
          })
        );
      })
      .catch(done)
      .finally(() => {
        // Perform assertion
        const app = appContext.getData('default', 'express');

        // Try accessing protected route and expect 401
        supertest(app)
          .post('/___service/default/me')
          .expect(401)
          .then((res) => {
            // Login and generate token
            supertest(app)
              .post('/___service/default/login')
              .expect(200)
              .then((res) => {
                expect(res.headers['x-powered-by']).toBeFalsy();

                // Again try accessing the protected route and expect 200
                supertest(app)
                  .post('/___service/default/me')
                  .set('Cookie', res.headers['set-cookie'][0])
                  .expect(200)
                  .then((res) => {
                    expect(res.body.meta.isAuthenticated).toStrictEqual(true);

                    // Logout and expect authorization to be reset
                    supertest(app)
                      .post('/___service/default/logout')
                      .expect(200)
                      .then((res) => {
                        expect(res.headers['set-cookie'][0]).toMatch(
                          /^authorization=/
                        );

                        appContext
                          .deactivate()
                          .then(() => done())
                          .catch(done);
                      })
                      .catch(done);
                  })
                  .catch(done);
              })
              .catch(done);
          })
          .catch(done);
      });
  });
});
