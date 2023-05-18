import { compile, createSchema } from './schema';

test('normal usage with objects only', () => {
  const val = {
    description: 'test desc',
    body: {
      innerBody: {
        forceMessage: 'This is a force message',
      },
    },
  };

  const schema = createSchema({
    name: '',
    description: '',
    body: createSchema({
      subject: '',
      innerBody: createSchema({
        testInner: 123,
        doubleInner: createSchema({
          message: 'Hola',
        }),
      }),
    }),
  });

  const result = compile(schema, val);

  // console.log(require('util').inspect(result, { depth: undefined }));

  expect(result.description).toStrictEqual('test desc');
  expect(result.body.innerBody.forceMessage).toStrictEqual(
    'This is a force message'
  );
  expect(result.body.innerBody.testInner).toStrictEqual(123);
  expect(result.body.innerBody.doubleInner.message).toStrictEqual('Hola');
  expect(result.body.subject).toStrictEqual('');
  expect(result.name).toStrictEqual('');
});

test('normal usage with array only', () => {
  const val = [
    {
      name: 'test bu',
      items: [{}],
    },
    {
      description: 'test desc',
      items: [
        {
          count: 10,
        },
      ],
    },
  ];

  const schema = [
    createSchema({
      name: '',
      description: '',
      items: [
        createSchema({
          count: 0,
          label: 'test label',
        }),
      ],
    }),
  ];

  const result = compile(schema, val);

  expect(result[0].name).toStrictEqual('test bu');
  expect(result[0].items[0].count).toStrictEqual(0);
  expect(result[0].items[0].label).toStrictEqual('test label');
  expect(result[0].description).toStrictEqual('');

  expect(result[1].description).toStrictEqual('test desc');
  expect(result[1].items[0].count).toStrictEqual(10);
  expect(result[1].items[0].label).toStrictEqual('test label');
  expect(result[1].name).toStrictEqual('');
});
