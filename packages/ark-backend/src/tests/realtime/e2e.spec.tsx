import React from './../../../../ark-frontend/node_modules/react';
import { ApplicationContext } from '@skyslit/ark-core';
import { createReactApp, Frontend } from '@skyslit/ark-frontend';
import { Backend } from '../../index';
import path from 'path';
import axios from 'axios';

describe('Frontend services', () => {
  let context: ApplicationContext;

  const webApp = createReactApp(({ use }) => {
    const { useComponent, mapRoute } = use(Frontend);

    const TestComp = useComponent('testCompo', ({ use }) => {
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
        const { useWebApp, useRoute, useServer, enableWebSocket } = use(
          Backend
        );
        const SampleWebApp = useWebApp(
          'sample',
          webApp,
          path.join(__dirname, 'test-template.html')
        );
        useRoute('get', '/', SampleWebApp.render());

        const io = enableWebSocket();

        io.on('connection', (socket) => {
          console.log('One client connected');
        });

        useServer({
          port: 3001,
        });
      })
      .then(async () => {
        const res = await axios.get(
          'http://localhost:3001/socket.io/?EIO=4&transport=polling&t=ONR2122'
        );
        expect(res.status).toStrictEqual(200);
      })
      .catch(console.error)
      .finally(async () => {
        await context.deactivate();
        done();
      });
  });
});
