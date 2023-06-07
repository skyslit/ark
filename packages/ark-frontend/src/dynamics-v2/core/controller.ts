import axios from 'axios';

export type Item = {
  name: string;
  parentPath: string;
  path: string;
  type: string;
  resolved: boolean;
  meta: any;
  security: any;
  slug: string;
  isSymLink: boolean;
  destinationPath: string;
};

export type Response = {
  currentDir: Item;
  items: Item[];
  claims: any;
};

export type CustomType = {
  id?: string;
  name: string;
  newItemLabel?: string;
  icon?: (...props: any[]) => JSX.Element;
  metaEditor?: (...props: any[]) => JSX.Element;
  toolkit?: Partial<UIToolkit>;
  fileSchema?: any;
  propertiesSchema?: any;
  fileCollectionName?: any;
  allowedChildCustomTypes?: string[];
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

  async createShortcut(
    sourcePath: string,
    destinationPath: string,
    itemName: string
  ) {
    return this.controller.createShortcut(
      this.name,
      sourcePath,
      destinationPath,
      itemName
    );
  }

  update(path: string, meta: any, security: any) {
    return this.controller.update(this.name, path, meta, security);
  }

  rename(path: string, newParentPath: string, newName: string) {
    return this.controller.rename(this.name, path, newParentPath, newName);
  }

  deleteMany(paths: string[]) {
    return this.controller.deleteMany(this.name, paths);
  }

  writeFile(filePath: string, content: any) {
    return this.controller.writeFile(this.name, filePath, content);
  }

  readFile(filePath: string) {
    return this.controller.readFile(this.name, filePath);
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
  FileEditorWrapper: (props: any) => JSX.Element;
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

  async fetch(ns: string, path: string, depth: number = 0): Promise<Response> {
    const res = await axios.post(
      '/___service/main/powerserver___fetch-content',
      {
        namespace: ns,
        path,
        depth,
      }
    );

    return res.data.meta;
  }

  async createShortcut(
    ns: string,
    sourcePath: string,
    destinationPath: string,
    itemName: string
  ) {
    const res = await axios.post(
      '/___service/main/powerserver___add-shortcut',
      {
        namespace: ns,
        sourcePath,
        destinationPath,
        itemName,
      }
    );

    return res.data;
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

  async update(ns: string, path: string, meta: any, security: any) {
    const res = await axios.post('/___service/main/powerserver___update-item', {
      namespace: ns,
      path,
      meta,
      security,
    });

    return res.data;
  }

  async rename(
    ns: string,
    path: string,
    newParentPath: string,
    newName: string
  ) {
    const res = await axios.post('/___service/main/powerserver___rename-item', {
      namespace: ns,
      path,
      newParentPath,
      newName,
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

  async writeFile(ns: string, filePath: string, content: any) {
    const res = await axios.post('/___service/main/powerserver___write-file', {
      namespace: ns,
      filePath,
      content,
    });

    return res.data;
  }

  async readFile(ns: string, filePath: string): Promise<any> {
    const res = await axios.post('/___service/main/powerserver___read-file', {
      namespace: ns,
      filePath,
    });

    return res.data;
  }
}

export default Controller.getInstance();
