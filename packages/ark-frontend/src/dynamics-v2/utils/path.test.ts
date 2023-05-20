import { joinPath } from './path';

test('normal usage', () => {
  let result = joinPath('/bar', 'foo/test');
  expect(result).toStrictEqual('/bar/foo/test');

  result = joinPath('bar', '', '/foo/test', '');
  expect(result).toStrictEqual('/bar/foo/test');
});
