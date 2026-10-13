#!/usr/bin/env python3
"""Entrada del cliente: mismo validador estricto del candidato, seis columnas por defecto."""
from pathlib import Path
import runpy
import sys

if __name__ == '__main__':
    script = Path(__file__).resolve().parents[3] / 'backend/scripts/validar-inventario.py'
    validar = runpy.run_path(str(script))['main']
    sys.exit(validar([sys.argv[0], '--perfil', 'preproduccion', '--estricto', *sys.argv[1:]]))
