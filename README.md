# Claude Code — Community Edition (no-AVX / old-timer build)

![](<img/2026-03-31 14-58-01-combined.gif>)

Rebuilt from source maps with real source preservation for `@ant/*` packages.

Community-maintained source build of Claude Code with **Bun replaced by esbuild** — runs on CPUs without AVX/AVX2 (Intel Westmere/Nehalem, AMD pre-Bulldozer, Hyper-V/VirtualBox/KVM VMs, old-timer hardware).

See: [anthropics/claude-code#33153](https://github.com/anthropics/claude-code/issues/33153)

## Install

Clones, builds, and installs the `claudius` command. Requires **Node.js >= 20** and **git**.

**macOS / Linux:**
```bash
curl -fsSL https://raw.githubusercontent.com/genose/claude-code-source-build-community-edition-noAVX-foroldtimer/noavx_esbuild/install.sh | bash
```

**Windows (PowerShell):**
```powershell
irm https://raw.githubusercontent.com/genose/claude-code-source-build-community-edition-noAVX-foroldtimer/noavx_esbuild/install.ps1 | iex
```

After install, run `claudius` instead of `claude`.

Default install locations:

| Platform | Install dir | Command |
|----------|-------------|---------|
| macOS | `~/.claudius` | `/usr/local/bin/claudius` (if writable, else `~/.local/bin/claudius`) |
| Linux | `~/.claudius` | `~/.local/bin/claudius` |
| Windows | `%USERPROFILE%\.claudius` | `%USERPROFILE%\.local\bin\claudius.cmd` |

To customize:
```bash
# macOS / Linux
CLAUDIUS_INSTALL_DIR=~/tools/claudius CLAUDIUS_BIN_DIR=~/bin bash install.sh

# Windows
$env:CLAUDIUS_INSTALL_DIR="C:\tools\claudius"; $env:CLAUDIUS_BIN_DIR="C:\tools\bin"; irm ... | iex
```

## Update / Reinstall

Re-run the same install command — it detects an existing install, pulls the latest commits, rebuilds, and updates the wrapper:

**macOS / Linux:**
```bash
curl -fsSL https://raw.githubusercontent.com/genose/claude-code-source-build-community-edition-noAVX-foroldtimer/noavx_esbuild/install.sh | bash
```

**Windows (PowerShell):**
```powershell
irm https://raw.githubusercontent.com/genose/claude-code-source-build-community-edition-noAVX-foroldtimer/noavx_esbuild/install.ps1 | iex
```

Or if you already cloned locally:
```bash
cd ~/.claudius   # or your custom CLAUDIUS_INSTALL_DIR
git pull
npm install
npm run build
```

## Prerequisites

- Node.js >= 20
- git
- npm

## Build from source

```bash
# 1. Clone
git clone --branch noavx_esbuild \
  https://github.com/genose/claude-code-source-build-community-edition-noAVX-foroldtimer.git
cd claude-code-source-build-community-edition-noAVX-foroldtimer

# 2. Install esbuild and dependencies
npm install

# 3. Build (production, minified)
npm run build
# equivalent: node scripts/build-cli.mjs

# Development build (unminified, faster)
node scripts/build-cli.mjs --no-minify

# Custom output path
node scripts/build-cli.mjs --outfile /path/to/cli.js
```

Output: `dist/cli.js` (entry point) + `dist/cli.bundle/` (bundle directory).

The first build auto-installs ~80 overlay npm packages into `.cache/workspace/`. Subsequent builds skip this step automatically.

> **Note:** The build parses a 57 MB source map (`source/cli.js.map`) once and caches it in memory for the duration of the build. On machines with < 2 GB of free RAM, Node.js may run out of heap. If you see an OOM crash, increase the heap limit:
> ```bash
> NODE_OPTIONS=--max-old-space-size=4096 npm run build
> ```

### Verify

```bash
node dist/cli.js --version
```

## Run

```bash
node dist/cli.js
```

Or use the installed `claudius` command if you ran `install.sh` / `install.ps1`.

### Computer Use (macOS)

Computer use activates automatically when the `CHICAGO_MCP` feature flag is enabled. Native addons are resolved from `source/native-addons/`. Override paths if needed:

```bash
COMPUTER_USE_SWIFT_NODE_PATH="/path/to/computer-use-swift.node" \
COMPUTER_USE_INPUT_NODE_PATH="/path/to/computer-use-input.node" \
node dist/cli.js
```

## Clean rebuild

```bash
rm -f .cache/workspace/.prepared.json
npm run build
```

## Feature flags

Toggle in `enabledBundleFeatures` inside `scripts/build-cli.mjs`. ~90 flags available — search `feature('` in source.

| Flag | What it does |
|------|-------------|
| `BUILDING_CLAUDE_APPS` | Skill content for building Claude apps |
| `BASH_CLASSIFIER` | Bash command safety classifier |
| `TRANSCRIPT_CLASSIFIER` | Transcript-level auto-mode classifier |
| `CHICAGO_MCP` | Computer use via MCP (screenshot, click, type, etc.) |

## Native addons

Pre-built macOS binaries in `source/native-addons/`:

| File | Purpose |
|------|---------|
| `computer-use-swift.node` | Screen capture, app management |
| `computer-use-input.node` | Mouse/keyboard input |
| `image-processor.node` | Sharp image processing |
| `audio-capture.node` | Audio capture |

## Structure

```
install.sh               — macOS/Linux installer (sets up claudius command)
install.ps1              — Windows installer (sets up claudius command)
scripts/build-cli.mjs    — Build script (source map extraction + esbuild bundling)
scripts/esbuild-runner.mjs — esbuild plugins (CJS/ESM shims, exports fix)
source/cli.js.map         — Original source map (4756 modules)
source/native-addons/     — Pre-built .node binaries (macOS)
source/src/               — Overlay assets (.md skill files)
.cache/workspace/         — Extracted workspace (generated, gitignored)
dist/                     — Build output (generated)
```
