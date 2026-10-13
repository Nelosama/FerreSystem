# Control previo de importación del candidato integrado

El CSV de inventario tiene exactamente estas seis columnas:

```csv
nombre,codigo,categoria,stockActual,stockMinimo,unidadMedida
```

Desde la raíz del repositorio:

```bash
python3 docs/operacion-cliente/herramientas/validar_plantilla.py inventario.csv --catalogo catalogo.csv
```

Esta entrada usa el mismo validador de `backend/scripts/validar-inventario.py`, con perfil `preproduccion` y modo estricto por defecto. No mantiene otra lista de unidades ni reglas. Bloquea códigos repetidos/existentes en el catálogo, encabezados ambiguos, filas ficticias, vacíos, coma decimal, valores inválidos y unidades desconocidas. Admite las doce unidades de la API, sin conversiones; `galón` y `galon` son equivalentes.

Conservar `stockActual=0` si se aplicará un levantamiento. Para cargar el conteo físico directamente, sin aplicarlo otra vez mediante levantamiento, usar una autorización declarada:

```bash
python3 docs/operacion-cliente/herramientas/validar_plantilla.py inventario.csv --catalogo catalogo.csv --permitir-existencias-iniciales "ADMIN: responsable, fecha de corte y motivo"
```

El programa es de solo lectura y no autentica al responsable. Conservar CSV, informe y autorización. Salida 0: datos válidos; 1: errores o sin filas; 2: lectura/argumentos inválidos. No importar si hay errores.

Los precios no se importan. Para revisar una hoja de ocho columnas (`nombre,codigo,categoria,precioCosto,precioVenta,stockActual,stockMinimo,unidadMedida`), usar el perfil maestro:

```bash
python3 backend/scripts/validar-inventario.py maestro-revision.csv --perfil maestro --estricto
```

El modo estricto bloquea ambos precios cero. Una excepción de revisión exige `--autorizar-precios-cero "ADMIN: responsable y motivo"`; no autoriza la venta ni convierte esa hoja en CSV importable. El candidato no aprueba una venta de precio cero y exige costo inicial positivo para la primera aprobación que inicializa el vigente.

Después de importar, ADMIN contrasta los productos con la hoja y usa «Precios y aprobación». Captura costo y precio y pulsa «Aprobar para venta»: inicialización del vigente y aprobación quedan auditadas sin alterar stock ni CxP. Los productos siguen pendientes hasta ese paso. No utilizar compras ficticias.

Antes de la carga real, comprobar catálogo completo (incluidos inactivos), corte del conteo, respaldo, categoría y unidad física. La validación offline no comprueba los datos actuales del servidor. Importar sin sobrescribir; conservar los resultados y comparar el inventario antes y después.
