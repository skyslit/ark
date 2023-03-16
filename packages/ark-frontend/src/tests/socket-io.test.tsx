/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, act } from '@testing-library/react';
import { createModule, ApplicationContext } from '@skyslit/ark-core';
import { createReactApp, Frontend, createComponent, makeApp } from '../index';
import http from 'http';
import { Server } from 'socket.io';
import 'core-js';

let server: http.Server = null;
let io: Server;
beforeAll(() => {
  return new Promise((resolve, reject) => {
    server = http.createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', 'http://localhost');
      res.setHeader('Access-Control-Request-Method', '*');
      res.setHeader(
        'Access-Control-Allow-Methods',
        'OPTIONS, GET, POST, PUT, DELETE'
      );
      res.setHeader('Access-Control-Allow-Headers', '*');
      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      switch (req.url) {
        case '/___service/modA/testServiceId': {
          res.write(
            JSON.stringify({
              meta: {
                message: 'Hello',
              },
              data: [1, 2, 3],
            })
          );
          res.end();
          break;
        }
        case '/___service/modA/testServiceId2': {
          res.write(
            JSON.stringify({
              meta: {
                message: 'Hello 2',
              },
              data: [4, 5],
            })
          );
          res.end();
          break;
        }
      }
    });

    io = new Server(server, {
      // options
    });

    io.on('connection', (socket) => {
      console.log('server: client connected to server');

      socket.on('ark/rooms/join', (joinInfo) => {
        console.log(`SRV: joining room(s) ${joinInfo.roomIds.join(', ')}`);
        socket.join(joinInfo.roomIds);
      });

      socket.on('ark/rooms/leave', (joinInfo) => {
        console.log(`SRV: leaving room(s) ${joinInfo.roomIds.join(', ')}`);
        socket.leave(joinInfo.roomIds);
      });
    });

    server.listen(3001, undefined, undefined, () => {
      resolve(null);
    });
  });
}, 20 * 1000);

afterAll(() => {
  return new Promise((resolve, reject) => {
    io.disconnectSockets(true);
    server.close((err) => {
      if (err) {
        reject(err);
      } else {
        resolve(null);
      }
    });
  });
}, 20 * 1000);

test(
  'useTableService() should react to change in service ID',
  (done) => {
    let ctx: ApplicationContext;

    const TestComponentA = createComponent(({ currentModuleId, use }) => {
      const { useSocket } = use(Frontend);
      const { useRoom, connect, disconnect } = useSocket();
      const [message, setMessage] = React.useState('');
      const myChatRoom = useRoom(
        {
          roomIds: ['test-room'],
        },
        true
      );

      React.useEffect(() => {
        let unsubFn: any = () => {};
        connect('localhost:3001')
          .then(() => myChatRoom.joinRoom())
          .then(() => {
            unsubFn = myChatRoom.subscribe('test-ev', (message) => {
              setMessage(message);
            });
          });

        return unsubFn;
      }, []);

      return (
        <div data-testid="content">
          <p>{`hasRoomJoined: ${myChatRoom.hasRoomJoined}`}</p>
          <p>{`message from server: ${message}`}</p>
        </div>
      );
    });

    const testModuleA = createModule(async ({ use }) => {
      const { useComponent } = use(Frontend);
      useComponent('test-compo', TestComponentA);

      const TestCompB = useComponent('modA/test-compo');

      /** Mount the component, connect to socket and join room */
      const { getByTestId, findByText, unmount } = render(<TestCompB />);

      await act(async () => {
        return await new Promise((r) => setTimeout(r, 3000));
      });

      /** Test is hasRoomJoined is true */
      expect(getByTestId('content').textContent).toContain(
        'hasRoomJoined: true'
      );

      io.emit('test-ev', 'hello john');

      await act(async () => {
        return await new Promise((r) => setTimeout(r, 3000));
      });

      /** Test is hasRoomJoined is true */
      expect(getByTestId('content').textContent).toContain(
        'message from server: hello john'
      );
    });

    const testContext = createReactApp(({ useModule }) => {
      useModule('modA', testModuleA);
    });

    makeApp('csr', testContext, ctx)
      .then(() => {
        done();
      })
      .catch(done);
  },
  20 * 1000
);
