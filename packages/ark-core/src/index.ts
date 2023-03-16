import traverse from '../traverse';

export type Activator = () => any | Promise<any>;
export type ContextScope<T> = (props: Partial<Ark.Pointers>) => T | Promise<T>;

export type Capabilities = {
  serviceId: string;
  params?: any;
};

export type ServiceResponseData<T = {}> = T & {
  capabilities: Array<Capabilities>;
};

export type ServiceResponse<M, D> = {
  type: 'success' | 'error';
  meta?: M;
  data?: Array<D> | D;
  capabilities?: Array<Capabilities>;
  errCode?: number;
  err?: Error | any;
  [key: string]: any;
};

interface PointerBase {
  init: () => void | Promise<any>;
}

export type PointerCreator<T> = (
  id: string,
  controller: ControllerContext<any>,
  context: ApplicationContext
) => T & Partial<PointerBase>;

export type PointerExtender<O, N> = (original: Partial<O>) => PointerCreator<N>;

interface CorePointers {
  use: <T extends (...args: any) => any>(creators: T) => ReturnType<T>;
  useModule: (id: string, fn: ContextScope<void>) => void;
  invoke: <T>(
    fn: ContextScope<T>,
    inputMap?: object,
    outputMap?: (v: T) => any
  ) => Promise<T | any>;
  getInput: <T>(id: string, defaultVal?: T) => T;
  setOutput: <T>(id: string, val: T) => T;
  getData: <T>(id: string, defaultVal?: T) => T;
  setData: <T>(id: string, val: T) => T;
  existData: (id: string) => boolean;
  run: (fn: Activator) => void;
  runOn: (moduleId: string, fn: ContextScope<any>) => void;
  put: <T>(refId: string, val?: T, overrite?: boolean, groupId?: string) => T;
  take: <T>(moduleId: string, refId: string, groupId?: string) => T;
  useDataFromContext: <T>(
    refId: string,
    val?: T,
    overrite?: boolean,
    groupId?: string
  ) => T;
}

declare global {
  // eslint-disable-next-line no-unused-vars
  namespace Ark {
    // eslint-disable-next-line no-unused-vars
    interface Pointers extends CorePointers {}
    // eslint-disable-next-line no-unused-vars
    interface IApplicationContext {}
  }
}

type SequelStarterOpt<T> = {
  resolver: (q: T) => any;
  before?: () => any;
  beforeEach?: (q: T) => any;
  afterEach?: (q: T) => any;
  after?: () => any;
};

/**
 * Sequel enables sequential execution of business logic
 * @override
 */
export class Sequel<
  Q = {
    name?: string;
    activator: Activator;
  }
> {
  static DefaultResolver = (item: any) => item.activator();

  private _q: Array<Q> = [];

  /**
   * Push new task / step to the queue
   * @param {Q} t Task / step to add
   * @return {Q} Task / step added
   */
  public push(t: Q): Q {
    this._q.push(t);
    return t;
  }

  /**
   * (Async) Run the added task / step in sequential manner
   * @param {Partial<SequelStarterOpt<Q>>} opts Runner Options
   * @return {Promise} Promise
   */
  public start(opts?: Partial<SequelStarterOpt<Q>>): Promise<any> {
    opts = Object.assign<SequelStarterOpt<Q>, Partial<SequelStarterOpt<Q>>>(
      {
        resolver: Sequel.DefaultResolver,
      },
      opts
    );

    if (!this._q || !Array.isArray(this._q)) {
      return Promise.resolve();
    }

    return (() => {
      const outerP = this._q.reduce(
        (p, q) => {
          return p
            .then(() => {
              if (opts.beforeEach && typeof opts.beforeEach === 'function') {
                return p.then(() => opts.beforeEach(q));
              }

              return p;
            })
            .then(() => opts.resolver(q))
            .then(() => {
              if (opts.afterEach && typeof opts.afterEach === 'function') {
                return p.then(() => opts.afterEach(q));
              }

              return p;
            });
        },
        (() => {
          const p = Promise.resolve();
          if (opts.before && typeof opts.before === 'function') {
            p.then(() => opts.before());
          }

          return p;
        })()
      );

      if (opts.after && typeof opts.after === 'function') {
        outerP.then(() => opts.after());
      }

      return outerP;
    })();
  }
}

/**
 * Isolated scope where controllers live and run
 */
export class ControllerContext<T> {
  private inputData: any;
  private outputData: any;
  private queue: Sequel;
  private applicationContext: ApplicationContext;
  private hasInitialized: boolean;
  /**
   * Creates new instance of controller context
   * @param {ApplicationContext} applicationContext
   * @param {any=} inputData Input Data
   * @param {any=} defaultData Default Data
   */
  constructor(applicationContext: ApplicationContext, inputData: any = {}) {
    this.applicationContext = applicationContext;
    this.inputData = inputData;
    this.outputData = {};
    this.queue = new Sequel();
    this.hasInitialized = false;
  }

  /**
   * Throw error if not initialized
   * @param {string=} msg Error message to throw
   */
  ensureInitialized(
    msg: string = 'Attempted to execute command before initialization'
  ) {
    if (!this.hasInitialized) throw new Error(msg);
  }

  /**
   * Throw error if already initialized
   * @param {string=} msg Error message to throw
   */
  ensureInitializing(
    msg: string = 'Attempted to execute command after initialization'
  ) {
    if (this.hasInitialized) throw new Error(msg);
  }

  /**
   * Run business logic in self container
   * @param {Activator} activator Function Activator
   * @return {{}}
   */
  run(activator: Activator) {
    this.ensureInitializing();
    return this.queue.push({ activator });
  }

  /**
   * Execute controller
   * @param {string} moduleId
   * @param {ControllerScope<T>} fn
   * @param {PointerCreator<any>} pointerCreator
   * @return {Promise<T>}
   */
  execute(
    moduleId: string,
    fn: ContextScope<T>,
    pointerCreator: PointerCreator<any>
  ): Promise<T> {
    const controllerPointerCreator: PointerCreator<
      Partial<CorePointers> & Partial<PointerBase>
    > = () => ({
      init: () => {},
      getInput: (id, def) => {
        let result: any = def;
        if (this.inputData[id]) {
          result = this.inputData[id];
        }
        return result;
      },
      setOutput: (id, v) => {
        this.outputData[id] = v;
        return v;
      },
      run: this.run.bind(this),
      runOn: (moduleId, activator) => {
        this.queue.push({
          activator: () =>
            Promise.resolve(
              activator(
                Object.assign(
                  pointerCreator(moduleId, this, this.applicationContext),
                  controllerPointerCreator(
                    moduleId,
                    this,
                    this.applicationContext
                  )
                )
              )
            ),
        });
      },
    });
    return Promise.resolve(
      fn(
        Object.assign(
          pointerCreator(moduleId, this, this.applicationContext),
          controllerPointerCreator(moduleId, this, this.applicationContext)
        )
      )
    )
      .then(() => {
        this.hasInitialized = true;
        return this.queue.start();
      })
      .then(() => Promise.resolve(this.outputData));
  }
}

type RefInfo = { moduleName: string; refId: string };
/**
 * Extracts reference information
 * @param {string} refId
 * @param {string=} moduleName
 * @param {string=} groupId
 * @return {RefInfo}
 */
export function extractRef(
  refId: string,
  moduleName: string,
  groupId: string = null
): RefInfo {
  const info: RefInfo = {
    moduleName,
    refId,
  };

  if (refId.includes('/')) {
    info.refId = refId.substring(refId.indexOf('/') + 1, refId.length);
    info.moduleName = refId.substring(0, refId.indexOf('/'));
  }

  if (groupId) {
    info.refId = `${groupId}_${info.refId}`;
  }

  return info;
}

/**
 * This class enables the transaction of Application State
 */
export class ApplicationContext implements Ark.IApplicationContext {
  static instance: ApplicationContext;
  /**
   * @return {ApplicationContext} Singleton Instance of current
   * Application Context
   */
  static getInstance(): ApplicationContext {
    if (!ApplicationContext.instance) {
      ApplicationContext.instance = new ApplicationContext();
    }
    return ApplicationContext.instance;
  }

  public data: { [key: string]: any };
  private pointers: Array<{ pid: string; creator: PointerCreator<any> }>;
  private rollupProcess: Sequel;

  /**
   * Creates a new instance of Application Context
   */
  constructor() {
    this.data = {};
    this.pointers = [];
    this.rollupProcess = new Sequel();

    this.registerPointer<Partial<CorePointers>>(
      'core',
      (moduleId, controller, ctx) => ({
        use: <T extends (...args: any) => any>(creators: T): ReturnType<T> => {
          return this.generatePointer(moduleId, controller, ctx, creators);
        },
        useModule: (id: string, fn: ContextScope<void>) => {
          if (/\//.test(id)) {
            // eslint-disable-next-line max-len
            throw new Error(
              `illegal module id '${id}', only use alpha-numeric characters`
            );
          }
          controller.run(() => this.activate(fn, id));
        },
        invoke: <T>(
          fn: ContextScope<T>,
          inputMap: object,
          outputMap: (v: T) => any = (v) => v
        ): Promise<T> => this.invoke(moduleId, fn, inputMap, outputMap),
        getData: (id, def) => ctx.getData(moduleId, id, def),
        setData: (id, v) => ctx.setData(moduleId, id, v),
        existData: (id) => ctx.existData(moduleId, id),
        put: (refId, val, overrite, groupId) =>
          ctx.put(moduleId, refId, val, overrite, groupId),
        take: (refId, groupId) => ctx.take(moduleId, refId, groupId),
        useDataFromContext: (refId, val?, overrite?, groupId?) =>
          ctx.useDataFromContext(moduleId, refId, val, overrite, groupId),
      })
    );
  }

  /**
   * Add deactivator to rollback actions
   * @param {Activator} deactivator
   */
  pushRollbackAction(deactivator: Activator) {
    this.rollupProcess.push({
      activator: deactivator,
    });
  }

  /**
   * Set state data to Application Context
   * @param {string} id Module ID
   * @param {string} _key Assignment Key
   * @param {T} value Value to set
   * @return {T} Whatever being set
   */
  setData<T>(id: string, _key: string, value: T): T {
    if (!this.data[id]) {
      this.data[id] = {};
    }

    if (!this.data[id][_key]) {
      this.data[id][_key] = value;
    }

    return value;
  }

  /**
   * Get state data from Application Context
   * @param {string} id Module ID
   * @param {string} _key Key to get value from
   * @param {T=} defaultVal - Default value to return if nothing found
   * @return {T} Value stored in module ID by the provided key / default
   * value if none matches
   */
  getData<T>(id: string, _key: string, defaultVal?: T): T {
    const result: T = defaultVal || null;

    if (!this.data[id]) {
      this.data[id] = {};
    }

    if (this.data[id]) {
      if (this.data[id][_key]) {
        return this.data[id][_key];
      }
    }

    this.data[id][_key] = result;
    return result;
  }

  /**
   * Put anything in context
   * @param {string} moduleId Module ID
   * @param {string} refId Address of the item e.g. {moduleId?}/{itemKey}
   * @param {T} val Item to put
   * @param {boolean=} overrite On False,
   * @param {string=} groupId Group ID e.g. components or services
   * it will throw error if item already exists
   * @return {T} Returns set value
   */
  put<T = any>(
    moduleId: string,
    refId: string,
    val: T,
    overrite: boolean = false,
    groupId: string = null
  ): T {
    const ref = extractRef(refId, moduleId, groupId);
    if (!overrite) {
      if (this.getData(ref.moduleName, ref.refId)) {
        throw new Error(`'${ref.refId}' already exists on ${ref.moduleName}`);
      }
    }
    return this.setData(ref.moduleName, ref.refId, val);
  }

  /**
   * Take anything from context
   * @param {string} moduleId Module ID
   * @param {string} refId Address of the item e.g. {moduleId?}/{itemKey}
   * @param {string=} groupId Group ID e.g. components or services
   * @return {T}
   */
  take<T>(moduleId: string, refId: string, groupId: string = null): T {
    const ref = extractRef(refId, moduleId, groupId);
    if (!this.getData(ref.moduleName, ref.refId)) {
      throw new Error(
        // eslint-disable-next-line max-len
        `${groupId ? groupId + ' ' : ''}'${
          ref.refId
        }' is not found under module '${ref.moduleName}'`
      );
    }
    return this.getData(ref.moduleName, ref.refId);
  }

  /**
   * Generic useData() fn
   * @param {string} moduleId Module ID
   * @param {string} refId Address of the item e.g. {moduleId?}/{itemKey}
   * to get
   * @param {T=} val (Optional) Item to put
   * @param {boolean=} overrite (Optional) On False,
   * @param {string=} groupId Group ID e.g. components or services
   * it will throw error if item already exists
   * @return {T}
   */
  useDataFromContext<T>(
    moduleId: string,
    refId: string,
    val: T = undefined,
    overrite: boolean = false,
    groupId: string = null
  ): T {
    if (val !== undefined) {
      return this.put(moduleId, refId, val, overrite, groupId);
    }
    return this.take(moduleId, refId, groupId);
  }

  /**
   * Check if data exist
   * @param {string} moduleId Module ID
   * @param {string} key Data key
   * @return {boolean} True if exists
   * value if none matches
   */
  existData(moduleId: string, key: string): boolean {
    return this.getData(moduleId, key, null) === null ? false : true;
  }

  /**
   * Registers new pointer
   * @param {string} pid An unique ID that represent this pointer
   * @param {PointerCreator} creator Func that creates module pointers
   */
  registerPointer<T>(pid: string, creator: PointerCreator<T>) {
    // Check if pointer with same ID already exists
    const indexOfExistingPointer = this.pointers.findIndex(
      (p) => p.pid === pid
    );

    if (indexOfExistingPointer > -1) {
      throw new Error(`Duplicate pointer registration is not allowed.
Attempted to register pointer with id: ${pid}`);
    }

    this.pointers.push({ pid, creator });
  }

  /**
   * Extends existing pointer
   * @param {string} pid Id of the existsing pointer
   * @param {PointerExtender} extender
   */
  extendPointer<O, N>(pid: string, extender: PointerExtender<O, N>) {
    const indexOfExistingPointer = this.pointers.findIndex(
      (p) => p.pid === pid
    );

    if (indexOfExistingPointer < 0) {
      throw new Error(`Pointer extension failed because
there is no pointer registered with provided id: ${pid}`);
    }

    this.pointers.splice(indexOfExistingPointer, 1, {
      pid,
      creator: extender(
        this.pointers[indexOfExistingPointer].creator(
          'default',
          new ControllerContext(this),
          this
        )
      ),
    });
  }

  /**
   * Get registered pointers from the context
   * @param {string} moduleId Module ID
   * @param {ControllerContext<any>} controller
   * @return {Partial<Ark.Pointers>}
   */
  getPointers(
    moduleId: string,
    controller: ControllerContext<any>
  ): Partial<Ark.Pointers> {
    return this.generatePointers(moduleId, controller, this);
  }

  /**
   * Start running the application
   * @param {ContextScope<void>} fn
   * @param {string=} moduleId Module ID to point
   * @return {Promise<any>}
   */
  activate(fn: ContextScope<void>, moduleId: string = 'default'): Promise<any> {
    return this.invoke(moduleId, fn, undefined);
  }

  /**
   * Perform destructive actions and deactivates application
   * @return {Promise<any>}
   */
  deactivate(): Promise<any> {
    return this.rollupProcess.start();
  }

  /**
   * This function generates all pointers to the specified module
   * @param {string} id Module ID
   * @param {ControllerContext<any>} controller
   * @param {ApplicationContext} context
   * @return {Ark.Pointers} Module Pointers
   */
  private generatePointers(
    id: string,
    controller: ControllerContext<any>,
    context: ApplicationContext
  ): Partial<Ark.Pointers> {
    return context.pointers
      .map((p) => {
        return p.creator;
      })
      .reduce(
        (acc, p) => ({
          ...acc,
          ...context.generatePointer(id, controller, context, p),
        }),
        {}
      );
  }

  /**
   * This function generates single pointer to the specified module
   * @param {string} id Module ID
   * @param {ControllerContext<any>} controller
   * @param {ApplicationContext} context
   * @param {function} pointer
   * @return {Ark.Pointers} Module Pointers
   */
  generatePointer(
    id: string,
    controller: ControllerContext<any>,
    context: ApplicationContext,
    pointer: (...args: any[]) => any
  ): any {
    const _p = pointer(id, controller, context);
    // Init
    if (_p.init && typeof _p.init === 'function') {
      _p.init();
    }
    return _p;
  }

  /**
   * Invokes / Activates a context / controller function
   * @param {string} modId
   * @param {ContextScope<T>} fn
   * @param {object} inputMap
   * @param {object | function} outputMap
   * @return {Promise<T>}
   */
  private invoke<T>(
    modId: string,
    fn: ContextScope<T>,
    inputMap: object,
    outputMap: (v: T) => any = (v) => v
  ): Promise<T> {
    const controller = new ControllerContext<T>(this, inputMap);
    return controller
      .execute(modId, fn, this.generatePointers)
      .then((v) => Promise.resolve(outputMap(v)));
  }
}

/**
 * Creates a new pointer service, which can be used to register in the context
 * @param {PointerCreator<T>} activatorFn Creator function
 * @return {PointerCreator<T>} Returns creator
 */
export function createPointer<T>(
  activatorFn: PointerCreator<T>
): PointerCreator<T> {
  return activatorFn;
}

/**
 * Creates new logic context that can be used
 * @param {ContextScope} fn Logic Scope
 * @return {ContextScope}
 */
export function createContext<T = any>(fn: ContextScope<T>): ContextScope<T> {
  return fn;
}

/**
 * Creates an isolated scope for new business logic
 * @param {ControllerScope<T>} fn Controller Function
 * @return {ControllerScope<T>}
 */
export function createController<T = any>(
  fn: ContextScope<T>
): ContextScope<T> {
  return fn;
}

/**
 * Creates a new package context
 * @param {ContextScope<T>} fn
 * @return {ContextScope<T>}
 */
export function createPackage<T>(fn: ContextScope<T>): ContextScope<T> {
  return fn;
}

/**
 * Creates a new module context
 * @param {ContextScope<T>} fn
 * @return {ContextScope<T>}
 */
export function createModule<T>(fn: ContextScope<T>): ContextScope<T> {
  return fn;
}

// Singleton Functions

/**
 * Run application in singleton context
 * @param {ContextScope<T>} fn
 * @return {Promise<any>}
 */
export function runApp(fn: ContextScope<void>): Promise<any> {
  return ApplicationContext.getInstance().activate(fn, 'default');
}

let runtimeVariables: any = {
  RUNTIME_MODE: 'STANDARD',
};

/**
 * Get environment variable
 * @param {string} key
 * @return {string}
 */
export function useEnv(key: string): string {
  let processEnv = {};
  try {
    processEnv = process.env;
  } catch (e) {}
  return Object.assign({}, runtimeVariables, processEnv)[key];
}

/**
 * Set default configuration
 * @param {object} payload env configuration
 */
export function setDefaultEnv(payload: { [key: string]: string }) {
  runtimeVariables = Object.assign(runtimeVariables || {}, payload);
}

/**
 * Set run time variables
 * @param {object} payload env configuration
 */
export function setRuntimeVars(payload: { [key: string]: string }) {
  runtimeVariables = Object.assign(runtimeVariables, payload);
}

export function createEnvVariableResolver(
  resolver: EnvVariableResolver
): EnvVariableResolver {
  return resolver;
}

export type EnvVariableResolver = {
  id: string;
  getValueByKeys: (keys: KeySnapshot[]) => Promise<{ [key: string]: string }>;
  test: () => boolean;
};

export type EnvVariableResolverOptions = {
  resolver: EnvVariableResolver;
  keys: string[];
  transformKey?: (v: string) => string;
};

type KeySnapshot = {
  original: string;
  transformed: string;
  value: string;
};

export async function resolveEnvironmentVar(
  strategies: Array<EnvVariableResolverOptions>
) {
  return strategies
    .filter((strategy) => {
      if (typeof strategy.resolver.test === 'function') {
        const shouldRun = strategy.resolver.test();

        if (shouldRun === true) {
          console.log(`'Resolver ${strategy.resolver.id}' is enabled`);
          return true;
        }
      }

      console.log(`'Resolver ${strategy.resolver.id}' is not enabled`);
      return false;
    })
    .reduce<Promise<any>>((acc, strategy) => {
      return acc
        .then(() => {
          const keyMap = strategy.keys.map<KeySnapshot>((key) => {
            let transformed = key;

            if (typeof strategy.transformKey === 'function') {
              transformed = strategy.transformKey(key);
            }

            return {
              original: key,
              transformed,
              value: useEnv(key),
            };
          });

          return strategy.resolver.getValueByKeys(keyMap);
        })
        .then((response) => {
          const k = Object.keys(response);
          if (k.length > 0) {
            console.log(
              `Resolved the following keys from '${
                strategy.resolver.id
              }': ${Object.keys(response).join(', ')}`
            );
          }
          setRuntimeVars(response);
        });
    }, Promise.resolve());
}

/**
 * Gets all run time variables
 * @return {any}
 */
export function getRuntimeVars(): any {
  return runtimeVariables;
}

// Content Management Functions

const idResolutionExpressions = {
  default: () => /^\[.*\]/gm,
};

/**
 * Resolves a complete object address to the current index
 * @param {traverse.Traverse<any>} traverseResult
 * @param {string} inputAddress
 * @return {string}
 */
export function resolveAddressForTraversal(
  traverseResult: traverse.Traverse<any>,
  inputAddress: string
): string {
  const pathParts = inputAddress.split('.');

  let i = 0;
  for (i; i < pathParts.length; i++) {
    const currentPath = pathParts[i];
    if (idResolutionExpressions.default().test(currentPath) === true) {
      const parentAddress = pathParts.slice(0, i);
      const resolvedId = resolveIndexFromTraversalResult(
        traverseResult,
        resolveTraversalAddressFromPath(parentAddress),
        currentPath
      );
      pathParts[i] = String(resolvedId);
    }
  }

  return resolveTraversalAddressFromPath(pathParts);
}

/**
 * Resolves traversal paths to address
 * @param {string[]} paths
 * @return {string}
 */
export function resolveTraversalAddressFromPath(paths: string[]): string {
  return paths.join('.');
}

/**
 * Resolves index of array item from the ID template
 * @param {traverse.Traverse<any>} traverseResult
 * @param {string} path
 * @param {string} query
 * @return {number}
 */
export function resolveIndexFromTraversalResult(
  traverseResult: traverse.Traverse<any>,
  path: string,
  query: string
): number {
  let id: string = null;

  if (idResolutionExpressions.default().test(query) === false) {
    return Number(query);
  }

  try {
    const results = idResolutionExpressions.default().exec(query);
    if (results && results.length > 0) {
      id = results[0].replace('[', '').replace(']', '');
    }
  } catch (e) {
    console.error(e);
  }

  const target = traverseResult.get(path.split('.').filter(Boolean));

  if (Array.isArray(target) && target.length > 0) {
    const index = target.findIndex((t) => {
      try {
        if (t.id) {
          if (String(t.id) === String(id)) {
            return true;
          }
        }
      } catch (e) {
        console.error(e);
      }
      return false;
    });

    return index;
  }

  return -1;
}

export type CMSLog = {
  key: string;
  val: any;
  version?: number;
  id?: number;
  clientId?: string;
  timestamp?: string;
  // Only if required
  prevValueType?: string;
  previousValue?: string;
};

export type CMSApplyMode = 'sync' | 'edit';

export function applyLog(
  content: any,
  key: string,
  val: any,
  mode: CMSApplyMode,
  track: (prevVal: any, prevValType: any) => void
) {
  const traverseResult = traverse(content);
  const resolvedKey = resolveAddressForTraversal(traverseResult, key);
  const paths = traverseResult.paths().filter((p) => p.length > 0);
  let i = 0;
  for (i = 0; i < paths.length; i++) {
    const address = resolveTraversalAddressFromPath(paths[i]);
    if (address === resolvedKey) {
      if (track) {
        const currentVal = traverseResult.get(paths[i]);
        track(currentVal, typeof currentVal);
      }
      traverseResult.set(paths[i], val);
      break;
    }
  }

  return content;
}

function* infinite() {
  let index = 0;

  while (true) {
    yield index++;
  }

  return index;
}

const generator = infinite();

export function sortLogs(actions: Array<CMSLog>) {
  actions = actions.sort((a, b) => {
    if (!isNaN(a.id) && !isNaN(b.id)) {
      if (a.id > b.id) {
        return 1;
      }

      return -1;
    }

    return undefined;
  });

  return actions;
}

export function updateContent(
  content: any,
  actions: Array<CMSLog>,
  mode: CMSApplyMode
) {
  actions = sortLogs(actions);

  let i = 0;
  for (i = 0; i < actions.length; i++) {
    actions[i].id = generator.next().value;
    content = applyLog(
      content,
      actions[i].key,
      actions[i].val,
      mode,
      (prevVal: any, prevValType: any) => {
        actions[i].prevValueType = prevValType;
        if (actions[i].prevValueType === 'string') {
          // Prev value enabled only for string now
          actions[i].previousValue = prevVal;
        }
      }
    );
  }

  return {
    appliedActions: actions,
    content,
  };
}

export function reconcileLogs(logs: Array<CMSLog>): Array<CMSLog> {
  logs = sortLogs(logs);

  // Generate map
  const map = logs.reduce<{ [key: string]: any }>((acc, item) => {
    acc[item.key] = item;
    return acc;
  }, {});

  return Object.keys(map).map((key) => map[key]);
}

export const CMS = {
  applyLog,
  updateContent,
};
