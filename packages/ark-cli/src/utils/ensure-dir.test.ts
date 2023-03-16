import ensureDir from './ensure-dir';
import fs from 'fs';

jest.mock('fs', function () {
  return require('memfs').fs;
});

test('should create dir should create folder in isDir mode', () => {
  const testPath: string = '/testA/test2/test3';

  expect(fs.existsSync(testPath)).toStrictEqual(false);
  ensureDir('/testA/test2/test3', false, true);
  expect(fs.existsSync(testPath)).toStrictEqual(true);
});

test('should create dir should create folder in isDir mode', () => {
  const testPath: string = '/testB/test2/test3';

  expect(fs.existsSync(testPath)).toStrictEqual(false);
  ensureDir('/testB/test2/test3/sample.txt', false, false);
  expect(fs.existsSync(testPath)).toStrictEqual(true);
  expect(fs.existsSync('/testB/test2/test3/sample.txt')).toStrictEqual(false);
});

test('should clean dir', () => {
  fs.mkdirSync('/testC');
  fs.writeFileSync('/testC/hello.txt', 'test-content');

  expect(fs.readFileSync('/testC/hello.txt', 'utf-8')).toStrictEqual(
    'test-content'
  );

  ensureDir('/testC/hello.txt', true);

  expect(fs.existsSync('/testC/hello.txt')).toStrictEqual(false);
});

test('should not clean dir', () => {
  fs.mkdirSync('/testD');
  fs.writeFileSync('/testD/hello.txt', 'test-content');

  expect(fs.readFileSync('/testD/hello.txt', 'utf-8')).toStrictEqual(
    'test-content'
  );

  ensureDir('/testD/hello.txt');

  expect(fs.existsSync('/testD/hello.txt')).toStrictEqual(true);
});
