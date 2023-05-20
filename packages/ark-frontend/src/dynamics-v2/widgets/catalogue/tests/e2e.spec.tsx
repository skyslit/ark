/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, act } from '@testing-library/react';
import { ApplicationContext, createModule } from '@skyslit/ark-core';
import {
  createReactApp,
  Frontend,
  createComponent,
  makeApp,
  reduxServiceStateSnapshot,
} from '../../../../index';
import { Catalogue } from '../';

describe('pass thru environment variable', () => {
  const ctx = new ApplicationContext();

  test(
    'useEnv() should load passthru env vars',
    (done) => {
      const TestView = createComponent(({ currentModuleId }) => {
        return <Catalogue namespace="test-ns" />;
      });

      const testModuleA = createModule(({ use }) => {
        const { mapRoute, useComponent } = use(Frontend);
        const TestViewComponent = useComponent('test-view', TestView);

        mapRoute('/', TestViewComponent);
      });

      const testContext = createReactApp(({ use, useModule }) => {
        useModule('modA', testModuleA);
      });

      makeApp('csr', testContext, ctx, {
        initialState: {
          ...reduxServiceStateSnapshot('___context', 'default', {
            responseCode: 200,
            response: {
              type: 'success',
              meta: {
                systemInfo: {
                  basePath: '',
                },
                passThroughVariables: {},
              },
            },
          }),
        },
      })
        .then(async (App) => {
          const { getByTestId, baseElement } = render(<App />);

          await act(async () => {
            getByTestId('test-ns');
          });

          console.log('baseElement', baseElement.outerHTML);

          done();
        })
        .catch(done);
    },
    10 * 1000
  );
});
