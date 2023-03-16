import { ApplicationContext } from '@skyslit/ark-core';
import fs from 'fs';
import supertest from 'supertest';
import { Backend, Data, ensureDir, FileVolume } from '../index';

jest.mock('fs', () => require('memfs').fs);

test('ensureDir should create dir if not exists', () => {
  expect(fs.existsSync('/ensuredir-test/sample')).toStrictEqual(false);
  ensureDir('/ensuredir-test/sample/');
  expect(fs.existsSync('/ensuredir-test/sample')).toStrictEqual(true);
});

describe('FileVolume', () => {
  test('should put file to folder', () => {
    const volume = new FileVolume({
      baseDir: '/filevol-test',
    });

    volume.put('src/doc/hello.txt', Buffer.from('Test Content', 'utf-8'));

    const fileContent = fs.readFileSync(
      '/filevol-test/src/doc/hello.txt',
      'utf8'
    );

    expect(fileContent).toEqual('Test Content');
  });

  test('should get file to folder', () => {
    const volume = new FileVolume({
      baseDir: '/filevol-test',
    });

    const fileContent = volume.get('src/doc/hello.txt');

    expect(Buffer.from(fileContent).toString('utf8')).toEqual('Test Content');
  });

  test('should delete file from folder', () => {
    const volume = new FileVolume({
      baseDir: '/filevol-test',
    });

    volume.delete('src/doc/hello.txt');

    expect(fs.existsSync('/filevol-test/src/doc/hello.txt')).toStrictEqual(
      false
    );
  });

  test('should rename file', () => {
    const volume = new FileVolume({
      baseDir: '/filevol-test',
    });

    volume.put('src/doc/toBeRenamed.txt', Buffer.from('Test Content', 'utf-8'));

    const fileContent = fs.readFileSync(
      '/filevol-test/src/doc/toBeRenamed.txt',
      'utf8'
    );
    expect(fileContent).toEqual('Test Content');

    expect(
      fs.existsSync('/filevol-test/src/doc/finalRenamed.txt')
    ).toStrictEqual(false);

    volume.rename(
      '/filevol-test/src/doc/toBeRenamed.txt',
      '/filevol-test/src/doc/finalRenamed.txt'
    );

    const fileContentRenamed = fs.readFileSync(
      '/filevol-test/src/doc/finalRenamed.txt',
      'utf8'
    );

    expect(fileContentRenamed).toEqual('Test Content');
  });
});

describe('useVolumeAccessPoint() server side', () => {
  test('should say not found when try to access without files', (done) => {
    const appContext = new ApplicationContext();
    appContext
      .activate(({ use }) => {
        use(Backend);
        const { useVolumeAccessPoint, useVolume } = use(Data);

        useVolumeAccessPoint(
          'test-ap',
          useVolume(
            'default',
            new FileVolume({ baseDir: '/___test-upload-dir' })
          )
        );
      })
      .finally(() => {
        supertest(appContext.getData('default', 'express'))
          .get('/volumes/default/test-ap')
          .then((res) => {
            expect(res.text).toBe('Not Found');
            done();
          });
      });
  });

  test('should return file', (done) => {
    const appContext = new ApplicationContext();
    fs.mkdirSync('/___test-upload-dir');
    fs.writeFileSync('/___test-upload-dir/sample.txt', 'Hello World');
    appContext
      .activate(({ use }) => {
        use(Backend);
        const { useVolumeAccessPoint, useVolume } = use(Data);

        useVolumeAccessPoint(
          'test-ap',
          useVolume(
            'default',
            new FileVolume({ baseDir: '/___test-upload-dir' })
          )
        );
      })
      .finally(() => {
        supertest(appContext.getData('default', 'express'))
          .get('/volumes/default/test-ap/sample.txt')
          .then((res) => {
            expect(res.text).toBe('Hello World');
            done();
          });
      });
  });

  test('should return custom json with middleware', (done) => {
    const appContext = new ApplicationContext();
    fs.mkdirSync('/___test-upload-dir2');
    fs.writeFileSync('/___test-upload-dir2/sample.txt', 'Hello World');
    appContext
      .activate(({ use }) => {
        use(Backend);
        const { useVolumeAccessPoint, useVolume } = use(Data);

        useVolumeAccessPoint(
          'test-ap',
          useVolume(
            'default',
            new FileVolume({ baseDir: '/___test-upload-dir2' })
          ),
          {
            middleware: [
              (req, res) => res.status(403).json({ message: 'Intercepted' }),
            ],
          }
        );
      })
      .finally(() => {
        supertest(appContext.getData('default', 'express'))
          .get('/volumes/default/test-ap/sample.txt')
          .then((res) => {
            expect(res.body.message).toBe('Intercepted');
            done();
          });
      });
  });
});
