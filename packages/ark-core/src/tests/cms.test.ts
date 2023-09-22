import traverse from '../../traverse';
import {
  resolveAddressForTraversal,
  resolveIndexFromTraversalResult,
  reconcileLogs,
  CMS,
} from '../index';

describe('cms functions', () => {
  test('basic usage of reconcileLogs', () => {
    const input = [
      {
        key: 'screens.[1641622577401].title',
        val: 'H',
        id: 1641634274845,
        previousValue: 'hello',
        prevValueType: 'string',
      },
      {
        key: 'screens.[1641622577401].title',
        val: 'Ho',
        id: 1641634275005,
        previousValue: 'H',
        prevValueType: 'string',
      },
      {
        key: 'screens.[1641622577401].title',
        val: 'Hol',
        id: 1641634275171,
        previousValue: 'Ho',
        prevValueType: 'string',
      },
      {
        key: 'screens.[1641622577401].title',
        val: 'Hola',
        id: 1641634275276,
        previousValue: 'Hol',
        prevValueType: 'string',
      },
      {
        key: 'screens.[1641622577401].description',
        val: 'S',
        id: 1641634484249,
        previousValue: 's',
        prevValueType: 'string',
      },
      {
        key: 'screens.[1641622577401].description',
        val: 'Sm',
        id: 1641634484397,
        previousValue: 'S',
        prevValueType: 'string',
      },
      {
        key: 'screens.[1641622577401].description',
        val: 'Sma',
        id: 1641634484516,
        previousValue: 'Sm',
        prevValueType: 'string',
      },
      {
        key: 'screens.[1641622577401].description',
        val: 'Smal',
        id: 1641634484652,
        previousValue: 'Sma',
        prevValueType: 'string',
      },
      {
        key: 'screens.[1641622577401].description',
        val: 'Small',
        id: 1641634484757,
        previousValue: 'Smal',
        prevValueType: 'string',
      },
      {
        key: 'screens.[1641622577401].description',
        val: 'Small ',
        id: 1641634484862,
        previousValue: 'Small',
        prevValueType: 'string',
      },
      {
        key: 'screens.[1641622577401].description',
        val: 'Small d',
        id: 1641634485041,
        previousValue: 'Small ',
        prevValueType: 'string',
      },
      {
        key: 'screens.[1641622577401].description',
        val: 'Small de',
        id: 1641634485206,
        previousValue: 'Small d',
        prevValueType: 'string',
      },
      {
        key: 'screens.[1641622577401].description',
        val: 'Small des',
        id: 1641634485372,
        previousValue: 'Small de',
        prevValueType: 'string',
      },
      {
        key: 'screens.[1641622577401].description',
        val: 'Small desc',
        id: 1641634485522,
        previousValue: 'Small des',
        prevValueType: 'string',
      },
      {
        key: 'screens.[1641622577401].description',
        val: 'Small descr',
        id: 1641634485656,
        previousValue: 'Small desc',
        prevValueType: 'string',
      },
      {
        key: 'screens.[1641622577401].description',
        val: 'Small descri',
        id: 1641634485776,
        previousValue: 'Small descr',
        prevValueType: 'string',
      },
      {
        key: 'screens.[1641622577401].description',
        val: 'Small descrip',
        id: 1641634485896,
        previousValue: 'Small descri',
        prevValueType: 'string',
      },
      {
        key: 'screens.[1641622577401].description',
        val: 'Small descript',
        id: 1641634486001,
        previousValue: 'Small descrip',
        prevValueType: 'string',
      },
      {
        key: 'screens.[1641622577401].description',
        val: 'Small descripti',
        id: 1641634486075,
        previousValue: 'Small descript',
        prevValueType: 'string',
      },
      {
        key: 'screens.[1641622577401].description',
        val: 'Small descriptio',
        id: 1641634486211,
        previousValue: 'Small descripti',
        prevValueType: 'string',
      },
      {
        key: 'screens.[1641622577401].description',
        val: 'Small description',
        id: 1641634486376,
        previousValue: 'Small descriptio',
        prevValueType: 'string',
      },
    ];

    const output = reconcileLogs(input);

    expect(output[0].val).toStrictEqual('Hola');
    expect(output[1].val).toStrictEqual('Small description');
  });

  test('basic usage of updateContent', () => {
    let original = {
      title: 'Test title',
      message: 'Hello there',
    };

    let copy1 = JSON.parse(JSON.stringify(original));

    expect(original.title).toStrictEqual('Test title');
    expect(original.message).toStrictEqual('Hello there');

    const result1 = CMS.updateContent(
      original,
      [
        {
          key: 'title',
          val: 'Test title updated',
          id: 1,
        },
        {
          key: 'message',
          val: 'Hola there',
          id: 0,
        },
      ],
      'edit'
    );

    expect(result1.appliedActions[0].key).toStrictEqual('message');
    expect(result1.appliedActions[1].key).toStrictEqual('title');

    expect(result1.content.title).toStrictEqual('Test title updated');
    expect(result1.content.message).toStrictEqual('Hola there');

    expect(copy1.title).toStrictEqual('Test title');
    expect(copy1.message).toStrictEqual('Hello there');

    const result2 = CMS.updateContent(copy1, result1.appliedActions, 'sync');

    expect(result2.appliedActions[0].key).toStrictEqual('message');
    expect(result2.appliedActions[1].key).toStrictEqual('title');

    expect(result2.content.title).toStrictEqual('Test title updated');
    expect(result2.content.message).toStrictEqual('Hola there');
  });

  test('basic usage of applyLog for non existant key root level', () => {
    let doc: any = {
      items: [
        {
          id: '1',
          title: 'hello',
        },
      ],
    };

    expect(doc.mainTitle).toBeFalsy();

    doc = CMS.applyLog(doc, 'mainTitle', 'Test desc updated', 'edit', null);

    expect(doc.mainTitle).toStrictEqual('Test desc updated');
  });

  test('basic usage of applyLog for non existant key inside array', () => {
    let doc: any = {
      items: [
        {
          id: '1',
          title: 'hello',
        },
      ],
    };

    expect(doc.items[0].desc).toBeFalsy();

    doc = CMS.applyLog(
      doc,
      'items.[1].desc',
      'Test desc updated',
      'edit',
      null
    );

    expect(doc.items[0].desc).toStrictEqual('Test desc updated');
  });

  test('basic usage of applyLog', () => {
    let doc = {
      title: 'Test title',
    };

    expect(doc.title).toStrictEqual('Test title');

    doc = CMS.applyLog(doc, 'title', 'Test title updated', 'edit', null);

    expect(doc.title).toStrictEqual('Test title updated');
  });
});

describe('helper functions', () => {
  test('common usage', () => {
    const data: any = {
      links: [
        {
          id: 'l-100',
          text: '100',
        },
        {
          id: 'l-200',
          text: '200',
          subLinks: [
            {
              id: 's-100',
              text: '100',
            },
            {
              id: 's-200',
              text: '200',
            },
            {
              id: 's-300',
              text: '300',
            },
          ],
        },
        {
          id: 'l-300',
          text: '300',
        },
      ],
    };

    const traverseResult = traverse(data);
    const output = resolveAddressForTraversal(
      traverseResult,
      'links.[l-200].subLinks.[s-300]'
    );

    expect(output).toStrictEqual('links.1.subLinks.2');
  });

  test('root usage', () => {
    const data: any = [
      {
        id: 's-100',
        text: '100',
      },
      {
        id: 's-200',
        text: '200',
      },
      {
        id: 's-300',
        text: '300',
      },
    ];

    const traverseResult = traverse(data);
    const output = resolveAddressForTraversal(traverseResult, '[s-200]');

    expect(output).toStrictEqual('1');
  });

  test('should return 2', () => {
    const data: any = {
      links: [
        {
          id: 'l-100',
          text: '100',
        },
        {
          id: 'l-200',
          text: '200',
        },
        {
          id: 'l-300',
          text: '300',
        },
      ],
    };
    const traverseResult = traverse(data);
    const index = resolveIndexFromTraversalResult(
      traverseResult,
      'links',
      '[l-300]'
    );
    expect(index).toStrictEqual(2);
  });

  test('should return 1', () => {
    const data: any = {
      links: [
        {
          id: 'l-100',
          text: '100',
        },
        {
          id: 'l-200',
          text: '200',
        },
        {
          id: 'l-300',
          text: '300',
        },
      ],
    };
    const traverseResult = traverse(data);
    const index = resolveIndexFromTraversalResult(
      traverseResult,
      'links',
      '[l-200]'
    );
    expect(index).toStrictEqual(1);
  });

  test('should return 1 in this case', () => {
    const data: any = {
      links: [
        {
          id: 'l-100',
          text: '100',
        },
        {
          id: 'l-200',
          text: '200',
          subLinks: [
            {
              id: 's-100',
              text: '100',
            },
            {
              id: 's-200',
              text: '200',
            },
            {
              id: 's-300',
              text: '300',
            },
          ],
        },
        {
          id: 'l-300',
          text: '300',
        },
      ],
    };
    const traverseResult = traverse(data);
    const index = resolveIndexFromTraversalResult(
      traverseResult,
      'links.1.subLinks',
      '[s-200]'
    );
    expect(index).toStrictEqual(1);
  });
});
