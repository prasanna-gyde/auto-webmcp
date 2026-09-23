import * as esbuild from 'esbuild';
import { execSync } from 'child_process';

const watch = process.argv.includes('--watch');

/** Country packs: src/packs/<id>.ts exporting one CountryPack as `exportName`. */
const PACKS = [
  { id: 'in', exportName: 'india' },
  { id: 'us', exportName: 'unitedStates' },
];

const packTarget = ['chrome112', 'firefox115', 'safari16'];

/** ESM + CJS per pack, and an IIFE that queues the pack for script-tag users. */
function packBuilds() {
  return PACKS.flatMap(({ id, exportName }) => [
    esbuild.build({ entryPoints: [`src/packs/${id}.ts`], bundle: true, format: 'esm', target: packTarget, outfile: `dist/packs/${id}.esm.js` }),
    esbuild.build({ entryPoints: [`src/packs/${id}.ts`], bundle: true, format: 'cjs', target: packTarget, outfile: `dist/packs/${id}.cjs.js` }),
    esbuild.build({
      stdin: {
        contents: `import { ${exportName} } from './${id}.js';\n(window.__AUTO_WEBMCP_PACKS = window.__AUTO_WEBMCP_PACKS || []).push(${exportName});`,
        resolveDir: 'src/packs',
        loader: 'ts',
      },
      bundle: true,
      format: 'iife',
      minify: true,
      target: packTarget,
      outfile: `dist/packs/${id}.iife.js`,
    }),
  ]);
}

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
      ...packBuilds(),
    ]);
    console.log('Build complete: dist/');
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
