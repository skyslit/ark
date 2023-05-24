import { getUniqueFileName } from './unique-file-name';

test('common usage', () => {
  let uniqueName = getUniqueFileName([], 'My Folder');
  expect(uniqueName).toStrictEqual('My Folder');

  uniqueName = getUniqueFileName([{}], 'My Folder');
  expect(uniqueName).toStrictEqual('My Folder');

  uniqueName = getUniqueFileName(
    [
      {
        name: 'My Folder',
      },
    ],
    'My Folder'
  );
  expect(uniqueName).toStrictEqual('My Folder (1)');

  uniqueName = getUniqueFileName(
    [
      {
        name: 'My Folder',
      },
      {
        name: 'My Folder (1)',
      },
    ],
    'My Folder'
  );
  expect(uniqueName).toStrictEqual('My Folder (2)');
});
