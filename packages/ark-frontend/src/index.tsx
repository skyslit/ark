import React from 'react';
import { createStore, Store } from 'redux';
import {
  ApplicationContext,
  ContextScope,
  ControllerContext,
  createPointer,
  extractRef,
  ServiceResponse,
  resolveAddressForTraversal,
  resolveIndexFromTraversalResult,
  CMS,
  CMSLog,
  useEnv,
  setDefaultEnv,
} from '@skyslit/ark-core';
import axios, { AxiosRequestConfig } from 'axios';
import { HelmetProvider } from 'react-helmet-async';
import {
  BrowserRouter,
  StaticRouter,
  Switch,
  Route,
  RouteProps,
  Redirect,
} from 'react-router-dom';
import ReactDOMServer from 'react-dom/server';
import traverse from 'traverse';
import cloneDeep from 'lodash/cloneDeep';
import isEqual from 'lodash/isEqual';
import _Dynamics, { DynamicsController } from './dynamics';
import { io, ManagerOptions, SocketOptions, Socket } from 'socket.io-client';
import {
  createFolderApis,
  FolderIntegrationApi,
} from './dynamics-v2/widgets/catalogue';

export type RenderMode = 'ssr' | 'csr';

axios.defaults.withCredentials = true;

export type ComponentPropType = {
  use: <T extends (...args: any) => any>(creators: T) => ReturnType<T>;
  currentModuleId: string;
  children?: any;
} & { [key: string]: any };

type StoreHook = <T>(
  refId: string,
  defaultVal?: T,
  useReactState?: boolean
) => [T, (val: T) => void];
export type ServiceHookOptions = {
  serviceId: string;
  storePostfix?: string;
  useRedux: boolean;
  ajax: AxiosRequestConfig;
  uxDelayInMs?: number;
};
type ServiceInvokeOptions = {
  force: boolean;
};
type ServiceHook<T = ServiceResponse<any, any>, E = Error> = (
  serviceId: string | Partial<ServiceHookOptions>
) => {
  statusCode: number;
  hasInitialized: boolean;
  isLoading: boolean;
  response: T;
  err: E;
  invoke: (body?: any, opts?: Partial<ServiceInvokeOptions>) => Promise<any>;
};

type ContextHook<T = ServiceResponse<any, any>, E = Error> = () => {
  statusCode: number;
  hasInitialized: boolean;
  isLoading: boolean;
  response: T;
  err: E;
  invoke: (body?: any, opts?: Partial<ServiceInvokeOptions>) => Promise<any>;
};

type TableHookOptions = {
  defaultPageSize?: number;
  defaultPage?: number;
  columns?: any[];
  additionalColumnNames?: string[];
  disableSelect?: boolean;
};

type TableHook = (
  serviceId: string | Partial<ServiceHookOptions & TableHookOptions>
) => {
  onChange: () => void;
  dataSource: any[];
  loading: boolean;
  columns: any[];
  pagination: {
    current: number;
    pageSize: number;
  };
};

type ContentHookOptions<T> = {
  serviceId: string;
  defaultContent: T;
  useReduxStore: boolean;
  enableLocalStorage?: boolean;
};
export type ContentHook = <T>(
  serviceId: string | Partial<ContentHookOptions<T>>
) => {
  isAvailable: boolean;
  hasChanged: boolean;
  content: T;
  actionLogs: React.MutableRefObject<CMSLog[]>;
  runBatch: (fn: (batchContent: T) => void) => void;
  markAsSaved: () => void;
  getPendingLogs: () => Array<CMSLog>;
  resetPendingLogs: () => void;
  setContent: (content: T) => void;
  updateKey: (key: string, val: T) => void;
  pushItem: (key: string, val: any) => void;
  unshiftItem: (key: string, val: any) => void;
  removeItemAt: (key: string, index: any) => void;
  insertItem: (key: string, indexToInsert: number | string, val: any) => void;
  saveLocally: () => void;
  hasLocalData: () => boolean;
  reset: () => void;
};

type MapRoute = (
  path: string,
  component: React.ComponentClass | React.FunctionComponent,
  layoutRefId?: string,
  opts?: RouteProps
) => void;

type MenuItem = {
  path: string | string[];
  hasLink?: boolean;
  isFlattened?: boolean;
  label?: string;
  icon?: any;
  extras?: any;
  hideInMenu?: boolean;
};

type MenuItemAddOn = {
  submenu?: Array<SubRouteConfigItem>;
};

type SubRouteConfigItem = {
  layout?: any;
  Route?: 'public' | React.FunctionComponent<{}>;
} & RouteProps &
  MenuItem;

type MenuHookOptions = {
  currentPath: string;
  refId: string;
  itemRenderer: (props?: { data: MenuItem; children?: any }) => JSX.Element;
  groupRenderer: (props?: {
    data: MenuItem & MenuItemAddOn;
    children?: any;
  }) => JSX.Element;
};

type MenuHook = (
  opts: MenuHookOptions
) => {
  menuItems: Array<JSX.Element>;
  activeGroupPath: string;
};

export type RouteConfigItem = SubRouteConfigItem & MenuItemAddOn;

export type ArkReactComponent<T> = (
  props: ComponentPropType & T
) => JSX.Element;

export type AuthConfiguration = {
  loginPageUrl: string;
  defaultProtectedUrl: string;
};

export type AccessPoint = {
  getUrl: (filename: string) => string;
};

type SocketRoomHook = {
  leaveRoom: () => void;
  joinRoom: () => void;
  subscribe: (event: string, callback: (...args: any[]) => any) => () => void;
  hasRoomJoined: boolean;
};
export type RoomInfo = {
  roomIds: string[];
  otherPayload?: any;
};
type SocketHook = () => {
  useRoom: (roomInfo: RoomInfo, autoJoin?: boolean) => SocketRoomHook;
  connect: (
    uri?: string,
    opts?: Partial<ManagerOptions & SocketOptions>,
    force?: boolean
  ) => Promise<void>;
  disconnect: () => Promise<string>;
  getSocket: () => Socket<any, any>;
};

declare global {
  // eslint-disable-next-line no-unused-vars
  namespace Ark {
    // eslint-disable-next-line no-unused-vars
    namespace MERN {
      // eslint-disable-next-line no-unused-vars
      interface React {
        renderMode: () => RenderMode;
        useStore: StoreHook;
        useComponent: <T = any>(
          refId: string,
          component?: ArkReactComponent<T>
        ) => React.FunctionComponent<T>;
        useService: ServiceHook;
        useSocket: SocketHook;
        useVolumeAccessPoint: (refId: string) => AccessPoint;
        useContext: ContextHook;
        useLayout: <T>(
          refId: string,
          component?: ArkReactComponent<T>
        ) => React.FunctionComponent<T>;
        useContent: ContentHook;
        useTableService: TableHook;
        mapRoute: MapRoute;
        useRouteConfig: (
          ref: string | (() => Array<RouteConfigItem>),
          configCreator?: () => Array<RouteConfigItem>
        ) => void;
        useMenu: MenuHook;
        configureAuth: (opts: AuthConfiguration) => void;
        useAuthConfiguration: () => AuthConfiguration;
        resolveServiceUrl: (serviceId: string, moduleId?: string) => string;
        useDynamicsController: (
          refId: string,
          controller?: DynamicsController
        ) => DynamicsController;
        useFolder: () => FolderIntegrationApi;
      }
    }
  }
}

/* -------------------------------------------------------------------------- */
/*                                  Utilities                                 */
/* -------------------------------------------------------------------------- */

/**
 * Resolve service Id to URL
 * @param {string} serviceId
 * @param {string} moduleId
 * @return {string}
 */
export function resolveServiceUrl(
  serviceId: string,
  moduleId: string = 'default'
): string {
  const ref = extractRef(serviceId, moduleId);
  return `/___service/${ref.moduleName}/${ref.refId}`;
}

const createReducer = (initialState = {}) => (
  state = initialState,
  action: any
) => {
  switch (action.type) {
    case 'SET_ITEM': {
      const { key, value } = action.payload;
      return Object.assign({}, state, {
        [key]: value,
      });
    }
    default: {
      return state;
    }
  }
};

/**
 * Initializes pure routed app
 * that can be used to render both in browser and node js
 * @param {ContextScope<any>} scope
 * @param {ApplicationContext=} ctx
 * @param {object=} initialState
 * @return {Promise<React.FunctionComponent>}
 */
export function initReactRouterApp(
  scope: ContextScope<any>,
  ctx: ApplicationContext = new ApplicationContext(),
  initialState: { [key: string]: any } = {}
) {
  let reduxDevtoolEnhancer: any = undefined;
  try {
    reduxDevtoolEnhancer =
      (global.window as any).__REDUX_DEVTOOLS_EXTENSION__ &&
      (global.window as any).__REDUX_DEVTOOLS_EXTENSION__();
  } catch (e) {
    /** Do nothing */
  }
  ctx.setData(
    'default',
    'store',
    createStore(createReducer(initialState), reduxDevtoolEnhancer)
  );

  return ctx.activate(scope).then(() => {
    const routes = ctx.getData<RouteConfigItem[]>(
      'default',
      'routeConfigs',
      []
    );
    return Promise.resolve(routes);
  });
}

type MakeAppOptions = {
  url: string;
  initialState?: any;
  Router?: any;
  routerProps?: any;
  helmetContext?: any;
};

// eslint-disable-next-line camelcase
declare const ___hydrated_redux___: any;

/**
 * Render react to string
 * @param {any} Component
 * @return {string}
 */
export function renderToString(Component: any) {
  return ReactDOMServer.renderToString(<Component />);
}

/**
 * Run react application
 * @param {RenderMode} mode
 * @param {ContextScope<any>} scope
 * @param {ApplicationContext} ctx
 * @param {object=} opts_
 * @return {Promise<React.FunctionComponent>}
 */
export function makeApp(
  mode: RenderMode,
  scope: ContextScope<any>,
  ctx: ApplicationContext = new ApplicationContext(),
  opts_: Partial<MakeAppOptions> = null
): Promise<React.FunctionComponent> {
  // Set renderMode flag to context
  ctx.setData('default', '__react___renderMode', mode);

  const opts: MakeAppOptions = Object.assign<
    MakeAppOptions,
    Partial<MakeAppOptions>
  >(
    {
      url: undefined,
      initialState: {},
      Router: BrowserRouter,
      routerProps: {},
    },
    opts_
  );

  if (mode === 'csr') {
    if (!opts.initialState) {
      opts.initialState = {};
    }

    try {
      opts.initialState = Object.assign(
        {},
        ___hydrated_redux___,
        opts.initialState
      );
    } catch (e) {
      /** Do nothing */
    }
  }

  return initReactRouterApp(scope, ctx, opts.initialState).then(
    (PureAppConfig) => {
      return Promise.resolve(() => {
        const main = useContextCreator(ctx)();
        const context: any = {};

        React.useEffect(() => {
          main.invoke();
        }, []);

        React.useEffect(() => {
          try {
            if (main.hasInitialized === true) {
              if (main?.response?.meta?.passThroughVariables) {
                setDefaultEnv(main?.response?.meta?.passThroughVariables || {});
              }
            }
          } catch (e) {
            console.error(e);
          }
        }, [main.hasInitialized]);

        if (!main.response) {
          return <div>Application booting up...</div>;
        }

        let Router: any = opts.Router;
        let routerProps: any = {};

        if (mode === 'ssr') {
          Router = StaticRouter;
          routerProps = {
            location: opts ? opts.url : '',
            context,
          };
        }

        if (opts.routerProps) {
          routerProps = {
            ...routerProps,
            ...opts.routerProps,
          };
        }

        return (
          <HelmetProvider context={opts.helmetContext}>
            <Router {...routerProps}>
              <Switch>
                {PureAppConfig.map((config) => {
                  let RouteComponent: any;

                  if (!config.Route) {
                    config.Route = 'public';
                  }

                  if (config.Route === 'public') {
                    RouteComponent = Route;
                  } else {
                    RouteComponent = config.Route;
                  }

                  const _props = config;
                  return <RouteComponent key={config.path} {..._props} />;
                })}
              </Switch>
            </Router>
          </HelmetProvider>
        );
      });
    }
  );
}

const ArkReactComponentContext = React.createContext<ComponentPropType>(null);

export function useArkReactServices(): ComponentPropType {
  return React.useContext(ArkReactComponentContext);
}

/**
 * Converts Ark Component to Connected React Component
 * @param {ArkReactComponent<any>} creator
 * @param {string} refId
 * @param {string} moduleId
 * @param {ControllerContext<any>} controller
 * @param {ApplicationContext} context
 * @return {React.FunctionComponent} Returns connected react component
 */
export function arkToReactComponent(
  Creator: ArkReactComponent<any>,
  refId: string,
  moduleId: string,
  controller: ControllerContext<any>,
  context: ApplicationContext
): React.FunctionComponent<any> {
  if (!Creator) {
    throw new Error('creator is required');
  }
  const ref = extractRef(refId, moduleId);
  const value = {
    currentModuleId: ref.moduleName,
    use: context.getPointers(ref.moduleName, controller).use,
  };

  return (props: any) => (
    <ArkReactComponentContext.Provider value={value}>
      <Creator {...props} {...value} />
    </ArkReactComponentContext.Provider>
  );
}

/**
 * Create react component
 * @param {ArkReactComponent} component
 * @return {JSX.Element}
 */
export function createComponent<T = {}>(
  component: ArkReactComponent<T>
): ArkReactComponent<T> {
  return component;
}

/**
 * Creates a new react based single page application
 * @param {ContextScope<Partial<Ark.MERN.React>>} fn
 * @return {ContextScope<Partial<Ark.MERN.React>>}
 */
export function createReactApp(fn: ContextScope<any>): ContextScope<any> {
  return fn;
}

/**
 * Creates a fully qualified ref id
 * @param {string} refId
 * @param {string} moduleId
 * @return {string}
 */
export function getFullyQualifiedReduxRefId(
  refId: string,
  moduleId: string
): string {
  return `${moduleId}/${refId}`;
}

/**
 * Creates a redux snapshot object
 * @param {string} refId
 * @param {string} moduleId
 * @param {any} val
 * @return {object}
 */
export function reduxStateSnapshot(
  refId: string,
  moduleId: string,
  val: any
): object {
  const ref = extractRef(refId, moduleId);
  return {
    [getFullyQualifiedReduxRefId(ref.refId, ref.moduleName)]: val,
  };
}

/**
 * Creates service state from backend
 * @param {string} serviceRefId
 * @param {string} moduleId
 * @param {any} stat
 * @return {object}
 */
export function reduxServiceStateSnapshot(
  serviceRefId: string,
  moduleId: string,
  stat: any
): object {
  const ref = extractRef(serviceRefId, moduleId);
  return {
    ...reduxStateSnapshot(`HAS_INITIALIZED_${ref.refId}`, moduleId, true),
    ...reduxStateSnapshot(`IS_LOADING_${ref.refId}`, moduleId, false),
    ...reduxStateSnapshot(
      `RESPONSE_${ref.refId}`,
      moduleId,
      stat.responseCode === 200 ? stat.response : null
    ),
    ...reduxStateSnapshot(
      `ERROR_${ref.refId}`,
      moduleId,
      stat.responseCode !== 200 ? stat.response : null
    ),
  };
}

export const useStoreCreator: (
  moduleId: string,
  ctx: ApplicationContext
) => StoreHook = (moduleId, ctx) => (
  refId,
  defaultVal = null,
  useReactState: boolean = false
) => {
  if (useReactState === false) {
    const ref = extractRef(refId, moduleId);
    const fullyQualifiedRefId = getFullyQualifiedReduxRefId(
      ref.refId,
      ref.moduleName
    );
    const store = ctx.getData<Store>('default', 'store');
    const [localStateVal, updateLocalStateVal] = React.useState(
      store.getState()[fullyQualifiedRefId] || defaultVal
    );

    React.useEffect(() => {
      const unsubscribe = store.subscribe(() => {
        const updatedVal = store.getState()[fullyQualifiedRefId];
        if (localStateVal !== updatedVal) {
          updateLocalStateVal(updatedVal);
        }
      });

      return unsubscribe;
    }, [fullyQualifiedRefId]);

    return [
      localStateVal,
      (value) => {
        store.dispatch({
          type: 'SET_ITEM',
          payload: {
            value,
            key: fullyQualifiedRefId,
          },
        });
      },
    ];
  } else {
    return React.useState(defaultVal);
  }
};

const getServiceUrl = (modId: string, service: string) =>
  `/___service/${modId}/${service}`;

function socketLog(...args: any[]) {
  try {
    const shouldDebug = (globalThis?.window as any)?.ARK_DEBUG_SOCKET === true;
    if (shouldDebug === true) {
      console.log(...args);
    }
  } catch (e) {
    console.error(e);
  }
}

const SOCKET_STORAGE_KEY = '__ark___socket_io_ref';
const useSocketCreator: (
  _modId: string,
  ctx: ApplicationContext
) => SocketHook = (_modId, ctx) => {
  return () => {
    const disconnect = (socket: Socket): Promise<string> => {
      return new Promise<string>((resolve, reject) => {
        const resolver = (reason: string) => {
          socket.removeListener('disconnect', resolver);
          resolve(reason);
        };
        socket.on('disconnect', resolver);
        socket.disconnect();
      });
    };

    const connect = (uri?: string, opts?: any, force?: boolean) => {
      return new Promise<void>(async (resolve, reject) => {
        if (typeof force === undefined) {
          force = false;
        }

        let socket: Socket<any, any> = ctx.getData(
          'default',
          SOCKET_STORAGE_KEY
        );
        if (force === true && socket) {
          if (socket.connected === true) {
            await disconnect(socket);
            socket = null;
          }
        }

        if (!socket) {
          socket = ctx.setData('default', SOCKET_STORAGE_KEY, io(uri, opts));

          const resolver = () => {
            socket.removeListener('connect', resolver);
            resolve();
          };

          socket.on('connect', resolver);

          /** Generic event listener */
          socket.on('connect', () => {
            socketLog(`Client connected to the server`);
          });
        } else {
          if (socket.connected === false) {
            const resolver = () => {
              socket.removeListener('connect', resolver);
              resolve();
            };

            socket.on('connect', resolver);
            socket.connect();
          } else {
            resolve();
          }
        }
      });
    };

    const getSocket = () => {
      let socket: Socket<any, any> = ctx.getData('default', SOCKET_STORAGE_KEY);

      return socket;
    };

    return {
      connect,
      getSocket,
      async disconnect() {
        let socket: Socket<any, any> = ctx.getData(
          'default',
          SOCKET_STORAGE_KEY
        );
        if (socket && socket.connected === true) {
          return disconnect(socket);
        }
      },
      useRoom(roomInfo, autoJoin) {
        const [hasRoomJoined, setHasRoomJoined] = React.useState<boolean>(
          false
        );

        const joinRoom = React.useCallback(() => {
          if (hasRoomJoined === false) {
            let socket: Socket<any, any> = ctx.getData(
              'default',
              SOCKET_STORAGE_KEY
            );
            if (socket) {
              socket.emit('ark/rooms/join', roomInfo);
              socketLog(
                `RT: Client joined rooms ${roomInfo.roomIds.join(', ')}`
              );
              setHasRoomJoined(true);
            }
          }
        }, [roomInfo, hasRoomJoined]);

        const leaveRoom = React.useCallback(
          (soft: boolean = false) => {
            if (hasRoomJoined === true) {
              let socket: Socket<any, any> = ctx.getData(
                'default',
                SOCKET_STORAGE_KEY
              );
              if (socket) {
                socket.emit('ark/rooms/leave', roomInfo);
                socketLog(
                  `RT: Client left room(s) ${roomInfo.roomIds.join(',')}${
                    soft === true ? ' (softly)' : ''
                  }`
                );
              }

              if (soft === false) {
                setHasRoomJoined(false);
              }
            }
          },
          [hasRoomJoined]
        );

        const subscribe = React.useCallback(
          (event: string, callback: (...args: any[]) => any) => {
            if (!hasRoomJoined) {
              console.warn(
                `Room(s) '${roomInfo.roomIds.join(
                  ', '
                )}' has not joined yet, hence event '${event}' might not be called.`
              );
            }

            let socket: Socket<any, any> = ctx.getData(
              'default',
              SOCKET_STORAGE_KEY
            );
            if (socket) {
              socket.on(event, callback);
              socketLog(`Event '${event}' listening on socket`);
              return () => {
                socketLog(`Event '${event}' unsubscribed from socket`);
                socket.off(event, callback);
              };
            }

            return () => {
              /** Do nothing */
            };
          },
          []
        );

        /** Auto join room, when socket re-connects */
        React.useEffect(() => {
          if (hasRoomJoined === true) {
            let socket: Socket<any, any> = ctx.getData(
              'default',
              SOCKET_STORAGE_KEY
            );
            if (socket) {
              const connectionHandler = () => {
                socketLog(
                  `RT: Client re-connected initiated for room '${roomInfo.roomIds.join(
                    ', '
                  )}'`
                );
                joinRoom();
              };

              socket.on('connect', connectionHandler);
              return () => {
                socket.off('connect', connectionHandler)
              };
            }
          }
        }, [hasRoomJoined, joinRoom, roomInfo]);

        /** Auto join room */
        React.useEffect(() => {
          if (autoJoin === true) {
            /** Leave the room if already joined */
            if (hasRoomJoined === true) {
              leaveRoom(true);
            }

            socketLog(`RT: Auto joining room: ${roomInfo.roomIds.join(', ')}`);
            joinRoom();
          }
        }, [roomInfo, autoJoin]);

        /** Leave room, when compoenent is unmounted */
        React.useEffect(() => {
          if (hasRoomJoined === true) {
            return () => {
              socketLog(`RT: Left room: ${roomInfo.roomIds.join(', ')}`);
              leaveRoom();
            };
          }
        }, [hasRoomJoined]);

        return {
          joinRoom,
          leaveRoom,
          subscribe,
          hasRoomJoined,
        };
      },
    };
  };
};

const useServiceCreator: (
  _modId: string,
  ctx: ApplicationContext
) => ServiceHook = (_modId, ctx) => (service) => {
  let modId = _modId;

  const option: ServiceHookOptions = Object.assign<
    ServiceHookOptions,
    Partial<ServiceHookOptions>
  >(
    {
      useRedux: false,
      storePostfix: '',
      serviceId: typeof service === 'string' ? service : undefined,
      ajax: {
        method: 'post',
      },
      uxDelayInMs: 300,
    },
    typeof service === 'string' ? {} : service
  );

  let uxDelayInMsEnv = parseInt(useEnv('ARK_SERVICE_UX_DELAY_MS'));
  if (!isNaN(uxDelayInMsEnv)) {
    option.uxDelayInMs = uxDelayInMsEnv;
  }

  if (typeof service === 'string') {
    const ref = extractRef(service, modId);
    modId = ref.moduleName;
    service = ref.refId;

    option.ajax.url = getServiceUrl(modId, service);
    option.ajax.method = 'post';
  } else {
    const ref = extractRef(service.serviceId, modId);
    modId = ref.moduleName;
    service.serviceId = ref.refId;

    try {
      option.ajax.url = getServiceUrl(modId, service.serviceId);
      if (service.ajax) {
        option.ajax = { ...option.ajax, ...service.ajax };
      }
    } catch (e) {
      console.error(e);
    }
  }

  const stateId = `${option.serviceId}${
    option.storePostfix ? `_${option.storePostfix}` : ''
  }`;
  const [hasInitialized, setHasInitialized] = useStoreCreator(
    modId,
    ctx
  )<boolean>(`HAS_INITIALIZED_${stateId}`, null, !option.useRedux);
  const [isLoading, setLoading] = useStoreCreator(modId, ctx)<boolean>(
    `IS_LOADING_${stateId}`,
    null,
    !option.useRedux
  );
  const [response, setResponse] = useStoreCreator(modId, ctx)<
    ServiceResponse<any, any>
  >(`RESPONSE_${stateId}`, null, !option.useRedux);
  const [err, setError] = useStoreCreator(modId, ctx)<Error>(
    `ERROR_${stateId}`,
    null,
    !option.useRedux
  );
  const [statusCode, setStatusCode] = useStoreCreator(modId, ctx)<number>(
    `STATUS_CODE_${stateId}`,
    null,
    !option.useRedux
  );

  const invoke = React.useCallback(
    (data?: any, opts_?: Partial<ServiceInvokeOptions>) => {
      return new Promise((resolve, reject) => {
        const opts: ServiceInvokeOptions = Object.assign<
          ServiceInvokeOptions,
          Partial<ServiceInvokeOptions>
        >(
          {
            force: false,
          },
          opts_
        );

        if (hasInitialized !== true || opts.force === true) {
          setStatusCode(-1);
          setLoading(true);
          setError(null);
          setResponse(null);
          axios(Object.assign(option.ajax, { data }))
            .then(async (response) => {
              setStatusCode(response.status);
              setHasInitialized(true);
              setResponse(response.data);
              if (option.uxDelayInMs > 0) {
                await new Promise<void>((r) =>
                  setTimeout(() => r(), option.uxDelayInMs)
                );
              }
              setLoading(false);
              resolve(response.data);
            })
            .catch(async (err) => {
              let statusCodeVal = 500;
              let errObj = err;
              // Fix: API error is not visible in redux state
              try {
                if (err.response) {
                  statusCodeVal = err.response.status;
                  errObj = err.response.data;
                }
              } catch (e) {
                // Do nothing
              }
              setError(errObj);
              setStatusCode(statusCodeVal);
              if (option.uxDelayInMs > 0) {
                await new Promise<void>((r) =>
                  setTimeout(() => r(), option.uxDelayInMs)
                );
              }
              setLoading(false);
              reject(errObj);
            });
        } else {
          resolve(false);
        }
      });
    },
    [
      option,
      setStatusCode,
      setHasInitialized,
      setResponse,
      setLoading,
      setError,
      hasInitialized,
    ]
  );

  return {
    hasInitialized: hasInitialized || false,
    isLoading: isLoading || false,
    response,
    err,
    statusCode,
    invoke,
  };
};

const useContextCreator: (context: ApplicationContext) => ContextHook = (
  context: ApplicationContext
) => () => {
  return useServiceCreator(
    'default',
    context
  )({
    serviceId: '___context',
    useRedux: true,
  });
};

const useTableServiceCreator: (
  modId: string,
  context: ApplicationContext
) => TableHook = (modId: string, context: ApplicationContext) => (
  serviceId
) => {
  let url: string = null;
  let defaultCurrentPage: number = 1;
  let defaultPageSize: number = 30;
  let disableSelect: boolean = false;
  let columns: any[] = undefined;
  let additionalColumnNames: string[] = undefined;
  let columnsToSelect: string[] = undefined;

  try {
    if (typeof serviceId === 'object') {
      url = serviceId.serviceId;
      columns = serviceId.columns;
      additionalColumnNames = serviceId.additionalColumnNames;
      disableSelect =
        typeof serviceId.disableSelect === 'boolean'
          ? serviceId.disableSelect
          : false;

      if (!isNaN(serviceId.defaultPage)) {
        defaultCurrentPage = serviceId.defaultPage;
      }

      if (!isNaN(serviceId.defaultPageSize)) {
        defaultPageSize = serviceId.defaultPageSize;
      }
    }
  } catch (e) {
    /** Do nothing */
  }

  if (disableSelect === false && Array.isArray(columns)) {
    try {
      columnsToSelect = React.useMemo(
        () => [
          ...columns.map((c) => c.dataIndex),
          ...(Array.isArray(additionalColumnNames)
            ? additionalColumnNames
            : []),
        ],
        [columns, additionalColumnNames]
      );
    } catch (e) {
      /** Do nothing */
    }
  }

  const [currentPage, setCurrentPage] = React.useState(defaultCurrentPage);
  const [pageSize, setPageSize] = React.useState(defaultPageSize);
  const service = useServiceCreator(modId, context)(serviceId);

  let dataSource: any[] = [];
  let total: number = 0;
  let pagination: any = {};

  try {
    if (Array.isArray(service.response.data)) {
      dataSource = service.response.data;
    }
  } catch (e) {
    /** Do nothing */
  }

  try {
    if (!isNaN(service.response.meta.totalCount)) {
      total = service.response.meta.totalCount;
    }
  } catch (e) {
    /** Do nothing */
  }

  pagination = {
    current: currentPage,
    pageSize: pageSize,
    total,
  };

  const onChange = React.useCallback(
    (_pag?: any, _filter?: any, _sorter?: any) => {
      if (!_pag) {
        _pag = pagination;
      }

      let sortQ: any = undefined;

      if (_sorter) {
        try {
          const sortFields: any[] = Array.isArray(_sorter)
            ? _sorter
            : [_sorter];
          sortQ = JSON.stringify(
            sortFields.reduce((acc, item) => {
              acc[item.field] = item.order === 'ascend' ? 1 : -1;
              return acc;
            }, {})
          );
        } catch (e) {
          /** Do nothing */
        }
      }

      let filterQ: any = undefined;

      if (_filter) {
        try {
          filterQ = JSON.stringify(_filter);
        } catch (e) {
          /** Do nothing */
        }
      }

      let selectQ: any = undefined;

      try {
        if (
          disableSelect === false &&
          Array.isArray(columnsToSelect) &&
          columnsToSelect.length > 0
        ) {
          selectQ = JSON.stringify(columnsToSelect.join(' '));
        }
      } catch (e) {
        /** Do nothing */
      }

      return service
        .invoke(
          {
            skip: _pag.pageSize * (_pag.current - 1),
            limit: _pag.pageSize,
            sort: sortQ,
            filter: filterQ,
            select: selectQ,
          },
          { force: true }
        )
        .then((res) => {
          setCurrentPage(_pag.current);
          setPageSize(_pag.pageSize);
        });
    },
    // Fix: issue with table source not changing when service id is changed
    [url]
  );

  React.useEffect(() => {
    onChange();
  }, [onChange]);

  return {
    loading: service.isLoading,
    dataSource,
    onChange,
    pagination,
    columns,
  };
};

const mapRouteCreator = (
  moduleId: string,
  context: ApplicationContext
): MapRoute => (path, Component, layoutRefId = null, opts = {}) => {
  let Layout: any = null;
  if (layoutRefId) {
    Layout = context.take(moduleId, layoutRefId, 'layouts');
  }

  const routeConfigs = context.getData<RouteConfigItem[]>(
    'default',
    'routeConfigs',
    []
  );
  routeConfigs.push({
    path: path as any,
    component: Layout
      ? (props: any) => (
          <Layout {...props}>
            <Component {...props} />
          </Layout>
        )
      : Component,
    ...opts,
  });
};

const addMenuItemToAccumulator = (
  acc: Array<any>,
  items: Array<RouteConfigItem>,
  isFlattened: boolean = false
) => {
  acc.push(
    ...items.map((i) => {
      i.hasLink = i.component !== undefined && i.component !== null;
      i.isFlattened = isFlattened;
      return i;
    })
  );
};

export const flattenRouteConfig = (
  input: Array<RouteConfigItem>
): Array<RouteConfigItem> => {
  return input.reduce((acc, item) => {
    addMenuItemToAccumulator(acc, [item]);

    // Add submenu items
    if (Array.isArray(item.submenu) && item.submenu.length > 0) {
      addMenuItemToAccumulator(acc, item.submenu, true);
    }

    return acc;
  }, []);
};

export const Routers = {
  ProtectedRoute: createComponent(
    ({ component, use, currentModuleId, children, ...rest }) => {
      const { useContext, useAuthConfiguration } = use(Frontend);
      const { hasInitialized, isLoading, response } = useContext();
      const { loginPageUrl } = useAuthConfiguration();

      let isAuthenticated: boolean = false;
      try {
        if (hasInitialized === true && isLoading === false) {
          if (response) {
            isAuthenticated = response.meta.isAuthenticated;
          }
        }
      } catch (e) {
        /** Do nothing */
      }

      const currentLocation = React.useMemo(() => {
        try {
          const canFetchLocation = Boolean(globalThis?.window?.location);
          if (canFetchLocation === true) {
            const href = globalThis?.window?.location?.href;
            if (typeof href === 'string' && href !== '') {
              return href;
            }
          }
        } catch (e) {}
        return null;
      }, [globalThis?.window?.location?.href]);

      const [loginPageUrl_M, search_M] = React.useMemo(() => {
        let searchQ: string = undefined;

        if (currentLocation) {
          try {
            const url = new URL(`http://localhost/${loginPageUrl}`);
            url.searchParams.set(
              'redirectUrl',
              encodeURIComponent(currentLocation)
            );

            if (url.search) {
              searchQ = url.search;
            }
          } catch (e) {}
        }

        return [loginPageUrl, searchQ];
      }, [loginPageUrl, currentLocation]);

      const Component: any = component;
      return (
        <Route
          {...rest}
          render={({ location }) =>
            isAuthenticated === true ? (
              <Component {...rest} />
            ) : (
              <Redirect
                to={{
                  pathname: loginPageUrl_M,
                  state: { from: location },
                  search: search_M,
                }}
              />
            )
          }
        />
      );
    }
  ),
  AuthRoute: createComponent(
    ({ component, use, currentModuleId, children, ...rest }) => {
      const { useContext, useAuthConfiguration } = use(Frontend);
      const { hasInitialized, isLoading, response } = useContext();
      const { defaultProtectedUrl } = useAuthConfiguration();

      let isAuthenticated: boolean = false;
      try {
        if (hasInitialized === true && isLoading === false) {
          if (response) {
            isAuthenticated = response.meta.isAuthenticated;
          }
        }
      } catch (e) {
        /** Do nothing */
      }

      const redirectUri = React.useMemo(() => {
        if (globalThis?.window?.location?.search) {
          const q = new URLSearchParams(globalThis?.window?.location?.search);
          if (q.has('redirectUrl')) {
            return q.get('redirectUrl');
          }
        }
        return null;
      }, [globalThis?.window?.location?.search]);

      const [redirectUriM, searchM] = React.useMemo(() => {
        let uriStr: string = defaultProtectedUrl;
        let search: string = undefined;

        if (redirectUri) {
          try {
            const url = new URL(decodeURIComponent(redirectUriM));
            uriStr = url.pathname;
            search = url.search || undefined;
          } catch (e) {}
        }

        return [uriStr, search];
      }, [redirectUri, defaultProtectedUrl]);

      const Component: any = component;
      return (
        <Route
          {...rest}
          render={({ location }) =>
            !isAuthenticated ? (
              <Component {...rest} />
            ) : (
              <Redirect
                to={{
                  pathname: redirectUriM,
                  state: { from: location },
                  search: searchM,
                }}
              />
            )
          }
        />
      );
    }
  ),
};

export const Frontend = createPointer<Ark.MERN.React>(
  (moduleId, controller, context) => ({
    init: () => {},
    renderMode: () => {
      try {
        return context.getData('default', '__react___renderMode');
      } catch (e) {
        /** Do nothing */
      }
      return 'csr';
    },
    useSocket: useSocketCreator(moduleId, context),
    useService: useServiceCreator(moduleId, context),
    useVolumeAccessPoint: (refId: string) => {
      const ref = extractRef(refId, moduleId);
      const accessPointPath = `/volumes/${ref.moduleName}/${ref.refId}`;
      return {
        getUrl: (fileName) => `${accessPointPath}/${fileName}`,
      };
    },
    useStore: useStoreCreator(moduleId, context),
    useContext: useContextCreator(context),
    useTableService: useTableServiceCreator(moduleId, context),
    useComponent: (refId, componentCreator = null) => {
      return context.useDataFromContext(
        moduleId,
        refId,
        componentCreator
          ? arkToReactComponent(
              componentCreator,
              refId,
              moduleId,
              controller,
              context
            )
          : undefined,
        false,
        'components'
      );
    },
    useLayout: (refId, componentCreator = null) => {
      return context.useDataFromContext(
        moduleId,
        refId,
        componentCreator
          ? arkToReactComponent(
              componentCreator,
              refId,
              moduleId,
              controller,
              context
            )
          : undefined,
        false,
        'layouts'
      );
    },
    mapRoute: mapRouteCreator(moduleId, context),
    useRouteConfig: (_ref, _configCreator) => {
      const ref = typeof _ref === 'string' ? _ref : 'default';
      const configCreator = typeof _ref === 'string' ? _configCreator : _ref;
      const hasConfigCreator = configCreator === undefined ? false : true;

      if (hasConfigCreator === false) {
        return context.useDataFromContext(
          'default',
          ref,
          undefined,
          false,
          'route_menu'
        );
      }

      controller.ensureInitializing();
      controller.run(() => {
        const config =
          hasConfigCreator === true
            ? flattenRouteConfig(configCreator())
            : undefined;
        const menu: Array<MenuItem & MenuItemAddOn> = config.map((c) => ({
          path: c.path,
          extras: c.extras,
          icon: c.icon,
          label: c.label,
          hasLink: c.hasLink,
          isFlattened: c.isFlattened,
          hideInMenu: c.hideInMenu,
          submenu: c.submenu,
        }));

        context.useDataFromContext('default', ref, menu, false, 'route_menu');

        const routeConfigs = context.getData<RouteConfigItem[]>(
          'default',
          'routeConfigs',
          []
        );
        routeConfigs.push(
          ...config
            .filter((c) => c.hasLink === true)
            .map((item) => {
              const RawComponent = item.component;
              item.component = item.layout
                ? (props: any) => (
                    <item.layout {...props}>
                      <RawComponent {...props} />
                    </item.layout>
                  )
                : item.component;
              return item;
            })
        );
      });

      return null;
    },
    useMenu: (opts) => {
      const ItemRenderer = opts.itemRenderer;
      const GroupRenderer = opts.groupRenderer;

      const menuItems = React.useMemo<Array<JSX.Element>>(() => {
        let result = context.useDataFromContext<
          Array<MenuItem & MenuItemAddOn>
        >('default', opts.refId, undefined, false, 'route_menu');

        if (Array.isArray(result) && result.length > 0) {
          result = result
            .filter((m) => m.isFlattened === false)
            .filter(
              (m) => m.hideInMenu === undefined || m.hideInMenu === false
            );
        } else {
          result = [];
        }

        return result.reduce<Array<JSX.Element>>((acc, item, index) => {
          const hasSubItem =
            Array.isArray(item.submenu) && item.submenu.length > 0;

          if (hasSubItem === true) {
            acc.push(
              <GroupRenderer key={item.path as string} data={item}>
                {item.submenu.map((v) => (
                  <ItemRenderer key={v.path as string} data={v} />
                ))}
              </GroupRenderer>
            );
          } else {
            acc.push(<ItemRenderer key={item.path as string} data={item} />);
          }

          return acc;
        }, []);
      }, [opts.refId, ItemRenderer, GroupRenderer]);

      const activeGroupPath: string = React.useMemo(() => {
        let result = context.useDataFromContext<
          Array<MenuItem & MenuItemAddOn>
        >('default', opts.refId, undefined, false, 'route_menu');

        if (Array.isArray(result) && result.length > 0) {
          result = result
            .filter((m) => m.isFlattened === false)
            .filter(
              (m) => m.hideInMenu === undefined || m.hideInMenu === false
            );
        } else {
          result = [];
        }

        let i = 0;
        for (i = 0; i < result.length; i++) {
          if (
            Array.isArray(result[i].submenu) &&
            result[i].submenu.length > 0
          ) {
            let j = 0;
            for (j = 0; j < result[i].submenu.length; j++) {
              if (result[i].submenu[j].path === opts.currentPath) {
                return result[i].path as string;
              }
            }
          }
        }

        return undefined;
      }, [opts.currentPath]);

      return {
        menuItems,
        activeGroupPath,
      };
    },
    useContent: (opts_) => {
      const opts: ContentHookOptions<any> = Object.assign<
        ContentHookOptions<any>,
        Partial<ContentHookOptions<any>>
      >(
        {
          serviceId: typeof opts_ === 'string' ? opts_ : undefined,
          defaultContent: undefined,
          useReduxStore: false,
          enableLocalStorage: false,
        },
        typeof opts_ === 'object' ? opts_ : undefined
      );

      const localStorageKey: string = `_cmsHook/_ls/${opts.serviceId}`;

      if (opts.enableLocalStorage === true) {
        try {
          opts.defaultContent = JSON.parse(
            localStorage.getItem(localStorageKey)
          );
        } catch (e) {
          console.warn(
            `Failed to load content from local storage for '${opts.serviceId};`
          );
          console.warn(e);
        }
      }

      const useStore = useStoreCreator(moduleId, context);
      const [baseContent, setBaseContent] = useStore<any>(
        `_cmsHook/_base_${opts.serviceId}`,
        opts.defaultContent,
        opts.useReduxStore === false
      );
      const [content, setContentToState] = useStore<any>(
        `_cmsHook/${opts.serviceId}`,
        opts.defaultContent,
        opts.useReduxStore === false
      );
      const [hasChanged, setHasChanged] = useStore<boolean>(
        `_cmsHook/_changed_${opts.serviceId}`,
        false,
        opts.useReduxStore === false
      );

      React.useEffect(() => {
        setHasChanged(isEqual(baseContent, content) === false);
      }, [baseContent, content]);

      let isBatchModeEnabled: boolean = false;
      let batchContent: any = null;

      const getCurrentValByKey = (
        key: string,
        ejectTraverseResult: boolean = false
      ) => {
        const traverseResult = traverse(
          isBatchModeEnabled === true ? batchContent : content
        );
        const resolvedKey = resolveAddressForTraversal(traverseResult, key);

        if (ejectTraverseResult === true) {
          return {
            val: traverseResult.get(resolvedKey.split('.')),
            traverseResult,
            resolvedKey,
          };
        }

        return traverseResult.get(resolvedKey.split('.'));
      };

      const actionLogs = React.useRef<Array<CMSLog>>([]);
      const updateKey = (key: string, val: any) => {
        let input: any = null;

        if (isBatchModeEnabled === true) {
          input = batchContent;
        } else {
          input = cloneDeep(content);
        }

        const result = CMS.updateContent(
          input,
          [
            {
              key,
              val,
            },
          ],
          'edit'
        );

        const output = result.content;
        actionLogs.current.push(...result.appliedActions);

        if (isBatchModeEnabled === true) {
          batchContent = output;
        } else {
          setContentToState(output);
        }
      };

      return {
        isAvailable: content !== null && content !== undefined,
        hasChanged,
        content,
        actionLogs,
        runBatch: (fn: (content: any) => void) => {
          isBatchModeEnabled = true;
          batchContent = cloneDeep(content);
          fn && fn(batchContent);
          isBatchModeEnabled = false;
          setContentToState(batchContent);
          batchContent = null;
        },
        reset: () => {
          setContentToState(baseContent);
          setHasChanged(false);
          actionLogs.current = [];
        },
        setContent: (val) => {
          setContentToState(val);
          setBaseContent(val);
          setHasChanged(false);
          actionLogs.current = [];
        },
        markAsSaved: () => {
          setBaseContent(content);
          setHasChanged(false);
          actionLogs.current = [];
        },
        getPendingLogs: () => {
          return actionLogs.current;
        },
        resetPendingLogs: () => {
          actionLogs.current = [];
        },
        insertItem: (key, indexToInsert, val) => {
          const item = getCurrentValByKey(key, true);
          const resolvedIndex = resolveIndexFromTraversalResult(
            item.traverseResult,
            item.resolvedKey,
            String(indexToInsert)
          );
          if (Array.isArray(item.val)) {
            updateKey(key, [
              ...item.val.slice(0, resolvedIndex),
              val,
              ...item.val.slice(resolvedIndex, item.val.length),
            ]);
          } else {
            throw new Error(
              `${key} is not an array. pushItem can be only called upon an array`
            );
          }
        },
        pushItem: (key, val) => {
          const item = getCurrentValByKey(key);
          if (Array.isArray(item)) {
            updateKey(key, [...item, val]);
          } else {
            throw new Error(
              `${key} is not an array. pushItem can be only called upon an array`
            );
          }
        },
        unshiftItem: (key, val) => {
          const item = getCurrentValByKey(key);
          if (Array.isArray(item)) {
            updateKey(key, [val, ...item]);
          } else {
            throw new Error(
              `${key} is not an array. unshiftItem can be only called upon an array`
            );
          }
        },
        removeItemAt: (key, index) => {
          const item = getCurrentValByKey(key, true);
          const resolvedIndex = resolveIndexFromTraversalResult(
            item.traverseResult,
            item.resolvedKey,
            index
          );
          if (Array.isArray(item.val)) {
            updateKey(
              key,
              item.val.filter((x: any, i: number) => i !== resolvedIndex)
            );
          } else {
            throw new Error(
              `${key} is not an array. unshiftItem can be only called upon an array`
            );
          }
        },
        updateKey,
        saveLocally: () => {
          try {
            window.localStorage.setItem(
              localStorageKey,
              JSON.stringify(content)
            );
          } catch (e) {
            console.warn(
              `Failed to load content from local storage for '${opts.serviceId};`
            );
            console.warn(e);
          }
        },
        hasLocalData: () => {
          try {
            const data = JSON.parse(
              window.localStorage.getItem(localStorageKey)
            );
            return data !== undefined && data !== null;
          } catch (e) {
            console.warn(
              `Failed to load content from local storage for '${opts.serviceId};`
            );
            console.warn(e);
          }

          return false;
        },
      };
    },
    configureAuth: (opts) => {
      controller.ensureInitializing();
      context.setData<AuthConfiguration>('default', 'authOptions', opts);
    },
    useAuthConfiguration: () => {
      return context.getData<AuthConfiguration>('default', 'authOptions', {
        loginPageUrl: '/auth/login',
        defaultProtectedUrl: '/',
      });
    },
    resolveServiceUrl: (serviceId: string, modId?: string): string => {
      let _moduleId = moduleId;
      if (modId) {
        _moduleId = modId;
      }

      return resolveServiceUrl(serviceId, _moduleId);
    },
    useDynamicsController: (refId, controller = null) => {
      return context.useDataFromContext(
        moduleId,
        refId,
        controller ? controller : undefined,
        false,
        'dynamics.controller'
      );
    },
    useFolder: createFolderApis(moduleId, controller, context),
  })
);

/* -------------------------------------------------------------------------- */
/*                                Dynamics API                                */
/* -------------------------------------------------------------------------- */

export const Dynamics = _Dynamics;
