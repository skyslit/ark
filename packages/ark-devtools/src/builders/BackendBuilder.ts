import { Configuration } from 'webpack';
import nodeExternals from 'webpack-node-externals';
import { BuilderBase, ConfigurationOptions } from '../utils/BuilderBase';
import path from 'path';

/**
 * Backend Builder
 */
export class BackendBuilder extends BuilderBase {
  private entryFilePath: string;
  /**
   * Creates a new backend builder instance
   * @param {string} entryFilePath
   */
  constructor(entryFilePath: string) {
    super();
    this.entryFilePath = entryFilePath;
  }
  /**
   * @param {ConfigurationOptions} opts
   * @return {Configuration}
   */
  getConfiguration({ cwd, mode }: ConfigurationOptions): Configuration {
    const babelLoaderOptions = {
      // Should not take any babelrc file located in the project root
      babelrc: false,
      inputSourceMap: mode === 'development',
      sourceMaps: mode === 'development' ? 'both' : false,
      compact: mode === 'production',
      presets: [
        [
          require.resolve('@babel/preset-env'),
          {
            targets: { browsers: ['last 2 versions'] },
            modules: false,
          },
        ],
        [
          require.resolve('@babel/preset-typescript'),
          { allowNamespaces: true },
        ],
        [require.resolve('@babel/preset-react')],
      ],
      cacheDirectory: true,
      cacheCompression: false,
      plugins: [
        require.resolve('@babel/plugin-proposal-class-properties'),
        require.resolve('@babel/plugin-syntax-dynamic-import'),
      ],
    };

    return {
      devtool: mode === 'development' ? 'source-map' : false,
      context: cwd,
      mode,
      resolve: {
        modules: ['scripts', 'node_modules'],
        extensions: ['.json', '.ts', '.tsx', '.js', '.jsx'],
        alias: {
          ...this.mapPeerDependencies(
            ['react', 'react-dom', 'react-router-dom'],
            cwd
          ),
        },
        symlinks: true,
      },
      entry: this.entryFilePath,
      output: {
        publicPath: '/',
        filename: 'main.js',
        path: path.resolve(cwd, 'build', 'server'),
        assetModuleFilename: './assets/[hash][ext][query]',
      },
      target: 'node',
      externals: [
        nodeExternals({
          allowlist: [
            '@skyslit/ark-backend',
            '@skyslit/ark-frontend',
            // Allow the stylesheet to be handled by ignore-loader
            this.getStyleTestExp(),
          ],
        }),
      ],
      stats: {
        loggingTrace: false,
        errorStack: false,
      },
      plugins: [],
      module: {
        rules: [
          {
            test: /\.js$/,
            enforce: 'pre',
            use: [require.resolve('source-map-loader')],
          },
          {
            test: /\.(js|mjs|jsx|ts|tsx)$/,
            exclude: /node_modules/,
            use: [
              {
                loader: require.resolve('babel-loader'),
                options: babelLoaderOptions,
              },
            ],
          },
          {
            test: /\.svg(\?v=\d+\.\d+\.\d+)?$/,
            use: [
              {
                loader: require.resolve('babel-loader'),
                options: babelLoaderOptions,
              },
              {
                loader: require.resolve('@svgr/webpack'),
                options: {
                  babel: false,
                  icon: true,
                },
              },
            ],
          },
          {
            test: /\.(png|jpg|jpeg|gif|woff2|woff|ttf|eot)$/i,
            use: [
              {
                loader: require.resolve('file-loader'),
                options: {
                  name: '[contenthash].[ext]',
                  outputPath: 'assets',
                  emitFile: false,
                },
              },
            ],
          },
          {
            test: this.getStyleTestExp(),
            loader: require.resolve('ignore-loader'),
          },
          {
            test: this.getLESSStyleTestExp(),
            loader: require.resolve('ignore-loader'),
          },
        ],
      },
    };
  }
}
