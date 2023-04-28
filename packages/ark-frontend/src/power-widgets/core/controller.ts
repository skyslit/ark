import axios from 'axios';

export type Item = {
  name: string;
  parentPath: string;
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
    const res = await axios.post(
      '/___service/main/powerserver___fetch-content',
      {
        namespace: ns,
        path,
      }
    );
    console.log('res', res.data);

    return res.data.meta;
    // switch (path) {
    //   case '/product 1': {
    //     return {
    //       currentDir: {
    //         name: 'product 1',
    //         parentPath: '/',
    //         path: '/product 1',
    //         meta: {},
    //         resolved: true,
    //         type: 'dir'
    //       },
    //       items: [
    //         {
    //           name: 'option 1',
    //           parentPath: '/product 1',
    //           path: '/product 1/option 1',
    //           meta: {},
    //           resolved: true,
    //           type: 'dir'
    //         }
    //       ],
    //     }
    //   }
    //   default: {
    //     return {
    //       currentDir: {
    //         name: 'home',
    //         path,
    //         parentPath: null,
    //         type: 'root',
    //         resolved: true,
    //         meta: {},
    //       },
    //       items: [
    //         {
    //           name: 'product 1',
    //           parentPath: '/',
    //           path: '/product 1',
    //           meta: {},
    //           resolved: true,
    //           type: 'dir'
    //         }
    //       ],
    //     };
    //   }
    // }
  }

  getNamespace(ns: string) {
    if (!this.namespaces[ns]) {
      this.namespaces[ns] = new ControllerNamespace(ns, this);
    }

    return this.namespaces[ns];
  }
}

export default Controller.getInstance();
