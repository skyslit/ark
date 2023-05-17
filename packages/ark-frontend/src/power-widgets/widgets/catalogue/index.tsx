import React from 'react';
import controller, {
  Item,
  Controller,
  ControllerNamespace,
  UIToolkit,
  Response,
} from '../../core/controller';
import { match } from 'path-to-regexp';

type Modes = 'read' | 'write';

type PropType = {
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
  path: string;
  setPath: (path: string) => void;
  namespace: ControllerNamespace;
  mode: Modes;
  currentDir: Item;
  dirLoading: boolean;
  items: Array<Item>;
  ui: UIToolkit;
  namespaceUI: UIToolkit;
};

const CatalogueContext = React.createContext<CatalogueApi>(null);

function createCatalogue(props: PropType): CatalogueApi {
  const { initialPath } = props;
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
      return namespace.create(path, name, type, meta || {}).then((res) => {
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
