import { ApplicationContext } from '@skyslit/ark-core';
import {
  DynamicsServerV2Config,
  defineService,
  useServiceCreator,
} from './index';
import { Document, Schema, Connection } from 'mongoose';
import Joi from 'joi';
import path from 'path';

export function createDynamicsV2Services(
  context: ApplicationContext,
  moduleId: string,
  conf: DynamicsServerV2Config
) {
  if (!conf) {
    conf = {};
  }

  if (!conf.fetchContentServiceId) {
    conf.fetchContentServiceId = 'powerserver___fetch-content';
  }

  if (!conf.addItemServiceId) {
    conf.addItemServiceId = 'powerserver___add-items';
  }

  if (!conf.updateItemsServiceId) {
    conf.updateItemsServiceId = 'powerserver___update-items';
  }

  if (!conf.removeItemsServiceId) {
    conf.removeItemsServiceId = 'powerserver___remove-items';
  }

  if (!conf.fetchContentRule) {
    conf.fetchContentRule = (options) => options.allow();
  }

  if (!conf.addItemRule) {
    conf.addItemRule = (options) => options.allow();
  }

  if (!conf.updateItemsRule) {
    conf.updateItemsRule = (options) => options.allow();
  }

  if (!conf.removeItemsRule) {
    conf.removeItemsRule = (options) => options.allow();
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
      })
    );

    /** Fetch content */
    useService(
      defineService(conf.fetchContentServiceId, (opts) => {
        opts.defineValidator(
          Joi.object({
            namespace: Joi.string().required(),
            path: Joi.string(),
          })
        );

        opts.defineRule(conf.fetchContentRule);

        opts.defineLogic(async (opts) => {
          const { namespace, path } = opts.args.input;
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
      defineService(conf.addItemServiceId, (opts) => {
        opts.defineValidator(
          Joi.object({
            namespace: Joi.string().required(),
            parentPath: Joi.string(),
            name: Joi.string(),
            meta: Joi.object(),
            type: Joi.string(),
          })
        );

        opts.defineRule(conf.addItemRule);

        opts.defineLogic(async (opts) => {
          const { namespace, parentPath, name, type, meta } = opts.args.input;

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
            return opts.error(
              new Error(
                `slug ${slug} already exists in parent path ${parentPath}`
              ),
              400
            );
          }

          const item = new PowerWidgetNavItems({
            namespace,
            parentPath,
            name,
            type,
            meta,
            slug,
            path: path.join(parentPath, slug),
          });

          await item.save();

          return opts.success({}, [item]);
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

          await PowerWidgetNavItems.updateOne(
            {
              namespace,
              path,
            },
            {
              $set: {
                meta,
                security,
              },
            }
          );

          return opts.success({ ack: true }, []);
        });
      })
    );

    const getFullFileCollectionName = (ns: string, collName: string) => {
      return `dyn_${ns}_${collName}`;
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

      const allItems = [...allItemsToDelete, itemToDelete];

      for (const item of allItems) {
        const shouldDeleteFile = Boolean(item?.meta?.fileCollectionName);
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

    /** Remove items */
    useService(
      defineService(conf.removeItemsServiceId, (opts) => {
        opts.defineValidator(
          Joi.object({
            namespace: Joi.string().required(),
            paths: Joi.array().min(1),
          })
        );

        opts.defineRule(conf.removeItemsRule);

        opts.defineLogic(async (opts) => {
          const { namespace, paths } = opts.args.input;

          let responses: any[] = [];
          for (const path of paths) {
            try {
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
            newName: Joi.string().required(),
          })
        );

        opts.defineLogic(async (opts) => {
          const { namespace, path: _path, newName } = opts.args.input;

          const exists = (await PowerWidgetNavItems.findOne({
            namespace,
            path: _path,
          })) as any;

          if (!exists) {
            return opts.error(new Error('Item not found by path'), 404);
          }

          const needRename = newName !== exists.name;

          const newSlug = needRename
            ? encodeURIComponent(
                String(newName)
                  .replace(/\W+(?!$)/g, '-')
                  .toLowerCase()
                  .replace(/\W$/, '')
              )
            : exists.slug;

          const newPath = needRename
            ? path.join(exists.parentPath, newSlug)
            : exists.path;

          if (needRename) {
            const newPathExists = (await PowerWidgetNavItems.findOne({
              namespace,
              path: newPath,
            })) as any;

            if (newPathExists) {
              return opts.error(
                new Error('Item with same name already exists in the folder'),
                404
              );
            }

            /** Update path and slug */
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

          return opts.success({ ack: true, newPath, newSlug }, []);
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

          const item = (await PowerWidgetNavItems.findOne({
            namespace,
            path: filePath,
          }).exec()) as any;

          let content = null;

          if (item) {
            const fileCollectionName =
              item?.meta?.fileCollectionName || 'default';
            const collName = getFullFileCollectionName(
              namespace,
              fileCollectionName
            );

            content = await mongooseConnection.db.collection(collName).findOne({
              _id: item._id,
            });
          }

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

          const item = (await PowerWidgetNavItems.findOne({
            namespace,
            path: filePath,
          }).exec()) as any;

          let writeOp = null;

          if (item) {
            const fileCollectionName =
              item?.meta?.fileCollectionName || 'default';
            const collName = getFullFileCollectionName(
              namespace,
              fileCollectionName
            );

            delete content._id;

            writeOp = await mongooseConnection.db
              .collection(collName)
              .updateOne(
                {
                  _id: item._id,
                },
                {
                  $set: content,
                },
                { upsert: true }
              );
          }

          return opts.success({ ack: true, namespace, writeOp }, []);
        });
      })
    );
  }
}
