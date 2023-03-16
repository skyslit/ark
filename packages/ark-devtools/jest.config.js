const base = require('../../jest.config.base.js');
const packageJson = require('./package.json');

module.exports = {
  ...base,
  name: packageJson.name,
  displayName: packageJson.name,
  verbose: true,
  modulePathIgnorePatterns: ['build', '__test__/test-artifacts'],
  moduleNameMapper: {
    '^react-router-dom$': '<rootDir>/node_modules/react-router-dom',
  },
};
