import { ApplicationContext } from '@skyslit/ark-core';
import {
  DynamicsServerV2Config,
  defineService,
  useServiceCreator,
} from '../index';
import { Document, Schema, Connection } from 'mongoose';
import Joi from 'joi';
import path from 'path';
import {
  IDynamicsPermissionDataStore,
  getItemPermission,
} from './utils/get-item-permission';

export function createDynamicsV2Services(
  context: ApplicationContext,
  moduleId: string,
  conf: DynamicsServerV2Config
) {
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

        if (item?.isSymLink === true) {
          shouldDeleteFile = false;
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

        await item.delete();
      }

      return {
        path,
      };
    };

    const addItem = async (
      namespace: string,
      parentPath: string,
      name: string,
      type: string,
      meta: any,
      isSymLink: boolean = false,
      destinationPath: string = null
    ) => {
      const slug = encodeURIComponent(
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

      if (Boolean(exists)) {
        throw new Error(
          `slug ${slug} already exists in parent path ${parentPath}`
        );
      }

      const item = new PowerWidgetNavItems({
        namespace,
        parentPath,
        name,
        type,
        meta,
        slug,
        isSymLink,
        destinationPath,
        path: path.posix.join(parentPath, slug),
      });

      await item.save();

      return item;
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
      const item = (await PowerWidgetNavItems.findOne({
        namespace,
        path: filePath,
      }).exec()) as any;

      let writeOp = null;

      if (item) {
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
      }

      return writeOp;
    };

    /** Fetch content */
    useService(
      defineService('powerserver___fetch-content', (opts) => {
        opts.defineValidator(
          Joi.object({
            namespace: Joi.string().required(),
            path: Joi.string(),
          })
        );

        opts.defineLogic(async (opts) => {
          const { namespace, path } = opts.args.input;

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
          }

          res.items = await PowerWidgetNavItems.find({
            namespace,
            parentPath: path,
          });

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
  }
}
