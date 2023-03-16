/**
 * @jest-environment jsdom
 */

import React from 'react';
import { createComponent, Frontend } from '../index';
import { createTestReactApp } from '../test-utils';
import { render } from '@testing-library/react';

test('render component with browser context > should say authenticated: false', async () => {
  const TestComponent = createComponent(({ use }) => {
    const { useContext } = use(Frontend);
    const context = useContext();
    return <div>Hello there {`${context.response.meta.isAuthenticated}`}</div>;
  });

  const TestApp = await createTestReactApp(TestComponent, {
    browserContext: {
      isAuthenticated: false,
    },
  });

  const { getByText } = render(<TestApp />);
  expect(getByText(/Hello/i).textContent).toEqual('Hello there false');
});

test('render component with browser context > should say authenticated: true', async () => {
  const TestComponent = createComponent(({ use }) => {
    const { useContext } = use(Frontend);
    const context = useContext();
    return <div>Hello there {`${context.response.meta.isAuthenticated}`}</div>;
  });

  const TestApp = await createTestReactApp(TestComponent, {
    browserContext: {
      isAuthenticated: true,
    },
  });

  const { getByText } = render(<TestApp />);
  expect(getByText(/Hello/i).textContent).toEqual('Hello there true');
});
