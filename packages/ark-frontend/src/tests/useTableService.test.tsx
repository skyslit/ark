/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, act } from '@testing-library/react';
import { createModule, ApplicationContext } from '@skyslit/ark-core';
import { createReactApp, Frontend, createComponent, makeApp } from '../index';
import http from 'http';

let server: http.Server = null;

beforeAll(() => {
  return new Promise((resolve, reject) => {
    server = http
      .createServer((req, res) => {
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
      })
      .listen(3001, undefined, undefined, () => {
        resolve(null);
      });
  });
});

afterAll(() => {
  return new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) {
        reject(err);
      } else {
        resolve(null);
      }
    });
  });
});

test(
  'useTableService() should react to change in service ID',
  (done) => {
    let ctx: ApplicationContext;

    const TestComponentA = createComponent(({ currentModuleId, use }) => {
      const { useTableService } = use(Frontend);
      const [source, setSource] = React.useState('testServiceId');

      const testService = useTableService({
        serviceId: source,
        ajax: {
          baseURL: 'http://localhost:3001',
          withCredentials: false,
        },
      });

      return (
        <div>
          <button
            data-testid="tst-button"
            onClick={() => testService.onChange()}
          >
            Get Response
          </button>
          <button
            data-testid="tst-switch-button"
            onClick={() => setSource('testServiceId2')}
          >
            Switch Source
          </button>
          <p data-testid="source-disp">Switch: {source}</p>
          <p>Response: {testService.loading === true ? 'Loading' : 'Loaded'}</p>
          <p data-testid="response-elem">
            {testService.dataSource
              ? JSON.stringify(testService.dataSource)
              : 'N/A'}
          </p>
        </div>
      );
    });

    const testModuleA = createModule(async ({ use }) => {
      const { useComponent } = use(Frontend);
      useComponent('test-compo', TestComponentA);

      const TestCompB = useComponent('modA/test-compo');

      const { getByTestId } = render(<TestCompB />);

      await act(async () => {
        getByTestId('tst-button').click();
        return await new Promise((r) => setTimeout(r, 1000));
      });

      expect(getByTestId('source-disp').textContent).toContain('testServiceId');
      expect(getByTestId('response-elem').textContent).toContain('1,2,3');

      await act(async () => {
        getByTestId('tst-switch-button').click();
      });

      expect(getByTestId('source-disp').textContent).toContain(
        'testServiceId2'
      );

      await act(async () => {
        getByTestId('tst-button').click();
        return await new Promise((r) => setTimeout(r, 1000));
      });

      expect(getByTestId('response-elem').textContent).toContain('4,5');
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
  10 * 1000
);
