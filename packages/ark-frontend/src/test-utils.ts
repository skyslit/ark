/* eslint-disable */
import { ApplicationContext, ContextScope } from '@skyslit/ark-core';
import {
  ArkReactComponent,
  makeApp,
  Frontend,
  reduxServiceStateSnapshot,
} from '.';

type BrowserContext = {
  isAuthenticated: boolean;
  [key: string]: any;
};

type MountOptions = {
  path: string;
  scope: ContextScope<any>;
  applicationContext: ApplicationContext;
  browserContext: BrowserContext;
  initialState: any;
};

export function createTestReactApp(
  component: ArkReactComponent<any>,
  opts?: Partial<MountOptions>
) {
  let options: MountOptions = Object.assign<
    MountOptions,
    Partial<MountOptions>
  >(
    {
      path: '/',
      scope: null,
      applicationContext: null,
      browserContext: {
        isAuthenticated: false,
      },
      initialState: null,
    },
    opts
  );

  if (!options.scope) {
    options.scope = ({ use, useModule }) => {
      const { useRouteConfig, useComponent } = use(Frontend);

      useModule('test-mod', ({ use }) => {
        const { useComponent } = use(Frontend);
        useComponent('test-component', component);
      });

      useRouteConfig(() => [
        {
          path: options.path,
          component: useComponent('test-mod/test-component'),
        },
      ]);
    };
  }

  if (!options.applicationContext) {
    options.applicationContext = new ApplicationContext();
  }

  return makeApp('csr', options.scope, options.applicationContext, {
    initialState: {
      ...reduxServiceStateSnapshot('___context', 'default', {
        responseCode: 200,
        response: {
          meta: options.browserContext,
        },
      }),
      ...(() => {
        if (!options.initialState) {
          return {};
        }
        return options.initialState;
      })(),
    },
  });
}
