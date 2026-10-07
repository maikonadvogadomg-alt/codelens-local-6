#!/bin/sh
# Linux, Mac ou Termux (celular):  sh iniciar.sh
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js não encontrado."
  echo "  Termux: pkg install nodejs-lts"
  echo "  Linux:  instale o Node 22 em https://nodejs.org"
  exit 1
fi
exec node scripts/iniciar.mjs
