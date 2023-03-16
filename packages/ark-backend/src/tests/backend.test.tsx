import React from 'react';
import path from 'path';
import { ApplicationContext } from '@skyslit/ark-core';
import {
  Backend,
  Data,
  defineService,
  ServiceController,
  Security,
  documentQueryToServiceResponse,
} from '../index';
import { Connection } from 'mongoose';
import supertest from 'supertest';
// import * as http from 'http';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createReactApp, Frontend } from '@skyslit/ark-frontend';
import Joi from 'joi';
import puppeteer from 'puppeteer';
import fs from 'fs';

declare global {
  // eslint-disable-next-line no-unused-vars
  namespace Ark {
    // eslint-disable-next-line no-unused-vars
    interface Databases {
      testDb: Connection;
    }
  }
}

process.env.DISABLE_APP_LOG = 'true';

describe('utils', () => {
  describe('useJwt', () => {
    test('should sign with default options', (done) => {
      const context = new ApplicationContext();

      context
        .activate(({ use }) => {
          const {} = use(Backend);
          const { jwt, enableAuth } = use(Security);
          enableAuth({
            jwtSecretKey: 'test_key_123',
          });
          const signedToken = jwt.sign({
            message: 'Secret Message',
          });
          const verifiedToken: any = jwt.verify(signedToken);

          expect(verifiedToken.message).toStrictEqual('Secret Message');
        })
        .then(() => {
          done();
        })
        .catch(done);
    });

    test('should sign with custom options', (done) => {
      const context = new ApplicationContext();

      context
        .activate(({ use }) => {
          const {} = use(Backend);
          const { jwt, enableAuth } = use(Security);
          enableAuth({
            jwtSecretKey: 'test_key_123',
          });

          const signedToken = jwt.sign(
            {
              message: 'Secret Message 2',
            },
            'test_key_456'
          );

          const verifiedToken: any = jwt.verify(signedToken, 'test_key_456');

          expect(verifiedToken.message).toStrictEqual('Secret Message 2');
        })
        .then(() => {
          done();
        })
        .catch(done);
    });

    test('should decode without verifying', (done) => {
      const context = new ApplicationContext();

      context
        .activate(({ use }) => {
          const {} = use(Backend);
          const { jwt, enableAuth } = use(Security);
          enableAuth({
            jwtSecretKey: 'test_key_123',
          });

          const signedToken = jwt.sign(
            {
              message: 'Secret Message 2',
            },
            'test_key_456'
          );

          const verifiedToken: any = jwt.decode(signedToken);

          expect(verifiedToken.message).toStrictEqual('Secret Message 2');
        })
        .then(() => {
          done();
        })
        .catch(done);
    });
  });
});

describe('Backend services', () => {
  test('useServer() fn with http', (done) => {
    const appContext = new ApplicationContext();
    appContext
      .activate(({ use, useModule }) => {
        const { useServer } = use(Backend);

        useModule('test', ({ use }) => {
          const { useRoute } = use(Backend);
          useRoute('get', '/', (req, res) => {
            res.send('Hello from test server');
          });
        });

        useServer();
      })
      .then(() => {
        return puppeteer.launch().then((browser) => {
          return browser
            .newPage()
            .then(async (page) => {
              await page.goto('http://localhost:3000');
              const bodyHTML = await page.evaluate(
                () => document.body.innerHTML
              );
              expect(bodyHTML).toContain('Hello from test server');
            })
            .then(() => {
              return browser.close();
            });
        });
      })
      .catch(done)
      .finally(async () => {
        await appContext.deactivate();
        done();
      });
  });

  test('useServer() fn with https', (done) => {
    const appContext = new ApplicationContext();
    appContext
      .activate(({ use, useModule }) => {
        const { useServer } = use(Backend);

        useModule('test', ({ use }) => {
          const { useRoute } = use(Backend);
          useRoute('get', '/', (req, res) => {
            res.send('Hello from test server');
          });
        });

        useServer({
          port: 3000,
          securePort: 3443,
          enableHttps: true,
          secureOptions: {
            key: fs.readFileSync(
              path.join(__dirname, './local-ssl/private.key')
            ),
            cert: fs.readFileSync(
              path.join(__dirname, './local-ssl/private.crt')
            ),
          },
        });
      })
      .then(() => {
        return puppeteer
          .launch({
            ignoreHTTPSErrors: true,
          })
          .then((browser) => {
            return browser
              .newPage()
              .then(async (page) => {
                await page.goto('https://localhost:3443');
                const bodyHTML = await page.evaluate(
                  () => document.body.innerHTML
                );
                expect(bodyHTML).toContain('Hello from test server');
              })
              .then(() => {
                return browser.close();
              });
          });
      })
      .catch(done)
      .finally(async () => {
        await appContext.deactivate();
        done();
      });
  });

  test('useRoute() fn', (done) => {
    const appContext = new ApplicationContext();
    appContext
      .activate(({ use }) => {
        const { useRoute } = use(Backend);
        useRoute('get', '/', (req, res, next) => {
          res.send('hello');
        });
      })
      .finally(() => {
        supertest(appContext.getData('default', 'express'))
          .get('/')
          .then((res) => {
            expect(res.status).toBe(200);
            done();
          });
      });
  });

  test('body should be attached to the req', (done) => {
    const appContext = new ApplicationContext();
    appContext
      .activate(({ use }) => {
        const { useRoute } = use(Backend);
        useRoute('post', '/test-post', (req, res, next) => {
          expect(req.body.sampleKey).toStrictEqual('testVal');
          res.send('hello');
        });
      })
      .finally(() => {
        supertest(appContext.getData('default', 'express'))
          .post('/test-post')
          .send({ sampleKey: 'testVal' })
          .then((res) => {
            expect(res.status).toBe(200);
            done();
          });
      });
  });

  describe('useService() fn', () => {
    test('response structure should be appropriate', (done) => {
      const testService = defineService('TEST_SERVICE', (opts) => {
        opts.defineLogic((opts) => {
          return opts.success({ message: 'This is from meta' }, [1, 2, 3]);
        });
      });

      const context = new ApplicationContext();
      context
        .activate(({ use }) => {
          const { useService } = use(Backend);
          useService(testService, {
            controller: new ServiceController(),
          });
        })
        .finally(() => {
          supertest(context.getData('default', 'express'))
            .post('/___service/default/TEST_SERVICE')
            .expect(200)
            .then((res) => {
              expect(res.body.meta.message).toStrictEqual('This is from meta');
              expect(res.body.data).toStrictEqual([1, 2, 3]);
              expect(res.body.type).toStrictEqual('success');
              done();
            });
        });
    });

    test('response structure should be self managed', (done) => {
      const testService = defineService('TEST_SERVICE', (opts) => {
        opts.defineLogic((opts) => {
          opts.args.res.send('Hello there');
        });
      });

      const context = new ApplicationContext();
      context
        .activate(({ use }) => {
          const { useService } = use(Backend);
          useService(testService, {
            controller: new ServiceController(),
          });
        })
        .finally(() => {
          supertest(context.getData('default', 'express'))
            .post('/___service/default/TEST_SERVICE')
            .expect(200)
            .then((res) => {
              // Expect to manually modify res
              expect(res.text).toStrictEqual('Hello there');
              done();
            });
        });
    });

    test('should register in service controller', (done) => {
      const testService = defineService('TEST_SERVICE', (opts) => {
        opts.defineLogic((opts) => {
          return opts.success({ message: 'This is from meta' });
        });
      });

      const context = new ApplicationContext();
      const serviceController = new ServiceController();
      context
        .activate(({ use }) => {
          const { useService } = use(Backend);
          useService(testService, {
            controller: serviceController,
            skipServiceRegistration: true,
          });
        })
        .finally(() => {
          supertest(context.getData('default', 'express'))
            .post('/___service/default/TEST_SERVICE')
            .expect(200)
            .then((res) => {
              expect(
                serviceController.find('TEST_SERVICE', 'service')
              ).toBeFalsy();
              done();
            });
        });
    });

    test('should not register in service controller', (done) => {
      const testService = defineService('TEST_SERVICE', (opts) => {
        opts.defineLogic((opts) => {
          return opts.success({ message: 'This is from meta' });
        });
      });

      const context = new ApplicationContext();
      const serviceController = new ServiceController();
      context
        .activate(({ use }) => {
          const { useService } = use(Backend);
          useService(testService, {
            controller: serviceController,
          });
        })
        .finally(() => {
          supertest(context.getData('default', 'express'))
            .post('/___service/default/TEST_SERVICE')
            .expect(200)
            .then((res) => {
              expect(
                serviceController.find('TEST_SERVICE', 'service')
              ).toBeTruthy();
              done();
            });
        });
    });

    test('should say 400 for invalid request', (done) => {
      const testService = defineService('TEST_SERVICE', (opts) => {
        opts.defineValidator(
          Joi.object({
            userName: Joi.string().required(),
          })
        );

        opts.defineLogic((opts) => {
          return opts.success({ message: 'This is from meta' });
        });
      });

      const context = new ApplicationContext();
      const serviceController = new ServiceController();
      context
        .activate(({ use }) => {
          const { useService } = use(Backend);
          useService(testService, {
            controller: serviceController,
          });
        })
        .finally(() => {
          supertest(context.getData('default', 'express'))
            .post('/___service/default/TEST_SERVICE')
            .expect(400)
            .then((res) => {
              expect(res.body.message).toStrictEqual('"userName" is required');
              expect(res.body.validationErrors[0].key).toStrictEqual(
                'userName'
              );
              expect(res.body.validationErrors[0].message).toStrictEqual(
                '"userName" is required'
              );
              done();
            });
        });
    });

    test('should say 401 for unauthorised scenario', (done) => {
      const loginService = defineService('LOGIN', (opts) => {
        opts.defineLogic((opts) => {
          return opts.success({
            token: opts.security.jwt.sign({
              _id: 'u-100',
              name: 'John',
              email: 'john@doe.com',
            }),
          });
        });
      });

      const testService = defineService('TEST', (opts) => {
        opts.defineRule((opts) => {
          if (opts.args.isAuthenticated) {
            opts.allow();
          }
        });
        opts.defineLogic((opts) => {
          return opts.success({
            message: 'This is from meta',
            user: opts.args.user,
          });
        });
      });

      const context = new ApplicationContext();
      const serviceController = new ServiceController();
      context
        .activate(({ use }) => {
          const { useService } = use(Backend);
          const { enableAuth } = use(Security);

          enableAuth({
            jwtSecretKey: 'my_secret_123',
          });

          useService(testService, {
            controller: serviceController,
          });

          useService(loginService, {
            controller: serviceController,
          });
        })
        .finally(() => {
          // Try accessing protected route
          supertest(context.getData('default', 'express'))
            .post('/___service/default/TEST')
            .expect(401)
            .then((res) => {
              // Login
              supertest(context.getData('default', 'express'))
                .post('/___service/default/LOGIN')
                .expect(200)
                .then((res) => {
                  const token = res.body.meta.token;
                  // Access the protected route again with token
                  supertest(context.getData('default', 'express'))
                    .post('/___service/default/TEST')
                    .set('Authorization', token)
                    .expect(200)
                    .then((res) => {
                      expect(res.body.meta.user.name).toStrictEqual('John');
                      expect(res.body.meta.message).toStrictEqual(
                        'This is from meta'
                      );
                      done();
                    })
                    .catch(done);
                })
                .catch(done);
            })
            .catch(done);
        });
    });

    test('should say 403 for forbidden request', (done) => {
      const loginService = defineService('LOGIN', (opts) => {
        opts.defineLogic((opts) => {
          return opts.success({
            token: opts.security.jwt.sign({
              _id: 'u-100',
              name: 'John',
              email: 'john@doe.com',
            }),
          });
        });
      });

      const testService = defineService('TEST', (opts) => {
        opts.defineRule((opts) => {
          if (opts.args.isAuthenticated) {
            opts.allowPolicy('SAMPLE_POLICY');
          }
        });
        opts.defineLogic((opts) => {
          return opts.success({
            message: 'This is from meta',
            user: opts.args.user,
          });
        });
      });

      const context = new ApplicationContext();
      const serviceController = new ServiceController();
      context
        .activate(({ use }) => {
          const { useService } = use(Backend);
          const { enableAuth } = use(Security);

          enableAuth({
            jwtSecretKey: 'my_secret_123',
          });

          useService(testService, {
            controller: serviceController,
          });

          useService(loginService, {
            controller: serviceController,
          });
        })
        .finally(() => {
          // Try accessing protected route
          supertest(context.getData('default', 'express'))
            .post('/___service/default/TEST')
            .expect(401)
            .then((res) => {
              // Login
              supertest(context.getData('default', 'express'))
                .post('/___service/default/LOGIN')
                .expect(200)
                .then((res) => {
                  const token = res.body.meta.token;
                  // Access the protected route again with token
                  supertest(context.getData('default', 'express'))
                    .post('/___service/default/TEST')
                    .set('Authorization', token)
                    .expect(403)
                    .then((res) => {
                      expect(res.body.message).toStrictEqual(
                        'Access forbidden'
                      );
                      done();
                    })
                    .catch(done);
                })
                .catch(done);
            })
            .catch(done);
        });
    });

    test('should say 200 when policy is matched', (done) => {
      const loginService = defineService('LOGIN', (opts) => {
        opts.defineLogic((opts) => {
          return opts.success({
            token: opts.security.jwt.sign({
              _id: 'u-100',
              name: 'John',
              email: 'john@doe.com',
              policies: ['SAMPLE_POLICY'],
            }),
          });
        });
      });

      const testService = defineService('TEST', (opts) => {
        opts.defineRule((opts) => {
          if (opts.args.isAuthenticated) {
            opts.allowPolicy('SAMPLE_POLICY');
          }
        });
        opts.defineLogic((opts) => {
          return opts.success({
            message: 'This is from meta',
            user: opts.args.user,
          });
        });
      });

      const context = new ApplicationContext();
      const serviceController = new ServiceController();
      context
        .activate(({ use }) => {
          const { useService } = use(Backend);
          const { enableAuth } = use(Security);

          enableAuth({
            jwtSecretKey: 'my_secret_123',
          });

          useService(testService, {
            controller: serviceController,
          });

          useService(loginService, {
            controller: serviceController,
          });
        })
        .finally(() => {
          // Try accessing protected route
          supertest(context.getData('default', 'express'))
            .post('/___service/default/TEST')
            .expect(401)
            .then((res) => {
              // Login
              supertest(context.getData('default', 'express'))
                .post('/___service/default/LOGIN')
                .expect(200)
                .then((res) => {
                  const token = res.body.meta.token;
                  // Access the protected route again with token
                  supertest(context.getData('default', 'express'))
                    .post('/___service/default/TEST')
                    .set('Authorization', token)
                    .expect(200)
                    .then((res) => {
                      done();
                    })
                    .catch(done);
                })
                .catch(done);
            })
            .catch(done);
        });
    });

    test('should say 200 when user name is John', (done) => {
      const loginService = defineService('LOGIN', (opts) => {
        opts.defineLogic((opts) => {
          return opts.success({
            token: opts.security.jwt.sign({
              _id: 'u-100',
              name: 'John',
              email: 'john@doe.com',
              role: 'STANDARD_USER',
            }),
          });
        });
      });

      const testService = defineService('TEST', (opts) => {
        opts.defineRule((opts) => {
          if (opts.args.isAuthenticated) {
            opts.allowPolicy('SAMPLE_POLICY');
          }
        });
        opts.defineLogic((opts) => {
          return opts.success({
            message: 'This is from meta',
            user: opts.args.user,
          });
        });
      });

      const context = new ApplicationContext();
      const serviceController = new ServiceController();
      context
        .activate(({ use }) => {
          const { useService } = use(Backend);
          const { enableAuth, definePolicyExtractor } = use(Security);

          enableAuth({
            jwtSecretKey: 'my_secret_123',
          });

          definePolicyExtractor('global', (args) => {
            if (args.isAuthenticated === true) {
              if (args.user.name === 'John') {
                return ['SAMPLE_POLICY'];
              }
            }
          });

          definePolicyExtractor('test-extractor', (args) => {
            return ['TEST_POLICY'];
          });

          useService(testService, {
            controller: serviceController,
            policyExtractorRefs: ['test-extractor', 'global'],
          });

          useService(loginService, {
            controller: serviceController,
          });
        })
        .finally(() => {
          // Try accessing protected route
          supertest(context.getData('default', 'express'))
            .post('/___service/default/TEST')
            .expect(401)
            .then((res) => {
              // Login
              supertest(context.getData('default', 'express'))
                .post('/___service/default/LOGIN')
                .expect(200)
                .then((res) => {
                  const token = res.body.meta.token;
                  // Access the protected route again with token
                  supertest(context.getData('default', 'express'))
                    .post('/___service/default/TEST')
                    .set('Authorization', token)
                    .expect(200)
                    .then((res) => {
                      expect(res.body.meta.message).toStrictEqual(
                        'This is from meta'
                      );
                      expect(res.body.meta.user.name).toStrictEqual('John');
                      done();
                    })
                    .catch(done);
                })
                .catch(done);
            })
            .catch(done);
        });
    });

    test('should say 403 when user name is not John', (done) => {
      const loginService = defineService('LOGIN', (opts) => {
        opts.defineLogic((opts) => {
          return opts.success({
            token: opts.security.jwt.sign({
              _id: 'u-100',
              name: 'Sam',
              email: 'john@doe.com',
              role: 'STANDARD_USER',
            }),
          });
        });
      });

      const testService = defineService('TEST', (opts) => {
        opts.defineRule((opts) => {
          if (opts.args.isAuthenticated) {
            opts.allowPolicy('SAMPLE_POLICY');
          }
        });
        opts.defineLogic((opts) => {
          return opts.success({
            message: 'This is from meta',
            user: opts.args.user,
          });
        });
      });

      const context = new ApplicationContext();
      const serviceController = new ServiceController();
      context
        .activate(({ use }) => {
          const { useService } = use(Backend);
          const { enableAuth, definePolicyExtractor } = use(Security);

          enableAuth({
            jwtSecretKey: 'my_secret_123',
          });

          definePolicyExtractor('global', (args) => {
            if (args.isAuthenticated === true) {
              if (args.user.name === 'John') {
                return ['SAMPLE_POLICY'];
              }
            }
          });

          useService(testService, {
            controller: serviceController,
            policyExtractorRefs: ['global'],
          });

          useService(loginService, {
            controller: serviceController,
          });
        })
        .finally(() => {
          // Try accessing protected route
          supertest(context.getData('default', 'express'))
            .post('/___service/default/TEST')
            .expect(401)
            .then((res) => {
              // Login
              supertest(context.getData('default', 'express'))
                .post('/___service/default/LOGIN')
                .expect(200)
                .then((res) => {
                  const token = res.body.meta.token;
                  // Access the protected route again with token
                  supertest(context.getData('default', 'express'))
                    .post('/___service/default/TEST')
                    .set('Authorization', token)
                    .expect(403)
                    .then((res) => {
                      expect(res.body.message).toBeTruthy();
                      done();
                    })
                    .catch(done);
                })
                .catch(done);
            })
            .catch(done);
        });
    });
  });
});

describe('Data services', () => {
  const mongod = new MongoMemoryServer();
  let testDbConnectionString: string = '';

  beforeAll(async () => {
    testDbConnectionString = await mongod.getUri();
  }, 60000);

  test('useDatabase() fn', (done) => {
    const appContext = new ApplicationContext();
    appContext
      .activate(({ use }) => {
        const { useDatabase } = use(Data);
        useDatabase('default', testDbConnectionString);
      })
      .catch(done)
      .finally(() => {
        // Perform assertion
        appContext.deactivate().then(done);
      });
  });

  test('useModel() fn as remote function', (done) => {
    const appContext = new ApplicationContext();
    appContext
      .activate(({ use, useModule }) => {
        const { useDatabase } = use(Data);
        useDatabase('default', testDbConnectionString);
        useModule('testModule', ({ use, run }) => {
          const { useModel } = use(Data);
          useModel('StudentSchema', {
            name: {
              type: String,
            },
          });
          run(async () => {
            const { useModel } = use(Data);
            const StudentSchema = useModel('StudentSchema');
            const newStudent = new StudentSchema({
              name: 'John Doe',
            });
            return newStudent.save();
          });
        });
        useModule('testModule2', ({ runOn }) => {
          runOn('testModule', async ({ use }) => {
            const { useModel } = use(Data);
            const StudentSchema = useModel('StudentSchema');
            const students = await StudentSchema.find({}).exec();
            expect(students.length).toEqual(1);
            expect((students[0] as any).name).toEqual('John Doe');
          });
        });
      })
      .catch(done)
      .finally(async () => {
        await appContext.deactivate();
        done();
      });
  });

  test('useModel() fn with different database', (done) => {
    const appContext = new ApplicationContext();
    appContext
      .activate(({ use, useModule }) => {
        const { useDatabase } = use(Data);
        useDatabase('testDb', testDbConnectionString);
        useModule('testModule', ({ use, run }) => {
          const { useModel } = use(Data);
          useModel(
            'ProfileSchema',
            {
              name: {
                type: String,
              },
              age: {
                type: Number,
              },
            },
            'testDb'
          );
          run(() => {
            const { useModel } = use(Data);
            const ProfileSchema = useModel(
              'ProfileSchema',
              undefined,
              'testDb'
            );
            const newStudent = new ProfileSchema({
              name: 'John Doe',
              age: 21,
            });
            return newStudent.save();
          });
        });
        useModule('testModule2', ({ runOn }) => {
          runOn('testModule', async ({ use }) => {
            const { useModel } = use(Data);
            const ProfileSchema = useModel(
              'ProfileSchema',
              undefined,
              'testDb'
            );
            const students = await ProfileSchema.find({}).exec();
            expect(students.length).toEqual(1);
            expect((students[0] as any).name).toEqual('John Doe');
            expect((students[0] as any).age).toEqual(21);
          });
        });
      })
      .catch(done)
      .finally(async () => {
        await appContext.deactivate();
        done();
      });
  });

  test('documentQueryToServiceResponse() function general usage', (done) => {
    const appContext = new ApplicationContext();
    appContext
      .activate(({ use, useModule }) => {
        const {} = use(Backend);
        const { useDatabase } = use(Data);

        useDatabase('testDb', testDbConnectionString);

        useModule('default', async ({ use }) => {
          const { useModel } = use(Data);

          const BookModel = useModel(
            'BookSchema',
            {
              name: {
                type: String,
              },
              age: {
                type: Number,
              },
            },
            'testDb'
          );

          await Promise.all(
            [
              { name: 'Test 1', age: 20 },
              { name: 'Test 21', age: 21 },
              { name: 'Test 6', age: 15 },
              { name: 'Test 19', age: 32 },
              { name: 'Test 23', age: 31 },
              { name: 'Test 2', age: 35 },
              { name: 'Test 18', age: 42 },
            ].map((doc) => new BookModel(doc).save())
          );

          const allResult = await documentQueryToServiceResponse(
            BookModel.find({}),
            {} as any
          );

          const filteredResult = await documentQueryToServiceResponse(
            BookModel.find({}),
            {
              input: {
                query: JSON.stringify({
                  name: 'Test 21',
                }),
              },
            } as any
          );

          const sortedResult = await documentQueryToServiceResponse(
            BookModel.find({}),
            {
              input: {
                sort: JSON.stringify({
                  name: -1,
                }),
              },
            } as any
          );

          const projectedResult = await documentQueryToServiceResponse(
            BookModel.find({}),
            {
              input: {
                select: JSON.stringify({
                  name: -1,
                }),
              },
            } as any
          );

          const skippedResult = await documentQueryToServiceResponse(
            BookModel.find({}),
            {
              input: {
                skip: 2,
              },
            } as any
          );

          const limitedResult = await documentQueryToServiceResponse(
            BookModel.find({}),
            {
              input: {
                limit: 2,
              },
            } as any
          );

          const masterFilteredResult = await documentQueryToServiceResponse(
            BookModel.find({
              age: {
                $gt: 30,
              },
            }),
            {
              input: {
                query: JSON.stringify({
                  age: {
                    $lt: 40,
                  },
                }),
              },
            } as any
          );

          const allOptionsResult = await documentQueryToServiceResponse(
            BookModel.find({
              age: {
                $gt: 30,
              },
            }),
            {
              input: {
                query: JSON.stringify({
                  age: {
                    $lt: 40,
                  },
                }),
                sort: JSON.stringify({
                  name: 1,
                }),
                select: JSON.stringify('name'),
                skip: 1,
                limit: 1,
              },
            } as any
          );

          expect(allResult.data).toHaveLength(7);
          expect(allResult.meta.totalCount).toStrictEqual(7);
          expect(allResult.data[0].name).toStrictEqual('Test 1');
          expect(allResult.data[0].age).toStrictEqual(20);
          expect(allResult.data[6].name).toStrictEqual('Test 18');

          expect(filteredResult.data).toHaveLength(1);
          expect(filteredResult.meta.totalCount).toStrictEqual(1);

          expect(sortedResult.data).toHaveLength(7);
          expect(sortedResult.data[0].name).toStrictEqual('Test 6');
          expect(sortedResult.data[6].name).toStrictEqual('Test 1');

          expect(projectedResult.data).toHaveLength(7);
          expect(projectedResult.data[0].name).toStrictEqual('Test 1');
          expect(projectedResult.data[0].age).toBeFalsy();
          expect(projectedResult.data[6].name).toStrictEqual('Test 18');

          expect(skippedResult.data).toHaveLength(5);
          expect(skippedResult.meta.totalCount).toStrictEqual(7);
          expect(skippedResult.data[0].name).toStrictEqual('Test 6');
          expect(
            skippedResult.data[skippedResult.data.length - 1].name
          ).toStrictEqual('Test 18');

          expect(limitedResult.data).toHaveLength(2);
          expect(limitedResult.meta.totalCount).toStrictEqual(7);
          expect(limitedResult.data[0].name).toStrictEqual('Test 1');
          expect(
            limitedResult.data[limitedResult.data.length - 1].name
          ).toStrictEqual('Test 21');

          expect(masterFilteredResult.data).toHaveLength(3);
          expect(masterFilteredResult.meta.totalCount).toStrictEqual(3);
          expect(masterFilteredResult.data[0].name).toStrictEqual('Test 19');
          expect(
            masterFilteredResult.data[masterFilteredResult.data.length - 1].name
          ).toStrictEqual('Test 2');

          expect(allOptionsResult.data).toHaveLength(1);
          expect(allOptionsResult.meta.totalCount).toStrictEqual(3);
          expect(allOptionsResult.data[0].name).toStrictEqual('Test 2');
          expect(allOptionsResult.data[0].age).toBeFalsy();
        });
      })
      .then(() => appContext.deactivate())
      .then(() => done())
      .catch(done);
  });

  afterAll(async () => {
    await mongod.stop();
  });
});

describe('useRemoteConfig()', () => {
  const mongod = new MongoMemoryServer();
  let testDbConnectionString: string = '';

  beforeEach(async () => {
    testDbConnectionString = await mongod.getUri();
  }, 60000);

  test('startup without error', (done) => {
    const appContext = new ApplicationContext();

    appContext
      .activate(({ use, useModule }) => {
        const { useDatabase } = use(Data);
        useDatabase('default', testDbConnectionString);

        useModule('test', async ({ use }) => {
          const { useRemoteConfig } = use(Backend);

          const { load } = useRemoteConfig();

          const config = await load();

          expect(config).toBeTruthy();
          expect(config.publicConfig).toEqual({});
          expect(config.privateConfig).toEqual({});
        });
      })
      .catch(done)
      .finally(() => {
        // Perform assertion
        appContext.deactivate().then(done);
      });
  });

  test('sync without error', (done) => {
    const appContext = new ApplicationContext();

    appContext
      .activate(({ use, useModule }) => {
        const { useDatabase } = use(Data);
        useDatabase('default', testDbConnectionString);

        useModule('test', async ({ use }) => {
          const { useRemoteConfig } = use(Backend);

          const { sync } = useRemoteConfig();

          const synced = await sync();

          expect(synced).toBeTruthy();
        });
      })
      .catch(done)
      .finally(() => {
        // Perform assertion
        appContext.deactivate().then(done);
      });
  });

  test('initial state should work', (done) => {
    const appContext = new ApplicationContext();

    appContext
      .activate(({ use, useModule }) => {
        const { useDatabase } = use(Data);
        useDatabase('default', testDbConnectionString);

        useModule('test', async ({ use }) => {
          const { useRemoteConfig } = use(Backend);

          const { load } = useRemoteConfig({
            privateConfig: {
              myPrivateSettings: 777,
            },
            publicConfig: {
              enablePublicFeature: 'yes',
            },
          });

          const config = await load();

          expect(config).toBeTruthy();
          expect(config.publicConfig.enablePublicFeature).toStrictEqual('yes');
          expect(config.privateConfig.myPrivateSettings).toStrictEqual(777);
        });
      })
      .catch(done)
      .finally(() => {
        // Perform assertion
        appContext.deactivate().then(done);
      });
  });

  test('put() should work as expected', (done) => {
    const appContext = new ApplicationContext();

    appContext
      .activate(({ use, useModule }) => {
        const { useDatabase } = use(Data);
        useDatabase('default', testDbConnectionString);

        useModule('test', async ({ use }) => {
          const { useRemoteConfig } = use(Backend);

          const { load, put, get } = useRemoteConfig({
            privateConfig: {
              myPrivateSettings: 777,
            },
            publicConfig: {
              enablePublicFeature: 'yes',
            },
          });

          const config = await load();

          expect(config).toBeTruthy();
          expect(config.publicConfig.enablePublicFeature).toStrictEqual('yes');
          expect(config.privateConfig.myPrivateSettings).toStrictEqual(777);

          let enablePublicFeature = await put(
            'public',
            'enablePublicFeature',
            'no'
          );
          let myPrivateSettings = await put(
            'private',
            'myPrivateSettings',
            333
          );

          enablePublicFeature = await get('public', 'enablePublicFeature');
          myPrivateSettings = await get('private', 'myPrivateSettings');

          expect(enablePublicFeature).toStrictEqual('no');
          expect(myPrivateSettings).toStrictEqual(333);

          myPrivateSettings = await put('private', 'myPrivateSettings', null);
          myPrivateSettings = await get('private', 'myPrivateSettings');

          expect(myPrivateSettings).toStrictEqual(null);
        });
      })
      .catch(done)
      .finally(() => {
        // Perform assertion
        appContext.deactivate().then(done);
      });
  });

  afterEach(async () => {
    await mongod.stop();
  });
});

describe('Frontend services', () => {
  let context: ApplicationContext;

  const webApp = createReactApp(({ use }) => {
    const { useComponent, mapRoute } = use(Frontend);
    const TestComp = useComponent('testCompo', () => {
      return <div>Hello</div>;
    });
    mapRoute('/', TestComp);
  });

  beforeEach(() => {
    context = new ApplicationContext();
  });

  test('useWebApp()', (done) => {
    context
      .activate(({ use }) => {
        const { useWebApp, useRoute } = use(Backend);
        const SampleWebApp = useWebApp(
          'sample',
          webApp,
          path.join(__dirname, 'test-template.html')
        );
        useRoute('get', '/', SampleWebApp.render());
      })
      .finally(() => {
        supertest(context.getData('default', 'express'))
          .get('/')
          .then((res) => {
            expect(res.status).toBe(200);
            expect(res.text).toContain('Hello');
            done();
          });
      });
  });
});

describe('Security services', () => {
  test('login() and logout() user flow', (done) => {
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
                expect(res.headers['set-cookie'][0]).toMatch(
                  /^authorization=Bearer/
                );

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
