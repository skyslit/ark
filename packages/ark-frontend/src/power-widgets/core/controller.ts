export type Item = {
  path: string;
  type: string;
  resolved: boolean;
  meta: any;
};

type Response = {
  currentDir: Item;
  items: Item[];
};

export class ControllerNamespace {
  controller: Controller;
  name: string;

  fetch(path: string): Promise<Response> {
    return this.controller.fetch(this.name, path);
  }

  constructor(n: string, controller: Controller) {
    this.name = n;
    this.controller = controller;
  }
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
    return {
      currentDir: {
        path,
        type: 'root',
        resolved: true,
        meta: {},
      },
      items: [],
    };
  }

  getNamespace(ns: string) {
    if (!this.namespaces[ns]) {
      this.namespaces[ns] = new ControllerNamespace(ns, this);
    }

    return this.namespaces[ns];
  }
}

export default Controller.getInstance();
