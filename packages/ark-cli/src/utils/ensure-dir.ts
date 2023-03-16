import fs from 'fs';
import path from 'path';
import rimraf from 'rimraf';
/**
 * Ensure directory exists
 * @param {string} filePath
 * @param {boolean} clean
 * @param {boolean} isDir
 */
export default function ensureDir(
  filePath: string,
  clean: boolean = false,
  isDir: boolean = false
) {
  let dirPath = filePath;

  if (isDir === false) {
    dirPath = path.dirname(filePath);
  }

  let exists = fs.existsSync(dirPath);

  // Delete the whole directory in clean mode
  if (clean === true) {
    if (exists === true) {
      rimraf.sync(dirPath);
      exists = false;
    }
  }

  if (!exists) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}
