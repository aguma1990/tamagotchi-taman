#!/bin/bash
# Klik dua kali di macOS untuk menjalankan game.
cd "$(dirname "$0")" && exec node src/server.js --open
