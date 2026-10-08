import test from 'node:test';
import assert from 'node:assert/strict';

// Helper function mirroring the exact filtering logic from CotizacionesPage.tsx
function filterCotizaciones(cotizaciones, filterEstado, searchTerm, sortBy = 'RECIENTE') {
  return cotizaciones
    .filter((c) => {
      if (filterEstado !== 'TODOS') {
        if (filterEstado === 'ENVIADA' || filterEstado === 'EMITIDA') {
          if (c.estado !== 'ENVIADA' && c.estado !== 'EMITIDA') {
            return false;
          }
        } else if (c.estado !== filterEstado) {
          return false;
        }
      }

      const q = searchTerm.trim().toLowerCase();
      if (q) {
        const numStr = `cot-${c.numero.toString().padStart(4, '0')}`.toLowerCase();
        const matchNum = numStr.includes(q) || c.numero.toString().includes(q);
        const matchCliente = c.cliente?.toLowerCase().includes(q) ?? false;
        const matchRtn = c.rtn?.toLowerCase().includes(q) ?? false;
        const matchVendedor = c.usuarioNombre?.toLowerCase().includes(q) ?? false;

        return matchNum || matchCliente || matchRtn || matchVendedor;
      }

      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'RECIENTE') {
        return b.numero - a.numero;
      }
      return a.numero - b.numero;
    });
}

const mockCotizaciones = [
  { id: '1', numero: 1, cliente: 'Constructora del Norte', rtn: '08011990123456', usuarioNombre: 'Carlos Vendedor', estado: 'BORRADOR', total: 1500 },
  { id: '2', numero: 2, cliente: 'Inversiones San Pedro', rtn: '05011995654321', usuarioNombre: 'Maria Atencion', estado: 'EMITIDA', total: 3200 },
  { id: '3', numero: 3, cliente: 'Ferretería El Centro', rtn: '01012000111222', usuarioNombre: 'Carlos Vendedor', estado: 'APROBADA', total: 800 },
  { id: '4', numero: 4, cliente: 'Consumidor Final', rtn: '', usuarioNombre: 'Juan Perez', estado: 'RECHAZADA', total: 450 },
  { id: '5', numero: 5, cliente: 'Distribuidora Maya', rtn: '08011985999888', usuarioNombre: 'Maria Atencion', estado: 'CONVERTIDA', total: 5000 },
];

test('Búsqueda por texto (cliente, RTN, número, vendedor)', () => {
  // Buscar por nombre de cliente con espacios/mayúsculas
  const resCliente = filterCotizaciones(mockCotizaciones, 'TODOS', '  constructora ');
  assert.equal(resCliente.length, 1);
  assert.equal(resCliente[0].id, '1');

  // Buscar por RTN
  const resRtn = filterCotizaciones(mockCotizaciones, 'TODOS', '654321');
  assert.equal(resRtn.length, 1);
  assert.equal(resRtn[0].id, '2');

  // Buscar por número ("COT-0003")
  const resNum = filterCotizaciones(mockCotizaciones, 'TODOS', 'cot-0003');
  assert.equal(resNum.length, 1);
  assert.equal(resNum[0].id, '3');

  // Buscar por vendedor
  const resVendedor = filterCotizaciones(mockCotizaciones, 'TODOS', 'carlos');
  assert.equal(resVendedor.length, 2);
});

test('Aplicación de filtros por estado (incluyendo alias EMITIDA/ENVIADA)', () => {
  // Filtro BORRADOR
  const resBorrador = filterCotizaciones(mockCotizaciones, 'BORRADOR', '');
  assert.equal(resBorrador.length, 1);
  assert.equal(resBorrador[0].id, '1');

  // Filtro ENVIADA debe incluir cotizaciones con estado EMITIDA
  const resEnviada = filterCotizaciones(mockCotizaciones, 'ENVIADA', '');
  assert.equal(resEnviada.length, 1);
  assert.equal(resEnviada[0].id, '2');

  // Filtro CONVERTIDA
  const resConvertida = filterCotizaciones(mockCotizaciones, 'CONVERTIDA', '');
  assert.equal(resConvertida.length, 1);
  assert.equal(resConvertida[0].id, '5');
});

test('Limpieza de la búsqueda y restablecimiento de filtros recupera todo el listado', () => {
  // 1. Aplicar búsqueda específica
  let list = filterCotizaciones(mockCotizaciones, 'TODOS', 'Maya');
  assert.equal(list.length, 1);

  // 2. Limpiar texto de búsqueda (volviendo a "")
  list = filterCotizaciones(mockCotizaciones, 'TODOS', '');
  assert.equal(list.length, 5);

  // 3. Aplicar filtro de estado
  list = filterCotizaciones(mockCotizaciones, 'APROBADA', '');
  assert.equal(list.length, 1);

  // 4. Restablecer filtro de estado a "TODOS"
  list = filterCotizaciones(mockCotizaciones, 'TODOS', '');
  assert.equal(list.length, 5);

  // 5. Aplicar búsqueda y estado simultáneos y luego limpiar ambos
  list = filterCotizaciones(mockCotizaciones, 'RECHAZADA', 'Juan');
  assert.equal(list.length, 1);

  list = filterCotizaciones(mockCotizaciones, 'TODOS', '   ');
  assert.equal(list.length, 5);
});
