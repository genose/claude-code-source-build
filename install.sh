#!/usr/bin/env bash
set -e

REPO="https://github.com/genose/claude-code-source-build-community-edition-noAVX-foroldtimer.git"
BRANCH="noavx_esbuild"
INSTALL_DIR="${CLAUDIUS_INSTALL_DIR:-$HOME/.claudius}"
CMD="claudius"

# Default bin dir: ~/.local/bin on Linux, /usr/local/bin on macOS (fallback to ~/.local/bin)
if [ -z "$CLAUDIUS_BIN_DIR" ]; then
  if [ "$(uname)" = "Darwin" ] && [ -w "/usr/local/bin" ]; then
    BIN_DIR="/usr/local/bin"
  else
    BIN_DIR="$HOME/.local/bin"
  fi
else
  BIN_DIR="$CLAUDIUS_BIN_DIR"
fi

echo "==> Installing Claudius (Claude Code — Community Edition no-AVX)"
echo "    Platform    : $(uname -s) $(uname -m)"
echo "    Install dir : $INSTALL_DIR"
echo "    Command     : $BIN_DIR/$CMD"
echo ""

# Check Node.js
if ! command -v node &>/dev/null; then
  echo "Error: Node.js >= 20 is required but not found." >&2
  echo "       Install from https://nodejs.org or via your package manager." >&2
  exit 1
fi
NODE_MAJOR=$(node -e "process.stdout.write(String(process.versions.node.split('.')[0]))")
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Error: Node.js >= 20 required (found $(node --version))." >&2
  exit 1
fi

# Check git
if ! command -v git &>/dev/null; then
  echo "Error: git is required but not found." >&2
  exit 1
fi

# Clone or update
if [ -d "$INSTALL_DIR/.git" ]; then
  echo "==> Updating existing install at $INSTALL_DIR"
  git -C "$INSTALL_DIR" fetch origin "$BRANCH"
  git -C "$INSTALL_DIR" checkout "$BRANCH"
  git -C "$INSTALL_DIR" reset --hard "origin/$BRANCH"
else
  echo "==> Cloning repo..."
  git clone --branch "$BRANCH" --depth 1 "$REPO" "$INSTALL_DIR"
fi

# Install dependencies (esbuild etc.)
echo "==> Installing dependencies..."
cd "$INSTALL_DIR"
npm install --silent

# Build
echo "==> Building..."
node scripts/build-cli.mjs

# Install wrapper
mkdir -p "$BIN_DIR"
cat > "$BIN_DIR/$CMD" <<WRAPPER
#!/usr/bin/env bash
exec node "$INSTALL_DIR/dist/cli.js" "\$@"
WRAPPER
chmod +x "$BIN_DIR/$CMD"

echo ""
echo "==> Done! Run: $CMD"
echo ""

# PATH hint
if ! echo "$PATH" | grep -q "$BIN_DIR"; then
  echo "    NOTE: Add $BIN_DIR to your PATH:"
  echo "      export PATH=\"\$PATH:$BIN_DIR\""
  echo "    Add this line to your ~/.bashrc or ~/.zshrc"
  echo ""
fi
