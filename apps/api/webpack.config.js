const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { IgnorePlugin } = require('webpack');
const { join } = require('path');

/**
 * Packages that must remain external (not bundled by webpack).
 * - Prisma: WASM binaries, generated code under .prisma/client, subpath requires
 * - pg: kept external to avoid duplicate instances with @prisma/adapter-pg
 * - pino/thread-stream: spawns worker threads via require.resolve('./lib/worker.js')
 *   which breaks when bundled (the worker file no longer exists on disk)
 */
const EXTERNAL_PACKAGES = [
  '@prisma/client',
  '@prisma/adapter-pg',
  '.prisma/client',
  'pg',
  'pino',
  'pino-http',
  'pino-pretty',
  'thread-stream',
  'nestjs-pino',
  '@google-cloud/storage',
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
function resolveExternals({ request }, callback) {
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

/**
 * NxAppWebpackPlugin unconditionally injects a bare `source-map-loader` rule
 * (test: /\.js$/, no exclude) when `sourceMap: true`. It follows every dependency's
 * `//# sourceMappingURL` comment into node_modules looking for original .ts files
 * that most published packages don't ship (e.g. nest-commander) - ~65 harmless
 * "Failed to parse source map" warnings. There is no plugin option to configure this
 * rule, so it's patched in place here, after NxAppWebpackPlugin has run (webpack calls
 * each plugin's synchronous `apply(compiler)` in array order, so this plugin must be
 * listed after it below). App-code (apps/api/src) source maps are untouched - only
 * node_modules is excluded.
 */
class ExcludeNodeModulesFromSourceMapLoaderPlugin {
  apply(compiler) {
    const rule = compiler.options.module.rules.find(
      (r) =>
        r &&
        typeof r === 'object' &&
        r.enforce === 'pre' &&
        typeof r.loader === 'string' &&
        r.loader.includes('source-map-loader'),
    );
    if (rule) {
      rule.exclude = /node_modules/;
    }
  }
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
  externals: [resolveExternals],
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
    // Must come after NxAppWebpackPlugin above - it depends on that plugin having
    // already pushed the source-map-loader rule into compiler.options.module.rules.
    new ExcludeNodeModulesFromSourceMapLoaderPlugin(),
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
    /**
     * `@nestjs/common`'s `FileTypeValidator` pipe (pulled in as part of the
     * `@nestjs/common/pipes` barrel) imports the `file-type` package, whose `exports`
     * field is ESM-only and unreachable under webpack's CJS resolution conditions -
     * "Module not found: '.' is not exported ... from file-type". Nothing in apps/ or
     * libs/ uses `FileTypeValidator` / `ParseFilePipe` / `MaxFileSizeValidator` today
     * (verified via grep), so the import is dead code and this is safe to suppress.
     *
     * DO NOT blanket-suppress this again if it starts failing differently: if a future
     * change introduces `ParseFilePipe`/`FileTypeValidator` (e.g. firmware admin file
     * upload validation), this must be fixed for real (upgrade `file-type`'s consumer,
     * swap to a CJS-compatible file-type check, or add an explicit resolve.alias) -
     * not re-suppressed, since it would then be a genuine runtime `Cannot find module`
     * on first request.
     */
    new IgnorePlugin({
      resourceRegExp: /^file-type$/,
      contextRegExp: /@nestjs\/common\/pipes\/file/,
    }),
  ],
};
