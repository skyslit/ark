import React from 'react';
import { Item, Controller, ControllerNamespace } from '../../core/controller';

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
  path: string;
  setPath: (path: string) => void;
  namespace: ControllerNamespace;
  mode: Modes;
  currentDir: Item;
  dirLoading: boolean;
  items: Array<Item>;
};

const CatalogueContext = React.createContext<CatalogueApi>(null);

function createCatalogue(props: PropType): CatalogueApi {
  const { initialPath } = props;
  const [controlledPath, setControlledPath] = React.useState<string>(
    initialPath || '/'
  );
  const [dirLoading, setDirLoading] = React.useState(false);
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
  }, [isControlledComponent]);

  const [currentDir, setCurrentDir] = React.useState<Item>(null);

  const setPath = React.useCallback(
    (path: string) => {
      props.onPathChange(path);
      if (isControlledComponent === false) {
        setControlledPath(path);
      }
    },
    [isControlledComponent, props.onPathChange]
  );

  React.useEffect(() => {
    if (namespace) {
      setDirLoading(true);
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

  return {
    path,
    setPath,
    namespace,
    mode,
    currentDir,
    dirLoading,
    items,
  };
}

export function useCatalogue(): CatalogueApi {
  return React.useContext(CatalogueContext);
}

export function Catalogue(props: PropType) {
  const api = createCatalogue(props);

  return (
    <CatalogueContext.Provider value={api}>
      <div data-testid={'test-ns'} className="ark__catalogue">
        {JSON.stringify(api.currentDir)}
      </div>
    </CatalogueContext.Provider>
  );
}
