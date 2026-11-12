#!/bin/bash
# Duplo clique para abrir o Zeus (instala o que faltar na primeira vez)
cd "$(dirname "$0")"
[ -d node_modules ] || npm install
npm start
