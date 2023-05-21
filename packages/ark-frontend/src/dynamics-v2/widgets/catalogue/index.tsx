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
import { compile } from '../../utils/schema';
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
};

type CatalogueApi = {
  createItem: (name: string, type: string, payload?: any) => Promise<any>;
  deleteItems: (paths: string[]) => Promise<void>;
  renameItem: (path: string, newName: string) => Promise<any>;
  updateItem: (path: string, meta: any, security: any) => Promise<any>;
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
  getFullUrlFromPath: (val: string) => string;
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

  const prevPathRef = React.useRef<string>(initialPath || '/');
  const [controlledPath, setControlledPath] = React.useState<string>(
    prevPathRef.current
  );
  const [dirLoading, setDirLoading] = React.useState(true);
  const [items, setItems] = React.useState<Array<Item>>([]);

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
          items.filter((item) => {
            const shouldRemove = paths.indexOf(item.path);
            return shouldRemove;
          })
        );
        return res;
      });
    },
    [namespace]
  );

  const renameItem = React.useCallback(
    async (path: string, newName: string) => {
      return namespace.rename(path, newName).then((r) => {
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

  React.useEffect(() => {
    prevPathRef.current = path;
    setDirLoading(true);
    setCurrentDir(null);
    setItems([]);

    if (namespace) {
      namespace
        .fetch(path)
        .then((res) => {
          if (res.currentDir && res.items) {
            setDirLoading(false);
            setCurrentDir(res.currentDir);
            setItems(res.items);
          }
        })
        .catch((err) => console.error(err));
    }
    namespace;
  }, [path, namespace]);

  const bufferred_dirLoading = React.useMemo(() => {
    if (path !== prevPathRef.current) {
      return true;
    }
    return dirLoading;
  }, [dirLoading, path]);

  return {
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
  ns: string,
  path: string,
  autoFetch: boolean = true
): CatalogueService {
  const [loaded, setLoaded] = React.useState<boolean>(false);
  const [response, setResponse] = React.useState<Response>(null);

  React.useEffect(() => {
    setLoaded(false);
    setResponse(null);

    if (autoFetch === true) {
      refresh();
    }
  }, [ns, path]);

  const refresh = React.useCallback(
    async (f = false) => {
      return controller.fetch(ns, path).then((res) => {
        setResponse(res);
        setLoaded(true);
      });
    },
    [ns, path]
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
      <div data-testid={'test-ns'} className="ark__catalogue">
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

/* -------------------------------------------------------------------------- */
/*                                 Properties                                 */
/* -------------------------------------------------------------------------- */

const PropertiesEditorContext = React.createContext<PropertiesApi>(null);

export function createPropertiesProvider(): PropertiesApi {
  const api = useCatalogue();
  const { use } = useArkReactServices();
  const { useContent } = use(Frontend);
  const [loading, setLoading] = React.useState(false);

  const defaultContent = React.useMemo(() => {
    if (api?.currentCustomType?.fileSchema) {
      return compile(api.currentCustomType.fileSchema);
    }

    return {
      meta: {},
      security: {},
    };
  }, [api?.currentCustomType?.fileSchema]);

  const cms: ReturnType<ContentHook> = useContent({
    serviceId: api.path,
    defaultContent,
  }) as any;

  const saveChanges = React.useCallback(async () => {
    setLoading(true);
    return api.namespace.writeFile(api.path, cms.content).then(() => {
      cms.markAsSaved();
      setLoading(false);
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

export function useProperties() {
  return React.useContext(PropertiesEditorContext);
}

export function PropetriesProvider(props: any) {
  const propertiesApi = createPropertiesProvider();

  return (
    <PropertiesEditorContext.Provider value={propertiesApi}>
      {props.children}
    </PropertiesEditorContext.Provider>
  );
}
