import { ApplicationContext } from '@skyslit/ark-core';
import { Backend, defineService, Security } from '../../index';
import puppeteer from 'puppeteer';

// 3000: Auth Server
// 3001: App Server

describe('Backend services', () => {
  test(
    'useServer() fn with http',
    (done) => {
      const authServerApp = new ApplicationContext();
      const mainServerApp = new ApplicationContext();
      authServerApp
        .activate(({ use, useModule }) => {
          const { useServer } = use(Backend);
          const { enableAuth } = use(Security);

          const apps = [
            {
              accessKeyId: 'test-key',
              accessSecret: 'test-secret',
              callbackUrls: [
                'http://localhost:3001/___external/auth/client/login/callback',
              ],
            },
          ];

          enableAuth({
            jwtSecretKey: 'TEST_123',
            enableExternalAuthServer: true,
            getInternalAppByAccessKeyId: async (key) => {
              return apps.find((a) => a.accessKeyId === key);
            },
            deserializeUser: (user) => {
              return {
                ...user,
                deserialized: true,
              };
            },
          });

          useModule('test', ({ use }) => {
            const { useRoute, useService } = use(Backend);
            useRoute('get', '/', (req, res) => {
              res.send('Hello from auth server');
            });

            useRoute('get', '/auth/login', (req, res) => {
              res.send(`
              <html>
              <head>
                <script>
                  async function login() {
                    fetch('/___service/test/login_service', {
                      method: 'POST',
                      credentials: 'include'
                    }).then((res) => {
                      window.location.replace(String('/___external/auth/server/login/handlers/callback' + window.location.search).replace('??', '?'));
                    });
                  }
                </script>
              </head>
              <body>
                <button onclick="login()" data-testid="login">Login Button in Auth</button>
              </body>
            </html>
            `);
            });

            useService(
              defineService('login_service', (props) => {
                props.defineLogic((props) => {
                  props.login(
                    props.security.jwt.sign({
                      name: 'Test user',
                      policies: [],
                      groups: [],
                    })
                  );
                  return props.success({ message: 'Hello there' });
                });
              })
            );
          });

          useServer();
        })
        .then(() => {
          return mainServerApp.activate(({ use, useModule }) => {
            const { useServer } = use(Backend);
            const { enableAuth } = use(Security);

            enableAuth({
              jwtSecretKey: 'TEST_1234',
              enableExternalAuthClient: true,
              externalAuthClientConf: {
                serverEndpoint:
                  'http://localhost:3000/___external/auth/server/login/initiate',
                accessKeyId: 'test-key',
                accessSecret: 'test-secret',
                callbackUrl:
                  'http://localhost:3001/___external/auth/client/login/callback',
              },
            });

            useModule('test', ({ use }) => {
              const { useRoute } = use(Backend);
              useRoute('get', '/', (req, res) => {
                res.send(`Hello from main server: ${JSON.stringify(req.user)}`);
              });
            });

            useServer({ port: 3001 });
          });
        })
        .then(() => {
          return puppeteer.launch().then((browser) => {
            return browser
              .newPage()
              .then(async (page) => {
                // page
                //   .on('console', message =>
                //     console.log(`${message.type().substr(0, 3).toUpperCase()} ${message.text()}`))
                //   .on('pageerror', ({ message }) => console.log(message))
                //   .on('response', response =>
                //     console.log(`${response.status()} ${response.url()}`))
                //   .on('requestfailed', request =>
                //     console.log(`${request.failure().errorText} ${request.url()}`))

                await page.goto(
                  'http://localhost:3001/___external/auth/client/login/initiate?redirect=http%3A%2F%2Flocalhost%3A3001'
                );

                let bodyHTML = '';
                bodyHTML = await page.evaluate(() => document.body.innerHTML);

                const winner = await Promise.race([
                  page.waitForSelector('[data-testid="login"]'),
                ]);

                await page.click(winner._remoteObject.description);

                await new Promise<void>((r) => setTimeout(r, 3000));

                bodyHTML = await page.evaluate(() => document.body.innerHTML);

                console.log(bodyHTML);
                expect(bodyHTML).toContain('Hello from main server');
                expect(bodyHTML).toContain('{"name":"Test user"');
                expect(bodyHTML).toContain('"deserialized":true}');
              })
              .then(() => {
                return browser.close();
              });
          });
        })
        .catch(async (e) => {
          await mainServerApp.deactivate();
          await authServerApp.deactivate();
          done(e);
        })
        .finally(async () => {
          await mainServerApp.deactivate();
          await authServerApp.deactivate();
          done();
        });
    },
    10 * 1000
  );
});
