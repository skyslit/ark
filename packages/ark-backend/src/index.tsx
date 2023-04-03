import path from 'path';
import fs from 'fs';
import {
  ApplicationContext,
  ContextScope,
  ControllerContext,
  createPointer,
  extractRef,
  ServiceResponse,
  useEnv,
  getRuntimeVars,
  setDefaultEnv,
} from '@skyslit/ark-core';
import expressApp, {
  CookieOptions,
  Handler,
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from 'express';
import Joi from 'joi';
import {
  SchemaDefinition,
  Model,
  Document,
  Schema,
  ConnectionOptions,
  createConnection,
  Connection,
  DocumentQuery,
} from 'mongoose';
import http from 'http';
import https from 'https';
import {
  makeApp,
  renderToString,
  reduxServiceStateSnapshot,
} from '@skyslit/ark-frontend';
import * as HTMLParser from 'node-html-parser';
import * as pathToRegexp from 'path-to-regexp';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import bodyParser from 'body-parser';
import morgan from 'morgan';
import axios from 'axios';
import {
  Server as IOServer,
  ServerOptions as IOServerOptions,
} from 'socket.io';
import {
  createClient,
  RedisClientOptions,
  RedisModules,
  RedisFunctions,
  RedisScripts,
} from 'redis';
import { createAdapter } from '@socket.io/redis-adapter';

type HttpVerbs =
  | 'all'
  | 'get'
  | 'post'
  | 'put'
  | 'delete'
  | 'patch'
  | 'options'
  | 'head';

type ServerOpts = {
  port: number;
  securePort?: number;
  hostname?: string;
  backlog?: number;
  listeningListener?: () => void;
  enableHttps?: boolean;
  secureOptions?: Partial<https.ServerOptions>;
};

type ServiceAlias = 'service' | 'rest';

type ServiceConsumerOptions = {
  alias: ServiceAlias;
  path: string;
  method: HttpVerbs;
  controller: ServiceController;
  skipServiceRegistration: boolean;
  skipBearerTokenCheck: boolean;
  policyExtractorRefs: string[];
};

type WebAppRenderer = {
  render: (
    initialState?: any,
    reqs_?: Array<ServiceReq>
  ) => expressApp.RequestHandler;
};

type UseServicePointer = (
  def: ServiceDefinitionMeta,
  opts?: Partial<ServiceConsumerOptions>
) => void;

export type ArkInternalApp = {
  accessKeyId: string;
  accessSecret: string;
  callbackUrls?: string[];
};

type AuthOptions = {
  jwtSecretKey?: jwt.Secret;
  jwtSignOptions?: jwt.SignOptions;
  jwtVerifyOptions?: jwt.VerifyOptions;
  jwtDecodeOptions?: jwt.DecodeOptions;
  deserializeUser?: (input: any) => any;
  blacklistToken?: (token: string, issuedAt: number) => Promise<boolean>;
  isTokenBlacklisted?: (token: string) => Promise<boolean>;
  enableExternalAuthServer?: boolean;
  enableExternalAuthClient?: boolean;
  externalAuthServerConf?: {
    initiateAuthUrl?: string;
    authPageUrl?: string;
    callbackHandlerUrl?: string;
  };
  externalAuthClientConf?: {
    initiateAuthUrl?: string;
    callbackUrl: string;
    serverEndpoint: string;
    accessKeyId: string;
    accessSecret: string;
    tokenCookieOpts?: CookieOptions;
    logoutUrl?: string;
  };
  getInternalAppByAccessKeyId?: (
    accessKeyId: string
  ) => Promise<ArkInternalApp>;
};

type AccessPointOptions = {
  middleware: Array<Handler>;
};

type RemoteConfigAccessType = 'private' | 'public';

export type RemoteConfig = {
  privateConfig: {
    [key: string]: any;
  };
  publicConfig: {
    [key: string]: any;
  };
  createdAt?: number;
  updatedAt?: number;
} & Document;

type RemoteConfigHook = {
  load: () => Promise<RemoteConfig>;
  sync: () => Promise<boolean>;
  get: <T>(
    access: RemoteConfigAccessType,
    key: string,
    defaultVal?: T
  ) => Promise<T>;
  put: <T>(access: RemoteConfigAccessType, key: string, val: T) => Promise<T>;
};

type DynamicsServerConfig = {
  fetchContentServiceId?: string;
  updateContentServiceId?: string;
  fetchContentRule?: RuleDefinition;
  updateContentRule?: RuleDefinition;
  dbName?: string;
};

declare global {
  // eslint-disable-next-line no-unused-vars
  namespace Express {
    // eslint-disable-next-line no-unused-vars
    interface Request {
      authToken: string;
      isAuthenticated: boolean;
      isInternalAppAuthenticated: boolean;
      authenticatedApp: any;
      user: ArkUser;
      policies: Array<string>;
      input: { [key: string]: any };
    }
  }
  // eslint-disable-next-line no-unused-vars
  namespace Ark {
    // eslint-disable-next-line no-unused-vars
    interface Security {}
    // eslint-disable-next-line no-unused-vars
    interface Backend {
      useServer: (opts?: ServerOpts, force?: boolean) => void;
      enableWebSocket: (
        opts?: IOServerOptions,
        redisConf?: RedisClientOptions<
          RedisModules,
          RedisFunctions,
          RedisScripts
        >
      ) => IOServer<any, any>;
      useWebSocket: () => IOServer<any, any>;
      useApp: () => expressApp.Application;
      useRoute: (
        method: HttpVerbs,
        path: string,
        handlers: expressApp.RequestHandler | Array<expressApp.RequestHandler>
      ) => void;
      useService: UseServicePointer;
      useWebApp: (
        appId: string,
        ctx?: ContextScope<any>,
        htmlFileName?: string
      ) => WebAppRenderer;
      enableDynamicsServer: (conf?: DynamicsServerConfig) => void;
      useRemoteConfig: (
        initialState?: Partial<RemoteConfig>,
        dbName?: string
      ) => RemoteConfigHook;
    }
    // eslint-disable-next-line no-unused-vars
    interface Data {
      useDatabase: (
        name: keyof Ark.PackageDatabases,
        connectionString: string,
        opts?: ConnectionOptions
      ) => void;
      useModel: <T>(
        name: string,
        schema?: SchemaDefinition<any> | (() => Schema),
        dbName?: keyof Ark.PackageDatabases,
        collectionName?: string
      ) => Model<T & Document>;
      useVolume: (ref?: string, vol?: IArkVolume) => IArkVolume;
      useVolumeAccessPoint: (
        refId: string,
        vol: IArkVolume,
        opts?: Partial<AccessPointOptions>
      ) => void;
    }
    // eslint-disable-next-line no-unused-vars
    interface Databases {}
    // eslint-disable-next-line no-unused-vars
    type PackageDatabases = {
      default: Connection;
    } & Databases;
  }
}

setDefaultEnv({
  APP_INFO_BASE_PATH: '',
});

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

/**
 * Checks if logging is disabled or not
 * @return {boolean}
 */
export function isLoggingDisabled(): boolean {
  try {
    if (process.env.DISABLE_APP_LOG) {
      return process.env.DISABLE_APP_LOG === 'true';
    }
  } catch (e) {
    /** Do nothing */
  }
  return false;
}

/* -------------------------------------------------------------------------- */
/*                              Ark Volume Begin                              */
/* -------------------------------------------------------------------------- */

type ArkVolumeOptions = {
  baseDir: string;
};

export interface IArkVolume {
  put: (path: string, data: NodeJS.ArrayBufferView) => Promise<any>;
  get: (path: string) => NodeJS.ArrayBufferView;
  rename: (oldPath: string, newPath: string) => Promise<any>;
  delete: (path: string) => Promise<any>;
  getDownloadHandler: () => Array<Handler>;
}

/**
 * Ensures that directory exists, if not create one
 * @param {string} p path
 */
export function ensureDir(p: string) {
  if (!fs.existsSync(p)) {
    fs.mkdirSync(p, { recursive: true });
  }
}

/**
 * Creates an abstract class for accessing file system
 */
export class FileVolume implements IArkVolume {
  static instance: IArkVolume;

  /**
   * Gets singleton instance of FileVolume
   * @param {ArkVolumeOptions} opts
   * @return {IArkVolume}
   */
  static getInstance(opts: ArkVolumeOptions): IArkVolume {
    if (!FileVolume.instance) {
      FileVolume.instance = new FileVolume(opts);
    }

    return FileVolume.instance;
  }

  private opts: ArkVolumeOptions;

  /**
   * Creates new instance of ArkVolume
   * @param {ArkVolumeOptions} opts
   */
  constructor(opts: ArkVolumeOptions) {
    this.opts = opts;
  }

  /**
   * Writes buffer to file
   * @param {string} p
   * @param {NodeJS.ArrayBufferView} data
   * @return {Promise<boolean>}
   */
  async put(p: string, data: NodeJS.ArrayBufferView): Promise<boolean> {
    const fullPath = path.join(this.opts.baseDir, p);
    ensureDir(path.dirname(fullPath));
    fs.writeFileSync(fullPath, data);
    return true;
  }

  /**
   * Read buffer to file
   * @param {string} p
   * @return {NodeJS.ArrayBufferView}
   */
  get(p: string): NodeJS.ArrayBufferView {
    return fs.readFileSync(path.join(this.opts.baseDir, p));
  }

  /**
   * Deletes file
   * @param {string} p
   * @return {Promise<boolean>}
   */
  async delete(p: string): Promise<boolean> {
    fs.unlinkSync(path.join(this.opts.baseDir, p));
    return true;
  }

  /**
   * Renames a file
   * @param {string} oldPath
   * @param {string} newPath
   * @return {Promise<boolean>}
   */
  async rename(oldPath: string, newPath: string): Promise<boolean> {
    fs.renameSync(oldPath, newPath);
    return true;
  }

  /**
   * Gets the download handler for file system volume
   * @return {Array<Handler>}
   */
  getDownloadHandler(): Array<Handler> {
    return [expressApp.static(this.opts.baseDir)];
  }
}

/**
 * Defines a new volume that can be mounted in Ark Backend
 * @param {IArkVolume} vol
 * @return {IArkVolume}
 */
export function defineVolume(vol: IArkVolume): IArkVolume {
  return vol;
}

/* -------------------------------------------------------------------------- */
/*                               Ark Volume End                               */
/* -------------------------------------------------------------------------- */

/**
 * Reads static HTML file from resource
 * @param {string} htmlFilePath e.g. index.html | admin.html
 * @return {string} HTML static content
 */
function readHtmlFile(htmlFilePath: string): string {
  if (fs.existsSync(htmlFilePath)) {
    return fs.readFileSync(htmlFilePath, 'utf8');
  } else {
    // Try loading from
    return fs.readFileSync(path.join(__dirname, '../', htmlFilePath), 'utf8');
  }
}

type ServiceReq = [string, (string | object)?, object?];

/**
 * Create request payload
 * @param {ServiceReq} item
 * @return {any}
 */
export function createReq(item: ServiceReq) {
  let serviceRefId: string = '';
  let localAliasId: string = undefined;
  let input: any = {};

  if (item.length < 1 || item.length > 3) {
    throw new Error('Request definition expects 1-3 items');
  }

  serviceRefId = item[0];
  if (typeof item[1] === 'string') {
    localAliasId = item[1];
    if (item[2]) {
      input = item[2];
    }
  } else {
    input = item[1];
  }

  return {
    serviceRefId,
    localAliasId,
    input,
  };
}

/**
 * Creates Web App Server-Side Render
 * @param {ContextScope<any>} scope
 * @param {string} htmlFileName
 * @param {string} moduleId
 * @param {ControllerContext<any>} controller
 * @param {ApplicationContext} context
 * @return {WebAppRenderer}
 */
function createWebAppRenderer(
  scope: ContextScope<any>,
  htmlFileName: string,
  moduleId: string,
  controller: ControllerContext<any>,
  context: ApplicationContext
): WebAppRenderer {
  return {
    render: (initialState, reqs_: Array<ServiceReq> = []) => {
      return async (req, res, next) => {
        const webAppContext = new ApplicationContext();
        let serviceState: any = {};

        try {
          const reqs: Array<ServiceReq> = [['default/___context'], ...reqs_];
          const parsedReqs = reqs.map(createReq);

          await parsedReqs.reduce((acc, item) => {
            return acc.then(() => {
              return new Promise((resolve, reject) => {
                const ref = extractRef(item.serviceRefId, moduleId);
                const registryItem = ServiceController.getInstance().find(
                  ref.refId,
                  'service',
                  ref.moduleName
                );
                if (!registryItem) {
                  return reject(
                    new Error(
                      `'${ref.refId}' cannot be retrived under module '${ref.moduleName}'. Please make sure you are using the right moduleId/resId combination.`
                    )
                  );
                }
                runService(
                  registryItem.def,
                  {
                    input: Object.assign(req.input, item.input),
                    isAuthenticated: req.isAuthenticated,
                    user: req.user,
                    policies: req.policies,
                    body: req.body,
                    params: req.params,
                    query: req.query,
                    req,
                    res,
                  },
                  {
                    moduleId,
                    context,
                    controllerContext: controller,
                    aliasMode: registryItem.alias,
                    policyExtractorRefs: registryItem.policyExtractorRefs,
                  }
                )
                  .then((val) => {
                    serviceState = {
                      ...serviceState,
                      ...reduxServiceStateSnapshot(
                        ref.refId,
                        registryItem.moduleId,
                        val
                      ),
                    };
                    resolve(true);
                  })
                  .catch((err) => {
                    reject(err);
                  });
              });
            });
          }, (() => Promise.resolve(true))());
        } catch (e) {
          return next(e);
        }

        let helmetContext: any = {};
        makeApp('ssr', scope, webAppContext, {
          url: req.url,
          initialState: Object.assign(
            {},
            initialState || {},
            serviceState || {}
          ),
          helmetContext,
        })
          .then((App) => {
            const store: any = webAppContext.getData('default', 'store');
            const htmlContent = readHtmlFile(htmlFileName);
            const htmlContentNode = HTMLParser.parse(htmlContent);

            const appStr = renderToString(App);

            let headContent: string[] = [];

            try {
              headContent = Object.keys(helmetContext.helmet).reduce(
                (acc, item) => {
                  let c: string = null;
                  try {
                    c = helmetContext.helmet[item].toString();
                  } catch (e) {
                    console.error(e);
                  }

                  if (Boolean(c)) {
                    acc.push(c);
                  }

                  return acc;
                },
                []
              );

              let i = 0;
              for (i = 0; i < headContent.length; i++) {
                htmlContentNode
                  .querySelector('head')
                  .appendChild(HTMLParser.parse(headContent[i]));
              }
            } catch (e) {
              console.error(e);
            }

            const scriptNode = HTMLParser.parse(
              `<script>const ___hydrated_redux___=${JSON.stringify(
                store.getState()
              )};</script>`
            );
            htmlContentNode.querySelector('head').appendChild(scriptNode);
            htmlContentNode.querySelector('#root').set_content(appStr);
            res.send(htmlContentNode.toString());
          })
          .catch(next);
      };
    },
  };
}

/**
 * Normalise model name
 * @param {string} moduleId Module ID
 * @param {string} modelName Model Name
 * @return {string}
 */
export function getModelName(moduleId: string, modelName: string): string {
  return `${moduleId}_${modelName}`;
}

export const Data = createPointer<Partial<Ark.Data>>(
  (moduleId, controller, context) => ({
    useVolumeAccessPoint: (refId, vol, opts) => {
      controller.ensureInitializing(
        'useRoute() should be called on context root'
      );
      const ref = extractRef(refId, moduleId);
      controller.run(() => {
        const options = Object.assign<
          AccessPointOptions,
          Partial<AccessPointOptions>
        >(
          {
            middleware: [],
          },
          opts
        );
        const accessPointPath = `/volumes/${ref.moduleName}/${ref.refId}`;
        const app = context.getData<expressApp.Application>(
          'default',
          'express'
        );
        app.use(accessPointPath, [
          ...options.middleware,
          ...((): Handler[] => {
            if (vol && vol.getDownloadHandler) {
              return vol.getDownloadHandler();
            }
            return [];
          })(),
          (req: Request, res: Response) => res.sendStatus(404),
        ]);
      });
    },
    useDatabase: (
      name: keyof Ark.PackageDatabases,
      connectionString: string,
      opts?: ConnectionOptions
    ) => {
      controller.ensureInitializing(
        'useDatabase() should be called on context root'
      );
      controller.run(
        () =>
          new Promise((resolve, reject) => {
            const dbId: string = `db/${name}`;
            const databaseConnectionExist = context.existData(moduleId, dbId);
            if (databaseConnectionExist) {
              reject(
                new Error(`Db connection with same id ${dbId} already exists`)
              );
              return;
            }

            if (!isLoggingDisabled()) {
              console.log(`Connecting to '${name}' database...`);
            }

            const connection = createConnection(
              connectionString,
              Object.assign<ConnectionOptions, ConnectionOptions>(
                {
                  useNewUrlParser: true,
                  useUnifiedTopology: true,
                  useCreateIndex: true,
                },
                opts
              )
            );

            // Define rollback actions
            context.pushRollbackAction(async () => {
              await connection.close();
            });

            context.setData(moduleId, dbId, connection);

            connection.on('open', () => {
              resolve(null);
              if (!isLoggingDisabled()) {
                console.log(`'${name}' database connected`);
                console.log('');
              }
            });

            connection.on('error', (err) => {
              console.error(err);
              reject(err);
            });
          })
      );
    },
    useModel: <T extends unknown>(
      refId: string,
      schema?: SchemaDefinition<any> | (() => Schema),
      dbName: keyof Ark.PackageDatabases = 'default',
      collectionName: string = undefined
    ) => {
      const modelName = getModelName(moduleId, refId);
      let registeredModel: Model<T & Document> = undefined;

      const mongooseConnection: Connection = context.getData(
        'default',
        `db/${dbName}`,
        null
      );

      if (!mongooseConnection) {
        throw new Error(
          "Looks like you're trying to useModel before the database is available, or have you actually configured the database connection?"
        );
      }

      if (schema) {
        if (typeof schema === 'function') {
          registeredModel = mongooseConnection.model<T & Document>(
            modelName,
            schema(),
            collectionName
          );
        } else {
          registeredModel = mongooseConnection.model<T & Document>(
            modelName,
            new Schema(schema),
            collectionName
          );
        }
      }

      return context.useDataFromContext(
        moduleId,
        refId,
        registeredModel,
        false,
        'model'
      );
    },
    useVolume: (refId, vol) => {
      let result: IArkVolume = null;

      try {
        result = context.useDataFromContext(
          moduleId,
          refId || '',
          vol,
          false,
          'volume'
        );
      } catch (e) {
        /** Do nothing */
      }

      if (!result) {
        return FileVolume.getInstance({
          baseDir: path.join(process.cwd(), 'user-uploads'),
        });
      }

      return result;
    },
  })
);

export const createAuthMiddleware = (authOpts: AuthOptions) => async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!authOpts) {
    return next();
  }

  let token: string = null;

  if (req.cookies.authorization) {
    token = String(req.cookies.authorization);
  }

  if (req.headers['authorization']) {
    token = req.headers['authorization'];
  }

  /** Try authenticate internal app */
  try {
    req.isInternalAppAuthenticated = false;
    req.authenticatedApp = null;

    let accessId: string = null;
    let accessSecret: string = null;
    if (req.headers['access_id']) {
      accessId = req.headers['access_id'] as string;
    }

    /** If access_id is not present in header, try to read from body */
    if (!accessId) {
      if (req?.body?.access_id) {
        accessId = req?.body?.access_id;
      }
    }

    if (req.headers['access_secret']) {
      accessSecret = req.headers['access_secret'] as string;
    }

    /** If access_secret is not present in header, try to read from body */
    if (!accessSecret) {
      if (req?.body?.access_secret) {
        accessSecret = req?.body?.access_secret;
      }
    }

    const canGetInternalAppByAccessKeyId = Boolean(
      authOpts.getInternalAppByAccessKeyId
    );

    if (canGetInternalAppByAccessKeyId === true) {
      const app = await authOpts.getInternalAppByAccessKeyId(accessId);
      if (app) {
        req.isInternalAppAuthenticated = accessSecret === app.accessSecret;
        if (req.isInternalAppAuthenticated === true) {
          req.authenticatedApp = app;
        }
      }
    }
  } catch (e) {
    console.error(e);
  }

  if (token) {
    try {
      token = decodeURI(token);
    } catch (e) {
      /** Do nothing */
    }

    if (token.startsWith('Bearer ')) {
      token = token.replace('Bearer ', '');
    }

    req.authToken = token;

    let isTokenBlacklisted: boolean = null;
    let identityPayload = null;
    try {
      if (authOpts.enableExternalAuthClient === true) {
        /** Strategy to deserialise and verify token through external auth server */
        const { user, verifiedTokenPayload } = await new Promise<any>(
          (resolve, reject) => {
            const simulatedUser = loadSimulatedUser();
            if (simulatedUser.hasUser === true) {
              return resolve({
                user: simulatedUser.user,
                verifiedTokenPayload: simulatedUser.user,
              });
            }

            const serverEndpoint_URL = new URL(
              authOpts.externalAuthClientConf.serverEndpoint
            );
            serverEndpoint_URL.pathname =
              '/___external/auth/server/deserialise-user';

            axios
              .post(
                serverEndpoint_URL.toString(),
                {
                  token,
                  access_id: authOpts.externalAuthClientConf.accessKeyId,
                  access_secret: authOpts.externalAuthClientConf.accessSecret,
                },
                {
                  headers: {
                    access_id: authOpts.externalAuthClientConf.accessKeyId,
                    access_secret: authOpts.externalAuthClientConf.accessSecret,
                  },
                }
              )
              .then((res) => {
                let user: any = null;
                let verifiedTokenPayload: any = null;
                if (res.data) {
                  if (res.data.user) {
                    user = res.data.user;
                    verifiedTokenPayload = res.data.verifiedTokenPayload;
                    isTokenBlacklisted = res.data.isTokenBlacklisted;
                  }
                }

                resolve({
                  user,
                  verifiedTokenPayload,
                });
              })
              .catch(reject);
          }
        );

        if (user) {
          req.user = user;
        }

        if (verifiedTokenPayload) {
          identityPayload = verifiedTokenPayload;
          if (!req.user) {
            req.user = verifiedTokenPayload;
          }
        }
      } else {
        identityPayload = jwt.verify(token, authOpts.jwtSecretKey);
        req.user = identityPayload as any;

        if (identityPayload) {
          /** Check if blacklisted */
          const canCheckIfTokenBlacklisted =
            typeof authOpts?.isTokenBlacklisted === 'function' &&
            isTokenBlacklisted === null;

          if (canCheckIfTokenBlacklisted === true) {
            isTokenBlacklisted = await authOpts.isTokenBlacklisted(token);
          }

          if (isTokenBlacklisted === true) {
            identityPayload = null;
            req.user = null;
          }
        }
      }
    } catch (e) {
      /** Do nothing */
      console.error(e);
    }

    req.isAuthenticated = identityPayload ? true : false;

    try {
      if (
        req.isAuthenticated === true &&
        req.user &&
        !authOpts.enableExternalAuthClient
      ) {
        if (typeof authOpts.deserializeUser === 'function') {
          const serializedUser = await Promise.resolve(
            authOpts.deserializeUser(req.user)
          );

          if (serializedUser) {
            req.user = serializedUser;
          }
        }
      }
    } catch (e) {}

    try {
      if (req.isAuthenticated === true) {
        if (Array.isArray(req.user.policies)) {
          req.policies = req.user.policies;
        }
      }
    } catch (e) {
      /** Do nothing */
    }
  }

  next();
};

export const createExternalAuthServerRoutes = (
  authOpts: AuthOptions,
  moduleId: string,
  context: ApplicationContext
) => {
  const useService = useServiceCreator(moduleId, context);
  const r = expressApp.Router();

  /** Initiate auth */
  r.get(
    authOpts.externalAuthServerConf.initiateAuthUrl,
    async (req, res, next) => {
      const { key, callback } = req.query as any;

      if (!key) {
        return res.status(401).send('Invalid access key');
      }

      if (!authOpts.getInternalAppByAccessKeyId) {
        return res.status(403).json({
          message: 'Cannot verify the external application [Internal]',
        });
      }

      let app;

      try {
        app = await authOpts.getInternalAppByAccessKeyId(key);
      } catch (e) {
        return res
          .status(403)
          .json({ message: 'Cannot verify the external application' });
      }

      if (!app) {
        return res
          .status(403)
          .json({ message: 'Cannot verify the external application' });
      }

      const callbackUrls: string[] = Array.isArray(app?.callbackUrls)
        ? app.callbackUrls
        : [];

      const isAValidCallback =
        callbackUrls.indexOf(decodeURIComponent(callback)) > -1;

      if (isAValidCallback === false) {
        return res.status(403).json({ message: 'Invalid callback URL' });
      }

      const originalUrl_Q = new URL(`http://test-proto${req.originalUrl}`);
      originalUrl_Q.searchParams.append('external_auth', 'true');

      const targetUrl_Q = new URL(
        `http://test-proto${authOpts.externalAuthServerConf.authPageUrl}`
      );

      const targetUrl_F = `${targetUrl_Q.pathname}?${originalUrl_Q.search}`.replace(
        '??',
        '?'
      );

      if (req.isAuthenticated === true) {
        res.redirect(
          authOpts.externalAuthServerConf.callbackHandlerUrl +
            '?' +
            `key=${req.query.key}&callback=${req.query.callback}&redirect=${req.query.redirect}`
        );
      } else {
        res.send(`
          <html>
            <head>
              <title>Please wait...</title>
              <script>
                window.location.replace("${targetUrl_F}");
              </script>
            </head>
          </html>
        `);
      }
    }
  );

  /** Handle callback */
  r.get(
    authOpts.externalAuthServerConf.callbackHandlerUrl,
    async (req, res, next) => {
      const { key, callback, redirect } = req.query as any;
      const callbackUrl = decodeURIComponent(callback);

      if (!key) {
        return res.status(401).send('Invalid access key');
      }

      if (!authOpts.getInternalAppByAccessKeyId) {
        return res.status(403).json({
          message: 'Cannot verify the external application [Internal]',
        });
      }

      let app;

      try {
        app = await authOpts.getInternalAppByAccessKeyId(key);
      } catch (e) {
        return res
          .status(403)
          .json({ message: 'Cannot verify the external application' });
      }

      if (!app) {
        return res
          .status(403)
          .json({ message: 'Cannot verify the external application' });
      }

      const callbackUrls: string[] = Array.isArray(app?.callbackUrls)
        ? app.callbackUrls
        : [];

      const callBackUrl_F = decodeURIComponent(callback);
      const isAValidCallback = callbackUrls.indexOf(callBackUrl_F) > -1;

      if (isAValidCallback === false) {
        return res.status(403).json({ message: 'Invalid callback URL' });
      }

      res.send(`
      <html>
        <head>
          <title>Please wait...</title>
        </head>
        <body>
          Please wait...
          <form id="auth-form" method="POST" action="${callBackUrl_F}">
            <input type="hidden" name="token" value="${req.authToken}" />
            <input type="hidden" name="redirect" value="${redirect}" />
          </form>
          <script>
            setTimeout(() => {
              document.getElementById("auth-form").submit();
            }, 300);
          </script>
        </body>
      </html>
    `);
    }
  );

  r.post(`/___external/auth/server/deserialise-user`, async (req, res) => {
    if (req.isInternalAppAuthenticated === true) {
      const { token } = req.body;

      let isTokenBlacklisted = false;
      const canCheckIfTokenBlacklisted =
        typeof authOpts?.isTokenBlacklisted === 'function';
      if (canCheckIfTokenBlacklisted === true) {
        isTokenBlacklisted = await authOpts.isTokenBlacklisted(token);
      }

      let verifiedTokenPayload: any = null;

      try {
        verifiedTokenPayload = jwt.verify(token, authOpts.jwtSecretKey);
      } catch (e) {
        console.error(e);
      }

      const canDeserializeUser = Boolean(authOpts.deserializeUser);
      let resolvedUser = null;
      if (isTokenBlacklisted === false) {
        if (canDeserializeUser === true && verifiedTokenPayload) {
          resolvedUser = await authOpts.deserializeUser(verifiedTokenPayload);
        }
      }

      res.json({
        user: resolvedUser,
        verifiedTokenPayload,
        isTokenBlacklisted,
      });
    } else {
      res.status(403).json({ message: 'Request forbidden' });
    }
  });

  useService(
    defineService('__ext__ark_logout', (opts) => {
      opts.defineLogic(async (props) => {
        if (props.args.req.isInternalAppAuthenticated === true) {
          const { token } = props.args.input;
          if (token) {
            await props.logout(undefined, token);
          }
        }

        return props.success({ ack: true });
      });
    }),
    {
      path: '/___external/auth/server/logout',
    }
  );

  return r;
};

export const createExternalAuthClientRoutes = (authOpts: AuthOptions) => {
  const r = expressApp.Router();
  const callbackPath = new URL(authOpts.externalAuthClientConf.callbackUrl)
    .pathname;

  r.get(authOpts.externalAuthClientConf.initiateAuthUrl, (req, res, next) => {
    const { redirect } = req.query as any;

    const simulatedUser = loadSimulatedUser();
    if (simulatedUser.hasUser === true) {
      res.send(`
      <html>
        <head>
          <title>Please wait...</title>
        </head>
        <body>
          Please wait...
          <form id="auth-form" method="POST" action="${callbackPath}">
            <input type="hidden" name="token" value="${simulatedUser.token}" />
            <input type="hidden" name="redirect" value="${redirect}" />
          </form>
          <script>
            setTimeout(() => {
              document.getElementById("auth-form").submit();
            }, 300);
          </script>
        </body>
      </html>
      `);
      return;
    }

    const url = new URL(authOpts.externalAuthClientConf.serverEndpoint);
    url.searchParams.delete('key');
    url.searchParams.delete('redirect');
    url.searchParams.delete('callback');

    if (authOpts.externalAuthClientConf.accessKeyId) {
      url.searchParams.append(
        'key',
        authOpts.externalAuthClientConf.accessKeyId
      );
    }

    if (redirect) {
      url.searchParams.append('redirect', redirect);
    }

    url.searchParams.append(
      'callback',
      encodeURIComponent(authOpts.externalAuthClientConf.callbackUrl)
    );

    let formattedServerEndpoint = url.toString();

    res.redirect(formattedServerEndpoint);
  });

  r.post(callbackPath, (req, res, next) => {
    let { token, redirect } = req.body;
    if (token) {
      res.cookie(
        'authorization',
        `Bearer ${token}`,
        authOpts?.externalAuthClientConf?.tokenCookieOpts
      );
    }

    if (!redirect) {
      redirect = '/';
    }

    res.send(`
      <html>
        <head>
          <title>Please wait...</title>
          <script>
            window.location.replace("${redirect}");
          </script>
        </head>
        <body>
          Please wait...
        </body>
      </html>
    `);
  });

  return r;
};

export const useServiceCreator: (
  moduleId: string,
  context: ApplicationContext
) => UseServicePointer = (moduleId: string, context: ApplicationContext) => (
  service: ServiceDefinitionMeta,
  _opts: Partial<ServiceConsumerOptions> = null
) => {
  const opts = Object.assign<
    ServiceConsumerOptions,
    Partial<ServiceConsumerOptions>
  >(
    {
      alias: 'service',
      path: resolveServiceUrl(service.name, moduleId),
      method: 'post',
      controller: ServiceController.getInstance(),
      skipServiceRegistration: false,
      skipBearerTokenCheck: false,
      policyExtractorRefs: [],
    },
    _opts
  );

  if (opts.skipServiceRegistration === false) {
    // Register
    opts.controller.register({
      def: service,
      path: opts.path,
      moduleId,
      alias: opts.alias,
      method: opts.method,
      policyExtractorRefs: opts.policyExtractorRefs,
    });
  }

  context.getData<expressApp.Application>('default', 'express')[opts.method](
    opts.path,
    ([
      async (req: Request, res: Response, next: NextFunction) => {
        let stat: RunnerStat;

        try {
          stat = await runService(
            service,
            {
              req: req,
              res: res,
              body: req.body,
              params: req.params,
              query: req.query,
              isAuthenticated: req.isAuthenticated,
              user: req.user,
              policies: req.policies,
              input: req.input,
            },
            {
              disablePre: false,
              disableRule: false,
              disableLogic: false,
              disableValidation: false,
              disableCapabilities: false,
              controller: opts.controller,
              aliasMode: opts.alias,
              context: context,
              policyExtractorRefs: opts.policyExtractorRefs,
              moduleId,
            }
          );
        } catch (e) {
          stat = e;
        }

        if (stat) {
          if (stat.isManagedResponse === true) {
            res.status(stat.responseCode).json(stat.response);
          }
        } else {
          // Pass thru if response is falsy
          next();
        }
      },
    ] as any[]).filter(Boolean)
  );
};

/* -------------------------------------------------------------------------- */
/*                                   Backend                                  */
/* -------------------------------------------------------------------------- */

/**
 *
 * @param {string} dbName
 * @param {ApplicationContext} context
 * @param {Partial<RemoteConfig>} initialState
 * @return {Promise<RemoteConfig>}
 */
async function getRemoteConfig(
  dbName: string,
  context: ApplicationContext,
  initialState?: Partial<RemoteConfig>
): Promise<RemoteConfig> {
  const remoteConfigModelName = getModelName('default', 'remote_config');

  const mongooseConnection: Connection = context.getData(
    'default',
    `db/${dbName}`,
    null
  );

  if (!mongooseConnection) {
    throw new Error(
      "Looks like you're trying to useModel before the database is available, or have you actually configured the database connection?"
    );
  }

  let RemoteConfigModel: Model<RemoteConfig, any> = null;

  try {
    RemoteConfigModel = mongooseConnection.model<RemoteConfig>(
      remoteConfigModelName
    );
  } catch (e) {
    /** Do nothing */
  }

  let config: any = null;

  if (!RemoteConfigModel) {
    RemoteConfigModel = mongooseConnection.model<RemoteConfig>(
      remoteConfigModelName,
      new Schema(
        {
          privateConfig: {
            type: Object,
            required: false,
            default: {},
          },
          publicConfig: {
            type: Object,
            required: false,
            default: {},
          },
        },
        {
          timestamps: {
            createdAt: 'createdAt',
            updatedAt: 'updatedAt',
          },
        }
      )
    );
  }

  config = await new Promise((resolve, reject) => {
    RemoteConfigModel.findOne({}, (err, config) => {
      if (err) {
        reject(err);
      } else {
        if (!config) {
          config = new RemoteConfigModel(Object.assign({}, initialState));
          config.save((err, config) => {
            if (err) {
              reject(err);
            } else {
              resolve(config);
            }
          });
        } else {
          resolve(config);
        }
      }
    });
  });

  if (!config) {
    throw new Error('Error initializing new remote config slot');
  }

  return config;
}

export const Backend = createPointer<Partial<Ark.Backend>>(
  (moduleId, controller, context) => ({
    init: () => {
      if (!context.existData('default', 'express')) {
        const instance = context.setData('default', 'express', expressApp());

        /** Security related response headers */
        instance.use((req, res, next) => {
          res.removeHeader('X-Powered-By');

          next();
        });

        if (isLoggingDisabled() === false) {
          instance.use(morgan('dev'));
        }

        instance.use(cookieParser());

        // parse application/json
        instance.use(
          bodyParser.json({
            limit: getRuntimeVars()['EXP_BODY_PARSER_JSON_LIMIT'],
          })
        );

        // parse application/x-www-form-urlencoded
        instance.use(
          bodyParser.urlencoded({
            extended: false,
            limit: getRuntimeVars()['EXP_BODY_PARSER_URLENC_LIMIT'],
          })
        );

        instance.use(
          '/_browser',
          expressApp.static(path.join(__dirname, '../_browser'))
        );
        instance.use(
          '/assets',
          expressApp.static(path.join(__dirname, '../assets'))
        );
        instance.use((req, res, next) => {
          req.user = null;
          req.isAuthenticated = false;
          req.policies = [];
          req.input = {
            ...req.body,
            ...req.params,
            ...req.query,
          };
          next();
        });
      }
    },
    useServer: (opts, force: boolean = false) => {
      if (force === false) {
        try {
          // Prevent this functionality when test run
          const RUNTIME_MODE = useEnv('RUNTIME_MODE');
          if (RUNTIME_MODE === 'TEST') {
            return;
          }
        } catch (e) {
          console.error(e);
        }
      }

      opts = opts
        ? opts
        : {
            port: 3000,
            securePort: 3443,
            hostname: undefined,
            backlog: undefined,
            listeningListener: undefined,
            enableHttps: false,
            secureOptions: undefined,
          };

      let httpServer: http.Server = context.getData('default', 'http');

      if (!httpServer) {
        httpServer = context.setData(
          'default',
          'http',
          http.createServer(
            context.getData<expressApp.Application>('default', 'express')
          )
        );
      }

      if (httpServer) {
        controller.run(() => {
          httpServer.on('listening', () => {
            console.log(`Listening on port: ${opts.port}`);
            console.log('');
          });
          httpServer.listen(
            opts.port,
            opts.hostname,
            opts.backlog,
            opts.listeningListener
          );
        });

        if (
          typeof opts.enableHttps === 'boolean' &&
          opts.enableHttps === true
        ) {
          const securePort = opts.securePort || 3443;
          const httpsServer = context.setData(
            'default',
            'https',
            https.createServer(
              opts.secureOptions,
              context.getData<expressApp.Application>('default', 'express')
            )
          );
          controller.run(() => {
            httpsServer.on('listening', () => {
              console.log(`(HTTPS) Listening on port: ${securePort}`);
              console.log('');
            });
            httpsServer.listen(
              securePort,
              undefined,
              undefined,
              opts.listeningListener
            );
          });

          context.pushRollbackAction(() => {
            httpsServer.removeAllListeners();
            httpsServer.close();
          });
        }

        context.pushRollbackAction(async () => {
          if (context.existData('default', 'io')) {
            const io: IOServer = context.getData('default', 'io');
            io.disconnectSockets(true);
            io.close();
            console.log('Closed IO');
          }

          httpServer.removeAllListeners();
          httpServer.close();
        });
      }
    },
    useWebSocket: () => {
      if (!context.existData('default', 'io')) {
        throw new Error(
          `WebSockets are not available in this application. Ensure you have called enableWebSocket fn in the app.`
        );
      }

      return context.getData('default', 'io') as IOServer;
    },
    enableWebSocket: (opts, redisConf) => {
      if (context.existData('default', 'http')) {
        throw new Error(`Call enableWebSocket() before calling useServer() fn`);
      }

      if (context.existData('default', 'io')) {
        throw new Error(`Websockets already initialised in this module`);
      }

      const httpServer: http.Server = context.setData(
        'default',
        'http',
        http.createServer(
          context.getData<expressApp.Application>('default', 'express')
        )
      );

      const io: IOServer = context.setData(
        'default',
        'io',
        new IOServer(httpServer, opts)
      );

      io.on('connection', (socket) => {
        console.log(`1 Client ('${socket.id}') connected to socket server`);

        socket.on('ark/rooms/join', (joinInfo) => {
          console.log(
            `Client '${socket.id}' joining room(s) ${joinInfo.roomIds.join(
              ', '
            )}`
          );
          socket.join(joinInfo.roomIds);
        });

        socket.on('ark/rooms/leave', (joinInfo) => {
          console.log(
            `Leaving '${socket.id}' room(s) ${joinInfo.roomIds.join(', ')}`
          );
          socket.leave(joinInfo.roomIds);
        });
      });

      const hasRedisEndpoint = Boolean(redisConf);
      if (hasRedisEndpoint === true) {
        console.log(`Redis endpoint detected for websockets`);

        const pubClient = createClient(redisConf);
        const subClient = pubClient.duplicate();

        controller.run(async () => {
          await pubClient.connect();
          await subClient.connect();
          console.log('Connected to redis (for socket)');

          io.adapter(createAdapter(pubClient, subClient));
        });
      }

      return io;
    },
    useApp: () => context.getData('default', 'express'),
    useRoute: (method, path, handlers) => {
      controller.ensureInitializing(
        'useRoute() should be called on context root'
      );
      controller.run(() => {
        context
          .getData<expressApp.Application>('default', 'express')
          [method](path, handlers);
      });
    },
    useService: useServiceCreator(moduleId, context),
    useWebApp: (appId, ctx, htmlFileName) => {
      if (!htmlFileName) {
        htmlFileName = `${appId}.html`;
      }

      if (!htmlFileName.toLowerCase().endsWith('.html')) {
        htmlFileName = `${htmlFileName}.html`;
      }

      let hasContextInitialized: boolean = context.getData<boolean>(
        'default',
        'hasContextApiCreated',
        false
      );

      if (!hasContextInitialized) {
        const useService = useServiceCreator(moduleId, context);
        hasContextInitialized = context.setData<boolean>(
          'default',
          'hasContextApiCreated',
          true
        );
        useService(
          defineService('___context', (opts) => {
            opts.defineLogic((opts) => {
              return opts.success({
                isAuthenticated: opts.args.isAuthenticated,
                currentUser: opts.args.user,
                systemInfo: {
                  version: useEnv('APP_INFO_VERSION'),
                  buildNumber: useEnv('APP_INFO_BUILD_NUMBER'),
                  basePath: useEnv('APP_INFO_BASE_PATH'),
                },
                passThroughVariables: Object.assign(
                  {},
                  getPassThroughPayload(),
                  (opts?.args?.req as any)?.passThroughVariables || {}
                ),
              });
            });
          })
        );
      }

      // const jsPath = `${path.basename(htmlFileName)}.js`;

      return context.useDataFromContext(
        moduleId,
        appId,
        ctx
          ? createWebAppRenderer(
              ctx,
              htmlFileName,
              moduleId,
              controller,
              context
            )
          : undefined,
        false,
        'pwa'
      );
    },
    enableDynamicsServer: (conf?) => {
      if (!conf) {
        conf = {};
      }

      if (!conf.fetchContentServiceId) {
        conf.fetchContentServiceId = 'dynamics___fetch-content';
      }

      if (!conf.updateContentServiceId) {
        conf.updateContentServiceId = 'dynamics___update-content';
      }

      if (!conf.fetchContentRule) {
        conf.fetchContentRule = (options) => options.allow();
      }

      if (!conf.updateContentRule) {
        conf.updateContentRule = (options) => options.allow();
      }

      if (!conf.dbName) {
        conf.dbName = 'default';
      }

      const hasInitialized: boolean = context.getData<boolean>(
        moduleId,
        'dynamics://hasInitialized',
        false
      );

      if (!hasInitialized) {
        context.setData<boolean>(moduleId, 'dynamics://hasInitialized', true);

        const useService = useServiceCreator(moduleId, context);

        /**
         * Import db connection
         */
        const mongooseConnection: Connection = context.getData(
          'default',
          `db/${conf.dbName}`,
          null
        );

        if (!mongooseConnection) {
          throw new Error(
            "Looks like you're trying to enableDynamicsServer before the database is available, or have you actually configured the database connection?"
          );
        }

        const DynamicsContentModel = mongooseConnection.model<Document>(
          '__dynamics_content',
          new Schema({
            domain: {
              type: String,
              required: true,
            },
            contentKey: {
              type: String,
              required: true,
            },
            sections: {
              type: [Object],
              required: true,
              default: [],
            },
          })
        );

        useService(
          defineService(conf.fetchContentServiceId, (opts) => {
            opts.defineValidator(
              Joi.object({
                domain: Joi.string().required(),
                keys: Joi.array().min(0),
              })
            );

            opts.defineRule(conf.fetchContentRule);

            opts.defineLogic(async (opts) => {
              const { domain, keys } = opts.args.input;
              const q: any = { domain };

              if (keys.length > 0) {
                q.contentKey = {
                  $in: keys,
                };
              }

              const items = await DynamicsContentModel.find(q).exec();
              return opts.success({}, [...items.map((i) => i.toObject())]);
            });
          })
        );

        useService(
          defineService(conf.updateContentServiceId, (opts) => {
            opts.defineValidator(
              Joi.object({
                domain: Joi.string().required(),
                contentKey: Joi.string().required(),
                sections: Joi.array().required().min(0),
              })
            );

            opts.defineRule(conf.updateContentRule);

            opts.defineLogic(async (opts) => {
              const { domain, contentKey, sections } = opts.args.input;

              const op = await DynamicsContentModel.updateOne(
                {
                  domain,
                  contentKey,
                },
                {
                  $set: {
                    sections,
                  },
                },
                { upsert: true }
              ).exec();

              return opts.success({ status: 'success' }, []);
            });
          })
        );
      }
    },
    useRemoteConfig: (initialState, dbName) => {
      dbName = dbName ? dbName : 'default';

      return {
        load: async () => await getRemoteConfig(dbName, context, initialState),
        sync: async () => {
          const config = await getRemoteConfig(dbName, context, initialState);
          if (config) {
            return true;
          }

          return false;
        },
        get: async (access, key, defaultVal) => {
          const config = await getRemoteConfig(dbName, context, initialState);

          const accessor = `${access}Config`;

          let result: any = undefined;

          try {
            // @ts-ignore
            result = config[accessor][key];
          } catch (e) {
            /** Do nothing */
          }

          if (result === undefined) {
            result = defaultVal;
          }

          return result;
        },
        put: async (access, key, val) => {
          const config = await getRemoteConfig(dbName, context, initialState);
          const accessor = `${access}Config`;

          // @ts-ignore
          if (!config[accessor]) {
            // @ts-ignore
            config[accessor] = {};
          }

          // @ts-ignore
          config[accessor] = Object.assign({}, config[accessor], {
            [key]: val,
          });

          await new Promise((resolve, reject) =>
            config.save((err, config) => {
              if (err) {
                reject(err);
              } else {
                resolve(config);
              }
            })
          );

          return val;
        },
      };
    },
  })
);

// ------------------ SERVICE BEGIN ------------------

type ControllerRegistryItem = {
  def: ServiceDefinitionMeta;
  moduleId?: string;
  alias: 'service' | 'rest';
  method: HttpVerbs;
  path: string;
  policyExtractorRefs: string[];
};

/**
 * Provides service discovery
 */
export class ServiceController {
  static instance: ServiceController;
  /**
   * Creates a singleton instance of the class
   * @return {ServiceController}
   */
  static getInstance(): ServiceController {
    if (!ServiceController.instance) {
      ServiceController.instance = new ServiceController();
    }
    return ServiceController.instance;
  }

  private regisry: Array<ControllerRegistryItem> = [];

  /**
   * Registers a new service
   * @param {ControllerRegistryItem} item
   */
  register(item: ControllerRegistryItem) {
    this.regisry.push(Object.assign({ moduleId: 'default' }, item));
  }

  /**
   * Finds service def by key
   * @param {string} key
   * @param {string} alias
   * @param {string} moduleId
   * @return {ControllerRegistryItem}
   */
  find(
    key: string,
    alias: ServiceAlias,
    moduleId: string = 'default'
  ): ControllerRegistryItem {
    const ref = extractRef(key, moduleId);
    return this.regisry.find(
      (r) =>
        r.alias === alias &&
        r.def.name === ref.refId &&
        r.moduleId === ref.moduleName
    );
  }
}

export type ArkUser = {
  _id: string;
  name: string;
  emailAddress: string;
  policies?: string[];
};

export type ServiceInput = {
  isAuthenticated: boolean;
  policies: Array<string>;
  user: ArkUser;
  params: any;
  query: any;
  input: any;
  body: any;
  req: Request;
  res: Response;
};

export type RuleDefinitionOptions = {
  args: ServiceInput;
  allowPolicy: (policyName: string) => boolean;
  denyPolicy: (policyName: string) => boolean;
  allow: () => void;
  deny: (msg?: string) => void;
};

export type RuleDefinition = (options: RuleDefinitionOptions) => any;

export type LogicDefinitionOptions = {
  args: ServiceInput;
  table: (
    query: DocumentQuery<any, Document>
  ) => Promise<ServiceResponse<any, any>>;
  success: (meta: any, data?: any | Array<any>) => ServiceResponse<any, any>;
  error: (err: Error | any, httpCode?: number) => ServiceResponse<any, any>;
  login: (token: string, opts?: CookieOptions) => void;
  logout: (opts?: any, token?: any) => Promise<void>;
  security: SecurityPointers;
};

export type LogicDefinition = (
  options: LogicDefinitionOptions
) => ServiceResponse<any, any> | Promise<ServiceResponse<any, any>> | void;

export type CapabilityMeta = {
  serviceName: string;
  rel: string;
  opts?: HypermediaLinkCreationOption;
};

export type HypermediaLink = {
  href: string;
  rel: string;
  method: HttpVerbs;
  input?: any;
};

export type HypermediaLinkCreationOption = {
  path?: string;
  method?: HttpVerbs;
  input?: {
    [key: string]: any;
  };
};

export type CapabilitiesDefinitionOptions = {
  result: ServiceResponse<any, any>;
  args: ServiceInput;
  attachLinks: (
    item: object | Array<object>,
    metaCreator: CapabilityMeta[] | ((item: object) => CapabilityMeta[])
  ) => void;
  createLink: (
    rel: string,
    serviceId: string,
    opts?: HypermediaLinkCreationOption
  ) => CapabilityMeta;
};

export type CapabilitiesDefinition = (
  options: CapabilitiesDefinitionOptions
) => void;

export type ServiceDefinitionOptions = {
  defineValidator: (schema: Joi.Schema) => void;
  definePre: (key: string, callback: (args: ServiceInput) => any) => void;
  defineRule: (def: RuleDefinition) => void;
  defineLogic: (def: LogicDefinition) => void;
  defineCapabilities: (def: CapabilitiesDefinition) => void;
  attachMiddleware: (handlers: RequestHandler | RequestHandler[]) => void;
  use: <T extends (...args: any) => any>(creators: T) => ReturnType<T>;
};

export type ServiceDefinition = (options: ServiceDefinitionOptions) => void;
export type ServiceDefinitionMeta = {
  def: ServiceDefinition;
  name: string;
};

/**
 * Defines new business service
 * @param {string} name
 * @param {ServiceDefinition} def
 * @return {ServiceDefinition}
 */
export function defineService(
  name: string,
  def: ServiceDefinition
): ServiceDefinitionMeta {
  return {
    name,
    def,
  };
}

export type ServiceRunnerOptions = {
  disableValidation: boolean;
  disablePolicyExtraction: boolean;
  disablePre: boolean;
  disableRule: boolean;
  disableLogic: boolean;
  disableCapabilities: boolean;
  disableResponseFromatter: boolean;
  disableMiddleware: boolean;
  controller: ServiceController;
  controllerContext: ControllerContext<any>;
  aliasMode: ServiceAlias;
  context: ApplicationContext;
  policyExtractors: Array<PolicyExtractor>;
  policyExtractorRefs: Array<string>;
  moduleId: string;
};

type RunnerContext = {
  middlewareRunner: () => any | Promise<any>;
  validationRunner: () => any | Promise<any>;
  preRunner: () => any | Promise<any>;
  policyExtractionAggregator: () => any | Promise<any>;
  ruleRunner: () => any | Promise<any>;
  logicRunner: () => any | Promise<any>;
  capRunner: () => any | Promise<any>;
  responseFromatter: () => void;
};

type RunnerStat = {
  isManagedResponse: boolean;
  result: ServiceResponse<any, any>;
  allowed: boolean;
  denied: boolean;
  denials: string[];
  isValid: boolean;
  validationErrors: Array<{ key: string; message: string }>;
  args: ServiceInput;
  response: any;
  responseCode: number;
};

/**
 * Checks required policy with received policy and returns
 * true if matches, otherwise false
 * @param {string} policyName
 * @param {Array<string>} policies
 * @return {boolean}
 */
export function shouldAllow(
  policyName: string,
  policies: Array<string>
): boolean {
  if (Array.isArray(policies)) {
    if (policies.length > 0) {
      return policies.indexOf(policyName) > -1;
    }
  }

  return false;
}

/**
 * Checks required policy with received policy and returns
 * false if matches, otherwise true
 * @param {string} policyName
 * @param {Array<string>} policies
 * @return {boolean}
 */
export function shouldDeny(
  policyName: string,
  policies: Array<string>
): boolean {
  if (Array.isArray(policies)) {
    if (policies.length > 0) {
      return policies.indexOf(policyName) > -1;
    }
  }

  return false;
}

/**
 * Resolves and attaches link to object
 * @param {object} item
 * @param {CapabilityMeta[]|function} metaCreator
 * @param {ServiceInput} args
 * @param {ServiceRunnerOptions} opts
 * @return {Promise<boolean>}
 */
export async function resolveLink(
  item: object,
  metaCreator: CapabilityMeta[] | ((item: object) => CapabilityMeta[]),
  args: ServiceInput,
  opts: ServiceRunnerOptions
): Promise<boolean> {
  const generatedLinks: Array<HypermediaLink> = [];
  let linkMetas: CapabilityMeta[] = [];
  if (typeof metaCreator === 'function') {
    linkMetas = metaCreator(item);
  } else if (Array.isArray(metaCreator)) {
    linkMetas = metaCreator;
  }
  let i = 0;
  for (i = 0; i < linkMetas.length; i++) {
    const targetDef = opts.controller.find(
      linkMetas[i].serviceName,
      opts.aliasMode,
      opts.moduleId
    );

    let vInput: any = {};
    try {
      vInput = linkMetas[i].opts.input;
    } catch (e) {
      // Do nothing
    }

    const output = await runService(
      targetDef.def,
      {
        input: vInput,
        isAuthenticated: args.isAuthenticated,
        policies: args.policies,
        user: args.user,
      },
      Object.assign<ServiceRunnerOptions, Partial<ServiceRunnerOptions>>(opts, {
        disableLogic: true,
        disableCapabilities: true,
      })
    );
    if (output.allowed === true) {
      const item: HypermediaLink = {
        rel: linkMetas[i].rel,
        href: targetDef.path,
        method: targetDef.method,
      };

      // Override
      if (linkMetas[i].opts) {
        // Override path
        if (linkMetas[i].opts.path && linkMetas[i].opts.path !== '') {
          item.href = linkMetas[i].opts.path;
        }
        // custom method
        if (linkMetas[i].opts.method) {
          item.method = linkMetas[i].opts.method;
        }
      }

      try {
        if (linkMetas[i].opts && linkMetas[i].opts.input) {
          item.href = pathToRegexp.compile(targetDef.path, {
            encode: encodeURIComponent,
          })(linkMetas[i].opts.input);
        }
      } catch (e) {
        // Do nothing
      }

      if (opts.aliasMode === 'service') {
        try {
          item.input = linkMetas[i].opts.input;
        } catch (e) {
          // Do nothing
        }
      }
      generatedLinks.push(item);
    }
  }

  // Attach the links
  (item as any).links = generatedLinks;

  return true;
}

const getServiceErrorCode = (code: number, stat?: RunnerStat) => {
  let _code = code;
  try {
    if (stat) {
      _code =
        typeof stat.result.errCode === 'number' ? stat.result.errCode : _code;
    }
  } catch (e) {
    /** Do nothing */
  }
  return _code;
};

const getServiceErrorMessage = (message: string, stat?: RunnerStat) => {
  let _message = message;
  try {
    if (stat) {
      if (typeof stat.result.err === 'object') {
        if (typeof stat.result.err.message === 'string') {
          _message = stat.result.err.message;
        }
      } else if (typeof stat.result.err === 'string') {
        _message = stat.result.err;
      }
    }
  } catch (e) {
    /** Do nothing */
  }
  return _message;
};

/**
 * Converts document query to service response
 * @param {DocumentQuery<any, Document, {}>} docQuery
 * @param {Request} req
 * @return {Promise<ServiceResponse<any, any>>}
 */
export async function documentQueryToServiceResponse(
  docQuery: DocumentQuery<any, Document, {}>,
  req: Request
): Promise<ServiceResponse<any, any>> {
  const response: ServiceResponse<any, any> = {
    type: 'success',
    meta: {
      totalCount: 0,
    },
    data: [],
  };

  let query: any = undefined;
  let sort: any = undefined;
  let select: any = undefined;
  let skip: number = undefined;
  let limit: number = 30;

  const input = req.input;

  try {
    let tableFilter: any = undefined;

    if (input.filter) {
      tableFilter = JSON.parse(input.filter as any);
    }

    if (tableFilter) {
      let hasActiveFilter: boolean = false;

      query = Object.keys(tableFilter).reduce(
        (acc, item) => {
          if (tableFilter[item]) {
            hasActiveFilter = true;

            acc['$and'].push({
              [item]: {
                $in: tableFilter[item].map(
                  (keyword: string) => new RegExp(keyword, 'i')
                ),
              },
            });
          }

          return acc;
        },
        {
          $and: [],
        } as any
      );

      if (hasActiveFilter === false) {
        query = undefined;
      }
    }
  } catch (e) {
    /** Do nothing */
  }

  try {
    if (input.query) {
      query = JSON.parse(input.query as any);
    }
  } catch (e) {
    /** Do nothing */
  }

  try {
    if (input.sort) {
      sort = JSON.parse(input.sort as any);
    }
  } catch (e) {
    /** Do nothing */
  }

  try {
    if (input.select) {
      select = JSON.parse(input.select as any);
    }
  } catch (e) {
    /** Do nothing */
  }

  try {
    if (input.skip) {
      skip = parseInt(input.skip as any);
    }
  } catch (e) {
    /** Do nothing */
  }

  try {
    if (input.limit) {
      limit = parseInt(input.limit as any);
    }
  } catch (e) {
    /** Do nothing */
  }

  const q = docQuery.find(query);
  response.meta.totalCount = await q.countDocuments().exec();
  response.data = await q
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .select(select)
    .find()
    .exec();

  return response;
}

/**
 * Run business service
 * @param {ServiceDefinitionMeta} service
 * @param {ServiceInput} args_
 * @param {ServiceRunnerOptions} opts_
 * @return {Promise<Result>}
 */
export function runService(
  service: ServiceDefinitionMeta,
  args_?: Partial<ServiceInput>,
  opts_?: Partial<ServiceRunnerOptions>
): Promise<RunnerStat> {
  const args = Object.assign<ServiceInput, Partial<ServiceInput>>(
    {
      isAuthenticated: false,
      policies: [],
      params: {},
      user: null,
      query: {},
      input: {},
      body: {},
      req: null,
      res: null,
    },
    args_ || {}
  );

  const opts = Object.assign<
    ServiceRunnerOptions,
    Partial<ServiceRunnerOptions>
  >(
    {
      disableValidation: false,
      disablePolicyExtraction: false,
      disablePre: false,
      disableRule: false,
      disableLogic: false,
      disableCapabilities: false,
      disableResponseFromatter: false,
      disableMiddleware: false,
      controller: ServiceController.getInstance(),
      controllerContext: new ControllerContext(
        ApplicationContext.getInstance()
      ),
      aliasMode: 'rest',
      context: ApplicationContext.getInstance(),
      policyExtractors: [],
      policyExtractorRefs: [],
      moduleId: 'default',
    },
    opts_ || {}
  );

  opts.policyExtractors = opts.policyExtractorRefs.reduce<PolicyExtractor[]>(
    (acc, item) => {
      acc.push(
        opts.context.take<PolicyExtractor>(
          opts.moduleId,
          item,
          'policy_extractor'
        )
      );
      return acc;
    },
    []
  );

  return new Promise<RunnerStat>((resolve, reject) => {
    const ctx: RunnerContext = {
      middlewareRunner: null,
      validationRunner: null,
      policyExtractionAggregator: async () => {
        let extractedPolicies: string[] = [];
        let i: number = 0;
        for (i = 0; i < opts.policyExtractors.length; i++) {
          extractedPolicies = await Promise.resolve(
            opts.policyExtractors[i](args)
          );
          if (
            Array.isArray(extractedPolicies) &&
            extractedPolicies.length > 0
          ) {
            args.policies.push(...extractedPolicies);
          }
        }
      },
      preRunner: null,
      ruleRunner: null,
      logicRunner: null,
      capRunner: null,
      responseFromatter: () => {
        if (stat) {
          if (stat.isValid === true) {
            if (stat.allowed === true) {
              if (stat.result && stat.result.type === 'success') {
                stat.responseCode = getServiceErrorCode(200, stat);
                stat.response = stat.result;
              } else {
                // Error
                let message: string = 'Unknown error';
                try {
                  if (stat.result.err.message) {
                    message = stat.result.err.message;
                  }
                } catch (e) {
                  /** Do nothing */
                }
                stat.responseCode = getServiceErrorCode(500, stat);
                stat.response = {
                  message: getServiceErrorMessage(message, stat),
                };
              }
            } else {
              // Not allowed
              if (stat.args.isAuthenticated === true) {
                // Forbidden
                stat.responseCode = getServiceErrorCode(403, stat);
                stat.response = {
                  message: getServiceErrorMessage('Access forbidden', stat),
                };
              } else {
                // Unauthorized
                stat.responseCode = getServiceErrorCode(401, stat);
                stat.response = {
                  message: getServiceErrorMessage(
                    'Your request is unauthorized',
                    stat
                  ),
                };
              }
            }
          } else {
            // Invalid
            let message: string = 'Your request is not valid';
            try {
              message = stat.validationErrors[0].message;
            } catch (e) {
              /** Do nothing */
            }
            stat.responseCode = getServiceErrorCode(400, stat);
            stat.response = {
              message: getServiceErrorMessage(message),
              validationErrors: stat.validationErrors,
            };
          }
        } else {
          // Pass thru if response is falsy
        }
      },
    };

    const stat: RunnerStat = {
      isManagedResponse: true,
      result: null,
      allowed: true,
      denied: false,
      denials: [],
      isValid: true,
      validationErrors: [],
      args: args as any,
      response: null,
      responseCode: 200,
    };

    const allow = () => (stat.allowed = true);
    const deny = (msg?: string) => {
      stat.denied = true;
      if (msg) {
        stat.denials.push(msg);
      }
    };

    const isRuleSatisfied = () =>
      stat.allowed === true && stat.denied === false;

    const _init = () =>
      Promise.resolve(
        service.def({
          use: <T extends (...args: any) => any>(
            creators: T
          ): ReturnType<T> => {
            if (!opts.controllerContext || !opts.context) {
              throw new Error(
                'You must provide ApplicationContext and ControllerContext while starting the application'
              );
            }
            return opts.context.generatePointer(
              opts.moduleId,
              opts.controllerContext,
              opts.context,
              creators
            );
          },
          attachMiddleware: (handlers) =>
            (ctx.middlewareRunner = () => {
              const _handlers: RequestHandler[] = Array.isArray(handlers)
                ? handlers
                : [handlers];
              return _handlers.reduce((acc, handler) => {
                return acc.then(
                  () =>
                    new Promise((resolve, reject) => {
                      handler(args.req, args.res, (err: any) => {
                        if (err) {
                          reject(err);
                        } else {
                          resolve(true);
                        }
                      });
                    })
                );
              }, Promise.resolve(true));
            }),
          defineValidator: (schema) =>
            (ctx.validationRunner = () => {
              stat.isValid = false;
              try {
                Joi.assert(args.input, schema, {
                  abortEarly: false,
                });
                stat.isValid = true;
              } catch (e) {
                try {
                  stat.validationErrors = e.details.map((d: any) => ({
                    key: d.path[0],
                    message: d.message,
                  }));
                } catch (e) {
                  // Do nothing
                }
              }
            }),
          definePre: (key: string, callback: (args: ServiceInput) => any) =>
            (ctx.preRunner = async () => {
              if (!args.input) {
                args.input = {};
              }

              if (!args.input[key]) {
                try {
                  args.input[key] = await Promise.resolve(
                    callback(args as any)
                  );
                } catch (e) {
                  throw e;
                }
              }
            }),
          defineRule: (def) =>
            (ctx.ruleRunner = () => {
              stat.allowed = false;
              if (stat.isValid === true) {
                return def({
                  args: args as ServiceInput,
                  allowPolicy: (policyName: string) => {
                    if (shouldAllow(policyName, args.policies)) {
                      allow();
                      return true;
                    } else {
                      // deny(`Missing required policy to execute this action. Required policy: '${policyName}'`);
                    }
                    return false;
                  },
                  denyPolicy: (policyName: string) => {
                    if (shouldDeny(policyName, args.policies)) {
                      deny(
                        `This action is forbidden due to policy '${policyName}'`
                      );
                      return true;
                    }
                    return false;
                  },
                  allow,
                  deny,
                });
              } else {
                return Promise.resolve(false);
              }
            }),
          defineLogic: (def) =>
            (ctx.logicRunner = () => {
              if (stat.isValid === false) {
                stat.result = {
                  type: 'error',
                  err: 'Validation error',
                  errCode: 400,
                };
                return Promise.resolve(stat.result);
              }

              if (isRuleSatisfied() === true) {
                return Promise.resolve(
                  def({
                    args: args as any,
                    table: (q) => documentQueryToServiceResponse(q, args.req),
                    success: (meta, data) => ({
                      type: 'success',
                      meta,
                      data,
                    }),
                    error: (err, errCode = 500) => ({
                      type: 'error',
                      errCode,
                      err,
                    }),
                    // eslint-disable-next-line new-cap
                    security: Security('default', null, opts.context),
                    login: (token: string, opts?: CookieOptions) => {
                      if (!args.res) {
                        throw new Error(
                          'login() needs res needs to be passed inside arguments'
                        );
                      }

                      if (!opts) {
                        opts = {};
                      }

                      if (opts.sameSite === undefined) {
                        opts.sameSite = 'lax';
                      }

                      if (opts.httpOnly === undefined) {
                        opts.httpOnly = true;
                      }

                      args.res.cookie('authorization', `Bearer ${token}`, opts);
                    },
                    logout: async (logoutOpts?: any, _token?) => {
                      let token = String(args.req.authToken);

                      if (_token) {
                        /** Override parameter */
                        token = _token;
                      }

                      if (token) {
                        const authOpts = opts.context.getData<AuthOptions>(
                          'default',
                          'authOpts'
                        );
                        if (authOpts?.enableExternalAuthClient === true) {
                          if (authOpts.externalAuthClientConf.logoutUrl) {
                            const serverEndpoint_URL = new URL(
                              authOpts.externalAuthClientConf.serverEndpoint
                            );
                            serverEndpoint_URL.pathname =
                              '/___external/auth/server/logout';

                            await axios.post(
                              serverEndpoint_URL.toString(),
                              {
                                token,
                                access_id:
                                  authOpts.externalAuthClientConf.accessKeyId,
                                access_secret:
                                  authOpts.externalAuthClientConf.accessSecret,
                              },
                              {
                                headers: {
                                  access_id:
                                    authOpts.externalAuthClientConf.accessKeyId,
                                  access_secret:
                                    authOpts.externalAuthClientConf
                                      .accessSecret,
                                },
                              }
                            );
                          }
                        } else {
                          const canBlacklistToken = Boolean(
                            authOpts?.blacklistToken
                          );

                          if (canBlacklistToken === true) {
                            let iat = new Date().getTime();

                            try {
                              const decodedToken = jwt.decode(token);
                              // @ts-ignore
                              if (typeof decodedToken?.iat === 'number') {
                                // @ts-ignore
                                iat = decodedToken?.iat;
                              }
                            } catch (e) {}
                            await authOpts.blacklistToken(token, iat);
                          }
                        }
                      }

                      args.res.clearCookie('authorization', logoutOpts);
                    },
                  })
                ).then((response) => {
                  if (!response) {
                    stat.isManagedResponse = false;
                    stat.response = undefined;
                  } else {
                    stat.result = response;
                  }
                  return stat.result;
                });
              } else {
                if (args.isAuthenticated === true) {
                  stat.result = {
                    type: 'error',
                    err: 'Access forbidden',
                    errCode: 403,
                  };
                } else {
                  stat.result = {
                    type: 'error',
                    err: 'Permission denied',
                    errCode: 401,
                  };
                }
                return Promise.resolve(stat.result);
              }
            }),
          defineCapabilities: (def) =>
            (ctx.capRunner = async () => {
              if (stat.result) {
                if (stat.result.type !== 'success') {
                  return false;
                }
              }

              const attachmentRegistry: Array<{
                item: object | Array<object>;
                metaCreator:
                  | CapabilityMeta[]
                  | ((item: object) => CapabilityMeta[]);
              }> = [];

              await Promise.resolve(
                def({
                  args: args as any,
                  result: stat.result,
                  createLink: (rel, serviceId, opts) => ({
                    rel,
                    serviceName: serviceId,
                    opts,
                  }),
                  attachLinks: (item, metaCreator) => {
                    attachmentRegistry.push({
                      item,
                      metaCreator,
                    });
                  },
                })
              );

              let i: number = 0;
              for (i = 0; i < attachmentRegistry.length; i++) {
                const item = attachmentRegistry[i].item;
                const metaCreator = attachmentRegistry[i].metaCreator;
                let success = false;
                if (Array.isArray(item)) {
                  let j = 0;
                  for (j = 0; j < item.length; j++) {
                    success = await resolveLink(
                      item[j],
                      metaCreator,
                      args as any,
                      opts
                    );
                    if (success === false)
                      throw new Error('Hypermedia link resolution failed');
                  }
                } else {
                  success = await resolveLink(
                    item,
                    metaCreator,
                    args as any,
                    opts
                  );
                }
                if (success === false)
                  throw new Error('Hypermedia link resolution failed');
              }
            }),
        })
      );

    [
      ['disableMiddleware', 'middlewareRunner'],
      ['disableValidation', 'validationRunner'],
      ['disablePre', 'preRunner'],
      ['disablePolicyExtraction', 'policyExtractionAggregator'],
      ['disableRule', 'ruleRunner'],
      ['disableLogic', 'logicRunner'],
      ['disableCapabilities', 'capRunner'],
      ['disableResponseFromatter', 'responseFromatter'],
    ]
      .reduce(
        (actor, config) => {
          return actor.then((v: any) => {
            if (config.length > 2 || config.length < 1)
              throw new Error('System failure, code: INVALID_RUNNER_CONF');
            let shouldRun: boolean = config.length === 1;
            if (config.length === 2) {
              // @ts-ignore
              shouldRun = !opts[config[0]];
            }

            if (shouldRun === true) {
              // @ts-ignore
              const action = ctx[config.length === 2 ? config[1] : config[0]];
              if (action) {
                return Promise.resolve(action());
              }
            }
            return Promise.resolve(v || false);
          });
        },
        (() => {
          try {
            return _init().then((v) => {
              if (!ctx.logicRunner) {
                return reject(
                  new Error(
                    `You likely forgot to define logic for service ${service.name}`
                  )
                );
              }

              return v;
            });
          } catch (e) {
            return Promise.reject(e);
          }
        })()
      )
      .then(() => {
        resolve(stat);
      })
      .catch((err) => {
        stat.result = {
          type: 'error',
          errCode: 500,
          err,
        };
        if (!opts.disableResponseFromatter) {
          ctx.responseFromatter();
        }
        resolve(stat);
      });
  });
}

type JwtService = {
  sign: (
    payload: string | object | Buffer,
    secret?: jwt.Secret,
    opts?: jwt.SignOptions
  ) => string;
  verify: (
    token: string,
    secret?: jwt.Secret,
    opts?: jwt.VerifyOptions
  ) => string | object | Buffer;
  decode: (
    token: string,
    opts?: jwt.DecodeOptions
  ) => string | { [key: string]: any };
};

type PolicyExtractor = (
  args: ServiceInput
) => Array<string> | Promise<Array<string>>;

type SecurityPointers = {
  jwt: JwtService;
  enableAuth: (opts: AuthOptions) => void;
  definePolicyExtractor: (refId: string, extractor: PolicyExtractor) => void;
};

export const Security = createPointer<SecurityPointers>(
  (moduleId, controller, context) => ({
    definePolicyExtractor: (refId, extractor) => {
      context.put(moduleId, refId, extractor, false, 'policy_extractor');
    },
    enableAuth: (opts) => {
      context.setData('default', 'authOpts', opts);
      // Attach middleware
      const app = context.getData<expressApp.Application>('default', 'express');
      if (!app) {
        throw new Error(
          'Backend has not been initialized, use(Backend) before use(Security)'
        );
      }

      /** External authentication */
      if (opts?.enableExternalAuthServer === undefined) {
        opts.enableExternalAuthServer = false;
      }

      if (opts?.enableExternalAuthClient === undefined) {
        opts.enableExternalAuthClient = false;
      }

      app.use(createAuthMiddleware(opts));

      if (opts.enableExternalAuthServer === true) {
        if (!opts.externalAuthServerConf) {
          opts.externalAuthServerConf = {};
        }

        if (!opts.externalAuthServerConf.initiateAuthUrl) {
          opts.externalAuthServerConf.initiateAuthUrl =
            '/___external/auth/server/login/initiate';
        }

        if (!opts.externalAuthServerConf.authPageUrl) {
          opts.externalAuthServerConf.authPageUrl = '/auth/login';
        }

        if (!opts.externalAuthServerConf.callbackHandlerUrl) {
          opts.externalAuthServerConf.callbackHandlerUrl =
            '/___external/auth/server/login/handlers/callback';
        }

        if (!opts.getInternalAppByAccessKeyId) {
          console.warn(
            `getInternalAppByAccessKeyId fn is not implemented to be used with external auth`
          );
        }

        app.use(createExternalAuthServerRoutes(opts, moduleId, context));
      } else if (opts.enableExternalAuthClient === true) {
        if (!opts.externalAuthClientConf) {
          opts.externalAuthClientConf = {
            serverEndpoint: null,
            accessKeyId: null,
            accessSecret: null,
            callbackUrl: null,
          };
        }

        if (!opts.externalAuthClientConf.initiateAuthUrl) {
          opts.externalAuthClientConf.initiateAuthUrl =
            '/___external/auth/client/login/initiate';
        }

        if (!opts.externalAuthClientConf.logoutUrl) {
          opts.externalAuthClientConf.logoutUrl =
            '/___external/auth/server/logout';
        }

        if (!opts.externalAuthClientConf.callbackUrl) {
          console.warn(`Auth client dont have callbackUrl`);
        }

        app.use(createExternalAuthClientRoutes(opts));
      }
    },
    jwt: {
      decode: (token, opts?) => {
        const authOpts = context.getData<AuthOptions>('default', 'authOpts');
        let decodeOptions = opts;

        try {
          if (authOpts) {
            decodeOptions = Object.assign(
              authOpts.jwtDecodeOptions || {},
              opts || {}
            );
          }
        } catch (e) {
          /** Do nothing */
        }

        return jwt.decode(token, decodeOptions);
      },
      verify: (token, secret?, opts?) => {
        const authOpts = context.getData<AuthOptions>('default', 'authOpts');
        let key = secret;
        let verifyOptions = opts;

        try {
          if (authOpts) {
            verifyOptions = Object.assign(
              authOpts.jwtVerifyOptions || {},
              opts || {}
            );
            if (!secret) {
              key = authOpts.jwtSecretKey;
            }
          }
        } catch (e) {
          /** Do nothing */
        }

        if (!key) {
          throw new Error(
            'secret key must be provided or can be configured globally using enableAuth'
          );
        }

        return jwt.verify(token, key, verifyOptions);
      },
      sign: (payload, secret?, _signOpts?: jwt.SignOptions) => {
        const authOpts = context.getData<AuthOptions>('default', 'authOpts');
        let key = secret;
        let signOptions = _signOpts;

        try {
          if (authOpts) {
            signOptions = Object.assign(
              authOpts.jwtSignOptions || {},
              _signOpts || {}
            );
            if (!secret) {
              key = authOpts.jwtSecretKey;
            }
          }
        } catch (e) {
          /** Do nothing */
        }

        if (!key) {
          throw new Error(
            'secret key must be provided or can be configured globally using enableAuth'
          );
        }

        return jwt.sign(payload, key, signOptions);
      },
    },
  })
);

/* -------------------------------------------------------------------------- */
/*                              Helper Functions                              */
/* -------------------------------------------------------------------------- */

function loadSimulatedUser(): { token: string; user: any; hasUser: boolean } {
  /** Never allow this function in production mode */
  let HAS_SIM_USER = false;
  let token: string = null;
  let user: any = null;

  const IS_TEST_MODE = useEnv('NODE_ENV') !== 'production';
  if (IS_TEST_MODE === true) {
    let AUTH_SIM_DIR_PATH: string = useEnv('ARK__AUTH_SIM_FILE_PATH');
    if (!Boolean(AUTH_SIM_DIR_PATH)) {
      AUTH_SIM_DIR_PATH = process.cwd();
    }

    const SIM_FILE_PATH = path.join(AUTH_SIM_DIR_PATH, '.ark-test-user.json');
    console.log(
      `Non-production environment: Checking if any simulated user session exists at ${SIM_FILE_PATH}`
    );

    if (fs.existsSync(SIM_FILE_PATH) === true) {
      console.warn(`Simulated user login detected`);
      try {
        const payload = JSON.parse(fs.readFileSync(SIM_FILE_PATH, 'utf-8'));
        if (payload && payload.token) token = payload.token;

        if (payload && payload.user) user = payload.user;

        if (token && user) HAS_SIM_USER = true;
      } catch (e) {
        console.error(e);
      }
    }
  }

  return {
    token,
    user,
    hasUser: HAS_SIM_USER,
  };
}

const PASS_THRU_ENV_VARS: string[] = ['APP_INFO_BASE_PATH'];

/**
 * Registers an environment variable as a pass through variable for frontend hydration
 * @param name Name of the environment variable to pass through to frontend
 */
export function passThroughEnvVar(name: string) {
  if (PASS_THRU_ENV_VARS.indexOf(name) < 0) {
    PASS_THRU_ENV_VARS.push(name);
  }
}

export function getPassThroughPayload() {
  return PASS_THRU_ENV_VARS.reduce((acc, key) => {
    return {
      ...acc,
      [key]: useEnv(key) || undefined,
    };
  }, {});
}
