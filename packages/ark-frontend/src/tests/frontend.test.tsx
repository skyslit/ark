/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { ApplicationContext, createModule, useEnv } from '@skyslit/ark-core';
import {
  useHistory,
  Router,
  useRouteMatch,
  MemoryRouter,
  useLocation,
} from 'react-router-dom';
import { createMemoryHistory } from 'history';
import {
  createReactApp,
  Frontend,
  createComponent,
  makeApp,
  reduxServiceStateSnapshot,
  Routers,
  flattenRouteConfig,
  RouteConfigItem,
} from '../index';

describe('utils', () => {
  test('flattenRouteConfig() should work as expected', () => {
    const config: Array<RouteConfigItem> = [
      {
        path: '/',
        label: 'Dashboard',
        component: () => <h1>Main View</h1>,
      },
      {
        path: '/menu-1',
        label: 'Menu 1',
        component: () => <h1>Menu 1</h1>,
        submenu: [
          {
            path: '/menu-1/lvl-1',
            label: 'Level 1',
            component: () => <h1>Level 1</h1>,
          },
          {
            path: '/menu-1/lvl-2',
            label: 'Level 2',
            component: () => <h1>Level 2</h1>,
          },
        ],
      },
      {
        path: '/menu-2',
        label: 'Menu 2',
        component: () => <h1>Menu 2</h1>,
      },
      {
        path: '/menu-3',
        label: 'Menu 3',
        submenu: [
          {
            path: '/menu-3/lvl-1',
            label: 'Level 1',
            component: () => <h1>Level 1</h1>,
          },
          {
            path: '/menu-3/lvl-2',
            label: 'Level 2',
            component: () => <h1>Level 2</h1>,
          },
        ],
      },
    ];

    const result = flattenRouteConfig(config);

    expect(result[0].path).toStrictEqual('/');
    expect(result[0].hasLink).toStrictEqual(true);
    expect(result[0].isFlattened).toStrictEqual(false);

    expect(result[1].path).toStrictEqual('/menu-1');
    expect(result[1].hasLink).toStrictEqual(true);
    expect(result[1].isFlattened).toStrictEqual(false);

    expect(result[2].path).toStrictEqual('/menu-1/lvl-1');
    expect(result[2].hasLink).toStrictEqual(true);
    expect(result[2].isFlattened).toStrictEqual(true);

    expect(result[3].path).toStrictEqual('/menu-1/lvl-2');
    expect(result[3].hasLink).toStrictEqual(true);
    expect(result[3].isFlattened).toStrictEqual(true);

    expect(result[5].path).toStrictEqual('/menu-3');
    expect(result[5].hasLink).toStrictEqual(false);
    expect(result[5].isFlattened).toStrictEqual(false);

    expect(result[6].path).toStrictEqual('/menu-3/lvl-1');
    expect(result[6].hasLink).toStrictEqual(true);
    expect(result[6].isFlattened).toStrictEqual(true);
  });
});

describe('functionality tests', () => {
  let ctx: ApplicationContext;

  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    ctx = new ApplicationContext();
  });

  test('useStore() should work seemlessly across multiple modules', (done) => {
    const TestComponent = createComponent(({ use }) => {
      const { useStore } = use(Frontend);
      const [data, updateData] = useStore('testData', 'Welcome');
      return (
        <div>
          <p data-testid="msgbox">{data}</p>
          <button onClick={() => updateData('Welcome Dameem')}>
            Say Hello
          </button>
        </div>
      );
    });

    const testModule = createModule(({ use }) => {
      const { useComponent } = use(Frontend);
      const TestComp = useComponent('test-compo', TestComponent);
      const { getByText, getByTestId } = render(<TestComp />);
      // Testing UI change
      expect(getByTestId('msgbox').textContent).toBe('Welcome');
      getByText(/Say Hello/).click();
      expect(getByTestId('msgbox').textContent).toBe('Welcome Dameem');
      // Testing redux state
      expect(
        ctx.getData<any>('default', 'store').getState()['module1/testData']
      ).toBe('Welcome Dameem');
    });

    const TestComponentB = createComponent(({ use }) => {
      const { useStore } = use(Frontend);
      const [data, updateData] = useStore('module1/testData', 'Welcome 2');
      return (
        <div>
          <p data-testid="msgbox2">{data}</p>
          <button onClick={() => updateData('Welcome 2 Again')}>
            Say Hola
          </button>
        </div>
      );
    });

    const testModule2 = createModule(({ use }) => {
      const { useComponent } = use(Frontend);
      const TestComp2 = useComponent('test-compo', TestComponentB);
      const { getByTestId } = render(<TestComp2 />);
      // Testing UI change
      expect(getByTestId('msgbox2').textContent).toBe('Welcome Dameem');
    });

    const testContext = createReactApp(({ useModule }) => {
      useModule('module1', testModule);
      useModule('module2', testModule2);
    });

    makeApp('csr', testContext, ctx)
      .then(() => {
        done();
      })
      .catch(done);
  });

  test('useStore(useReactState = true) should not work across multiple modules', (done) => {
    const TestComponent = createComponent(({ use }) => {
      const { useStore } = use(Frontend);
      const [data, updateData] = useStore('testData', 'Welcome', true);
      return (
        <div>
          <p data-testid="msgbox">{data}</p>
          <button onClick={() => updateData('Welcome Dameem')}>
            Say Hello
          </button>
        </div>
      );
    });

    const testModule = createModule(({ use }) => {
      const { useComponent } = use(Frontend);
      const TestComp = useComponent('test-compo', TestComponent);
      const { getByText, getByTestId } = render(<TestComp />);
      // Testing UI change
      expect(getByTestId('msgbox').textContent).toBe('Welcome');
      getByText(/Say Hello/).click();
      expect(getByTestId('msgbox').textContent).toBe('Welcome Dameem');
      // Testing redux state
      expect(
        ctx.getData<any>('default', 'store').getState()['module1/testData']
      ).toBe(undefined);
    });

    const TestComponentB = createComponent(({ use }) => {
      const { useStore } = use(Frontend);
      const [data, updateData] = useStore(
        'module1/testData',
        'Welcome 2',
        true
      );
      return (
        <div>
          <p data-testid="msgbox2">{data}</p>
          <button onClick={() => updateData('Welcome 2 Again')}>
            Say Hola
          </button>
        </div>
      );
    });

    const testModule2 = createModule(({ use }) => {
      const { useComponent } = use(Frontend);
      const TestComp2 = useComponent('test-compo', TestComponentB);
      const { getByTestId } = render(<TestComp2 />);
      // Testing UI change
      expect(getByTestId('msgbox2').textContent).toBe('Welcome 2');
    });

    const testContext = createReactApp(({ useModule }) => {
      useModule('module1', testModule);
      useModule('module2', testModule2);
    });

    makeApp('csr', testContext, ctx)
      .then(() => {
        done();
      })
      .catch(done);
  });

  // eslint-disable-next-line max-len
  test('useComponent() should work seemlessly across multiple modules', (done) => {
    const TestComponentA = createComponent(({ currentModuleId }) => {
      return <h1>{`Component A ${currentModuleId}`}</h1>;
    });

    const testModuleA = createModule(({ use }) => {
      const { useComponent } = use(Frontend);
      useComponent('test-compo', TestComponentA);
    });

    const testModuleB = createModule(({ use }) => {
      const { useComponent } = use(Frontend);
      let TestCompB: any = null;
      const t = () => (TestCompB = useComponent('test-compo'));
      expect(t).toThrowError();

      TestCompB = useComponent('modA/test-compo');

      const { getByText } = render(<TestCompB />);
      expect(getByText(/Compo/i).textContent).toContain('modA');
    });

    const testContext = createReactApp(({ useModule }) => {
      useModule('modA', testModuleA);
      useModule('modB', testModuleB);
    });

    makeApp('csr', testContext, ctx)
      .then(() => {
        done();
      })
      .catch(done);
  });

  test('useLayout() should work seemlessly across multiple modules', (done) => {
    const TestLayout = createComponent(({ currentModuleId, children }) => {
      return (
        <div>
          <h1>{`Layout A ${currentModuleId}`}</h1>
          {children}
        </div>
      );
    });

    const TestView = createComponent(({ currentModuleId }) => {
      return <h1>{`View A ${currentModuleId}`}</h1>;
    });

    const testModuleA = createModule(({ use }) => {
      const { mapRoute, useComponent } = use(Frontend);
      const TestViewComponent = useComponent('test-view', TestView);

      mapRoute('/', TestViewComponent, 'default/test-compo');
    });

    const testContext = createReactApp(({ use, useModule }) => {
      const { useLayout } = use(Frontend);
      useLayout('test-compo', TestLayout);
      useModule('modA', testModuleA);
    });

    makeApp('csr', testContext, ctx, {
      initialState: {
        ...reduxServiceStateSnapshot('___context', 'default', {
          responseCode: 200,
          response: {},
        }),
      },
    })
      .then((App) => {
        const { getByText } = render(<App />);
        expect(getByText(/View/i).textContent).toBe('View A modA');
        expect(getByText(/Layout/i).textContent).toBe('Layout A default');
        done();
      })
      .catch(done);
  });

  test('mapRoute() should work under BrowserRouter', (done) => {
    const TestComponentA = createComponent(() => {
      return <h1>Component A</h1>;
    });

    const TestComponentB = createComponent(() => {
      return <h1>Component B</h1>;
    });

    const testModuleA = createModule(({ use }) => {
      const { useComponent, mapRoute } = use(Frontend);
      const TestCompA = useComponent('test-compo', TestComponentA);
      mapRoute('/test-a', TestCompA);
    });

    const testModuleB = createModule(({ use }) => {
      const { useComponent, mapRoute } = use(Frontend);
      const TestCompB = useComponent('test-compo-b', TestComponentB);
      mapRoute('/', TestCompB);
    });

    const testContext = createReactApp(({ useModule }) => {
      useModule('modA', testModuleA);
      useModule('modB', testModuleB);
    });

    makeApp('csr', testContext, ctx, {
      initialState: {
        ...reduxServiceStateSnapshot('___context', 'default', {
          responseCode: 200,
          response: {},
        }),
      },
    })
      .then((App) => {
        const { getByText } = render(<App />);
        expect(getByText(/Comp/i).textContent).toBe('Component B');
        done();
      })
      .catch(done);
  });

  test('useRouteConfig() should work as expected', (done) => {
    const TestComponentA = createComponent(() => {
      return <h1>Component A</h1>;
    });

    const TestComponentB = createComponent(() => {
      return <h1>Component B</h1>;
    });

    const Layout = createComponent((props) => {
      return (
        <div>
          <h1>Layout D</h1>
          {props.children}
        </div>
      );
    });

    const testModuleA = createModule(({ use }) => {
      const { useComponent, useLayout } = use(Frontend);
      useComponent('test-compo-a', TestComponentA);
      useLayout('layout-a', Layout);
    });

    const testModuleB = createModule(({ use }) => {
      const { useComponent } = use(Frontend);
      useComponent('test-compo-b', TestComponentB);
    });

    const testContext = createReactApp(({ use, useModule, run }) => {
      const { useRouteConfig, useComponent, useLayout } = use(Frontend);
      useModule('modA', testModuleA);
      useModule('modB', testModuleB);

      useRouteConfig(() => [
        {
          path: '/',
          component: useComponent('modB/test-compo-b'),
          layout: useLayout('modA/layout-a'),
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
      .then((App) => {
        const { getByText } = render(<App />);
        // Expect component and layout
        expect(getByText(/Layou/i).textContent).toBe('Layout D');
        expect(getByText(/Comp/i).textContent).toBe('Component B');
        done();
      })
      .catch(done);
  });

  describe('useContent', () => {
    test('useContent', (done) => {
      const createCMSComponent = createComponent(({ use }) => {
        const { useContent } = use(Frontend);
        const {
          isAvailable,
          content,
          setContent,
          updateKey,
          pushItem,
          unshiftItem,
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
                pushItem('items', 4);
              }}
            >
              Push to Items Array
            </button>
            <button
              onClick={() => {
                unshiftItem('items', 0);
              }}
            >
              Unshift Items Array
            </button>
            <button
              onClick={() => {
                insertItem('items', 3, 2.5);
              }}
            >
              Insert val to items at index 3
            </button>
            <button
              onClick={() => {
                updateKey(
                  'innerObj.collection.0.subTitle',
                  'Collection Sub Title (changed)'
                );
              }}
            >
              Update content inside
            </button>
            <button
              onClick={() => {
                runBatch(() => {
                  updateKey('keyA', 100);
                  updateKey('keyB', 200);
                });
              }}
            >
              Update multiple key
            </button>
            <button
              onClick={() => {
                runBatch(() => {
                  pushItem('emptyArrayToPush', 100);
                  pushItem('emptyArrayToPush', 200);
                });
              }}
            >
              Push multiple items
            </button>
            <button
              onClick={() => {
                runBatch(() => {
                  removeItemAt('itemsToRemoveFrom', 3);
                });
              }}
            >
              Remove item at index 3
            </button>
            <button
              onClick={() =>
                setContent({
                  title: 'Sample',
                  keyA: 1,
                  keyB: 2,
                  items: [1, 2, 3],
                  emptyArrayToPush: [],
                  itemsToRemoveFrom: ['a', 'b', 'c', 'd', 'e'],
                  innerObj: {
                    collection: [
                      {
                        subTitle: 'Collection Sub Title',
                      },
                    ],
                  },
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

          // Content has changed
          expect(getByTestId('changed-field').textContent).toEqual('true');

          // Mark as save
          act(() => {
            getByText('Save Changes').click();
          });

          // Content has changed
          expect(getByTestId('changed-field').textContent).toEqual('false');

          // Check if title has been changed
          expect(
            JSON.parse(
              getByTestId('output').getElementsByTagName('code')[0].textContent
            ).title
          ).toEqual('Sample Updated Title');

          // Content has changed
          expect(getByTestId('changed-field').textContent).toEqual('false');

          act(() => {
            // Click Push to Items Array
            getByText('Push to Items Array').click();
          });

          // Check if items has been changed
          expect(
            JSON.parse(
              getByTestId('output').getElementsByTagName('code')[0].textContent
            ).items
          ).toEqual([1, 2, 3, 4]);

          act(() => {
            // Click unshift button
            getByText('Unshift Items Array').click();
          });

          // Check if items has been changed
          expect(
            JSON.parse(
              getByTestId('output').getElementsByTagName('code')[0].textContent
            ).items
          ).toEqual([0, 1, 2, 3, 4]);

          // Content has changed
          expect(getByTestId('changed-field').textContent).toEqual('true');

          // Mark as save
          act(() => {
            getByText('Save Changes').click();
          });

          // Content has changed
          expect(getByTestId('changed-field').textContent).toEqual('false');

          act(() => {
            // Click `Insert val to items at index 3` button
            getByText('Insert val to items at index 3').click();
          });

          // Check if items has been changed
          expect(
            JSON.parse(
              getByTestId('output').getElementsByTagName('code')[0].textContent
            ).items
          ).toEqual([0, 1, 2, 2.5, 3, 4]);

          // Mark as save
          act(() => {
            getByText('Save Changes').click();
          });

          // Content has changed
          expect(getByTestId('changed-field').textContent).toEqual('false');

          act(() => {
            // Click `Update content inside` button
            getByText('Update content inside').click();
          });

          expect(
            JSON.parse(
              getByTestId('output').getElementsByTagName('code')[0].textContent
            ).innerObj.collection[0].subTitle
          ).toEqual('Collection Sub Title (changed)');

          // Content has changed
          expect(getByTestId('changed-field').textContent).toEqual('true');

          act(() => {
            getByText('Reset').click();
          });

          // Content has changed
          expect(getByTestId('changed-field').textContent).toEqual('false');

          // Try again after clicking reset
          expect(
            JSON.parse(
              getByTestId('output').getElementsByTagName('code')[0].textContent
            ).innerObj.collection[0].subTitle
          ).toEqual('Collection Sub Title');

          act(() => {
            // Click `Update multiple key` button
            getByText('Update multiple key').click();
          });

          // Check if keyA and keyB are updated
          expect(
            JSON.parse(
              getByTestId('output').getElementsByTagName('code')[0].textContent
            ).keyA
          ).toEqual(100);
          expect(
            JSON.parse(
              getByTestId('output').getElementsByTagName('code')[0].textContent
            ).keyB
          ).toEqual(200);

          // Expect items before removal
          expect(
            JSON.parse(
              getByTestId('output').getElementsByTagName('code')[0].textContent
            ).itemsToRemoveFrom
          ).toEqual(['a', 'b', 'c', 'd', 'e']);

          act(() => {
            // Click `Remove item at index 3` button
            getByText('Remove item at index 3').click();
          });

          // Expect item to be removed
          expect(
            JSON.parse(
              getByTestId('output').getElementsByTagName('code')[0].textContent
            ).itemsToRemoveFrom
          ).toEqual(['a', 'b', 'c', 'e']);

          act(() => {
            // Click `Push multiple items` button
            getByText('Push multiple items').click();
          });

          expect(
            JSON.parse(
              getByTestId('output').getElementsByTagName('code')[0].textContent
            ).emptyArrayToPush
          ).toEqual([100, 200]);
        })
        .then(() => {
          done();
        })
        .catch(done);
    });

    describe('localStorage support', () => {
      /**
       * LocalStorageMock
       */
      class LocalStorageMock {
        store: any;

        /**
         * Mock Constructor
         */
        constructor() {
          this.store = {};
        }

        /**
         * Clear fn
         */
        clear() {
          this.store = {};
        }

        /**
         * getItem key
         * @param {string} key
         * @return {any}
         */
        getItem(key: string) {
          return this.store[key] || null;
        }

        /**
         * getItem key
         * @param {string} key
         * @param {any} value
         */
        setItem(key: string, value: any) {
          this.store[key] = String(value);
        }

        /**
         * getItem key
         * @param {string} key
         */
        removeItem(key: string) {
          delete this.store[key];
        }
      }

      Object.defineProperty(window, 'localStorage', {
        value: new LocalStorageMock(),
      });

      test('localStorage setItem action should work without error', (done) => {
        const createCMSComponent = createComponent(({ use }) => {
          const { useContent } = use(Frontend);
          const {
            isAvailable,
            content,
            setContent,
            hasChanged,
            saveLocally,
            hasLocalData,
            markAsSaved,
            reset,
          } = useContent<any>({
            serviceId: 'test-content',
            enableLocalStorage: true,
          });
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
                  saveLocally();
                  markAsSaved();
                }}
              >
                Save Locally
              </button>
              <button
                onClick={() =>
                  setContent({
                    title: 'Sample',
                  })
                }
              >
                Set Content
              </button>
              <div data-testid="has-local-data">{`output: ${hasLocalData()}`}</div>
              <div data-testid="changed-field">
                {String(Boolean(hasChanged))}
              </div>
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

            act(() => {
              // Click `Set Content` button
              getByText('Set Content').click();
            });

            expect(getByTestId('has-local-data').innerHTML).toStrictEqual(
              'output: false'
            );
            expect(getByTestId('output').innerHTML).toBe(
              `<code>{\"title\":\"Sample\"}</code>`
            );

            act(() => {
              // Click `Save Locally` button
              getByText('Save Locally').click();
            });

            expect(
              global.window.localStorage.store['_cmsHook/_ls/test-content']
            ).toStrictEqual(`{"title":"Sample"}`);
          })
          .then(() => {
            done();
          })
          .catch(done);
      });

      test('localStorage should load with data from localstorage', (done) => {
        const createCMSComponent = createComponent(({ use }) => {
          const { useContent } = use(Frontend);
          const {
            isAvailable,
            content,
            setContent,
            hasChanged,
            saveLocally,
            hasLocalData,
            reset,
          } = useContent<any>({
            serviceId: 'test-content',
            enableLocalStorage: true,
          });
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
                  saveLocally();
                }}
              >
                Save Locally
              </button>
              <button
                onClick={() =>
                  setContent({
                    title: 'Sample',
                  })
                }
              >
                Set Content
              </button>
              <div data-testid="has-local-data">{`output: ${hasLocalData()}`}</div>
              <div data-testid="changed-field">
                {String(Boolean(hasChanged))}
              </div>
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
            const { getByTestId } = render(<App />);

            expect(
              global.window.localStorage.store['_cmsHook/_ls/test-content']
            ).toStrictEqual(`{"title":"Sample"}`);
            expect(getByTestId('output').innerHTML).toBe(
              `<code>{\"title\":\"Sample\"}</code>`
            );
            expect(getByTestId('has-local-data').innerHTML).toStrictEqual(
              'output: true'
            );
          })
          .then(() => {
            done();
          })
          .catch(done);
      });

      test('localStorage should not load with data from localstorage when disabled', (done) => {
        const createCMSComponent = createComponent(({ use }) => {
          const { useContent } = use(Frontend);
          const {
            isAvailable,
            content,
            setContent,
            hasChanged,
            saveLocally,
            reset,
          } = useContent<any>({
            serviceId: 'test-content',
            enableLocalStorage: false,
          });
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
                  saveLocally();
                }}
              >
                Save Locally
              </button>
              <button
                onClick={() =>
                  setContent({
                    title: 'Sample',
                  })
                }
              >
                Set Content
              </button>
              <div data-testid="changed-field">
                {String(Boolean(hasChanged))}
              </div>
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
            const { getByTestId } = render(<App />);

            expect(
              global.window.localStorage.store['_cmsHook/_ls/test-content']
            ).toStrictEqual(`{"title":"Sample"}`);
            expect(getByTestId('output').innerHTML).toBe('');
          })
          .then(() => {
            done();
          })
          .catch(done);
      });
    });
  });
});

describe('navigation menu and breadcrumbs', () => {
  describe('navigation menu', () => {
    test('should load sub menu', (done) => {
      const ctx = new ApplicationContext();

      const testContext = createReactApp(({ use }) => {
        const { useRouteConfig, useComponent } = use(Frontend);

        useComponent('ProtectedRoute', Routers.ProtectedRoute);
        useComponent('AuthRoute', Routers.AuthRoute);

        useRouteConfig(() => [
          {
            path: '/sample',
            submenu: [
              {
                path: '/level-1',
                component: () => <h1>Level 1 page</h1>,
              },
            ],
          },
          {
            path: '/test',
            component: () => <h1>Test main page</h1>,
            submenu: [
              {
                path: '/tst/level-1',
                component: () => <h1>Test Level 1 page</h1>,
              },
            ],
          },
          {
            path: '*',
            component: () => <span>404 Not Found</span>,
          },
        ]);
      });

      const history = createMemoryHistory();
      history.push('/level-1');

      makeApp('csr', testContext, ctx, {
        Router,
        routerProps: {
          history,
        },
        initialState: {
          ...reduxServiceStateSnapshot('___context', 'default', {
            responseCode: 200,
            response: {
              meta: {
                isAuthenticated: false,
              },
            },
          }),
        },
      })
        .then((App) => {
          const { getByText } = render(<App />);
          // Expect component and layout
          expect(getByText(/Level 1/i).textContent).toBe('Level 1 page');

          act(() => {
            history.push('/tst/level-1');
          });

          expect(getByText(/Test Level/i).textContent).toBe(
            'Test Level 1 page'
          );

          act(() => {
            history.push('/test');
          });

          expect(getByText(/Test main/i).textContent).toBe('Test main page');

          act(() => {
            history.push('/');
          });

          expect(getByText(/404/i).textContent).toBe('404 Not Found');

          done();
        })
        .catch(done);
    });

    test('should render menu items appropriately', (done) => {
      const ctx = new ApplicationContext();

      const testContext = createReactApp(({ use }) => {
        const { useRouteConfig, useComponent } = use(Frontend);

        useComponent('ProtectedRoute', Routers.ProtectedRoute);
        useComponent('AuthRoute', Routers.AuthRoute);
        useComponent(
          'layout',
          createComponent((props) => {
            const match = useRouteMatch();
            const { useMenu } = props.use(Frontend);
            const { menuItems, activeGroupPath } = useMenu({
              refId: 'default',
              currentPath: match.path,
              groupRenderer: (props) => (
                <div>
                  <span>{`group-${props.data.label}`}</span>
                  {props.children}
                </div>
              ),
              itemRenderer: (props) => <div>{props.data.label}</div>,
            });

            return (
              <div>
                <span>{`Active: ${activeGroupPath}`}</span>
                <div className="menu">{menuItems}</div>
                <div className="content">{props.children}</div>
              </div>
            );
          })
        );

        useRouteConfig(() => [
          {
            path: '/sample',
            label: 'Sample Group',
            exact: true,
            submenu: [
              {
                path: '/level-1',
                label: 'Sample > Level 1',
                component: () => <h1>Level 1 page</h1>,
                layout: useComponent('layout'),
              },
            ],
          },
          {
            path: '/test',
            label: 'Test Group',
            exact: true,
            component: () => <h1>Test main page</h1>,
            layout: useComponent('layout'),
            submenu: [
              {
                path: '/tst/:id/level-1',
                label: 'Test > Level 1',
                layout: useComponent('layout'),
                component: () => <h1>Test Level 1 page</h1>,
              },
            ],
          },
          {
            path: '*',
            label: '404 Page',
            hideInMenu: true,
            layout: useComponent('layout'),
            component: () => <span>404 Not Found</span>,
          },
        ]);
      });

      const history = createMemoryHistory();
      history.push('/sample');

      makeApp('csr', testContext, ctx, {
        Router,
        routerProps: {
          history,
        },
        initialState: {
          ...reduxServiceStateSnapshot('___context', 'default', {
            responseCode: 200,
            response: {
              meta: {
                isAuthenticated: false,
              },
            },
          }),
        },
      })
        .then((App) => {
          const { getByText } = render(<App />);
          // Expect component and layout
          expect(getByText(/group-Sample Group/i).textContent).toBeTruthy();
          expect(getByText(/group-Test Group/i).textContent).toBeTruthy();
          expect(getByText(/Sample > Level 1/i).textContent).toBeTruthy();
          expect(getByText(/Test > Level 1/i).textContent).toBeTruthy();
          expect(() => getByText(/404 Page/i)).toThrowError();

          expect(getByText(/Active:/i).textContent).toStrictEqual(
            'Active: undefined'
          );

          act(() => {
            history.push('/level-1');
          });

          expect(getByText(/Active:/i).textContent).toStrictEqual(
            'Active: /sample'
          );

          act(() => {
            history.push('/tst/123/level-1');
          });

          expect(getByText(/Active:/i).textContent).toStrictEqual(
            'Active: /test'
          );

          done();
        })
        .catch(done);
    });
  });
});

describe('predefined Routers', () => {
  const LoginPage = createComponent(() => {
    return <h1>Login Page</h1>;
  });

  const Dashboard = createComponent(() => {
    return <h1>Dashboard</h1>;
  });

  const Layout = createComponent((props) => {
    const history = useHistory();
    return (
      <div>
        <span>P: {history.location.pathname}</span>
        <h1>Layout D</h1>
        {props.children}
      </div>
    );
  });

  test('should take to login page when not authenticated', (done) => {
    const ctx = new ApplicationContext();

    const testContext = createReactApp(({ use }) => {
      const { useRouteConfig, useComponent, useLayout } = use(Frontend);

      useComponent('dashboard-page', Dashboard);
      useComponent('login-page', LoginPage);
      useLayout('layout-a', Layout);

      useComponent('ProtectedRoute', Routers.ProtectedRoute);
      useComponent('AuthRoute', Routers.AuthRoute);

      useRouteConfig(() => [
        {
          path: '/auth/login',
          component: useComponent('login-page'),
          layout: useLayout('layout-a'),
          exact: true,
          Route: useComponent('AuthRoute'),
        },
        {
          path: '/',
          component: useComponent('dashboard-page'),
          layout: useLayout('layout-a'),
          Route: useComponent('ProtectedRoute'),
        },
      ]);
    });

    makeApp('csr', testContext, ctx, {
      initialState: {
        ...reduxServiceStateSnapshot('___context', 'default', {
          responseCode: 200,
          response: {
            meta: {
              isAuthenticated: false,
            },
          },
        }),
      },
    })
      .then((App) => {
        const { getByText } = render(<App />);
        // Expect component and layout
        expect(getByText(/Layou/i).textContent).toBe('Layout D');
        expect(getByText(/Login Page/i).textContent).toBe('Login Page');
        done();
      })
      .catch(done);
  });

  test('should take to dashboard page when authenticated', (done) => {
    const ctx = new ApplicationContext();

    const testContext = createReactApp(({ use }) => {
      const { useRouteConfig, useComponent, useLayout } = use(Frontend);

      useComponent('dashboard-page', Dashboard);
      useComponent('login-page', LoginPage);
      useLayout('layout-a', Layout);

      useComponent('ProtectedRoute', Routers.ProtectedRoute);
      useComponent('AuthRoute', Routers.AuthRoute);

      useRouteConfig(() => [
        {
          path: '/auth/login',
          component: useComponent('login-page'),
          layout: useLayout('layout-a'),
          exact: true,
          Route: useComponent('AuthRoute'),
        },
        {
          path: '/',
          component: useComponent('dashboard-page'),
          layout: useLayout('layout-a'),
          Route: useComponent('ProtectedRoute'),
        },
      ]);
    });

    makeApp('csr', testContext, ctx, {
      initialState: {
        ...reduxServiceStateSnapshot('___context', 'default', {
          responseCode: 200,
          response: {
            meta: {
              isAuthenticated: true,
            },
          },
        }),
      },
    })
      .then((App) => {
        const { getByText } = render(<App />);
        // Expect component and layout
        expect(getByText(/Layou/i).textContent).toBe('Layout D');
        expect(getByText(/Dash/i).textContent).toBe('Dashboard');
        done();
      })
      .catch(done);
  });

  test('should take to custom login url', (done) => {
    const ctx = new ApplicationContext();

    const testContext = createReactApp(({ use }) => {
      const { useRouteConfig, useComponent, useLayout, configureAuth } = use(
        Frontend
      );

      useComponent('dashboard-page', Dashboard);
      useComponent('login-page', LoginPage);
      useLayout('layout-a', Layout);

      useComponent('ProtectedRoute', Routers.ProtectedRoute);
      useComponent('AuthRoute', Routers.AuthRoute);

      configureAuth({
        loginPageUrl: '/custom/auth/login',
        defaultProtectedUrl: '/',
      });

      useRouteConfig(() => [
        {
          path: '/custom/auth/login',
          component: useComponent('login-page'),
          layout: useLayout('layout-a'),
          exact: true,
          Route: useComponent('AuthRoute'),
        },
        {
          path: '/',
          component: useComponent('dashboard-page'),
          layout: useLayout('layout-a'),
          Route: useComponent('ProtectedRoute'),
          exact: true,
        },
      ]);
    });

    makeApp('csr', testContext, ctx, {
      initialState: {
        ...reduxServiceStateSnapshot('___context', 'default', {
          responseCode: 200,
          response: {
            meta: {
              isAuthenticated: false,
            },
          },
        }),
      },
    })
      .then((App) => {
        const { getByText } = render(<App />);
        // Expect component and layout
        expect(getByText(/Layou/i).textContent).toBe('Layout D');
        expect(getByText(/Login Page/i).textContent).toBe('Login Page');
        done();
      })
      .catch(done);
  });

  test('should take to custom default url', (done) => {
    const ctx = new ApplicationContext();

    const testContext = createReactApp(({ use }) => {
      const { useRouteConfig, useComponent, useLayout, configureAuth } = use(
        Frontend
      );

      useComponent('dashboard-page', Dashboard);
      useComponent('login-page', LoginPage);
      useLayout('layout-a', Layout);

      useComponent('ProtectedRoute', Routers.ProtectedRoute);
      useComponent('AuthRoute', Routers.AuthRoute);

      configureAuth({
        loginPageUrl: '/custom/auth/login',
        defaultProtectedUrl: '/custom-landing',
      });

      useRouteConfig(() => [
        {
          path: '/custom/auth/login',
          component: useComponent('login-page'),
          layout: useLayout('layout-a'),
          exact: true,
          Route: useComponent('AuthRoute'),
        },
        {
          path: '/custom-landing',
          component: useComponent('dashboard-page'),
          layout: useLayout('layout-a'),
          Route: useComponent('ProtectedRoute'),
          exact: true,
        },
      ]);
    });

    makeApp('csr', testContext, ctx, {
      initialState: {
        ...reduxServiceStateSnapshot('___context', 'default', {
          responseCode: 200,
          response: {
            meta: {
              isAuthenticated: true,
            },
          },
        }),
      },
    })
      .then((App) => {
        const { getByText } = render(<App />);
        // Expect component and layout
        expect(getByText(/Layou/i).textContent).toBe('Layout D');
        expect(getByText(/Dashboard/i).textContent).toBe('Dashboard');
        done();
      })
      .catch(done);
  });
});

describe('useVolumeAccessPoint()', () => {
  test('general tests', (done) => {
    const ctx = new ApplicationContext();

    let valFromDefault: string = null;
    let valFromTestModule: string = null;
    let valFromTestModuleFromDefault: string = null;

    const testContext = createReactApp(({ use, useModule }) => {
      const { useVolumeAccessPoint } = use(Frontend);

      const accessPointFromDefault = useVolumeAccessPoint('testAP');
      valFromDefault = accessPointFromDefault.getUrl('file');

      useModule('testModule', ({ use }) => {
        const { useVolumeAccessPoint } = use(Frontend);

        const accessPointFromTest = useVolumeAccessPoint('testAP');
        valFromTestModule = accessPointFromTest.getUrl('file');

        const accessPointTestModuleFromDefault = useVolumeAccessPoint(
          'default/testAP'
        );
        valFromTestModuleFromDefault = accessPointTestModuleFromDefault.getUrl(
          'file'
        );
      });
    });

    makeApp('csr', testContext, ctx, {
      initialState: {
        ...reduxServiceStateSnapshot('___context', 'default', {
          responseCode: 200,
          response: {
            meta: {
              isAuthenticated: false,
            },
          },
        }),
      },
    })
      .then((App) => {
        render(<App />);
        expect(valFromDefault).toStrictEqual('/volumes/default/testAP/file');
        expect(valFromTestModule).toStrictEqual(
          '/volumes/testModule/testAP/file'
        );
        expect(valFromTestModuleFromDefault).toStrictEqual(valFromDefault);
        done();
      })
      .catch(done);
  });
});

describe('pass thru environment variable', () => {
  const ctx = new ApplicationContext();

  test('useEnv() should load passthru env vars', (done) => {
    const TestLayout = createComponent(({ currentModuleId, children }) => {
      return (
        <div>
          <h1>{`Layout A ${currentModuleId}`}</h1>
          {children}
        </div>
      );
    });

    const TestView = createComponent(({ currentModuleId }) => {
      return <h1>{`View A ${currentModuleId}`}</h1>;
    });

    const testModuleA = createModule(({ use }) => {
      const { mapRoute, useComponent } = use(Frontend);
      const TestViewComponent = useComponent('test-view', TestView);

      mapRoute('/', TestViewComponent, 'default/test-compo');
    });

    const testContext = createReactApp(({ use, useModule }) => {
      const { useLayout } = use(Frontend);
      useLayout('test-compo', TestLayout);
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
              passThroughVariables: {
                ARK__TEST_ENV: 'HELLO_123',
              },
            },
          },
        }),
      },
    })
      .then((App) => {
        const { getByText } = render(<App />);
        expect(getByText(/View/i).textContent).toBe('View A modA');
        expect(getByText(/Layout/i).textContent).toBe('Layout A default');
        expect(useEnv('ARK__TEST_ENV')).toStrictEqual('HELLO_123');
        done();
      })
      .catch(done);
  });
});
