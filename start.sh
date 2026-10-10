#!/bin/bash
cd "$(dirname "$0")"
PORT=8000
echo "=========================================================="
echo "🏎️  SUPER MARIO KART (SNES) - CLON CON MODO SELFIE"
echo "=========================================================="
echo "Iniciando servidor local en http://localhost:$PORT ..."
open "http://localhost:$PORT" 2>/dev/null || xdg-open "http://localhost:$PORT" 2>/dev/null || true
python3 -m http.server $PORT
