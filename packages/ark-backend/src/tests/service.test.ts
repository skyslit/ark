import {
  defineService,
  runService,
  shouldAllow,
  shouldDeny,
  ServiceController,
} from '../index';
import Joi from 'joi';

describe('ServiceController', () => {
  const controller = new ServiceController();
  const CreateProject = defineService('CreateProject', (options) => {
    options.defineLogic((opts) => {
      return opts.success(
        {
          message: 'created',
        },
        {
          _id: 'p-200',
          name: 'Cash Balance Monitoring',
        }
      );
    });

    options.defineCapabilities((opts) => {
      opts.attachLinks(opts.result.meta, [
        opts.createLink('self', 'GetProject'),
        opts.createLink('delete', 'DeleteProject'),
        opts.createLink('update-owner', 'UpdateProjectOwner', {
          path: '/custom/path',
          method: 'put',
        }),
        opts.createLink('update', 'UpdateProjectById', {
          input: {
            projectId: opts.result.data._id,
          },
        }),
      ]);
    });
  });

  const GetAllProjects = defineService('GetAllProjects', (options) => {
    options.defineLogic((opts) => {
      return opts.success(
        {
          totalItems: 20,
          pageSize: 5,
        },
        [
          {
            _id: 'p-200',
            name: 'Cash Balance Monitoring',
          },
          {
            _id: 'p-100',
            name: 'Accounts Payable',
          },
        ]
      );
    });
  });

  const GetProject = defineService('GetProject', (options) => {
    options.defineLogic((opts) => {
      return opts.success(
        {},
        {
          _id: 'p-100',
          name: 'Accounts Payable',
        }
      );
    });
  });

  const UpdateProjectOwner = defineService('UpdateProjectOwner', (options) => {
    options.defineLogic((opts) => {
      return opts.success({ success: true });
    });
  });

  const UpdateProjectById = defineService('UpdateProjectById', (options) => {
    options.definePre('project', (args) => {
      if (args.input.projectId === 'p-200') {
        return {
          _id: 'p-200',
          name: 'Accounts Payable',
          userId: 'u-100',
        };
      }

      return null;
    });

    options.defineRule((opts) => {
      try {
        if (opts.args.input.project) {
          if (opts.args.input.project.userId === opts.args.user._id) {
            opts.allowPolicy('ProjectWrite');
          }
        }
      } catch (e) {
        // Do nothing
      }
    });

    options.defineLogic((opts) => {
      return opts.success({
        message: 'updated',
      });
    });
  });

  const DeleteProject = defineService('DeleteProject', (options) => {
    options.defineRule((opts) => {
      opts.allowPolicy('ProjectDelete');
    });
    options.defineLogic((opts) => {
      return opts.success({
        message: 'deleted',
      });
    });
  });

  controller.register({
    def: CreateProject,
    alias: 'service',
    method: 'post',
    path: `/__services/${CreateProject.name}`,
    policyExtractorRefs: [],
  });

  controller.register({
    def: GetAllProjects,
    alias: 'service',
    method: 'post',
    path: `/__services/${GetAllProjects.name}`,
    policyExtractorRefs: [],
  });

  controller.register({
    def: GetProject,
    alias: 'service',
    method: 'post',
    path: `/__services/${GetProject.name}`,
    policyExtractorRefs: [],
  });

  controller.register({
    def: UpdateProjectOwner,
    alias: 'service',
    method: 'post',
    path: `/__services/${UpdateProjectOwner.name}/:projectId`,
    policyExtractorRefs: [],
  });

  controller.register({
    def: UpdateProjectById,
    alias: 'service',
    method: 'post',
    path: `/__services/${UpdateProjectById.name}/:projectId`,
    policyExtractorRefs: [],
  });

  controller.register({
    def: DeleteProject,
    alias: 'service',
    method: 'post',
    path: `/__services/${DeleteProject.name}`,
    policyExtractorRefs: [],
  });

  test('user without delete policy should not see delete link', async () => {
    const output = await runService(
      CreateProject,
      {
        policies: [],
      },
      {
        aliasMode: 'service',
        controller,
      }
    );

    expect(
      output.result.meta.links.filter((l: any) => l.rel === 'delete')
    ).toHaveLength(0);
  });

  test('user with delete policy should see delete link', async () => {
    const output = await runService(
      CreateProject,
      {
        policies: ['ProjectDelete'],
      },
      {
        aliasMode: 'service',
        controller,
      }
    );

    expect(
      output.result.meta.links.filter((l: any) => l.rel === 'delete')
    ).toHaveLength(1);
  });

  test('hypermedia link generation should take meta input', async () => {
    const output = await runService(
      CreateProject,
      {
        policies: ['ProjectWrite'],
        user: {
          _id: 'u-100',
          emailAddress: 'someone@example.com',
          name: 'Test User 100',
        },
      },
      {
        aliasMode: 'service',
        controller,
      }
    );

    expect(
      output.result.meta.links.filter((l: any) => l.rel === 'update')
    ).toHaveLength(1);
  });

  test('generated link href should be compiled with params', async () => {
    const output = await runService(
      CreateProject,
      {
        policies: ['ProjectWrite'],
        user: {
          _id: 'u-100',
          emailAddress: 'someone@example.com',
          name: 'Test User 100',
        },
      },
      {
        aliasMode: 'service',
        controller,
      }
    );

    expect(
      output.result.meta.links.filter((l: any) => l.rel === 'update')[0].href
    ).toContain('/p-200');
  });

  test('self link should have proper href and method', async () => {
    const output = await runService(
      CreateProject,
      {
        policies: ['ProjectWrite'],
        user: {
          _id: 'u-100',
          emailAddress: 'someone@example.com',
          name: 'Test User 100',
        },
      },
      {
        aliasMode: 'service',
        controller,
      }
    );

    expect(
      output.result.meta.links.filter((l: any) => l.rel === 'self')[0].href
    ).toStrictEqual('/__services/GetProject');
    expect(
      output.result.meta.links.filter((l: any) => l.rel === 'self')[0].method
    ).toStrictEqual('post');
  });

  test('update-owner link should have custom href and method', async () => {
    const output = await runService(
      CreateProject,
      {
        policies: ['ProjectWrite'],
        user: {
          _id: 'u-100',
          emailAddress: 'someone@example.com',
          name: 'Test User 100',
        },
      },
      {
        aliasMode: 'service',
        controller,
      }
    );

    expect(
      output.result.meta.links.filter((l: any) => l.rel === 'update-owner')[0]
        .href
    ).toStrictEqual('/custom/path');
    expect(
      output.result.meta.links.filter((l: any) => l.rel === 'update-owner')[0]
        .method
    ).toStrictEqual('put');
  });
});

describe('utility', () => {
  test('should allow', () => {
    const policies = ['ABC', 'DEF', 'TEST'];
    const testPolicy = 'TEST';
    const isAllowed = shouldAllow(testPolicy, policies);
    expect(isAllowed).toStrictEqual(true);
  });
  test('should not allow', () => {
    const policies = ['ABC', 'DEF', 'TEST'];
    const testPolicy = 'SOMETHING_ELSE';
    const isAllowed = shouldAllow(testPolicy, policies);
    expect(isAllowed).toStrictEqual(false);
  });

  test('should deny', () => {
    const policies = ['ABC', 'DEF', 'TEST'];
    const testPolicy = 'TEST';
    const isAllowed = shouldDeny(testPolicy, policies);
    expect(isAllowed).toStrictEqual(true);
  });
  test('should not deny', () => {
    const policies = ['ABC', 'DEF', 'TEST'];
    const testPolicy = 'SOMETHING_ELSE';
    const isAllowed = shouldDeny(testPolicy, policies);
    expect(isAllowed).toStrictEqual(false);
  });
});

describe('definePre tests', () => {
  const TestService = defineService('TestService', (options) => {
    options.definePre('dbObj', () => {
      return 'Object from database';
    });

    options.defineLogic((opts) => {
      return opts.success({
        message: 'Test',
      });
    });
  });

  test('input should have dbObj when dbId is provided', async () => {
    const output = await runService(TestService, {
      input: {
        dbId: '123',
      },
    });

    expect(output.args.input.dbObj).toStrictEqual('Object from database');
    expect(output.result.type).toStrictEqual('success');
    expect(output.result.meta.message).toStrictEqual('Test');

    expect(output.responseCode).toStrictEqual(200);
    expect(output.response.meta.message).toStrictEqual('Test');
  });

  test('input should have dbObj when dbObj is provided', async () => {
    const output = await runService(TestService, {
      input: {
        dbObj: 'Passthru information',
      },
    });

    expect(output.args.input.dbObj).toStrictEqual('Passthru information');
    expect(output.result.type).toStrictEqual('success');
    expect(output.result.meta.message).toStrictEqual('Test');

    expect(output.responseCode).toStrictEqual(200);
    expect(output.response.meta.message).toStrictEqual('Test');
  });
});

describe('defineLogic tests', () => {
  test('defineLogic isManagedResponse should be false', async () => {
    const TestService = defineService('TestService', (options) => {
      options.defineLogic((opts) => {
        return opts.success({
          message: 'Hello World',
        });
      });
    });

    const output = await runService(TestService);
    expect(output.isManagedResponse).toStrictEqual(true);
  });

  test('defineLogic isManagedResponse should be true', async () => {
    const TestService = defineService('TestService', (options) => {
      options.defineLogic((opts) => {
        // Don't returning anything here should flag this instance as managed response
      });
    });

    const output = await runService(TestService);
    expect(output.isManagedResponse).toStrictEqual(false);
  });
});

describe('defineRule test', () => {
  const TestServiceWithRuleChecking = defineService(
    'TestService',
    (options) => {
      options.defineRule((opts) => {
        opts.allowPolicy('TEST');
      });

      options.defineLogic((opts) => {
        return opts.success({
          message: 'Hello World',
        });
      });
    }
  );

  const PublicTestService = defineService('TestService', (options) => {
    options.defineLogic((opts) => {
      return opts.success({
        message: 'Hello World',
      });
    });
  });

  test('result should be 401 error without any policies', async () => {
    const output = await runService(TestServiceWithRuleChecking);
    expect(output.result.type).toStrictEqual('error');
    expect(output.result.errCode).toStrictEqual(401);

    expect(output.responseCode).toStrictEqual(401);
    expect(output.response.message).toStrictEqual('Permission denied');
  });

  test('result should be 401 error', async () => {
    const output = await runService(TestServiceWithRuleChecking, {
      policies: ['TEST22'],
    });
    expect(output.result.type).toStrictEqual('error');
    expect(output.result.errCode).toStrictEqual(401);

    expect(output.responseCode).toStrictEqual(401);
    expect(output.response.message).toStrictEqual('Permission denied');
  });

  test('result should be success', async () => {
    const output = await runService(TestServiceWithRuleChecking, {
      policies: ['TEST'],
    });
    expect(output.result.type).toStrictEqual('success');
    expect(output.result.meta.message).toStrictEqual('Hello World');

    expect(output.responseCode).toStrictEqual(200);
    expect(output.response.meta.message).toStrictEqual('Hello World');
  });

  test('public test > result should be success', async () => {
    const output = await runService(PublicTestService);
    expect(output.result.type).toStrictEqual('success');
    expect(output.result.meta.message).toStrictEqual('Hello World');

    expect(output.responseCode).toStrictEqual(200);
    expect(output.response.meta.message).toStrictEqual('Hello World');
  });

  test('public test > result should be success (with policies specified in input)', async () => {
    const output = await runService(PublicTestService, {
      policies: ['TEST'],
    });
    expect(output.result.type).toStrictEqual('success');
    expect(output.result.meta.message).toStrictEqual('Hello World');

    expect(output.responseCode).toStrictEqual(200);
    expect(output.response.meta.message).toStrictEqual('Hello World');
  });

  test('result should fail when no policy is specified in rule definition', async () => {
    const TestServiceWithRuleCheckingWithoutPolicies = defineService(
      'TestService',
      (options) => {
        options.defineRule((opts) => {});

        options.defineLogic((opts) => {
          return opts.success({
            message: 'Hello World',
          });
        });
      }
    );

    const output = await runService(
      TestServiceWithRuleCheckingWithoutPolicies,
      {
        policies: ['TEST'],
      }
    );
    expect(output.result.type).toStrictEqual('error');
    expect(output.result.errCode).toStrictEqual(401);

    expect(output.responseCode).toStrictEqual(401);
    expect(output.response.message).toStrictEqual('Permission denied');
  });
});

describe('defineValidator test', () => {
  test('validation should fail', async () => {
    const TestService = defineService('TestService', (options) => {
      options.defineValidator(
        Joi.object({
          userName: Joi.string().alphanum().min(3).max(30).required().messages({
            'any.required': 'Please enter your username',
          }),

          fullName: Joi.string().alphanum().min(3).max(30).required().messages({
            'any.required': 'Full name is required',
          }),
        })
      );

      options.defineLogic((opts) => {
        return opts.success({
          message: 'Hello World',
        });
      });
    });

    const output = await runService(TestService);

    expect(output.result.type).toStrictEqual('error');
    expect(output.result.errCode).toStrictEqual(400);
    expect(output.validationErrors[0].key).toStrictEqual('userName');
    expect(output.validationErrors[0].message).toStrictEqual(
      'Please enter your username'
    );
    expect(output.validationErrors[1].key).toStrictEqual('fullName');
    expect(output.validationErrors[1].message).toStrictEqual(
      'Full name is required'
    );

    expect(output.responseCode).toStrictEqual(400);
    expect(output.response.message).toStrictEqual('Please enter your username');
    expect(output.response.validationErrors).toHaveLength(2);
  });

  test('validation should succeed', async () => {
    const TestService = defineService('TestService', (options) => {
      options.defineValidator(
        Joi.object({
          userName: Joi.string().alphanum().min(3).max(30).required().messages({
            'any.required': 'Please enter your username',
          }),

          fullName: Joi.string().alphanum().min(3).max(30).required().messages({
            'any.required': 'Full name is required',
          }),
        })
      );

      options.defineLogic((opts) => {
        return opts.success({
          message: 'Hello World',
        });
      });
    });

    const output = await runService(TestService, {
      input: {
        userName: 'dameemshahabaz',
        fullName: 'Dameem',
      },
    });

    expect(output.result.type).toStrictEqual('success');
    expect(output.result.meta.message).toStrictEqual('Hello World');

    expect(output.responseCode).toStrictEqual(200);
    expect(output.response.type).toStrictEqual('success');
    expect(output.response.meta.message).toStrictEqual('Hello World');
  });
});

describe('error handling', () => {
  test('error on definePre', async () => {
    const TestService = defineService('TestService', (options) => {
      options.definePre('dbObj', () => {
        throw new Error('Intentional error');
      });

      options.defineLogic((opts) => {
        return opts.success({
          message: 'Test',
        });
      });
    });

    const output = await runService(TestService);

    expect(output.result.type).toStrictEqual('error');
    expect(output.result.errCode).toStrictEqual(500);

    expect(output.responseCode).toStrictEqual(500);
    expect(output.response.message).toStrictEqual('Intentional error');
  });

  test('error on defineRule', async () => {
    const TestService = defineService('TestService', (options) => {
      options.defineRule(() => {
        throw new Error('Intentional error');
      });

      options.defineLogic((opts) => {
        return opts.success({
          message: 'Test',
        });
      });
    });

    const output = await runService(TestService);

    expect(output.result.type).toStrictEqual('error');
    expect(output.result.errCode).toStrictEqual(500);

    expect(output.responseCode).toStrictEqual(500);
    expect(output.response.message).toStrictEqual('Intentional error');
  });

  test('error on defineLogic', async () => {
    const TestService = defineService('TestService', (options) => {
      options.defineLogic((opts) => {
        throw new Error('Intentional error');
      });
    });

    const output = await runService(TestService);

    expect(output.result.type).toStrictEqual('error');
    expect(output.result.errCode).toStrictEqual(500);

    expect(output.responseCode).toStrictEqual(500);
    expect(output.response.message).toStrictEqual('Intentional error');
  });

  test('error on defineCapabilities', async () => {
    const TestService = defineService('TestService', (options) => {
      options.defineLogic((opts) => {
        return opts.success({ success: true });
      });

      options.defineCapabilities(() => {
        throw new Error('Intentional error');
      });
    });

    const output = await runService(TestService);

    expect(output.result.type).toStrictEqual('error');
    expect(output.result.errCode).toStrictEqual(500);

    expect(output.responseCode).toStrictEqual(500);
    expect(output.response.message).toStrictEqual('Intentional error');
  });

  test('error on evaluator', async () => {
    const TestService = defineService('TestService', (options) => {
      throw new Error('Intentional error 2');
    });

    const output = await runService(TestService);

    expect(output.result.type).toStrictEqual('error');
    expect(output.result.errCode).toStrictEqual(500);

    expect(output.responseCode).toStrictEqual(500);
    expect(output.response.message).toStrictEqual('Intentional error 2');
  });
});

describe('use()', () => {
  test('use() should be truthy', async () => {
    let useFn = null;
    const TestService = defineService('TestService', (options) => {
      useFn = options.use;
      options.defineLogic((opts) => {
        return opts.success({
          message: 'Test',
        });
      });
    });

    const output = await runService(TestService);

    expect(output.result.type).toStrictEqual('success');

    expect(output.responseCode).toStrictEqual(200);
    expect(output.response.meta.message).toStrictEqual('Test');
    expect(useFn).toBeTruthy();
  });
});

describe('attachMiddleware()', () => {
  test('should run as the first item', async () => {
    let testMatch: number = 0;
    const TestService = defineService('TestService', (options) => {
      options.attachMiddleware((req, res, next) => {
        (req as any).testAbc = 100;
        next();
      });

      options.defineLogic((opts) => {
        testMatch = (opts.args.req as any).testAbc;
        return opts.success({
          message: 'Test',
        });
      });
    });

    const output = await runService(TestService, {
      req: {} as any,
    });

    expect(output.result.type).toStrictEqual('success');

    expect(output.responseCode).toStrictEqual(200);
    expect(output.response.meta.message).toStrictEqual('Test');
    expect(testMatch).toStrictEqual(100);
  });
});
