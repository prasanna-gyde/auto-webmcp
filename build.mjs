import * as esbuild from 'esbuild';
import { execSync } from 'child_process';

const watch = process.argv.includes('--watch');

const sharedOptions = {
  entryPoints: ['src/index.ts'],
  bundle: true,
  sourcemap: true,
  target: ['chrome112', 'firefox115', 'safari16'],
};

async function build() {
  // Generate TypeScript declarations
  try {
    execSync('npx tsc --emitDeclarationOnly --declaration --outDir dist', { stdio: 'inherit' });
  } catch {
    console.warn('TypeScript declaration generation had warnings');
  }

  if (watch) {
    const esmCtx = await esbuild.context({
      ...sharedOptions,
      format: 'esm',
      outfile: 'dist/auto-webmcp.esm.js',
    });
    const iifeCtx = await esbuild.context({
      ...sharedOptions,
      format: 'iife',
      globalName: 'AutoWebMCP',
      outfile: 'dist/auto-webmcp.iife.js',
    });
    await Promise.all([esmCtx.watch(), iifeCtx.watch()]);
    console.log('Watching for changes...');
  } else {
    await Promise.all([
      esbuild.build({
        ...sharedOptions,
        format: 'esm',
        outfile: 'dist/auto-webmcp.esm.js',
        minify: false,
      }),
      esbuild.build({
        ...sharedOptions,
        format: 'iife',
        globalName: 'AutoWebMCP',
        outfile: 'dist/auto-webmcp.iife.js',
        minify: true,
      }),
      esbuild.build({
        ...sharedOptions,
        format: 'cjs',
        outfile: 'dist/auto-webmcp.cjs.js',
        minify: false,
      }),
    ]);
    console.log('Build complete: dist/');
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
