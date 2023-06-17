import { ApplicationContext, ControllerContext } from '@skyslit/ark-core';
import {
  Data,
  DynamicsServerV2Config,
  defineService,
  useServiceCreator,
} from '../index';
import { Document, Schema, Connection } from 'mongoose';
import Joi from 'joi';
import path from 'path';
import {
  IDynamicsPermissionDataStore,
  PermissionResult,
  getItemPermission,
} from './utils/get-item-permission';
import { extractPaths } from './utils/get-item-permission';
import busboy from 'busboy';
import fs from 'fs';
import stream from 'stream';

type Item = {
  name: string;
  parentPath: string;
  path: string;
  type: string;
  resolved: boolean;
  meta: any;
  security: ItemSecurity;
  slug: string;
  isSymLink: boolean;
  destinationPath: string;
};

type ItemSecurity = {
  permissions: [];
};

type MetaSyncAutomator = (api: {
  file: any;
  updateMeta: (diff: any) => void;
}) => Promise<void> | void;
type DynamicsAutomator = MetaSyncAutomator;
type AutomatorEntry = {
  type: 'meta-sync';
  automator: DynamicsAutomator;
};

type AutomatorTypes = 'meta-sync';

export const Automators = {
  createMetaSyncAutomator: (automator: MetaSyncAutomator): AutomatorEntry => {
    return {
      type: 'meta-sync',
      automator,
    };
  },
};

export type FolderOperationsApi = {
  writeBinaryFile: (
    namespace: string,
    parentPath: string,
    name: string,
    type: string,
    file: stream.Readable,
    meta: any,
    binaryMeta: {
      encoding: string;
      mimeType: string;
    },
    security?: ItemSecurity
  ) => Promise<void>;
  automate: (
    namespace: string,
    type: string,
    automator: AutomatorTypes
  ) => Promise<any>;
  ensurePaths: (
    namespace: string,
    pathObjs: Array<Partial<Item>>
  ) => Promise<boolean>;
  defineAutomation: (
    namespace: string,
    type: string,
    automator: AutomatorEntry
  ) => void;
  fetchContent: (
    namespace: string,
    path: string,
    validateUserAccess: boolean,
    user?: any,
    maxDepth?: number,
    rootPermissionResult?: PermissionResult,
    aggregationStages?: any[]
  ) => Promise<{ currentDir: Item; items: Item[] }>;
  addItem: (
    namespace: string,
    parentPath: string,
    name: string,
    type: string,
    meta: any,
    security?: any,
    isSymLink?: boolean,
    destinationPath?: string,
    alreadyExistsErrorHandleStrategy?: 'throw' | 'supress' | 'resolve',
    ensurePath?: boolean
  ) => Promise<Item>;
  renameItem: (
    namespace: string,
    _path: string,
    newParentPath: string,
    newName: string
  ) => Promise<{
    newPath: string;
    newSlug: string;
    updatedItem: Item;
  }>;
  deleteOneItem: (
    namespace: string,
    path: string
  ) => Promise<{
    path: string;
  }>;
  createShortcut: (
    namespace: string,
    sourcePath: string,
    destinationPath: string,
    itemName: string
  ) => Promise<Item>;
  updateItemMeta: (namespace: string, path: string, meta: any) => Promise<any>;
  updateItemSecurity: (
    namespace: string,
    path: string,
    security: any
  ) => Promise<any>;
  readFile: (namespace: string, filePath: string) => Promise<any>;
  writeFile: (
    namespace: string,
    filePath: string,
    content: any
  ) => Promise<any>;
  getItemPermission: (
    ns: string,
    path: string,
    user: { emailAddress?: string; policies?: string[] }
  ) => Promise<PermissionResult>;
};

export function createDynamicsV2Services(
  context: ApplicationContext,
  controller: ControllerContext<any>,
  moduleId: string,
  conf: DynamicsServerV2Config
) {
  const { useVolume } = context.generatePointer(
    moduleId,
    controller,
    context,
    Data
  );
  const storageBucket = useVolume();

  if (!conf) {
    conf = {};
  }

  if (!conf.dbName) {
    conf.dbName = 'default';
  }

  const hasInitialized: boolean = context.getData<boolean>(
    moduleId,
    'power-server://hasInitialized',
    false
  );

  if (!hasInitialized) {
    context.setData<boolean>(moduleId, 'power-server://hasInitialized', true);

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
        "Looks like you're trying to enableDynamicsV2Services before the database is available, or have you actually configured the database connection?"
      );
    }

    const PowerWidgetNavItems = mongooseConnection.model<Document>(
      '__power_nav_items',
      new Schema({
        namespace: {
          type: String,
          required: true,
          index: true,
        },
        isSymLink: {
          type: Boolean,
          required: false,
          default: false,
        },
        destinationPath: {
          type: String,
          required: false,
          default: null,
        },
        parentPath: {
          type: String,
          index: true,
          required: true,
        },
        slug: {
          type: String,
          required: true,
        },
        name: {
          type: String,
        },
        path: {
          type: String,
        },
        type: {
          type: String,
        },
        meta: {
          type: Object,
        },
        binaryMeta: {
          type: Object,
          default: null,
          required: false,
        },
        security: {
          type: Object,
          default: {
            permissions: [],
          },
        },
      })
    );

    const permissionDataServer: IDynamicsPermissionDataStore = {
      async getItems(ns, paths) {
        const items = (await PowerWidgetNavItems.find({
          namespace: ns,
          path: {
            $in: paths,
          },
        })) as any[];

        return paths.reduce((acc, path) => {
          const item = items.find((item) => item.path === path);
          if (item) {
            acc.push(item);
          }
          return acc;
        }, []);
      },
    };

    const getFullFileCollectionName = (ns: string, collName: string) => {
      return `dyn_${ns}_${collName}`;
    };

    const populateItems = async (
      namespace: string,
      obj: {
        path: string;
        destinationPath: string;
        isSymLink: boolean;
        items: any[];
      },
      validateUserAccess: boolean,
      aggregationStages: any[],
      maxDepth: number = 0,
      depth: number = 0,
      user: any = undefined,
      rootPermissionResult: PermissionResult = undefined
    ) => {
      if (!obj) {
        return obj;
      }

      if (!Array.isArray(obj?.items)) {
        obj.items = [];
      }

      const itemPath = obj.isSymLink === true ? obj.destinationPath : obj.path;

      let canRead = false;

      if (!validateUserAccess) {
        canRead = true;
      } else {
        let permissionResult: PermissionResult = rootPermissionResult;

        if (!permissionResult) {
          permissionResult = await getItemPermission(
            namespace,
            itemPath,
            user,
            permissionDataServer
          );
        }

        canRead = permissionResult.claims.read === true;
      }

      if (canRead === false) {
        return obj;
      }

      if (depth > maxDepth) {
        return obj;
      }

      obj.items = (
        await PowerWidgetNavItems.aggregate(
          [
            {
              $match: {
                namespace,
                parentPath: itemPath,
              },
            },
            ...aggregationStages,
          ].filter(Boolean)
        )
      ).map((o) => {
        if (typeof o?.toObject === 'function') {
          return o.toObject();
        }

        return o;
      });

      let i: number;
      for (i = 0; i < obj.items.length; i++) {
        obj.items[i] = await populateItems(
          namespace,
          obj.items[i],
          validateUserAccess,
          aggregationStages,
          maxDepth,
          depth + 1,
          user
        );
      }

      return obj;
    };

    const fetchContent = async (
      namespace: string,
      path: string,
      validateUserAccess: boolean,
      user: any = undefined,
      maxDepth: number = 0,
      rootPermissionResult: PermissionResult = undefined,
      aggregationStages: any[] = []
    ) => {
      const res = {
        currentDir: null,
        items: [],
      };

      if (path === '/') {
        res.currentDir = {
          name: 'home',
          path: '/',
          parentPath: null,
          type: 'root',
          resolved: true,
          meta: {},
        };
      } else {
        res.currentDir = await PowerWidgetNavItems.findOne({
          namespace,
          path,
        });

        if (res?.currentDir && res?.currentDir?.toObject) {
          res.currentDir = res.currentDir.toObject();
        }
      }

      const root = await populateItems(
        namespace,
        res.currentDir,
        validateUserAccess,
        aggregationStages,
        maxDepth,
        0,
        user,
        rootPermissionResult
      );
      res.items = root?.items;

      return res;
    };

    const addItem = async (
      namespace: string,
      parentPath: string,
      name: string,
      type: string,
      meta: any,
      security: ItemSecurity = { permissions: [] },
      isSymLink: boolean = false,
      destinationPath: string = null,
      alreadyExistsErrorHandleStrategy:
        | 'throw'
        | 'supress'
        | 'resolve' = 'throw',
      ensurePath: boolean = true
    ) => {
      if (ensurePath === true) {
        const parents = extractPaths(parentPath);

        let i: number = 0;
        for (i = 0; i < parents.length; i++) {
          if (parents[i] === '/') {
            continue;
          }

          const name = parents[i].split('/').reverse()[0];

          await addItem(
            namespace,
            parents[i - 1],
            name,
            'folder',
            {},
            { permissions: [] },
            false,
            null,
            'supress',
            false
          );
        }
      }

      let slug: string = '';
      let nameUnique: boolean = false;
      let attempt: number = 1;
      while (nameUnique === false) {
        slug = encodeURIComponent(
          String(name)
            .replace(/\W+(?!$)/g, '-')
            .toLowerCase()
            .replace(/\W$/, '')
        );

        const exists = await PowerWidgetNavItems.findOne({
          namespace,
          parentPath,
          slug,
        });

        nameUnique = !Boolean(exists);

        if (!nameUnique) {
          if (alreadyExistsErrorHandleStrategy === 'throw') {
            throw new Error(
              `slug ${slug} already exists in parent path ${parentPath}`
            );
          } else if (alreadyExistsErrorHandleStrategy === 'resolve') {
            name = `(${attempt}) ${name}`;
            attempt++;
            continue;
          } else {
            // supress
            if (exists?.toObject) {
              return exists.toObject();
            } else {
              return exists;
            }
          }
        }
      }

      const item = new PowerWidgetNavItems({
        namespace,
        parentPath,
        name,
        type,
        meta,
        security,
        slug,
        isSymLink,
        destinationPath,
        path: path.posix.join(parentPath, slug),
      });

      await item.save();

      return item.toObject() as any;
    };

    const renameItem = async (
      namespace: string,
      _path: string,
      newParentPath: string,
      newName: string
    ) => {
      newParentPath = newParentPath || '/';

      const exists = (await PowerWidgetNavItems.findOne({
        namespace,
        path: _path,
      })) as any;

      if (!exists) {
        throw new Error('Item not found by path');
      }

      const needRename =
        newName !== exists.name || newParentPath !== exists.parentPath;

      const newSlug = needRename
        ? encodeURIComponent(
            String(newName)
              .replace(/\W+(?!$)/g, '-')
              .toLowerCase()
              .replace(/\W$/, '')
          )
        : exists.slug;

      const newPath = needRename
        ? path.posix.join(newParentPath, newSlug)
        : exists.path;

      if (needRename) {
        const newPathExists = (await PowerWidgetNavItems.findOne({
          namespace,
          path: newPath,
        })) as any;

        if (newPathExists) {
          throw new Error('Item with same name already exists in the folder');
        }

        /** Update path and slug */
        exists.parentPath = newParentPath;
        exists.path = newPath;
        exists.slug = newSlug;
        exists.name = newName;
        await exists.save();

        /** Update all child items */
        const allChildItems = (await PowerWidgetNavItems.find({
          namespace,
          parentPath: new RegExp(`^${_path}`),
        })) as any[];

        for (const item of allChildItems) {
          item.path = String(item.path).replace(_path, newPath);
          item.parentPath = String(item.parentPath).replace(_path, newPath);
          await item.save();
        }
      }

      return {
        newPath,
        newSlug,
        updatedItem: exists,
      };
    };

    const deleteOnePath = async (namespace: string, path: string) => {
      const allItemsToDelete = await PowerWidgetNavItems.find({
        namespace,
        parentPath: new RegExp(`^${path}`),
      });

      const itemToDelete = (await PowerWidgetNavItems.findOne({
        namespace,
        path,
      })) as any;

      const shortcuts = await PowerWidgetNavItems.find({
        namespace,
        destinationPath: new RegExp(`^${path}`),
        isSymLink: true,
      });

      const allItems = [...allItemsToDelete, ...shortcuts, itemToDelete];

      for (const item of allItems) {
        let shouldDeleteFile = Boolean(item?.meta?.fileCollectionName);
        let shouldDeleteBinaryFile = Boolean(item?.type === 'binary');

        if (item?.isSymLink === true) {
          shouldDeleteFile = false;
          shouldDeleteBinaryFile = false;
        }

        if (shouldDeleteFile) {
          const fileCollectionName = item?.meta?.fileCollectionName;
          const collName = getFullFileCollectionName(
            namespace,
            fileCollectionName
          );
          await mongooseConnection.db.collection(collName).deleteOne({
            _id: item._id,
          });
        }

        if (shouldDeleteBinaryFile) {
          await storageBucket.delete(
            require('path').join(namespace, String(item._id))
          );
        }

        await item.delete();
      }

      return {
        path,
      };
    };

    const createShortcut = async (
      namespace: string,
      sourcePath: string,
      destinationPath: string,
      itemName: string
    ) => {
      const sourceItem = (await PowerWidgetNavItems.findOne({
        namespace,
        path: sourcePath,
      })) as any;

      if (!sourceItem) {
        throw new Error(
          `Source not found '${sourcePath}' at ns '${namespace}'`
        );
      }
      return addItem(
        namespace,
        destinationPath,
        itemName,
        sourceItem.type,
        sourceItem.meta,
        undefined,
        true,
        sourceItem.path
      );
    };

    const updateItemMeta = async (
      namespace: string,
      path: string,
      meta: any
    ) => {
      const item = (await PowerWidgetNavItems.findOne({
        namespace,
        path,
      })) as any;

      if (!item) {
        return false;
      }

      /** Ignore shortcut */
      if (item.isSymLink === true) {
        return false;
      }

      const op = await PowerWidgetNavItems.updateOne(
        {
          namespace,
          path,
        },
        {
          $set: {
            meta,
          },
        }
      );

      /** Update all shortcuts */
      await PowerWidgetNavItems.updateMany(
        {
          namespace,
          destinationPath: path,
          isSymLink: true,
        },
        {
          $set: {
            meta,
          },
        }
      );

      return op;
    };

    const updateItemSecurity = async (
      namespace: string,
      path: string,
      security: any
    ) => {
      const item = (await PowerWidgetNavItems.findOne({
        namespace,
        path,
      })) as any;

      if (!item) {
        return false;
      }

      /** Ignore shortcut */
      if (item.isSymLink === true) {
        return false;
      }

      const op = await PowerWidgetNavItems.updateOne(
        {
          namespace,
          path,
        },
        {
          $set: {
            security,
          },
        }
      );

      return op;
    };

    const readFile = async (namespace: string, filePath: string) => {
      const item = (await PowerWidgetNavItems.findOne({
        namespace,
        path: filePath,
      }).exec()) as any;

      let content = null;

      if (item) {
        const fileCollectionName = item?.meta?.fileCollectionName || 'default';
        const collName = getFullFileCollectionName(
          namespace,
          fileCollectionName
        );

        content = await mongooseConnection.db.collection(collName).findOne({
          _id: item._id,
        });
      }

      return content;
    };

    const writeFile = async (
      namespace: string,
      filePath: string,
      content: any
    ) => {
      let item = (await PowerWidgetNavItems.findOne({
        namespace,
        path: filePath,
      }).exec()) as any;

      let writeOp = null;

      if (item) {
        if (item?.toObject) {
          item = item.toObject();
        }

        const fileCollectionName = item?.meta?.fileCollectionName || 'default';
        const collName = getFullFileCollectionName(
          namespace,
          fileCollectionName
        );

        delete content._id;

        writeOp = await mongooseConnection.db.collection(collName).updateOne(
          {
            _id: item._id,
          },
          {
            $set: content,
          },
          { upsert: true }
        );

        let newMeta = item.meta;

        await automate(namespace, item.type, 'meta-sync', {
          file: content,
          updateMeta: (diff: any) => {
            newMeta = Object.assign(newMeta, diff);
          },
        });

        await updateItemMeta(namespace, filePath, newMeta);
      }

      return writeOp;
    };

    const ensurePaths = async (
      namespace: string,
      pathObjs: Array<Partial<Item>>
    ) => {
      pathObjs = pathObjs.sort((a, b) => {
        if (a.parentPath > b.parentPath) {
          return 1;
        } else if (a.parentPath < b.parentPath) {
          return -1;
        } else {
          return 0;
        }
      });

      for (const path of pathObjs) {
        try {
          await addItem(
            namespace,
            path.parentPath,
            path.name,
            path.type,
            path.meta || {},
            path.security,
            path.isSymLink,
            path.destinationPath,
            'supress'
          );
        } catch (e) {
          throw e;
        }
      }

      return true;
    };

    /** Registry to store all automation functions */
    const backendAutomationRegistry: any = {};

    const defineAutomation = (
      namespace: string,
      type: string,
      automator: AutomatorEntry
    ) => {
      if (!backendAutomationRegistry[namespace]) {
        backendAutomationRegistry[namespace] = {};
      }

      if (!Array.isArray(backendAutomationRegistry[namespace][type])) {
        backendAutomationRegistry[namespace][type] = [];
      }

      backendAutomationRegistry[namespace][type].push(automator);
    };

    const automate = async (
      namespace: string,
      type: string,
      automatorType: AutomatorTypes,
      ...args: any[]
    ) => {
      const automators: AutomatorEntry[] = (() => {
        try {
          if (backendAutomationRegistry[namespace]) {
            if (Array.isArray(backendAutomationRegistry[namespace][type])) {
              return backendAutomationRegistry[namespace][type].filter(
                (automator) => automator.type === automatorType
              );
            }
          }
        } catch (e) {}

        return [];
      })();

      for (const automator of automators) {
        try {
          // @ts-ignore
          await Promise.resolve(automator.automator(...args));
        } catch (e) {
          console.error(e);
        }
      }
    };

    const writeBinaryFile = async (
      namespace: string,
      parentPath: string,
      name: string,
      type: string,
      file: stream.Readable,
      meta: any,
      binaryMeta: {
        encoding: string;
        mimeType: string;
      },
      security: ItemSecurity = { permissions: [] }
    ) => {
      let fileLengthInBytes: number = 0;

      const fileItem = await addItem(
        namespace,
        parentPath,
        name,
        type,
        meta,
        security,
        false,
        null,
        'resolve'
      );

      if (!fileItem) {
        throw new Error(`Error while creating binary file`);
      }

      file.on('data', (data) => {
        fileLengthInBytes = data.length;
      });

      file.on('close', async () => {
        const op = await PowerWidgetNavItems.updateOne(
          {
            namespace,
            path: fileItem.path,
          },
          {
            $set: {
              binaryMeta: {
                ...binaryMeta,
                fileLengthInBytes,
              },
            },
          }
        );
      });

      file.on('error', (err) => {
        throw err;
      });

      file.pipe(
        storageBucket.createWriteStream(
          path.join(namespace, String(fileItem._id))
        )
      );
    };

    const readBinaryFile = async (
      namespace: string,
      filePath: string
    ): Promise<{
      readable: stream.Readable;
      mimeType: string;
      encoding: string;
      fileName: string;
    }> => {
      const item: any = await PowerWidgetNavItems.findOne({
        namespace,
        path: filePath,
      });

      if (!item) {
        throw new Error(`Item not found`);
      }

      if (item?.type !== 'binary') {
        throw new Error('Only binary file can be read using this handler.');
      }

      return {
        readable: storageBucket.createReadStream(
          path.join(namespace, String(item._id))
        ),
        mimeType: (() => {
          if (item?.binaryMeta?.mimeType) {
            return item?.binaryMeta?.mimeType;
          }
          return null;
        })(),
        encoding: (() => {
          if (item?.binaryMeta?.encoding) {
            return item?.binaryMeta?.encoding;
          }
          return null;
        })(),
        fileName: (() => {
          if (item?.name) {
            return item?.name;
          }
          return null;
        })(),
      };
    };

    const folderOpApi: FolderOperationsApi = {
      writeBinaryFile,
      automate,
      ensurePaths,
      defineAutomation,
      fetchContent,
      addItem,
      renameItem,
      deleteOneItem: deleteOnePath,
      createShortcut,
      updateItemMeta,
      updateItemSecurity,
      readFile,
      writeFile,
      getItemPermission: (ns, path, user) =>
        getItemPermission(ns, path, user, permissionDataServer),
    };

    context.setData<FolderOperationsApi>(
      moduleId,
      'dynamics://folder-op-api',
      folderOpApi
    );

    /** Fetch content */
    useService(
      defineService('powerserver___fetch-content', (opts) => {
        opts.defineValidator(
          Joi.object({
            namespace: Joi.string().required(),
            path: Joi.string(),
            depth: Joi.number().optional(),
            aggregationStages: Joi.array().optional(),
          })
        );

        opts.defineLogic(async (opts) => {
          let { namespace, path, depth, aggregationStages } = opts.args.input;

          if (typeof depth !== 'number') {
            depth = 0;
          }

          const permissionResult = await getItemPermission(
            namespace,
            path,
            opts.args.user,
            permissionDataServer
          );

          if (permissionResult?.claims?.read !== true) {
            return opts.error(new Error('Unauthorized'), 401);
          }

          const res = {
            currentDir: null,
            items: [],
            claims: permissionResult.claims,
          };

          const fetchResponse = await fetchContent(
            namespace,
            path,
            true,
            opts.args.user,
            depth,
            permissionResult,
            aggregationStages
          );

          if (fetchResponse) {
            res.currentDir = fetchResponse.currentDir;
            res.items = fetchResponse.items;
          }

          return opts.success(res);
        });
      })
    );

    /** Add item */
    useService(
      defineService('powerserver___add-items', (opts) => {
        opts.defineValidator(
          Joi.object({
            namespace: Joi.string().required(),
            parentPath: Joi.string(),
            name: Joi.string(),
            meta: Joi.object(),
            type: Joi.string(),
          })
        );

        opts.defineLogic(async (opts) => {
          const { namespace, parentPath, name, type, meta } = opts.args.input;

          const permissionResult = await getItemPermission(
            namespace,
            parentPath,
            opts.args.user,
            permissionDataServer
          );

          if (permissionResult?.claims?.write !== true) {
            return opts.error(new Error('Unauthorized'), 401);
          }

          try {
            const item = await addItem(namespace, parentPath, name, type, meta);
            return opts.success({}, [item]);
          } catch (e) {
            return opts.error(e, 400);
          }
        });
      })
    );

    /** Add shortcut */
    useService(
      defineService('powerserver___add-shortcut', (opts) => {
        opts.defineValidator(
          Joi.object({
            namespace: Joi.string().required(),
            sourcePath: Joi.string(),
            destinationPath: Joi.string(),
            itemName: Joi.string(),
          })
        );

        opts.defineLogic(async (opts) => {
          const {
            namespace,
            sourcePath,
            destinationPath,
            itemName,
          } = opts.args.input;

          const permissionResult = await getItemPermission(
            namespace,
            destinationPath,
            opts.args.user,
            permissionDataServer
          );

          if (permissionResult?.claims?.write !== true) {
            return opts.error(new Error('Unauthorized'), 401);
          }

          try {
            const item = await createShortcut(
              namespace,
              sourcePath,
              destinationPath,
              itemName
            );
            return opts.success({}, [item]);
          } catch (e) {
            return opts.error(e, 400);
          }
        });
      })
    );

    /** Update item */
    useService(
      defineService('powerserver___update-item', (opts) => {
        opts.defineValidator(
          Joi.object({
            namespace: Joi.string().required(),
            path: Joi.string(),
            meta: Joi.object().optional(),
            security: Joi.object().optional(),
          })
        );

        opts.defineLogic(async (opts) => {
          const { namespace, path, meta, security } = opts.args.input;

          const permissionResult = await getItemPermission(
            namespace,
            path,
            opts.args.user,
            permissionDataServer
          );

          if (permissionResult?.claims?.write !== true) {
            return opts.error(new Error('Unauthorized'), 401);
          }

          const updateOp = await updateItemMeta(namespace, path, meta);
          let securityUpdateOp = null;

          /** Allow security update only for owner */
          if (permissionResult?.claims?.owner === true) {
            securityUpdateOp = await updateItemSecurity(
              namespace,
              path,
              security
            );
          }

          return opts.success({ ack: true, updateOp, securityUpdateOp }, []);
        });
      })
    );

    /** Remove items */
    useService(
      defineService('powerserver___remove-items', (opts) => {
        opts.defineValidator(
          Joi.object({
            namespace: Joi.string().required(),
            paths: Joi.array().min(1),
          })
        );

        opts.defineLogic(async (opts) => {
          const { namespace, paths } = opts.args.input;

          let responses: any[] = [];
          for (const path of paths) {
            try {
              const permissionResult = await getItemPermission(
                namespace,
                path,
                opts.args.user,
                permissionDataServer
              );

              if (permissionResult?.claims?.owner !== true) {
                return opts.error(new Error('Unauthorized'), 401);
              }

              responses.push(await deleteOnePath(namespace, path));
            } catch (e) {
              console.error(e);
            }
          }

          return opts.success({ ack: true, namespace }, responses);
        });
      })
    );

    /** Rename item */
    useService(
      defineService('powerserver___rename-item', (opts) => {
        opts.defineValidator(
          Joi.object({
            namespace: Joi.string().required(),
            path: Joi.string().required(),
            newParentPath: Joi.string().optional().allow(null),
            newName: Joi.string().required(),
          })
        );

        opts.defineLogic(async (opts) => {
          const {
            namespace,
            path: _path,
            newParentPath,
            newName,
          } = opts.args.input;
          try {
            const permissionResult = await getItemPermission(
              namespace,
              _path,
              opts.args.user,
              permissionDataServer
            );

            if (permissionResult?.claims?.write !== true) {
              return opts.error(new Error('Unauthorized'), 401);
            }

            const res = await renameItem(
              namespace,
              _path,
              newParentPath,
              newName
            );
            return opts.success({ ack: true, ...res }, []);
          } catch (e) {
            return opts.error(e, 400);
          }
        });
      })
    );

    /** Read file */
    useService(
      defineService('powerserver___read-file', (opts) => {
        opts.defineValidator(
          Joi.object({
            namespace: Joi.string().required(),
            filePath: Joi.string().required(),
          })
        );

        opts.defineLogic(async (opts) => {
          const { namespace, filePath } = opts.args.input;

          const permissionResult = await getItemPermission(
            namespace,
            filePath,
            opts.args.user,
            permissionDataServer
          );

          if (permissionResult?.claims?.read !== true) {
            return opts.error(new Error('Unauthorized'), 401);
          }

          let content = await readFile(namespace, filePath);

          return opts.success(
            { ack: true, namespace, content: content || {} },
            []
          );
        });
      })
    );

    /** Write file */
    useService(
      defineService('powerserver___write-file', (opts) => {
        opts.defineValidator(
          Joi.object({
            namespace: Joi.string().required(),
            filePath: Joi.string().required(),
            content: Joi.any().required(),
          })
        );

        opts.defineLogic(async (opts) => {
          const { namespace, filePath, content } = opts.args.input;

          const permissionResult = await getItemPermission(
            namespace,
            filePath,
            opts.args.user,
            permissionDataServer
          );

          if (permissionResult?.claims?.write !== true) {
            return opts.error(new Error('Unauthorized'), 401);
          }

          const writeOp = await writeFile(namespace, filePath, content);
          return opts.success({ ack: true, namespace, writeOp }, []);
        });
      })
    );

    /** Upload files */
    useService(
      defineService('powerserver___upload-files', (opts) => {
        opts.defineValidator(
          Joi.object({
            namespace: Joi.string().required(),
            parentPath: Joi.string().required(),
          })
        );

        opts.defineLogic(async (opts) => {
          const { namespace, parentPath } = opts.args.input;

          const permissionResult = await getItemPermission(
            namespace,
            parentPath,
            opts.args.user,
            permissionDataServer
          );

          if (permissionResult?.claims?.write !== true) {
            return opts.error(new Error('Unauthorized'), 401);
          }

          const stream = busboy({ headers: opts.args.req.headers, limits: {} });
          stream.on('file', (name, file, info) => {
            const { filename, encoding, mimeType } = info;

            writeBinaryFile(
              namespace,
              parentPath,
              filename,
              'binary',
              file,
              {},
              {
                encoding,
                mimeType,
              }
            ).catch((err) => {
              stream.destroy(err);
            });
          });
          stream.on('field', (name, val, info) => {});
          stream.on('finish', () => {
            opts.args.res.json({ ack: true });
          });
          stream.on('error', (err: any) => {
            opts.args.res
              .status(400)
              .json({ message: err?.message || 'Upload failed' });
          });

          opts.args.req.pipe(stream);
        });
      })
    );

    /** Download file */
    useService(
      defineService('powerserver___stream-file', (opts) => {
        opts.defineValidator(
          Joi.object({
            namespace: Joi.string().required(),
            filePath: Joi.string().required(),
            attachment: Joi.string().optional(),
          })
        );

        opts.defineLogic(async (opts) => {
          const { namespace, filePath, attachment } = opts.args.input;

          const isAttachment = String(attachment) === 'true';

          const permissionResult = await getItemPermission(
            namespace,
            filePath,
            opts.args.user,
            permissionDataServer
          );

          if (permissionResult?.claims?.read !== true) {
            return opts.error(new Error('Unauthorized'), 401);
          }

          try {
            const result = await readBinaryFile(namespace, filePath);

            if (result.mimeType) {
              opts.args.res.setHeader('Content-Type', result.mimeType);
            }

            if (result.encoding) {
              opts.args.res.setHeader('Content-Encoding', result.encoding);
            }

            if (isAttachment === true) {
              if (result.fileName) {
                opts.args.res.setHeader(
                  'Content-Disposition',
                  `attachment; filename="${result.fileName}"`
                );
              }
            }

            result.readable.pipe(opts.args.res);
          } catch (e) {
            return opts.error({ message: e.message }, 400);
          }
        });
      }),
      {
        method: 'get',
      }
    );
  }
}
