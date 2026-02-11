const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { IgnorePlugin } = require('webpack');
const { join } = require('path');

/**
 * Packages that must remain external (not bundled by webpack).
 * Prisma uses WASM binaries, generated code under .prisma/client,
 * and internal subpath requires that must resolve from node_modules at runtime.
 * pg is kept external to avoid duplicate instances with @prisma/adapter-pg.
 */
const EXTERNAL_PACKAGES = [
  '@prisma/client',
  '@prisma/adapter-pg',
  '.prisma/client',
  'pg',
];

/**
 * NestJS optional peer dependencies that are dynamically imported via try/catch.
 * Not installed in this project — webpack must ignore them to avoid build errors.
 */
const NESTJS_LAZY_IMPORTS = [
  '@nestjs/microservices',
  '@nestjs/microservices/microservices-module',
  '@nestjs/websockets',
  '@nestjs/websockets/socket-module',
];

/**
 * Custom webpack externals function using prefix matching.
 * NxAppWebpackPlugin's externalDependencies array uses exact matching,
 * which fails for subpath imports (e.g., @prisma/client/runtime/client.js).
 */
function prismaExternals({ request }, callback) {
  if (
    request &&
    EXTERNAL_PACKAGES.some(
      (prefix) => request === prefix || request.startsWith(prefix + '/'),
    )
  ) {
    return callback(null, `commonjs ${request}`);
  }
  callback();
}

module.exports = {
  output: {
    path: join(__dirname, 'dist'),
    clean: true,
    ...(process.env.NODE_ENV !== 'production' && {
      devtoolModuleFilenameTemplate: '[absolute-resource-path]',
    }),
  },
  entry: {
    main: './src/main.ts',
    cli: './src/cli.ts',
  },
  externals: [prismaExternals],
  plugins: [
    new NxAppWebpackPlugin({
      target: 'node',
      compiler: 'tsc',
      main: './src/main.ts',
      tsConfig: './tsconfig.app.json',
      assets: [{ glob: '**/*', input: './src/assets', output: '.' }],
      optimization: false,
      outputHashing: 'none',
      generatePackageJson: false,
      sourceMap: true,
      externalDependencies: 'none',
      mergeExternals: true,
    }),
    new IgnorePlugin({
      checkResource(resource) {
        if (!NESTJS_LAZY_IMPORTS.includes(resource)) return false;
        try {
          require.resolve(resource, { paths: [process.cwd()] });
          return false;
        } catch {
          return true;
        }
      },
    }),
  ],
};
