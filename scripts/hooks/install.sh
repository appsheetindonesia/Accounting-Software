#!/usr/bin/env bash
# ============================================================
# install.sh — aktifkan Git hooks ter-versioning (core.hooksPath)
#
# Memakai core.hooksPath ABSOLUT sehingga hook selalu sinkron
# dengan isi repo (tanpa menyalin ke .git/hooks yang tidak
# ter-versioning — hasil salinan akan basi saat hook di-update).
#
# Pemakaian:
#   scripts/hooks/install.sh            # aktifkan
#   scripts/hooks/install.sh --uninstall  # nonaktifkan
# ============================================================
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
HOOKS_DIR="$ROOT/scripts/hooks"

if [ "${1:-}" = "--uninstall" ]; then
    git config --unset core.hooksPath || true
    echo "Uninstalled: core.hooksPath dihapus (hook pre-commit QA tidak aktif)."
    exit 0
fi

if [ ! -x "$HOOKS_DIR/pre-commit" ] && [ ! -f "$HOOKS_DIR/pre-commit" ]; then
    echo "ERROR: $HOOKS_DIR/pre-commit tidak ditemukan." >&2
    exit 1
fi

git config core.hooksPath "$HOOKS_DIR"
echo "Installed: core.hooksPath = $HOOKS_DIR"
echo "  Hook pre-commit QA (check-qa-sync) aktif untuk repo ini."
echo "  Cek: git config --get core.hooksPath"
