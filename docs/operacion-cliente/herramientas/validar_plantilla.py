#!/usr/bin/env python3
"""Control previo a importación de inventario para FerreSystem.

Revisa un CSV con el mismo formato que acepta ImportarProductosModal.tsx y
reporta errores que impedirían una carga limpia. No se conecta al sistema,
no escribe datos y no importa nada.

Uso:
  python3 validar_plantilla.py ARCHIVO.csv [--catalogo CODIGOS.csv]

  --catalogo  CSV exportado o capturado con columna "codigo" de los productos
              que ya existen en la empresa. Las filas con código existente
              se marcan como error para evitar sobrescrituras accidentales.

Salida: 0 si no hay errores, 1 si hay errores, 2 si el archivo no se puede leer.
Requiere solo Python 3 estándar.
"""
import csv
import io
import os
import re
import sys

# Columnas que lee ImportarProductosModal.tsx. Los precios NO se importan: el importador los ignora
# y el alta sin precio deja el producto pendiente hasta que el administrador lo apruebe (PATCH /productos/:id/precios).
ENCABEZADOS = ['nombre', 'codigo', 'categoria', 'stockActual', 'stockMinimo', 'unidadMedida']
UNIDADES_CSV = ['unidad', 'caja', 'metro', 'kg', 'galón']  # mismas que el importador
MAX_BYTES = 5 * 1024 * 1024
MAX_FILAS = 5000
NUMERO = re.compile(r'^\d+(\.\d{1,2})?$')
CODIGO_VALIDO = re.compile(r'^[A-Z0-9][A-Z0-9_\-]*$')  # sin «/» ni «.» (ver 01-inventario.md §4)


def normalizar_clave(texto):
    # Igual que getFieldValue() del importador: minúsculas y solo letras y dígitos.
    return re.sub(r'[^a-z0-9]', '', texto.lower())


def leer(ruta):
    if os.path.getsize(ruta) > MAX_BYTES:
        raise ValueError('el archivo supera 5 MB')
    with open(ruta, 'rb') as f:
        crudo = f.read()
    try:
        texto = crudo.decode('utf-8-sig')
    except UnicodeDecodeError:
        raise ValueError('el archivo no está en UTF-8; en Excel use «Guardar como → CSV UTF-8»')
    filas = list(csv.reader(io.StringIO(texto)))
    if not filas:
        raise ValueError('el archivo está vacío')
    return filas


def cargar_catalogo(ruta):
    with open(ruta, encoding='utf-8-sig', newline='') as f:
        lector = csv.DictReader(f)
        if not lector.fieldnames or 'codigo' not in [c.strip().lower() for c in lector.fieldnames]:
            raise ValueError('el archivo de catálogo debe tener columna "codigo"')
        return {r[[c for c in lector.fieldnames if c.strip().lower() == 'codigo'][0]].strip().upper()
                for r in lector if r}


def es_ejemplo(nombre, codigo):
    n = nombre.strip().lower()
    c = codigo.strip().upper()
    return (n.startswith('[ejemplo]') or c.startswith('EJ-')
            or c in {'COD-001', 'COD-002', 'COD-003'} or n.startswith('producto ejemplo'))


def validar(filas, catalogo=None):
    errores, avisos = [], []
    encabezado = filas[0]
    claves = {normalizar_clave(h): i for i, h in enumerate(encabezado)}
    faltan = [h for h in ENCABEZADOS if normalizar_clave(h) not in claves]
    if faltan:
        errores.append(f'Encabezados faltantes: {", ".join(faltan)}. Use la plantilla importable.')
        return 0, errores, avisos
    if 'descripcion' in claves:
        avisos.append('Hay una columna "descripcion": el importador la usa como nombre si "nombre" está vacío. Use solo "nombre".')

    datos = [(n, f) for n, f in enumerate(filas[1:], start=2) if any(c.strip() for c in f)]
    if len(datos) > MAX_FILAS:
        errores.append(f'Más de {MAX_FILAS} filas: divida el archivo.')
    if not datos:
        avisos.append('El archivo no tiene filas de datos: nada que importar.')

    def celda(fila, clave):
        i = claves[normalizar_clave(clave)]
        return fila[i].strip() if i < len(fila) else ''

    vistos_codigo = {}
    vistos_nombre = {}
    permitidas = {u.lower() for u in UNIDADES_CSV}
    for linea, fila in datos:
        nombre = celda(fila, 'nombre')
        codigo = celda(fila, 'codigo')
        ref = f'fila {linea}' + (f' ({codigo})' if codigo else '')

        for campo in ENCABEZADOS:
            if campo in ('stockMinimo',):
                continue  # vacío se toma como 5 en el importador; lo marcamos abajo
            if not celda(fila, campo):
                errores.append(f'{ref}: "{campo}" vacío. El importador lo convertiría en valor por defecto sin aviso.')
        if not celda(fila, 'stockMinimo'):
            errores.append(f'{ref}: "stockMinimo" vacío. El importador usaría 5 sin aviso.')

        if es_ejemplo(nombre, codigo):
            errores.append(f'{ref}: fila de ejemplo o ficticia. Bórrela antes de importar.')

        if codigo:
            clave = codigo.upper()
            if ' ' in codigo or not codigo.isascii():
                errores.append(f'{ref}: el código tiene espacios o acentos.')
            elif not CODIGO_VALIDO.match(clave):
                avisos.append(f'{ref}: caracteres poco recomendados en el código.')
            if clave in vistos_codigo:
                errores.append(f'{ref}: código repetido (también en fila {vistos_codigo[clave]}). Sin distinguir mayúsculas.')
            else:
                vistos_codigo[clave] = linea
            if catalogo is not None and clave in catalogo:
                errores.append(f'{ref}: el código ya existe en la empresa. Sin «Sobrescribir» se omitiría; con «Sobrescribir» cambiaría existencias.')

        if nombre:
            clave_n = nombre.lower()
            if clave_n in vistos_nombre:
                avisos.append(f'{ref}: nombre igual a la fila {vistos_nombre[clave_n]}. Revise si es duplicado.')
            else:
                vistos_nombre[clave_n] = linea

        for campo in ('stockActual', 'stockMinimo'):
            valor = celda(fila, campo)
            if not valor:
                continue
            if ',' in valor:
                errores.append(f'{ref}: "{campo}" usa coma ("{valor}"). Use punto decimal; el importador leería solo la parte entera.')
            elif not NUMERO.match(valor):
                errores.append(f'{ref}: "{campo}" no es un número válido ("{valor}"), máximo dos decimales.')
            elif campo == 'stockActual' and float(valor) != 0:
                avisos.append(f'{ref}: existencia {valor} distinta de 0. Si el conteo se hará en levantamiento, cargue 0 aquí para no duplicar existencias.')

        unidad = celda(fila, 'unidadMedida')
        if unidad and unidad.strip().lower() not in permitidas:
            pista = ' Escriba «galón» con acento.' if unidad.strip().lower() == 'galon' else ''
            errores.append(f'{ref}: unidad "{unidad}" no admitida por CSV. Valores: {", ".join(UNIDADES_CSV)}.{pista} Otras unidades se cargan en el formulario.')

    return len(datos), errores, avisos


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        return 2
    ruta = argv[1]
    catalogo = None
    if '--catalogo' in argv:
        try:
            catalogo = cargar_catalogo(argv[argv.index('--catalogo') + 1])
        except (ValueError, OSError, IndexError) as e:
            print(f'No se pudo leer el catálogo: {e}')
            return 2
    try:
        filas = leer(ruta)
    except (ValueError, OSError) as e:
        print(f'No se pudo leer el archivo: {e}')
        return 2

    total, errores, avisos = validar(filas, catalogo)
    print(f'Archivo: {ruta}')
    print(f'Filas de datos: {total}')
    print(f'Errores: {len(errores)}  |  Advertencias: {len(avisos)}')
    for e in errores:
        print(f'  ERROR  {e}')
    for a in avisos:
        print(f'  AVISO  {a}')
    listo = not errores and total > 0
    print('RESULTADO: ' + ('listo para importar en preproducción (revisar advertencias)' if listo
                           else 'NO importar. Corrija los errores y vuelva a validar.'))
    return 0 if not errores and total > 0 else 1


if __name__ == '__main__':
    sys.exit(main(sys.argv))
