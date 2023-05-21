import _controller from './core/controller';

export {
  Catalogue,
  useCatalogue,
  useCataloguePath,
  useFile,
  FileEditor,
  useProperties,
  PropetriesProvider,
} from './widgets/catalogue';
export { compile, createSchema } from './utils/schema';

export const controller = _controller;
