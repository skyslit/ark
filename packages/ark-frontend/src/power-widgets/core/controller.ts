import axios from 'axios';

export type Item = {
  name: string;
  parentPath: string;
  path: string;
  type: string;
  resolved: boolean;
  meta: any;
  slug: string;
};

export type Response = {
  currentDir: Item;
  items: Item[];
};

export type CustomType = {
  id?: string;
  name: string;
  newItemLabel?: string;
  icon?: (...props: any[]) => JSX.Element;
  toolkit?: Partial<UIToolkit>;
};

export class ControllerNamespace {
  controller: Controller;
  name: string;
  ui: UIToolkit;
  types: {
    [key: string]: CustomType;
  };

  typesArray: Array<CustomType>;

  fetch(path: string): Promise<Response> {
    return this.controller.fetch(this.name, path);
  }

  create(parentPath: string, name: string, type: string, meta: any) {
    return this.controller.create(this.name, parentPath, name, type, meta);
  }

  deleteMany(paths: string[]) {
    return this.controller.deleteMany(this.name, paths);
  }

  defineType(type: string, customType: CustomType) {
    const typeAlreadyDefined = Boolean(this.types[type]);
    if (typeAlreadyDefined) {
      throw new Error(
        `Type '${type}' already defined in namespace ${this.name}`
      );
    }

    customType.id = type;

    if (!customType.newItemLabel) {
      customType.newItemLabel = `New ${customType.name}`;
    }

    this.types[type] = customType;
    this.typesArray = Object.keys(this.types).map((t) => this.types[t]);
  }

  constructor(n: string, controller: Controller) {
    this.name = n;
    this.controller = controller;
    this.types = {};
    this.typesArray = [];

    this.defineType('folder', {
      name: 'Folder',
    });
  }
}

export interface UIToolkit {
  Renderer: () => JSX.Element;
  ItemGrid: () => JSX.Element;
}

export class Controller {
  static instance: Controller;
  static getInstance(): Controller {
    if (!Controller.instance) {
      Controller.instance = new Controller();
    }

    return Controller.instance;
  }

  namespaces: {
    [key: string]: ControllerNamespace;
  } = {};

  async fetch(ns: string, path: string): Promise<Response> {
    const res = await axios.post(
      '/___service/main/powerserver___fetch-content',
      {
        namespace: ns,
        path,
      }
    );

    return res.data.meta;
  }

  async create(
    ns: string,
    parentPath: string,
    name: string,
    type: string,
    meta: any
  ) {
    const res = await axios.post('/___service/main/powerserver___add-items', {
      namespace: ns,
      parentPath,
      name,
      type,
      meta,
    });

    return res.data;
  }

  async deleteMany(ns: string, paths: string[]) {
    const res = await axios.post(
      '/___service/main/powerserver___remove-items',
      {
        namespace: ns,
        paths,
      }
    );

    return res.data;
  }

  getNamespace(ns: string) {
    if (!this.namespaces[ns]) {
      this.namespaces[ns] = new ControllerNamespace(ns, this);
    }

    return this.namespaces[ns];
  }

  registerUI(ns: string, ui: UIToolkit) {
    const _ns = this.getNamespace(ns);
    _ns.ui = ui;
  }

  defineType(type: string, customType: CustomType, ns: string = 'default') {
    const _ns = this.getNamespace(ns);
    _ns.defineType(type, customType);
  }
}

export default Controller.getInstance();
