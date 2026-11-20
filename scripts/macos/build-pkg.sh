#!/usr/bin/env bash
# Build a macOS .pkg installer from a Tauri-built Mythpen.app.
#
# Tauri v2 has no `pkg` bundle target (only app/dmg), so CI wraps the .app with
# pkgbuild + productbuild after `pnpm tauri build`. The postinstall script in
# pkg-scripts/ clears the com.apple.quarantine flag on the installed app, which
# is what Gatekeeper otherwise reports as "Mythpen is damaged" for ad-hoc signed
# builds.
#
# Usage: scripts/macos/build-pkg.sh <Mythpen.app> <version> [arch]
# Output: src-tauri/target/release/bundle/pkg/Mythpen_<version>_<arch>.pkg
#
# Set APPLE_INSTALLER_SIGNING_IDENTITY to a "Developer ID Installer" identity
# to sign the product archive (not required for unsigned releases).
set -euo pipefail

APP_PATH="${1:?usage: build-pkg.sh <Mythpen.app> <version> [arch]}"
VERSION="${2:?version is required}"
ARCH="${3:-$(uname -m)}"

if [ ! -d "$APP_PATH" ]; then
  echo "App bundle not found: $APP_PATH" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PKG_SCRIPTS_DIR="$REPO_ROOT/scripts/macos/pkg-scripts"
OUT_DIR="$REPO_ROOT/src-tauri/target/release/bundle/pkg"

APP_NAME="$(basename "$APP_PATH" .app)"
PKG_IDENTIFIER="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APP_PATH/Contents/Info.plist")"

mkdir -p "$OUT_DIR"

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

# pkgbuild maps the contents of --root onto --install-location, so the .app must
# sit directly under the root.
mkdir -p "$WORK_DIR/root"
ditto "$APP_PATH" "$WORK_DIR/root/$APP_NAME.app"
chmod +x "$PKG_SCRIPTS_DIR/postinstall"

COMPONENT_PKG="$WORK_DIR/$APP_NAME-component.pkg"
pkgbuild \
  --root "$WORK_DIR/root" \
  --identifier "$PKG_IDENTIFIER.pkg" \
  --version "$VERSION" \
  --install-location /Applications \
  --scripts "$PKG_SCRIPTS_DIR" \
  --ownership recommended \
  "$COMPONENT_PKG"

PKG_NAME="${APP_NAME}_${VERSION}_${ARCH}.pkg"
OUT_PKG="$OUT_DIR/$PKG_NAME"

# productbuild turns the component into a double-clickable product archive and
# preserves its postinstall script.
UNSIGNED_PKG="$WORK_DIR/$PKG_NAME"
productbuild --package "$COMPONENT_PKG" "$UNSIGNED_PKG"

if [ -n "${APPLE_INSTALLER_SIGNING_IDENTITY:-}" ]; then
  productsign --sign "$APPLE_INSTALLER_SIGNING_IDENTITY" "$UNSIGNED_PKG" "$OUT_PKG"
  echo "Signed $OUT_PKG"
else
  mv "$UNSIGNED_PKG" "$OUT_PKG"
  echo "Built $OUT_PKG (unsigned)"
fi
