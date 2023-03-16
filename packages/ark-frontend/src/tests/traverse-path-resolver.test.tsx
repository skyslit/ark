/**
 * @jest-environment jsdom
 */

import React from 'react';
import traverse from 'traverse';
import { ApplicationContext } from '@skyslit/ark-core';
import {
  createComponent,
  Frontend,
  createReactApp,
  makeApp,
  reduxServiceStateSnapshot,
} from '../index';
import { render, act } from '@testing-library/react';

describe('useContent', () => {
  const ctx = new ApplicationContext();
  test('useContent', (done) => {
    const createCMSComponent = createComponent(({ use }) => {
      const { useContent } = use(Frontend);
      const {
        isAvailable,
        content,
        setContent,
        updateKey,
        insertItem,
        hasChanged,
        markAsSaved,
        reset,
        runBatch,
        removeItemAt,
      } = useContent<any>('test-content');
      return (
        <div>
          <div>Hello</div>
          <button
            onClick={() => {
              reset();
            }}
          >
            Reset
          </button>
          <button
            onClick={() => {
              markAsSaved();
            }}
          >
            Save Changes
          </button>
          <button
            onClick={() => {
              updateKey('title', 'Sample Updated Title');
            }}
          >
            Update Title
          </button>
          <button
            onClick={() => {
              updateKey(
                `screens.[s-100].states.[state-102].features.[feat-103].label`,
                'Changed'
              );
            }}
          >
            Change Feature Label
          </button>
          <button
            onClick={() => {
              runBatch(() => {
                // Removes state-102
                removeItemAt(`screens.[s-100].states`, 1);
                // Remove state-104
                removeItemAt(`screens.[s-100].states`, '[state-104]');
                // Update state-106
                updateKey(
                  `screens.[s-100].states.[state-106].features.0.label`,
                  'Complex Change'
                );
                // Insert new item after 106
                insertItem(`screens.[s-100].states`, '[state-106]', {
                  id: 'state-110',
                  features: [],
                });
              });
            }}
          >
            Batch process by id
          </button>
          <button
            onClick={() =>
              setContent({
                title: 'Sample',
                screens: [
                  {
                    id: 's-50',
                    states: [],
                  },
                  {
                    id: 's-100',
                    states: [
                      {
                        id: 'state-101',
                        features: [],
                      },
                      {
                        id: 'state-102',
                        features: [
                          {
                            id: 'feat-103',
                            label: 'Unchanged',
                          },
                        ],
                      },
                      {
                        id: 'state-104',
                        features: [
                          {
                            id: 'feat-105',
                            label: 'Unchanged',
                          },
                        ],
                      },
                      {
                        id: 'state-106',
                        features: [
                          {
                            id: 'feat-107',
                            label: 'Unchanged',
                          },
                        ],
                      },
                    ],
                  },
                ],
              })
            }
          >
            Set Content
          </button>
          <div data-testid="changed-field">{String(Boolean(hasChanged))}</div>
          <div data-testid="output">
            {isAvailable === true ? (
              <code>{JSON.stringify(content)}</code>
            ) : null}
          </div>
        </div>
      );
    });

    const testContext = createReactApp(({ use }) => {
      const { useComponent, useRouteConfig } = use(Frontend);
      const CMS = useComponent('cms', createCMSComponent);

      useRouteConfig(() => [
        {
          path: '/',
          component: CMS,
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

        expect(getByTestId('output').innerHTML).toBe('');

        // Has changed field
        expect(getByTestId('changed-field').textContent).toEqual('false');

        act(() => {
          // Sets content
          getByText('Set Content').click();
        });

        expect(getByTestId('changed-field').textContent).toEqual('false');

        // Assert title
        expect(
          JSON.parse(
            getByTestId('output').getElementsByTagName('code')[0].textContent
          ).title
        ).toEqual('Sample');

        act(() => {
          // Click update title
          getByText('Update Title').click();
        });

        // Check if title has been changed
        expect(
          JSON.parse(
            getByTestId('output').getElementsByTagName('code')[0].textContent
          ).title
        ).toEqual('Sample Updated Title');

        expect(
          JSON.parse(
            getByTestId('output').getElementsByTagName('code')[0].textContent
          ).screens[1].states[1].features[0].label
        ).toEqual('Unchanged');

        act(() => {
          // Sets content
          getByText('Change Feature Label').click();
        });

        expect(
          JSON.parse(
            getByTestId('output').getElementsByTagName('code')[0].textContent
          ).screens[1].states[1].features[0].label
        ).toEqual('Changed');

        expect(
          JSON.parse(
            getByTestId('output').getElementsByTagName('code')[0].textContent
          ).screens[1].states.length
        ).toStrictEqual(4);

        act(() => {
          // Run batch job
          getByText('Batch process by id').click();
        });

        expect(
          JSON.parse(
            getByTestId('output').getElementsByTagName('code')[0].textContent
          ).screens[1].states.length
        ).toStrictEqual(3); // 3 including the newly inserted one

        expect(
          JSON.parse(
            getByTestId('output').getElementsByTagName('code')[0].textContent
          ).screens[1].states[2].features[0].label
        ).toStrictEqual('Complex Change');
      })
      .then(() => {
        done();
      })
      .catch(done);
  });
});
