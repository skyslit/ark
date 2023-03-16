import { ApplicationContext, setDefaultEnv } from '@skyslit/ark-core';
import { Backend, defineService, Security } from '../../index';
import puppeteer from 'puppeteer';

describe('Backend services', () => {
  test(
    'useServer() fn with http',
    (done) => {
      setDefaultEnv({
        ARK__AUTH_SIM_FILE_PATH: __dirname,
      });

      const mainServerApp = new ApplicationContext();
      Promise.resolve()
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

                await new Promise<void>((r) => setTimeout(r, 1000));

                await page.goto(
                  'http://localhost:3001/___external/auth/client/login/initiate?redirect=http%3A%2F%2Flocalhost%3A3001'
                );

                await new Promise<void>((r) => setTimeout(r, 3000));

                let bodyHTML = '';
                bodyHTML = await page.evaluate(() => document.body.innerHTML);

                expect(bodyHTML).toContain('Hello from main server');
                expect(bodyHTML).toContain(
                  '{"emailAddress":"simulated.user@skyslit.com"}'
                );
              })
              .then(() => {
                return browser.close();
              });
          });
        })
        .catch(async (e) => {
          await mainServerApp.deactivate();
          done(e);
        })
        .finally(async () => {
          await mainServerApp.deactivate();
          done();
        });
    },
    10 * 1000
  );
});
