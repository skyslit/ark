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
  Dynamics,
} from '../index';
import { render, act, waitFor } from '@testing-library/react';
import { DynamicsController } from '.';
import http from 'http';

let server: http.Server = null;

describe('CSR with multiple context and static sections', () => {
  beforeAll(() => {
    return new Promise((resolve, reject) => {
      server = http
        .createServer(async (req, res) => {
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

          let body: any = '';
          await new Promise<void>((r) => {
            req.on('data', (chunk) => {
              body += chunk;
            });
            req.on('end', () => {
              r();
            });
          });

          body = JSON.parse(body);

          switch (req.url) {
            case '/___service/default/dynamics___fetch-content': {
              switch (body.domain) {
                case 'custom-form': {
                  res.write(
                    JSON.stringify({
                      meta: {},
                      data: [
                        {
                          contentKey: 'test-dashboard',
                          domain: 'custom-form',
                          sections: [
                            {
                              id: '100',
                              sectionTemplateId: 'banner.template',
                              contentMap: {
                                'bg-color': 'blue',
                                'template-title': 'My Custom Form',
                              },
                            },
                          ],
                        },
                      ],
                    })
                  );
                  res.end();
                  break;
                }
                case 'language': {
                  res.write(
                    JSON.stringify({
                      meta: {},
                      data: [
                        {
                          contentKey: 'test-dashboard',
                          domain: 'language',
                          sections: [
                            {
                              id: '100',
                              sectionTemplateId: 'banner.template',
                              contentMap: {
                                'bg-color': 'blue',
                                'template-title': 'My Template Title',
                              },
                            },
                          ],
                        },
                      ],
                    })
                  );
                  res.end();
                  break;
                }
                default: {
                  res.statusCode = 404;
                  res.end();
                }
              }
              break;
            }
          }
        })
        .listen(3002, undefined, undefined, () => {
          resolve(null);
        });
    });
  }, 10 * 1000);

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
  }, 10 * 1000);

  test('[CSR] Dynamics should bootstrap and render content', (done) => {
    const ctx = new ApplicationContext();
    const dynamicsController = new DynamicsController();

    dynamicsController.fetchServiceOptions.ajax = {
      baseURL: 'http://localhost:3002',
      withCredentials: false,
      method: 'POST',
    };

    const language_DynamicsContext = Dynamics.createDynamicsDomain();
    const customForm_DynamicsContext = Dynamics.createDynamicsDomain();

    function LanguageStaticTemplate(props: any) {
      const toolbox = Dynamics.useToolbox(language_DynamicsContext);
      return (
        <>
          <div
            data-testid="banner-template-id"
            style={{
              backgroundColor: toolbox.getPropertyValue('bg-color', 'yellow'),
            }}
          >{`Banner Template ${toolbox.getPropertyValue(
            'template-title',
            'Title 200'
          )}`}</div>
          <div
            data-testid="banner-template-id-2"
            style={{
              backgroundColor: toolbox.getPropertyValue('bg-color', 'yellow'),
            }}
          >{`Banner Template ${toolbox.getPropertyValue(
            'template-subtitle',
            'Subtitle 200'
          )}`}</div>
        </>
      );
    }

    function CustomFormStaticTemplate(props: any) {
      const toolbox = Dynamics.useToolbox(customForm_DynamicsContext);
      return (
        <>
          <h1>Form Component</h1>
          <div
            data-testid="custom-form_banner-template-id"
            style={{
              backgroundColor: toolbox.getPropertyValue('bg-color', 'yellow'),
            }}
          >{`Banner Template ${toolbox.getPropertyValue(
            'template-title',
            'Title 200'
          )}`}</div>
          <div
            data-testid="custom-form_banner-template-id-2"
            style={{
              backgroundColor: toolbox.getPropertyValue('bg-color', 'yellow'),
            }}
          >{`Banner Template ${toolbox.getPropertyValue(
            'template-subtitle',
            'Subtitle 200'
          )}`}</div>
        </>
      );
    }

    const createTestComponent = createComponent(({ use }) => {
      return (
        <div>
          <Dynamics.EnableDynamics
            domain="language"
            context={language_DynamicsContext}
          >
            <Dynamics.EnableDynamics
              domain="custom-form"
              context={customForm_DynamicsContext}
            >
              <div data-testid="output">Hello</div>
              <Dynamics.Content
                mode="edit"
                contentKey="test-dashboard"
                context={language_DynamicsContext}
              >
                <LanguageStaticTemplate
                  properties={[
                    {
                      name: 'bg-color',
                      defValue: 'yellow',
                    },
                    {
                      name: 'template-title',
                      defValue: 'Title 200',
                    },
                    {
                      name: 'template-subtitle',
                      defValue: 'Subtitle 200',
                    },
                  ]}
                  contentKey="test-dashboard"
                  sectionId="100"
                />
                <Dynamics.Content
                  mode="edit"
                  contentKey="test-dashboard"
                  context={customForm_DynamicsContext}
                >
                  <CustomFormStaticTemplate
                    properties={[
                      {
                        name: 'bg-color',
                        defValue: 'yellow',
                      },
                      {
                        name: 'template-title',
                        defValue: 'Title Default',
                      },
                      {
                        name: 'template-subtitle',
                        defValue: 'Subtitle 200',
                      },
                    ]}
                    contentKey="test-dashboard"
                    sectionId="100"
                  />
                </Dynamics.Content>
              </Dynamics.Content>
            </Dynamics.EnableDynamics>
          </Dynamics.EnableDynamics>
        </div>
      );
    });

    const testContext = createReactApp(({ use }) => {
      const { useComponent, useRouteConfig, useDynamicsController } = use(
        Frontend
      );

      const defaultDynamicsController = useDynamicsController(
        'default',
        dynamicsController
      );
      defaultDynamicsController.debug = true;

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
        const { getByTestId } = render(<App />);

        await waitFor(() => new Promise((r) => setTimeout(r, 1000)), {
          timeout: 10 * 1000,
        });

        expect(getByTestId('output').innerHTML).toBe('Hello');
        expect(getByTestId('banner-template-id').innerHTML).toBe(
          `Banner Template My Template Title`
        );

        expect(getByTestId('custom-form_banner-template-id').innerHTML).toBe(
          `Banner Template My Custom Form`
        );
      })
      .then(() => {
        done();
      })
      .catch(done);
  });
});

describe('CSR', () => {
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
            case '/___service/default/dynamics___fetch-content': {
              res.write(
                JSON.stringify({
                  meta: {},
                  data: [
                    {
                      contentKey: 'test-dashboard',
                      domain: 'default',
                      sections: [
                        {
                          id: '100',
                          sectionTemplateId: 'banner.template',
                          contentMap: {
                            'bg-color': 'blue',
                            'template-title': 'Title 201',
                          },
                        },
                      ],
                    },
                  ],
                })
              );
              res.end();
              break;
            }
          }
        })
        .listen(3002, undefined, undefined, () => {
          resolve(null);
        });
    });
  }, 10 * 1000);

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
  }, 10 * 1000);

  test('[CSR] Dynamics should bootstrap and render content', (done) => {
    const ctx = new ApplicationContext();
    const dynamicsController = new DynamicsController();

    dynamicsController.fetchServiceOptions.ajax = {
      baseURL: 'http://localhost:3002',
      withCredentials: false,
    };

    const BannerTemplate = Dynamics.createSectionTemplate({
      id: 'banner.template',
      properties: [
        {
          name: 'bg-color',
          defValue: 'yellow',
        },
        {
          name: 'template-title',
          defValue: 'Title 200',
        },
        {
          name: 'template-subtitle',
          defValue: 'Subtitle 200',
        },
      ],
      Template: (props) => {
        const toolbox = Dynamics.useToolbox();

        // Asset if section data can be referenced
        expect(toolbox.sectionData.id).toStrictEqual('100');

        return (
          <>
            <div
              data-testid="banner-template-id"
              style={{
                backgroundColor: toolbox.getPropertyValue('bg-color', 'yellow'),
              }}
            >{`Banner Template ${toolbox.getPropertyValue(
              'template-title',
              'Title 200'
            )}`}</div>
            <div
              data-testid="banner-template-id-2"
              style={{
                backgroundColor: toolbox.getPropertyValue('bg-color', 'yellow'),
              }}
            >{`Banner Template ${toolbox.getPropertyValue(
              'template-subtitle',
              'Subtitle 200'
            )}`}</div>
          </>
        );
      },
    });

    dynamicsController.sectionTemplates.push(BannerTemplate);

    const createTestComponent = createComponent(({ use }) => {
      return (
        <div>
          <Dynamics.EnableDynamics domain="default">
            <div data-testid="output">Hello</div>
            <Dynamics.Content mode="edit" contentKey="test-dashboard" />
            <Dynamics.Content mode="edit" contentKey="test-dashboard-2" />
          </Dynamics.EnableDynamics>
        </div>
      );
    });

    const testContext = createReactApp(({ use }) => {
      const { useComponent, useRouteConfig, useDynamicsController } = use(
        Frontend
      );

      const defaultDynamicsController = useDynamicsController(
        'default',
        dynamicsController
      );
      defaultDynamicsController.debug = true;

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

        await waitFor(() => new Promise((r) => setTimeout(r, 1000)), {
          timeout: 10 * 1000,
        });

        expect(getByTestId('output').innerHTML).toBe('Hello');
        expect(getByTestId('banner-template-id').innerHTML).toBe(
          `Banner Template Title 201`
        );
        expect(getByTestId('banner-template-id-2').innerHTML).toBe(
          `Banner Template Subtitle 200`
        );
      })
      .then(() => {
        done();
      })
      .catch(done);
  });
});

describe('SSR', () => {
  test('[SSR] Dynamics should bootstrap and render content', (done) => {
    const ctx = new ApplicationContext();
    const dynamicsController = new DynamicsController();

    const BannerTemplate = Dynamics.createSectionTemplate({
      id: 'banner.template',
      properties: [
        {
          name: 'bg-color',
          defValue: 'yellow',
        },
        {
          name: 'template-title',
          defValue: 'Title 200',
        },
        {
          name: 'template-subtitle',
          defValue: 'Subtitle 200',
        },
      ],
      Template: (props) => {
        const toolbox = Dynamics.useToolbox();
        return (
          <>
            <div
              data-testid="banner-template-id"
              style={{
                backgroundColor: toolbox.getPropertyValue('bg-color'),
              }}
            >{`Banner Template ${toolbox.getPropertyValue(
              'template-title'
            )}`}</div>
            <div
              data-testid="banner-template-id-2"
              style={{
                backgroundColor: toolbox.getPropertyValue('bg-color'),
              }}
            >{`Banner Template ${toolbox.getPropertyValue(
              'template-subtitle'
            )}`}</div>
          </>
        );
      },
    });

    dynamicsController.sectionTemplates.push(BannerTemplate);

    const createTestComponent = createComponent(({ use }) => {
      return (
        <div>
          <Dynamics.EnableDynamics domain="default">
            <div data-testid="output">Hello</div>
            <Dynamics.Content mode="edit" contentKey="test-dashboard" />
          </Dynamics.EnableDynamics>
        </div>
      );
    });

    const testContext = createReactApp(({ use }) => {
      const { useComponent, useRouteConfig, useDynamicsController } = use(
        Frontend
      );

      const defaultDynamicsController = useDynamicsController(
        'default',
        dynamicsController
      );
      defaultDynamicsController.debug = true;

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
        ...reduxServiceStateSnapshot(
          'dynamics___fetch-content_default',
          'default',
          {
            responseCode: 200,
            response: {
              meta: {},
              data: [
                {
                  contentKey: 'test-dashboard',
                  domain: 'default',
                  sections: [
                    {
                      id: '100',
                      sectionTemplateId: 'banner.template',
                      contentMap: {
                        'bg-color': 'blue',
                        'template-title': 'Title 201',
                      },
                    },
                  ],
                },
              ],
            },
          }
        ),
      },
    })
      .then(async (App) => {
        const { getByText, getByTestId } = render(<App />);

        await waitFor(() => new Promise((r) => setTimeout(r, 1000)), {
          timeout: 10 * 1000,
        });

        expect(getByTestId('output').innerHTML).toBe('Hello');
        expect(getByTestId('banner-template-id').innerHTML).toBe(
          `Banner Template Title 201`
        );
        expect(getByTestId('banner-template-id-2').innerHTML).toBe(
          `Banner Template Subtitle 200`
        );
      })
      .then(() => {
        done();
      })
      .catch(done);
  });
});
