/**
 * @jest-environment jsdom
 */

import React from 'react';
import { ApplicationContext } from '@skyslit/ark-core';
import {
  createComponent,
  Frontend,
  createReactApp,
  makeApp,
  reduxServiceStateSnapshot,
  useArkReactServices,
} from '../index';
import { render, act } from '@testing-library/react';

describe('useArkReactServices behaviour', () => {
  const ctx = new ApplicationContext();
  test('child component should be able to consume ark hooks api without prop drilling', (done) => {
    const ChildComponent = () => {
      const ArkServices = useArkReactServices();
      const { useStore } = ArkServices.use(Frontend);
      const [msg, setMsg] = useStore('global-state', 'My message', false);

      return (
        <div>
          <h1 data-testid="child-title">This is a child component</h1>
          <p data-testid="globalmessage-in-child-component">{msg}</p>
          <button onClick={() => setMsg('My message 3')}>
            Set global message from child component
          </button>
        </div>
      );
    };

    const createTestComponent = createComponent(({ use }) => {
      const { useStore } = use(Frontend);
      const [msg, setMsg] = useStore('global-state', 'My message', false);
      return (
        <div>
          <div data-testid="msg">{msg}</div>
          <button onClick={() => setMsg('My message 2')}>
            Set global message from root component
          </button>
          <ChildComponent />
        </div>
      );
    });

    const testContext = createReactApp(({ use }) => {
      const { useComponent, useRouteConfig } = use(Frontend);
      const TestComponent = useComponent('test-component', createTestComponent);

      useRouteConfig(() => [
        {
          path: '/',
          component: TestComponent,
        },
      ]);
    });

    makeApp('csr', testContext, ctx, {
      initialState: {
        ...reduxServiceStateSnapshot('___context', 'default', {
          responseCode: 200,
          response: {},
        }),
      },
    })
      .then(async (App) => {
        const { getByText, getByTestId } = render(<App />);

        expect(getByTestId('msg').innerHTML).toBe('My message');

        act(() => {
          // Sets content
          getByText('Set global message from root component').click();
        });

        expect(getByTestId('msg').innerHTML).toBe('My message 2');

        /** Assert that child component mounted */
        expect(getByTestId('child-title').innerHTML).toBe(
          'This is a child component'
        );

        /** Assert that child component also reads the same state from root component */
        expect(getByTestId('globalmessage-in-child-component').innerHTML).toBe(
          'My message 2'
        );

        /** Click the button in child component to see if the fn call is updating
         * both root and child components
         */
        act(() => {
          // Sets content
          getByText('Set global message from child component').click();
        });
        expect(getByTestId('globalmessage-in-child-component').innerHTML).toBe(
          'My message 3'
        );
        expect(getByTestId('msg').innerHTML).toBe('My message 3');
      })
      .then(() => {
        done();
      })
      .catch(done);
  });
});
