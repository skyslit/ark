import React from 'react';
import controller, {
  Item,
  Controller,
  ControllerNamespace,
  UIToolkit,
  Response,
  CustomType,
} from '../../core/controller';
import { match } from 'path-to-regexp';
import { ContentHook, Frontend, useArkReactServices } from '../../..';
import { compile, createSchema } from '../../utils/schema';
import { joinPath } from '../../utils/path';

type Modes = 'read' | 'write';

type PropType = {
  basePath?: string;
  controller?: Controller;
  namespace?: string;
  initialPath?: string;
  path?: string;
  onPathChange?: (path: string) => void;
  mode?: Modes;
  meta?: any;
  style?: any;
};

type Claim = {
  read: boolean;
  write: boolean;
  owner: boolean;
};

type ClipboardObject = {
  action: string;
  meta?: any;
};

type CatalogueApi = {
  initialPath: string;
  refresh: (silent?: boolean) => Promise<any>;
  createItem: (name: string, type: string, payload?: any) => Promise<any>;
  deleteItems: (paths: string[]) => Promise<void>;
  renameItem: (
    path: string,
    newParentPath: string,
    newName: string
  ) => Promise<any>;
  updateItem: (path: string, meta: any, security: any) => Promise<any>;
  moveItem: (
    sourcePath: string,
    destParentPath: string,
    newName: string
  ) => Promise<any>;
  createShortcut: (
    sourceItem: string,
    destinationDirPath: string,
    fileName: string
  ) => Promise<any>;
  basePath: string;
  path: string;
  setPath: (path: string) => void;
  controller: Controller;
  namespace: ControllerNamespace;
  mode: Modes;
  currentDir: Item;
  dirLoading: boolean;
  items: Array<Item>;
  ui: UIToolkit;
  namespaceUI: UIToolkit;
  currentCustomType: CustomType;
  getDestinationPathFromItem: (item: Item) => string;
  getFullUrlFromPath: (val: string) => string;
  claims: Claim;
  clipboard: ClipboardObject;
  setClipboard: (obj: ClipboardObject) => void;
  findNextUniqueName: (name: string) => string;
  meta: any;
  selectedItems: Array<Item>;
  setSelectedItems: React.Dispatch<React.SetStateAction<Item[]>>;
};

type FileApi = {
  cms: ReturnType<ContentHook>;
  saveChanges: () => Promise<any>;
  loading: boolean;
};

type PropertiesApi = {
  cms: ReturnType<ContentHook>;
  saveChanges: () => Promise<any>;
  loading: boolean;
};

const CatalogueContext = React.createContext<CatalogueApi>(null);

function createCatalogue(props: PropType): CatalogueApi {
  const { initialPath } = props;

  const basePath = React.useMemo(() => {
    return props?.basePath || '/';
  }, [props.basePath]);

  const [clipboard, setClipboard] = React.useState<ClipboardObject>(null);
  const prevPathRef = React.useRef<string>(initialPath || '/');
  const [controlledPath, setControlledPath] = React.useState<string>(
    prevPathRef.current
  );
  const [dirLoading, setDirLoading] = React.useState(true);
  const [items, setItems] = React.useState<Array<Item>>([]);
  const [selectedItems, setSelectedItems] = React.useState<Array<Item>>([]);
  const [claims, setClaims] = React.useState<Claim>({
    owner: false,
    read: false,
    write: false,
  });

  const mode = React.useMemo<Modes>(() => {
    if (props.mode === undefined) {
      return 'read';
    }

    return props.mode;
  }, [props.mode]);

  const controller = React.useMemo<Controller>(() => {
    if (props.controller) {
      return props.controller;
    }

    return Controller.getInstance();
  }, [props.controller]);

  const namespaceStr = React.useMemo(() => {
    if (props.namespace) {
      return props.namespace;
    }

    return 'default';
  }, [props.namespace]);

  const namespace = React.useMemo(() => {
    return controller.getNamespace(namespaceStr);
  }, [namespaceStr]);

  const namespaceUI = React.useMemo(() => {
    return namespace.ui;
  }, [namespace]);

  const isControlledComponent = React.useMemo(() => {
    if (props.path === undefined) {
      return false;
    }

    return true;
  }, [props.path]);

  const path = React.useMemo(() => {
    if (isControlledComponent === true) {
      return props.path;
    }

    return controlledPath;
  }, [controlledPath, isControlledComponent, props.path]);

  const [currentDir, setCurrentDir] = React.useState<Item>(null);

  const currentCustomType = React.useMemo(() => {
    if (currentDir) {
      const customTypeStr = currentDir.type;
      const customType = namespace.types[customTypeStr];
      return customType || null;
    }
    return null;
  }, [currentDir, namespace]);

  const ui = React.useMemo(() => {
    return Object.assign({}, namespaceUI, currentCustomType?.toolkit || {});
  }, [namespaceUI, currentCustomType]);

  const setPath = React.useCallback(
    (path: string) => {
      if (props.onPathChange) {
        props.onPathChange(path);
      }

      if (isControlledComponent === false) {
        setControlledPath(path);
      }
    },
    [isControlledComponent, props.onPathChange]
  );

  const createItem = React.useCallback(
    async (name: string, type: string, meta?: any) => {
      const t = namespace.types[type];
      let fileCollectionName = 'default';
      if (t && t?.fileCollectionName) {
        fileCollectionName = t.fileCollectionName;
      }

      const m = meta || {};
      m._t = true;
      m.fileCollectionName = fileCollectionName;
      return namespace.create(path, name, type, m).then((res) => {
        setItems((item) => [...item, res.data[0]]);
        return res;
      });
    },
    [namespace, path]
  );

  const deleteItems = React.useCallback(
    async (paths: string[]) => {
      return namespace.deleteMany(paths).then((res) => {
        setItems((items) =>
          items
            .filter((item) => {
              const shouldRemove = paths.indexOf(item.path) > -1;
              return shouldRemove === false;
            })
            .filter((item) => {
              if (item?.isSymLink === true) {
                const shouldRemove = paths.some((removedPath) => {
                  return item.destinationPath.startsWith(removedPath);
                });

                return shouldRemove === false;
              }

              return true;
            })
        );
        return res;
      });
    },
    [namespace]
  );

  const renameItem = React.useCallback(
    async (path: string, newParentPath: string, newName: string) => {
      return namespace.rename(path, newParentPath, newName).then((r) => {
        setItems((items) =>
          items.map((item) => {
            if (item.path === path) {
              return {
                ...item,
                name: newName,
                path: r.meta.newPath,
                slug: r.meta.newSlug,
              };
            }
            return item;
          })
        );
        return r;
      });
    },
    [namespace]
  );

  const updateItem = React.useCallback(
    (path: string, meta: any, security: any) => {
      return namespace.update(path, meta, security).then((r) => {
        setItems((items) =>
          items.map((item) => {
            if (item.path === path) {
              return {
                ...item,
                meta: meta,
                security: security,
              };
            }
            return item;
          })
        );
        return r;
      });
    },
    [namespace]
  );

  const getFullUrlFromPath = React.useCallback(
    (_path) => {
      if (basePath) {
        return joinPath(basePath, _path);
      }
      return _path;
    },
    [basePath]
  );

  const getDestinationPathFromItem = React.useCallback((item: Item) => {
    if (item?.isSymLink === true) {
      return item?.destinationPath;
    }

    return item?.path;
  }, []);

  const refresh = React.useCallback(
    async (silent: boolean = false) => {
      prevPathRef.current = path;
      if (silent === false) {
        setSelectedItems([]);
        setDirLoading(true);
        setClaims({
          owner: false,
          read: false,
          write: false,
        });
        setCurrentDir(null);
        setItems([]);
      }

      if (namespace) {
        return namespace
          .fetch(path)
          .then((res) => {
            setDirLoading(false);
            if (res.currentDir && res.items) {
              setCurrentDir(res.currentDir);
              setItems(res.items);
              setClaims(res.claims);
            }
          })
          .catch((err) => {
            setDirLoading(false);
            console.error(err);
          });
      }
    },
    [path, namespace]
  );

  React.useEffect(() => {
    refresh();
  }, [path, namespace]);

  const bufferred_dirLoading = React.useMemo(() => {
    if (path !== prevPathRef.current) {
      return true;
    }
    return dirLoading;
  }, [dirLoading, path]);

  const moveItem = React.useCallback(
    async (sourceItem, destParentPath, newName) => {
      return namespace.rename(sourceItem, destParentPath, newName).then((r) => {
        setItems((items) => [...items, r.meta.updatedItem]);
        return r;
      });
    },
    []
  );

  const createShortcut = React.useCallback(
    async (sourcePath, destinationDirPath, fileName) => {
      return namespace
        .createShortcut(sourcePath, destinationDirPath, fileName)
        .then((res) => {
          setItems((item) => [...item, res.data[0]]);
        });
    },
    [namespace]
  );

  const findNextUniqueName = React.useCallback(
    (name: string) => {
      let uniqueName = name;

      let isScanning = true;
      let attempt = 0;
      while (isScanning === true) {
        const existingItem = items.find((item) => item.name === uniqueName);
        if (!existingItem) {
          isScanning = false;
          break;
        }

        attempt++;
        uniqueName = `${name} (${attempt})`;
      }

      return uniqueName;
    },
    [items]
  );

  return {
    refresh,
    findNextUniqueName,
    path,
    setPath,
    namespace,
    mode,
    currentDir,
    dirLoading: bufferred_dirLoading,
    items,
    createItem,
    ui,
    namespaceUI,
    deleteItems,
    controller,
    currentCustomType,
    getFullUrlFromPath,
    basePath,
    renameItem,
    updateItem,
    claims,
    clipboard,
    setClipboard,
    moveItem,
    createShortcut,
    getDestinationPathFromItem,
    meta: props.meta,
    initialPath: props.initialPath,
    selectedItems,
    setSelectedItems,
  };
}

export type FolderIntegrationApi = {
  useCataloguePath: (
    id: string,
    path: string,
    opts?: {
      autoFetch?: boolean;
      useRedux?: boolean;
      ns?: string;
      depth?: number;
    }
  ) => CatalogueService;
  createItem: (
    parentPath: string,
    name: string,
    type: string,
    meta: any,
    ns?: string
  ) => Promise<any>;
  createShortcut: (
    sourcePath: string,
    destinationPath: string,
    itemName: string,
    ns?: string
  ) => Promise<any>;
  update: (path: string, meta: any, security: any, ns?: string) => Promise<any>;
  rename: (
    path: string,
    newParentPath: string,
    newName: string,
    ns?: string
  ) => Promise<any>;
  deleteMany: (paths: string[], ns?: string) => Promise<any>;
  writeFile: (filePath: string, content: any, ns?: string) => Promise<any>;
  readFile: (filePath: string, ns?: string) => Promise<any>;
};

export function createFolderApis(
  moduleId: string,
  ark_controller: any,
  context: any
): () => FolderIntegrationApi {
  return () => {
    return {
      createItem: (parentPath, name, type, meta, ns = 'default') => {
        return controller.create(ns, parentPath, name, type, meta);
      },
      createShortcut(sourcePath, destinationPath, itemName, ns = 'default') {
        return controller.createShortcut(
          ns,
          sourcePath,
          destinationPath,
          itemName
        );
      },
      update: (path, meta, security, ns = 'default') => {
        return controller.update(ns, path, meta, security);
      },
      rename(path, newParentPath, newName, ns = 'default') {
        return controller.rename(ns, path, newParentPath, newName);
      },
      deleteMany(paths, ns = 'default') {
        return controller.deleteMany(ns, paths);
      },
      writeFile(filePath, content, ns = 'default') {
        return controller.writeFile(ns, filePath, content);
      },
      readFile(filePath, ns = 'default') {
        return controller.readFile(ns, filePath);
      },
      useCataloguePath(id, path, opts) {
        const { autoFetch, useRedux, ns, depth } = React.useMemo(() => {
          const def = {
            autoFetch: true,
            useRedux: false,
            ns: 'default',
            depth: 0,
          };

          return Object.assign({}, def, opts || {});
        }, [opts]);

        const { use } = useArkReactServices();
        const { useStore } = use(Frontend);
        const [loaded, setLoaded] = useStore<boolean>(
          `use-catalogue-path-${id}-loaded`,
          false,
          useRedux === false
        );
        const [response, setResponse] = useStore<Response>(
          id,
          null,
          useRedux === false
        );

        React.useEffect(() => {
          if (autoFetch === true) {
            refresh();
          }
        }, [ns, path]);

        const refresh = React.useCallback(
          async (force = false) => {
            if (loaded === true && force === false) {
              return;
            }

            setLoaded(false);
            setResponse(null);

            return controller.fetch(ns, path, depth).then((res) => {
              setResponse(res);
              setLoaded(true);
            });
          },
          [ns, path, loaded, depth]
        );

        return {
          loaded,
          response,
          refresh,
        };
      },
    };
  };
}

export function useCatalogue(): CatalogueApi {
  return React.useContext(CatalogueContext);
}

type CatalogueService = {
  loaded: boolean;
  response: Response;
  refresh: (force?: boolean) => Promise<void>;
};

export function useCataloguePath(
  id: string,
  ns: string,
  path: string,
  autoFetch: boolean = true,
  useRedux: boolean = false
): CatalogueService {
  const { use } = useArkReactServices();
  const { useStore } = use(Frontend);
  const [loaded, setLoaded] = useStore<boolean>(
    `use-catalogue-path-${id}-loaded`,
    false,
    useRedux === false
  );
  const [response, setResponse] = useStore<Response>(
    id,
    null,
    useRedux === false
  );

  React.useEffect(() => {
    if (autoFetch === true) {
      refresh();
    }
  }, [ns, path]);

  const refresh = React.useCallback(
    async (force = false) => {
      if (loaded === true && force === false) {
        return;
      }

      setLoaded(false);
      setResponse(null);

      return controller.fetch(ns, path).then((res) => {
        setResponse(res);
        setLoaded(true);
      });
    },
    [ns, path, loaded]
  );

  return {
    loaded,
    response,
    refresh,
  };
}

export function Catalogue(props: PropType) {
  const api = createCatalogue(props);

  const Renderer = React.useMemo(() => {
    if (api?.ui?.Renderer) {
      return api?.ui?.Renderer;
    }

    return () => (
      <div>
        <em>Renderer not implemented in the interface</em>
      </div>
    );
  }, [api?.ui?.Renderer]);

  return (
    <CatalogueContext.Provider value={api}>
      <div
        data-testid={'test-ns'}
        className="ark__catalogue"
        style={props.style}
      >
        {api.dirLoading === false ? <Renderer /> : null}
      </div>
    </CatalogueContext.Provider>
  );
}

export function createFileEditor(): FileApi {
  const api = useCatalogue();
  const { use } = useArkReactServices();
  const { useContent } = use(Frontend);
  const [loading, setLoading] = React.useState(false);

  const defaultContent = React.useMemo(() => {
    if (api?.currentCustomType?.fileSchema) {
      return compile(api.currentCustomType.fileSchema);
    }

    return {};
  }, [api?.currentCustomType?.fileSchema]);

  const cms: ReturnType<ContentHook> = useContent({
    serviceId: api.path,
    defaultContent,
  }) as any;

  const saveChanges = React.useCallback(async () => {
    return api.namespace.writeFile(api.path, cms.content).then(() => {
      cms.markAsSaved();
    });
  }, [cms.content, api.namespace, api.path]);

  React.useEffect(() => {
    setLoading(true);
    api.namespace.readFile(api.path).then((res) => {
      cms.setContent(
        compile(api.currentCustomType.fileSchema, res?.meta?.content)
      );
      setLoading(false);
    });
  }, [api.namespace, api.path, api?.currentCustomType?.fileSchema]);

  return {
    cms,
    saveChanges,
    loading,
  };
}

const FileEditorContext = React.createContext<FileApi>(null);

export function useFile() {
  return React.useContext(FileEditorContext);
}

export function FileEditor(props: any) {
  const api = useCatalogue();
  const fileEditor = createFileEditor();
  const FileEditorWrapper = React.useMemo(() => {
    if (api?.ui?.FileEditorWrapper) {
      return api?.ui?.FileEditorWrapper;
    }

    return () => props.children;
  }, [api?.ui?.FileEditorWrapper, props.children]);

  return (
    <FileEditorContext.Provider value={fileEditor}>
      <FileEditorWrapper {...props} />
    </FileEditorContext.Provider>
  );
}

export function generateFileLink(
  filePath: string,
  mode: 'stream' | 'download' = 'stream',
  namespace: string = 'default'
) {
  return `/___service/main/powerserver___stream-file?namespace=${namespace}&filePath=${filePath}&attachment=${
    mode === 'download' ? 'true' : 'false'
  }`;
}

/* -------------------------------------------------------------------------- */
/*                                 Properties                                 */
/* -------------------------------------------------------------------------- */

const PropertiesEditorContext = React.createContext<PropertiesApi>(null);

const securitySchema = createSchema({
  permissions: [
    createSchema({
      type: '', // userId | groupId | public
      policy: '',
      userEmail: '',
      access: 'none', // none | read | write | owner
    }),
  ],
});

export function createPropertiesProvider(item: Item): PropertiesApi {
  const api = useCatalogue();
  const { use } = useArkReactServices();
  const { useContent } = use(Frontend);
  const [loading, setLoading] = React.useState(false);

  const defaultContent = React.useMemo(() => {
    const type = api.namespace.types[item.type];
    let meta: any = {};
    if (type?.propertiesSchema) {
      meta = compile(type.propertiesSchema, item.meta || {});
    }

    return {
      meta,
      security: compile(securitySchema, item?.security || {}),
    };
  }, [item, api.namespace]);

  const cms: ReturnType<ContentHook> = useContent<any>({
    serviceId: api.path,
    defaultContent,
  }) as any;

  const saveChanges = React.useCallback(async () => {
    setLoading(true);
    return api
      .updateItem(
        item.path,
        (cms.content as any).meta,
        (cms.content as any).security
      )
      .then((res) => {
        cms.markAsSaved();
        setLoading(false);
        return res;
      });
  }, [cms.content, api.namespace, item.path]);

  React.useEffect(() => {
    cms.setContent(defaultContent);
  }, [defaultContent]);

  return {
    cms,
    saveChanges,
    loading,
  };
}

export function useProperties() {
  return React.useContext(PropertiesEditorContext);
}

export function PropetriesProvider(props: { item: Item; children?: any }) {
  const propertiesApi = createPropertiesProvider(props.item);

  return (
    <PropertiesEditorContext.Provider value={propertiesApi}>
      {props.children}
    </PropertiesEditorContext.Provider>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 Item Picker                                */
/* -------------------------------------------------------------------------- */

type ItemPickerOptions = {
  initialPath?: string;
  namespace?: string;
};

type ItemPickerResult = {
  items: Array<Item>;
};

type ItemPickerAPI = {
  isPickerOpen: boolean;
  chooseItems: (opts?: ItemPickerOptions) => Promise<ItemPickerResult>;
  pickerOption: ItemPickerOptions;
  settle: (result: ItemPickerResult) => void;
  cancel: () => void;
};

const createItemPickerAPI = (): ItemPickerAPI => {
  const resolverRef = React.useRef<any>(null);
  const [pickerOption, setPickerOption] = React.useState<ItemPickerOptions>(
    null
  );

  const chooseItems = React.useCallback((opts?: ItemPickerOptions) => {
    return new Promise<ItemPickerResult>((resolve, reject) => {
      if (!opts) {
        opts = {};
      }

      if (!opts?.namespace) {
        opts.namespace = 'default';
      }

      if (!opts?.initialPath) {
        opts.initialPath = '/';
      }

      setPickerOption(opts);
      resolverRef.current = (result: ItemPickerResult) => {
        setPickerOption(null);
        resolve(result);
      };
    });
  }, []);

  const cancel = React.useCallback(() => {
    setPickerOption(null);
    resolverRef.current = null;
  }, []);

  const settle = React.useCallback(
    (result: ItemPickerResult) => {
      if (resolverRef.current) {
        resolverRef.current(result);
      }
    },
    [resolverRef.current]
  );

  const result = React.useMemo<ItemPickerAPI>(() => {
    const r: ItemPickerAPI = {
      chooseItems,
      isPickerOpen: Boolean(pickerOption),
      pickerOption,
      settle,
      cancel,
    };

    return r;
  }, [chooseItems, pickerOption, settle, cancel]);

  return result;
};

const CatalogueItemPickerContext = React.createContext<ItemPickerAPI>(null);

export function CatalogueItemPickerProvider(props: any) {
  const api = createItemPickerAPI();
  return (
    <CatalogueItemPickerContext.Provider value={api}>
      {props.children}
    </CatalogueItemPickerContext.Provider>
  );
}

export function useCatalogueItemPicker(): ItemPickerAPI {
  return React.useContext(CatalogueItemPickerContext);
}
