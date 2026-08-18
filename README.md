# Claude Code — Community Edition (no-AVX / old-timer build)

![](<img/2026-03-31 14-58-01-combined.gif>)

Rebuilt from source maps with real source preservation for `@ant/*` packages.

Community-maintained source build of Claude Code with **Bun replaced by esbuild** — runs on CPUs without AVX/AVX2 (Intel Westmere/Nehalem, AMD pre-Bulldozer, Hyper-V/VirtualBox/KVM VMs, old-timer hardware).

See: [anthropics/claude-code#33153](https://github.com/anthropics/claude-code/issues/33153)

## Install

One-liner — clones, builds, and installs the `claudius` command to `~/.local/bin`:

```bash
curl -fsSL https://raw.githubusercontent.com/genose/claude-code-source-build-community-edition-noAVX-foroldtimer/noavx_esbuild/install.sh | bash
```

Or clone and run manually:

```bash
git clone --branch noavx_esbuild https://github.com/genose/claude-code-source-build-community-edition-noAVX-foroldtimer.git ~/.claudius
bash ~/.claudius/install.sh
```

After install, run `claudius` instead of `claude`.

To customize the install location:

```bash
CLAUDIUS_INSTALL_DIR=~/tools/claudius CLAUDIUS_BIN_DIR=~/bin bash install.sh
```

## Prerequisites

- Node.js >= 20
- npm (for overlay dependency install on first build)

## Build

```bash
# Production (minified)
node scripts/build-cli.mjs

# Development (unminified, faster builds)
node scripts/build-cli.mjs --no-minify

# Custom output path
node scripts/build-cli.mjs --outfile /path/to/output/cli.js
```

Output: `dist/cli.js` (wrapper) + `dist/cli.bundle/` (bundle).

First build runs `npm install` for ~80 overlay packages. Subsequent builds skip this.

## Run

```bash
node dist/cli.js
```

### Computer Use (macOS)

Computer use runs in-process automatically when the `CHICAGO_MCP` flag is enabled. The native addons are resolved from `prebuilds/` relative to the bundled package, or via env var overrides:

```bash
# Override native addon paths if the default resolution fails
COMPUTER_USE_SWIFT_NODE_PATH="/path/to/computer-use-swift.node" \
COMPUTER_USE_INPUT_NODE_PATH="/path/to/computer-use-input.node" \
node dist/cli.js
```

## Feature Flags

| Flag | What it does |
|------|-------------|
| `BUILDING_CLAUDE_APPS` | Skill content for building Claude apps |
| `BASH_CLASSIFIER` | Bash command safety classifier |
| `TRANSCRIPT_CLASSIFIER` | Transcript-level auto-mode classifier |
| `CHICAGO_MCP` | Computer use via MCP (screenshot, click, type, etc.) |

Toggle in `enabledBundleFeatures` inside `scripts/build-cli.mjs`. ~90 flags available — search `feature('` in source.

## Native Addons

In `source/native-addons/`:

| File | Purpose |
|------|---------|
| `computer-use-swift.node` | Screen capture, app management (macOS) |
| `computer-use-input.node` | Mouse/keyboard input (macOS) |
| `image-processor.node` | Sharp image processing |
| `audio-capture.node` | Audio capture |

## Clean Rebuild

```bash
rm -f .cache/workspace/.prepared.json
node scripts/build-cli.mjs --no-minify
```

## Structure

```
scripts/build-cli.mjs    — Build script (source map extraction + esbuild bundling)
scripts/esbuild-runner.mjs — esbuild plugins (CJS/ESM shims, exports fix)
source/cli.js.map         — Original source map (4756 modules)
source/native-addons/     — Pre-built .node binaries
source/src/               — Overlay assets (.md skill files)
.cache/workspace/         — Extracted workspace (generated, gitignored)
dist/                     — Build output (generated)
```
