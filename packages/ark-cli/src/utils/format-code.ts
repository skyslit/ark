import pt from 'prettier';
/**
 * Format code
 * @param {string} inputStr
 * @return {string}
 */
export default function formatCode(inputStr: string) {
  return pt.format(inputStr, {
    parser: 'babel-ts',
  });
}

/**
 * Format code
 * @param {string} inputStr
 * @return {string}
 */
export function formatJson(inputStr: string) {
  return pt.format(inputStr, {
    parser: 'json',
  });
}
