import importlib.util
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).with_name('validar-inventario.py')
spec = importlib.util.spec_from_file_location('validador', SCRIPT)
v = importlib.util.module_from_spec(spec)
sys.dont_write_bytecode = True
spec.loader.exec_module(v)


class InventarioEstricto(unittest.TestCase):
    def filas(self, **cambios):
        fila = dict(zip(v.ENCABEZADOS, ['Cable', 'CAB-1', 'Electricidad', '8', '12', '0', '5', 'METRO']))
        fila.update(cambios)
        return [v.ENCABEZADOS, [fila[c] for c in v.ENCABEZADOS]]

    def test_archivo_seguro(self):
        self.assertEqual(v.validar(self.filas(), estricto=True), (1, [], []))

    def test_existencias_no_cero(self):
        self.assertTrue(v.validar(self.filas(stockActual='1'), estricto=True)[1])
        self.assertFalse(v.validar(self.filas(stockActual='1'))[1])

    def test_ambos_precios_cero(self):
        for campo in ['precioCosto', 'precioVenta']:
            self.assertTrue(v.validar(self.filas(**{campo: '0'}), estricto=True)[1])
            self.assertFalse(v.validar(self.filas(**{campo: '0'}))[1])

    def test_excepciones_independientes(self):
        filas = self.filas(stockActual='2', precioCosto='0', precioVenta='0')
        self.assertTrue(v.validar(filas, estricto=True, permitir_existencias='ADMIN: conteo')[1])
        self.assertTrue(v.validar(filas, estricto=True, autorizar_ceros='ADMIN: revisar')[1])
        _, errores, avisos = v.validar(filas, estricto=True, permitir_existencias='ADMIN: conteo', autorizar_ceros='ADMIN: revisar')
        self.assertFalse(errores)
        self.assertEqual(len(avisos), 3)
        self.assertIn('ADMIN:', avisos[0])

    def test_unidades_y_aliases(self):
        for unidad in v.UNIDADES_CSV + ['galón', 'galon', 'kg', 'metro_cuadrado', 'metro_cúbico', 'gallon', 'lb'] + list(v.ALIASES):
            self.assertFalse(v.validar(self.filas(unidadMedida=unidad), estricto=True)[1], unidad)
        self.assertTrue(v.validar(self.filas(unidadMedida='tonelada'), estricto=True)[1])

    def test_no_conversion_cantidades(self):
        filas = self.filas(unidadMedida='PIE', stockActual='2.50')
        v.validar(filas, estricto=True, permitir_existencias='conteo físico')
        self.assertEqual(filas[1][5], '2.50')

    def test_duplicados_catalogo_ejemplos_vacios_decimales(self):
        filas = self.filas()
        filas.append(filas[1].copy())
        self.assertTrue(v.validar(filas, estricto=True)[1])
        self.assertTrue(v.validar(self.filas(), catalogo={'CAB-1'}, estricto=True)[1])
        for datos in [{'codigo': 'EJ-1'}, {'precioCosto': ''}, {'precioVenta': '1,25'}, {'stockActual': '-1'}, {'precioVenta': '999999999999999999999'}]:
            self.assertTrue(v.validar(self.filas(**datos), estricto=True)[1], datos)

    def test_encabezados_y_columnas_ambiguas(self):
        filas = self.filas()
        filas[0] = filas[0] + ['PrecioCosto']
        filas[1] = filas[1] + ['99']
        self.assertTrue(v.validar(filas, estricto=True)[1])
        self.assertTrue(v.validar([v.ENCABEZADOS, ['Cable']], estricto=True)[1])

    def test_perfil_candidato_no_finge_importar_precios(self):
        self.assertTrue(v.validar(self.filas(), estricto=True, perfil='preproduccion')[1])
        filas = self.filas()
        filas = [[c for i, c in enumerate(fila) if i not in (3, 4)] for fila in filas]
        self.assertFalse(v.validar(filas, estricto=True, perfil='preproduccion')[1])
        self.assertTrue(v.validar(filas, estricto=True)[1])

    def test_cli_y_codigos_salida(self):
        with tempfile.TemporaryDirectory() as directorio:
            archivo = Path(directorio) / 'inventario.csv'
            def ejecutar(*args):
                return subprocess.run([sys.executable, str(SCRIPT), str(archivo), *args], capture_output=True, text=True)
            archivo.write_text(','.join(v.ENCABEZADOS) + '\nCable,CAB-1,Electricidad,0,12,1,5,GALON\n')
            self.assertEqual(ejecutar('--estricto').returncode, 1)
            autorizado = ejecutar('--estricto', '--autorizar-precios-cero', 'ADMIN: autorizado', '--permitir-existencias-iniciales', 'ADMIN: conteo directo')
            self.assertEqual(autorizado.returncode, 0)
            self.assertIn('ADMIN: autorizado', autorizado.stdout)
            self.assertEqual(ejecutar('--estricto', '--autorizar-precios-cero', '  ').returncode, 2)
            self.assertEqual(ejecutar('--desconocido').returncode, 2)
            archivo.write_text(','.join(v.ENCABEZADOS) + '\n')
            self.assertEqual(ejecutar('--estricto').returncode, 1)
            archivo.write_bytes(b'\xff')
            self.assertEqual(ejecutar('--estricto').returncode, 2)


if __name__ == '__main__':
    unittest.main()
