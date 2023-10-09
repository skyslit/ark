import { ApplicationContext } from '@skyslit/ark-core';
import { Communication, Data } from '..';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongodb from 'mongodb';

describe('communication', () => {
  describe('email', () => {
    const mongod = new MongoMemoryServer();

    let testDbConnectionString: string = '';

    beforeAll(async () => {
      testDbConnectionString = await mongod.getUri();
    }, 60000);

    afterAll(async () => {
      await mongod.stop();
    });

    test('should send using custom provider without db', (done) => {
      const context = new ApplicationContext();

      context
        .activate(async ({ use }) => {
          const { sendEmail, useProvider, enableCommunication } = use(
            Communication
          );

          enableCommunication();

          const aravindsMailbox: any = [];

          useProvider({
            async render(template, data) {
              if (template === '<h1>{template}</h1>') {
                return data.greetings;
              }

              return template;
            },
            async sendEmail(envelop) {
              aravindsMailbox.push({
                html: envelop.htmlContent,
                text: envelop.textContent,
              });

              return {
                envelop,
                vendorAck: {
                  ack: true,
                },
              };
            },
          });

          const receipt = await sendEmail({
            subject: 'Test email',
            toAddresses: [
              {
                name: 'Aravind',
                email: 'aravind@skyslit.com',
              },
            ],
            fromAddress: {
              email: 'no-reply@skyslit.com',
              name: 'Skyslit Support',
            },
            htmlTemplate: `<h1>{template}</h1>`,
            textContent: 'Hello Aravind',
            data: {
              greetings: `<h1>Hello Aravind</h1>`,
            },
          });

          expect(receipt.vendorAck?.ack).toStrictEqual(true);
          expect(aravindsMailbox[0]['html']).toStrictEqual(
            '<h1>Hello Aravind</h1>'
          );
          expect(aravindsMailbox[0]['text']).toStrictEqual('Hello Aravind');
        })
        .then(() => {
          done();
        })
        .catch(done);
    });

    test('should send using custom provider with db', (done) => {
      const context = new ApplicationContext();

      context
        .activate(async ({ use, run }) => {
          const { useProvider, enableCommunication } = use(Communication);
          const { useDatabase } = use(Data);

          useDatabase('default', testDbConnectionString);

          enableCommunication();

          const aravindsMailbox: any = [];

          useProvider({
            async render(template, data) {
              if (template === '<h1>{template}</h1>') {
                return data.greetings;
              }

              return template;
            },
            async sendEmail(envelop) {
              aravindsMailbox.push({
                html: envelop.htmlContent,
                text: envelop.textContent,
              });

              return {
                envelop,
                vendorAck: {
                  ack: true,
                },
              };
            },
          });

          run(async () => {
            const { sendEmail } = use(Communication);
            const receipt = await sendEmail({
              subject: 'Test email',
              toAddresses: [
                {
                  name: 'Aravind',
                  email: 'aravind@skyslit.com',
                },
              ],
              fromAddress: {
                email: 'no-reply@skyslit.com',
                name: 'Skyslit Support',
              },
              htmlTemplate: `<h1>{template}</h1>`,
              textContent: 'Hello Aravind',
              data: {
                greetings: `<h1>Hello Aravind</h1>`,
              },
            });

            const connection = await mongodb.connect(testDbConnectionString);
            const receiptsInDb = await connection
              .db()
              .collection('__communication_email_receipts')
              .find()
              .toArray();
            await connection.close();

            expect(receipt.vendorAck?.ack).toStrictEqual(true);
            expect(aravindsMailbox[0]['html']).toStrictEqual(
              '<h1>Hello Aravind</h1>'
            );
            expect(aravindsMailbox[0]['text']).toStrictEqual('Hello Aravind');

            expect(receiptsInDb.length).toStrictEqual(1);
            expect(receiptsInDb[0]._id).toBeTruthy();
            expect(receiptsInDb[0].vendorAck?.ack).toStrictEqual(true);

            await sendEmail({
              subject: 'Test email',
              toAddresses: [
                {
                  name: 'Aravind',
                  email: 'aravind@skyslit.com',
                },
              ],
              fromAddress: {
                email: 'no-reply@skyslit.com',
                name: 'Skyslit Support',
              },
              htmlTemplate: `<h1>{template}</h1>`,
              textContent: 'Hello Aravind',
              data: {
                greetings: `<h1>Hello Aravind</h1>`,
              },
            });
          });
        })
        .then(async () => {
          await context.deactivate();
          done();
        })
        .catch(done);
    });
  });
});
