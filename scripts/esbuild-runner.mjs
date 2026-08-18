#!/usr/bin/env node
/**
 * esbuild JS API runner — called by build-cli.mjs via spawnSync(node, [thisFile, ...args])
 *
 * Two plugins handle edge cases the CLI can't:
 *
 * 1. exportsFixPlugin  — TypeScript subpath imports ending in .js that aren't
 *    listed in package.json "exports" (e.g. vscode-jsonrpc/node.js → /node).
 *    Strips the extension and retries resolution.
 *
 * 2. cjsWrapPlugin — The workspace package.json has "type":"module", so esbuild
 *    treats ALL .js files (including extracted CJS packages in node_modules) as
 *    ESM. CJS files have no "export" keywords → "No matching export" errors.
 *    This plugin detects CJS-pattern files and wraps them with a proper ESM
 *    shim that provides both `export default` and any detectable named exports.
 */

import * as esbuild from 'esbuild';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Parse --key=value CLI args
const rawArgs = process.argv.slice(2);
const flags = {};
const entryPoints = [];
for (const arg of rawArgs) {
  if (arg.startsWith('--')) {
    const eq = arg.indexOf('=');
    if (eq !== -1) flags[arg.slice(2, eq)] = arg.slice(eq + 1);
    else flags[arg.slice(2)] = true;
  } else {
    entryPoints.push(arg);
  }
}

const defineEntries = Object.fromEntries(
  Object.entries(flags)
    .filter(([k]) => k.startsWith('define:'))
    .map(([k, v]) => [k.slice(7), v]),
);
const loaderEntries = Object.fromEntries(
  Object.entries(flags)
    .filter(([k]) => k.startsWith('loader:'))
    .map(([k, v]) => [k.slice(7), v]),
);

// --- Plugin 1: subpath .js extension fix ---
const exportsFixPlugin = {
  name: 'exports-fix',
  setup(build) {
    // For package subpath imports ending in .js that fail exports resolution,
    // retry without the extension (e.g. 'vscode-jsonrpc/node.js' → '/node')
    build.onResolve({ filter: /^[^./].*\.[cm]?js$/ }, async (args) => {
      const withoutExt = args.path.replace(/\.[cm]?js$/, '');
      const result = await build.resolve(withoutExt, {
        importer: args.importer,
        resolveDir: args.resolveDir,
        kind: args.kind,
      });
      if (!result.errors?.length) return result;
      return undefined; // fall through to normal resolution
    });
  },
};

// Detect named exports from CJS source text (shallow, no file I/O)
function extractCjsNamedExports(src) {
  const names = new Set();

  // exports.X = ... and module.exports.X = ...
  for (const m of src.matchAll(/(?:module\.)?exports\.([a-zA-Z_$][\w$]*)\s*=/g)) names.add(m[1]);

  // Object.defineProperty(exports, 'X', ...)
  for (const m of src.matchAll(/Object\.defineProperty\(\s*exports\s*,\s*['"]([^'"]+)['"]/g)) names.add(m[1]);

  // module.exports = { key1, key2: val, ... } — extract object keys
  const objLit = src.match(/module\.exports\s*=\s*\{([^}]+)\}/s);
  if (objLit) {
    // match lines like: "  key," or "  key: value,"
    for (const m of objLit[1].matchAll(/^\s*([a-zA-Z_$][\w$]*)\s*[,:]/mg)) names.add(m[1]);
    for (const m of objLit[1].matchAll(/^\s*([a-zA-Z_$][\w$]*)\s*$/mg)) names.add(m[1]);
  }

  // __export(target, { key: () => val }) — esbuild-bundled CJS
  for (const m of src.matchAll(/\b__export\s*\([^,]+,\s*\{([^}]+)\}/g)) {
    for (const k of m[1].matchAll(/([a-zA-Z_$][\w$]*)\s*:/g)) names.add(k[1]);
  }

  names.delete('__esModule');
  names.delete('default');
  return [...names];
}

function resolveAndExtractDeep(rel, dir, depth) {
  const candidates = [rel, `${rel}.js`, `${rel}/index.js`];
  for (const c of candidates) {
    const abs = path.resolve(dir, c);
    let childSrc;
    try { childSrc = fs.readFileSync(abs, 'utf8'); } catch { continue; }
    return extractCjsNamedExportsDeep(childSrc, abs, depth + 1);
  }
  return [];
}

// Walk require chains and __exportStar calls to collect all named exports
function extractCjsNamedExportsDeep(src, filePath, depth = 0) {
  if (depth > 4) return [];
  const names = new Set(extractCjsNamedExports(src));
  const dir = path.dirname(filePath);

  // If no direct exports, follow: module.exports = require('./X')
  if (names.size === 0) {
    for (const m of src.matchAll(/module\.exports\s*=\s*require\(['"](\.[^'"]+)['"]\)/g)) {
      for (const n of resolveAndExtractDeep(m[1], dir, depth)) names.add(n);
    }
  }

  // Always merge __exportStar chains (they add exports on top of direct ones)
  for (const m of src.matchAll(/\b__exportStar\s*\(\s*require\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
    for (const n of resolveAndExtractDeep(m[1], dir, depth)) names.add(n);
  }

  return [...names];
}

// --- Plugin 2: CJS-in-ESM-workspace fix ---
const cjsWrapPlugin = {
  name: 'cjs-wrap',
  setup(build) {
    build.onLoad({ filter: /\.js$/, namespace: 'file' }, async (args) => {
      // Only patch files inside node_modules
      if (!args.path.includes(`${path.sep}node_modules${path.sep}`)) return undefined;

      let src;
      try { src = await fs.promises.readFile(args.path, 'utf8'); }
      catch { return undefined; }

      // Skip genuine ESM files (they have import/export keywords at the top level)
      if (/^(export|import)\s/m.test(src) || /\bexport\s+default\b/.test(src)) return undefined;

      // Skip if there are no CJS patterns at all
      if (!/\bmodule\.exports\b|\bObject\.defineProperty\(exports/.test(src) &&
          !/\bexports\.[a-zA-Z_$][\w$]*\s*=/.test(src)) return undefined;

      // Only wrap "delegation" files — files where esbuild cannot statically infer
      // named exports because exports come from require() chains, __exportStar, or
      // module.exports = {...} object literals.
      //
      // Files with direct `exports.X = value` patterns ARE handled correctly by
      // esbuild natively. Wrapping them breaks esbuild's __toCommonJS (D()) interop,
      // causing "X is not a function" runtime errors when one CJS file requires another.
      const hasDirectExportsAssign = /(?:^|[;{}\n])[ \t]*exports\.[a-zA-Z_$][\w$]*\s*=[^=]/m.test(src) ||
                                     /(?:^|[;{}\n])[ \t]*module\.exports\.[a-zA-Z_$][\w$]*\s*=[^=]/m.test(src);
      const hasDelegationExport = /module\.exports\s*=\s*require\(/.test(src);
      const hasExportStar = /\b__exportStar\s*\(/.test(src);
      const hasEsbuildExport = /\b__export\s*\([^,]+,\s*\{/.test(src);

      // If the file has direct exports, esbuild handles it natively — skip.
      // Exception: also wrap if __exportStar adds MORE exports on top of direct ones.
      if (hasDirectExportsAssign && !hasExportStar && !hasEsbuildExport) return undefined;

      // Only wrap delegation and TypeScript re-export patterns.
      // Object-literal exports (module.exports = {...}) are intentionally excluded:
      // esbuild extracts named exports from literals natively, and packages like
      // node-forge rely on shared mutable state (same object reference across requires),
      // which breaks when wrapped in a per-call IIFE.
      if (!hasDelegationExport && !hasExportStar && !hasEsbuildExport) return undefined;

      // Wrap the CJS content in an IIFE to isolate its local variable scope
      // from our ESM re-export declarations (avoids "already declared" conflicts)
      const namedExports = extractCjsNamedExportsDeep(src, args.path);
      const namedExportLines = namedExports
        .map(n => `export const ${n} = __cjsMod__.${n};`)
        .join('\n');

      // Note: require is intentionally NOT shadowed here — esbuild must be able
      // to see and bundle the require() calls statically (bundle:true mode).
      // Only module/exports are shadowed to give CJS code its expected globals.
      const wrapped = [
        `const __cjsMod__ = (() => {`,
        `  const module = { exports: {} };`,
        `  let exports = module.exports;`,
        `  // --- original CJS source ---`,
        src,
        `  return module.exports;`,
        `})();`,
        `export default __cjsMod__;`,
        namedExportLines,
      ].join('\n');

      return { contents: wrapped, loader: 'js', resolveDir: path.dirname(args.path) };
    });
  },
};

try {
  // When the output is ESM but contains CJS packages bundled with esbuild's __require shim,
  // the shim checks `typeof require !== "undefined"` — which is false in Node.js ESM.
  // Providing globalThis.require via createRequire makes built-in modules (node:events etc.)
  // accessible through the shim without breaking esbuild's own module bundling.
  const cjsRequireBanner = `import { createRequire as __cjsCreateRequire } from 'module';\nglobalThis.require ??= __cjsCreateRequire(import.meta.url);\n`;

  const result = await esbuild.build({
    entryPoints,
    bundle: true,
    platform: flags.platform ?? 'node',
    format: flags.format ?? 'esm',
    target: flags.target,
    outfile: flags.outfile,
    minify: 'minify' in flags,
    loader: loaderEntries,
    define: defineEntries,
    absWorkingDir: flags.cwd ?? process.cwd(),
    banner: { js: cjsRequireBanner },
    plugins: [exportsFixPlugin, cjsWrapPlugin],
    logLevel: 'silent',
  });

  for (const w of result.warnings) {
    const loc = w.location;
    process.stderr.write(`✘ [WARNING] ${w.text}${loc ? `\n\n    ${loc.file}:${loc.line}:${loc.column}:` : ''}\n\n`);
  }
} catch (err) {
  if (err.errors) {
    for (const e of err.errors) {
      const loc = e.location;
      process.stderr.write(`✘ [ERROR] ${e.text}${loc ? `\n\n    ${loc.file}:${loc.line}:${loc.column}:` : ''}\n\n`);
      for (const note of (e.notes ?? [])) process.stderr.write(`  ${note.text}\n`);
    }
  } else {
    process.stderr.write(err.message + '\n');
  }
  process.exit(1);
}
