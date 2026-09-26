import React, { useState, useMemo } from 'react';
import { TopBar } from '../components/TopBar';
import { useTenant } from '../context/TenantContext';
import {
  useMockData,
  type ProductItem,
  type QuotationItem,
  type QuotationDetailItem,
} from '../context/MockDataContext';
import {
  FileText,
  Plus,
  ArrowRightCircle,
  Clock,
  CheckCircle2,
  XCircle,
  FileCheck,
  Printer,
  X,
  Check,
  Search,
  Copy,
  Trash2,
  AlertCircle,
  Edit3,
  DollarSign,
  PackageCheck,
} from 'lucide-react';
import { formatLempiras } from '../utils/format';

export const CotizacionesPage: React.FC = () => {
  const { tenant, user } = useTenant();
  const {
    cotizaciones,
    productos,
    agregarCotizacion,
    actualizarCotizacion,
    duplicarCotizacion,
    actualizarEstadoCotizacion,
    convertirCotizacionAVenta,
  } = useMockData();

  // Permisos de usuario
  const isAdminOrSeller = user?.rol === 'ADMIN' || user?.rol === 'VENDEDOR' || user?.rol === 'SUPERADMIN';
  const canModifyPrice = user?.rol === 'ADMIN' || user?.rol === 'SUPERADMIN' || user?.permisos?.includes('configuracion.editar');

  // Estados de Filtros y Búsqueda
  const [searchTerm, setSearchTerm] = useState('');
  const [filterEstado, setFilterEstado] = useState<string>('TODOS');
  const [sortBy, setSortBy] = useState<'RECIENTE' | 'ANTIGUO'>('RECIENTE');

  // Modales
  const [modalForm, setModalForm] = useState<boolean>(false);
  const [editingCotizacionId, setEditingCotizacionId] = useState<string | null>(null);
  const [modalPdf, setModalPdf] = useState<QuotationItem | null>(null);
  const [modalConvertir, setModalConvertir] = useState<QuotationItem | null>(null);
  const [modalProductoPicker, setModalProductoPicker] = useState<boolean>(false);
  const [mensajeNotificacion, setMensajeNotificacion] = useState<{ texto: string; tipo: 'exito' | 'error' } | null>(null);

  // Búsqueda dentro del selector de productos
  const [searchProducto, setSearchProducto] = useState('');

  // Form State para la Cotización
  const [formClienteNombre, setFormClienteNombre] = useState('');
  const [formClienteRtn, setFormClienteRtn] = useState('');
  const [formClienteTelefono, setFormClienteTelefono] = useState('');
  const [formClienteEmail, setFormClienteEmail] = useState('');
  const [formClienteDireccion, setFormClienteDireccion] = useState('');

  const [formDiasValidez, setFormDiasValidez] = useState<number>(15);
  const [formCondicionesPago, setFormCondicionesPago] = useState('Contado / Transferencia');
  const [formPorcentajeIsv, setFormPorcentajeIsv] = useState<number>(15);
  const [formNotas, setFormNotas] = useState('');

  const [formDescuentoGeneral, setFormDescuentoGeneral] = useState<number>(0);
  const [formTipoDescuentoGeneral, setFormTipoDescuentoGeneral] = useState<'PORCENTAJE' | 'MONTO'>('MONTO');

  // Tabla interactiva de detalles
  const [formItems, setFormItems] = useState<QuotationDetailItem[]>([]);

  // Notificaciones flotantes
  const mostrarNotificacion = (texto: string, tipo: 'exito' | 'error' = 'exito') => {
    setMensajeNotificacion({ texto, tipo });
    setTimeout(() => setMensajeNotificacion(null), 4500);
  };

  // Abrir formulario para Crear Nueva Cotización
  const handleAbrirNueva = () => {
    setEditingCotizacionId(null);
    setFormClienteNombre('');
    setFormClienteRtn('');
    setFormClienteTelefono('');
    setFormClienteEmail('');
    setFormClienteDireccion('');
    setFormDiasValidez(15);
    setFormCondicionesPago('Contado / Transferencia');
    setFormPorcentajeIsv(15);
    setFormNotas('');
    setFormDescuentoGeneral(0);
    setFormTipoDescuentoGeneral('MONTO');
    setFormItems([]);
    setModalForm(true);
  };

  // Abrir formulario para Editar Borrador
  const handleAbrirEditar = (cot: QuotationItem) => {
    if (cot.estado === 'APROBADA' || cot.estado === 'CONVERTIDA') {
      mostrarNotificacion('No se pueden editar cotizaciones aprobadas o convertidas a venta', 'error');
      return;
    }

    setEditingCotizacionId(cot.id);
    setFormClienteNombre(cot.cliente || '');
    setFormClienteRtn(cot.rtn || '');
    setFormClienteTelefono(cot.telefono || '');
    setFormClienteEmail(cot.email || '');
    setFormClienteDireccion(cot.direccion || '');
    setFormDiasValidez(cot.diasValidez || 15);
    setFormCondicionesPago(cot.condicionesPago || 'Contado / Transferencia');
    setFormPorcentajeIsv(cot.porcentajeIsv !== undefined ? cot.porcentajeIsv : 15);
    setFormNotas(cot.notas || '');
    setFormDescuentoGeneral(cot.descuentoGeneral || 0);
    setFormTipoDescuentoGeneral(cot.tipoDescuentoGeneral || 'MONTO');
    setFormItems(cot.detalles ? [...cot.detalles] : []);
    setModalForm(true);
  };

  // Duplicar Cotización
  const handleDuplicar = (cot: QuotationItem) => {
    try {
      const duplicada = duplicarCotizacion(cot.id, user?.nombre);
      mostrarNotificacion(`Cotización #COT-${duplicada.numero.toString().padStart(4, '0')} creada exitosamente como duplicado en Borrador.`);
    } catch {
      mostrarNotificacion('Error al duplicar la cotización', 'error');
    }
  };

  // Cambiar Estado
  const handleCambiarEstado = (cotId: string, nuevoEstado: QuotationItem['estado']) => {
    actualizarEstadoCotizacion(cotId, nuevoEstado);
    mostrarNotificacion(`Estado de cotización actualizado a ${nuevoEstado}`);
  };

  // Convertir A Venta
  const handleConfirmarConvertir = (cot: QuotationItem) => {
    convertirCotizacionAVenta(cot.id);
    setModalConvertir(null);
    mostrarNotificacion(
      `¡Cotización #COT-${cot.numero.toString().padStart(4, '0')} convertida a Venta! Stock actualizado en inventario.`
    );
  };

  // Selección de Producto desde el modal
  const handleSeleccionarProducto = (prod: ProductItem) => {
    if (!prod.activo) {
      mostrarNotificacion('No se puede agregar un producto inactivo a la cotización', 'error');
      return;
    }

    // Comprobar si ya existe en la lista
    const yaExiste = formItems.find((i) => i.productoId === prod.id);
    if (yaExiste) {
      // Incrementar cantidad
      setFormItems((prev) =>
        prev.map((i) => {
          if (i.productoId === prod.id) {
            const nuevaCant = i.cantidad + 1;
            const nuevaMed = i.usaMedida ? i.medida : 1;
            const totalMedida = nuevaCant * nuevaMed;
            const baseSubtotal = totalMedida * i.precioUnitario;
            const descMonto = i.tipoDescuento === 'PORCENTAJE' ? (baseSubtotal * i.descuento) / 100 : i.descuento;
            const subtotal = Math.max(0, baseSubtotal - descMonto);
            const isv = i.exento ? 0 : subtotal * (formPorcentajeIsv / 100);
            return {
              ...i,
              cantidad: nuevaCant,
              totalMedida,
              subtotal,
              isv,
              totalLinea: subtotal + isv,
            };
          }
          return i;
        })
      );
      mostrarNotificacion(`Se incrementó la cantidad de "${prod.nombre}" en la cotización.`);
    } else {
      // Agregar nueva línea
      const usaMedida = Boolean(prod.usaMedida || prod.unidadMedida === 'PIE' || prod.unidadMedida === 'METRO');
      const cantidad = 1;
      const medida = usaMedida ? 10 : 1; // Medida por defecto
      const totalMedida = cantidad * (usaMedida ? medida : 1);
      const precioLista = prod.precioVenta;
      const precioUnitario = prod.precioVenta;
      const subtotal = totalMedida * precioUnitario;
      const isv = subtotal * (formPorcentajeIsv / 100);

      const nuevoItem: QuotationDetailItem = {
        id: `det-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
        productoId: prod.id,
        codigoProducto: prod.codigo,
        descripcionProducto: prod.nombre,
        unidadMedida: prod.unidadMedida,
        usaMedida,
        cantidad,
        medida,
        totalMedida,
        precioLista,
        precioUnitario,
        precioModificado: false,
        descuento: 0,
        tipoDescuento: 'MONTO',
        exento: false,
        subtotal,
        isv,
        totalLinea: subtotal + isv,
      };

      setFormItems((prev) => [...prev, nuevoItem]);
      mostrarNotificacion(`"${prod.nombre}" agregado a la cotización.`);
    }

    setModalProductoPicker(false);
  };

  // Modificar línea de cotización
  const handleActualizarLinea = (
    index: number,
    campo: keyof QuotationDetailItem,
    valor: any
  ) => {
    setFormItems((prev) => {
      const copia = [...prev];
      const item = { ...copia[index] };

      if (campo === 'cantidad') {
        const c = Math.max(0.001, parseFloat(valor) || 0);
        item.cantidad = c;
      } else if (campo === 'medida') {
        const m = Math.max(0.001, parseFloat(valor) || 0);
        item.medida = item.usaMedida ? m : 1;
      } else if (campo === 'precioUnitario') {
        const p = Math.max(0, parseFloat(valor) || 0);
        item.precioUnitario = p;
        item.precioModificado = p !== item.precioLista;
      } else if (campo === 'descuento') {
        item.descuento = Math.max(0, parseFloat(valor) || 0);
      } else if (campo === 'tipoDescuento') {
        item.tipoDescuento = valor as 'PORCENTAJE' | 'MONTO';
      } else if (campo === 'exento') {
        item.exento = Boolean(valor);
      }

      // Recalcular
      const totalMedida = item.cantidad * (item.usaMedida ? item.medida : 1);
      item.totalMedida = Math.round(totalMedida * 100) / 100;

      const baseLineTotal = Math.round(item.totalMedida * item.precioUnitario * 100) / 100;
      let descuentoMonto = 0;

      if (item.tipoDescuento === 'PORCENTAJE') {
        descuentoMonto = Math.round((baseLineTotal * (item.descuento || 0)) / 100 * 100) / 100;
      } else {
        descuentoMonto = Math.min(baseLineTotal, item.descuento || 0);
      }

      const subtotal = Math.max(0, baseLineTotal - descuentoMonto);
      const isv = item.exento ? 0 : Math.round(subtotal * (formPorcentajeIsv / 100) * 100) / 100;

      item.subtotal = subtotal;
      item.isv = isv;
      item.totalLinea = Math.round((subtotal + isv) * 100) / 100;

      copia[index] = item;
      return copia;
    });
  };

  // Eliminar línea
  const handleEliminarLinea = (index: number) => {
    setFormItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Cálculos globales del Formulario
  const calculosGlobales = useMemo(() => {
    const subtotalLineas = formItems.reduce((acc, item) => acc + item.subtotal, 0);
    const descLineasTotal = formItems.reduce((acc, item) => {
      const base = item.totalMedida * item.precioUnitario;
      const desc = item.tipoDescuento === 'PORCENTAJE' ? (base * item.descuento) / 100 : item.descuento;
      return acc + desc;
    }, 0);

    let descGenMonto = 0;
    if (formTipoDescuentoGeneral === 'PORCENTAJE') {
      descGenMonto = Math.round((subtotalLineas * (formDescuentoGeneral || 0)) / 100 * 100) / 100;
    } else {
      descGenMonto = Math.min(subtotalLineas, formDescuentoGeneral || 0);
    }

    const subtotalGravadoNeto = Math.max(0, subtotalLineas - descGenMonto);
    const isvTotal = formItems.reduce((acc, item) => {
      if (item.exento) return acc;
      // Proporción de subtotal si hay descuento general
      const proporcion = subtotalLineas > 0 ? item.subtotal / subtotalLineas : 0;
      const baseItemNeto = Math.max(0, item.subtotal - descGenMonto * proporcion);
      return acc + Math.round(baseItemNeto * (formPorcentajeIsv / 100) * 100) / 100;
    }, 0);

    const totalFinal = Math.round((subtotalGravadoNeto + isvTotal) * 100) / 100;

    return {
      subtotalLineas,
      descLineasTotal,
      descGenMonto,
      descuentoTotalSum: descLineasTotal + descGenMonto,
      subtotalGravadoNeto,
      isvTotal,
      totalFinal,
    };
  }, [formItems, formDescuentoGeneral, formTipoDescuentoGeneral, formPorcentajeIsv]);

  // Guardar Formulario de Cotización
  const handleGuardarFormulario = (estadoGuardar: 'BORRADOR' | 'ENVIADA') => {
    if (!formClienteNombre.trim()) {
      mostrarNotificacion('Debe ingresar el nombre del cliente', 'error');
      return;
    }

    if (formItems.length === 0) {
      mostrarNotificacion('Agregue al menos un producto a la cotización', 'error');
      return;
    }

    // Calcular fecha validez
    const fechaVal = new Date();
    fechaVal.setDate(fechaVal.getDate() + formDiasValidez);
    const day = fechaVal.getDate().toString().padStart(2, '0');
    const month = (fechaVal.getMonth() + 1).toString().padStart(2, '0');
    const year = fechaVal.getFullYear();
    const fechaValidezFormatted = `${day}/${month}/${year}`;

    const payloadData = {
      cliente: formClienteNombre.trim(),
      rtn: formClienteRtn.trim() || undefined,
      telefono: formClienteTelefono.trim() || undefined,
      email: formClienteEmail.trim() || undefined,
      direccion: formClienteDireccion.trim() || undefined,
      usuarioNombre: user?.nombre || 'Usuario Sistema',
      fechaEmision: new Date().toLocaleDateString('es-HN'),
      fechaValidez: fechaValidezFormatted,
      diasValidez: formDiasValidez,
      condicionesPago: formCondicionesPago,
      porcentajeIsv: formPorcentajeIsv,
      subtotal: calculosGlobales.subtotalLineas,
      descuentoGeneral: formDescuentoGeneral,
      tipoDescuentoGeneral: formTipoDescuentoGeneral,
      isv: calculosGlobales.isvTotal,
      descuento: calculosGlobales.descuentoTotalSum,
      total: calculosGlobales.totalFinal,
      estado: estadoGuardar,
      notas: formNotas.trim() || undefined,
      itemsCount: formItems.length,
      detalles: formItems,
    };

    if (editingCotizacionId) {
      actualizarCotizacion(editingCotizacionId, payloadData);
      mostrarNotificacion(`Cotización actualizada exitosamente.`);
    } else {
      const nueva = agregarCotizacion(payloadData);
      mostrarNotificacion(`Cotización #COT-${nueva.numero.toString().padStart(4, '0')} creada con éxito.`);
    }

    setModalForm(false);
  };

  // Filtrado y búsqueda de cotizaciones
  const cotizacionesFiltradas = useMemo(() => {
    return cotizaciones
      .filter((c) => {
        if (filterEstado !== 'TODOS' && c.estado !== filterEstado) {
          return false;
        }

        if (searchTerm.trim()) {
          const q = searchTerm.toLowerCase();
          const numStr = `cot-${c.numero.toString().padStart(4, '0')}`.toLowerCase();
          const matchNum = numStr.includes(q) || c.numero.toString().includes(q);
          const matchCliente = c.cliente.toLowerCase().includes(q);
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
  }, [cotizaciones, filterEstado, searchTerm, sortBy]);

  // Productos filtrados para el Selector
  const productosFiltradosModal = useMemo(() => {
    if (!searchProducto.trim()) return productos;
    const q = searchProducto.toLowerCase();
    return productos.filter(
      (p) =>
        p.codigo.toLowerCase().includes(q) ||
        p.nombre.toLowerCase().includes(q) ||
        (p.descripcion && p.descripcion.toLowerCase().includes(q)) ||
        p.categoria.toLowerCase().includes(q)
    );
  }, [productos, searchProducto]);

  // Indicadores métricos rápidos
  const metricas = useMemo(() => {
    const totalCount = cotizaciones.length;
    const pendientesCount = cotizaciones.filter((c) => c.estado === 'ENVIADA' || c.estado === 'BORRADOR').length;
    const convertidasCount = cotizaciones.filter((c) => c.estado === 'CONVERTIDA').length;
    const montoTotalMined = cotizaciones.reduce((acc, c) => acc + c.total, 0);

    return { totalCount, pendientesCount, convertidasCount, montoTotalMined };
  }, [cotizaciones]);

  const getStatusBadge = (estado: QuotationItem['estado']) => {
    switch (estado) {
      case 'APROBADA':
        return <span className="badge badge-success"><CheckCircle2 size={11} /> APROBADA</span>;
      case 'ENVIADA':
        return <span className="badge badge-warning"><Clock size={11} /> ENVIADA</span>;
      case 'CONVERTIDA':
        return <span className="badge badge-dark"><FileCheck size={11} /> CONVERTIDA A VENTA</span>;
      case 'RECHAZADA':
        return <span className="badge badge-danger"><XCircle size={11} /> RECHAZADA</span>;
      case 'VENCIDA':
        return <span className="badge" style={{ backgroundColor: '#FECACA', color: '#991B1B' }}><AlertCircle size={11} /> VENCIDA</span>;
      default:
        return <span className="badge" style={{ backgroundColor: '#F5F5F4', color: '#44403C' }}>BORRADOR</span>;
    }
  };

  return (
    <div style={styles.container}>
      <TopBar title="COTIZACIONES & PROFORMAS" subtitle="Gestión Comercial y Conversión a Facturación POS" />

      <main style={styles.content}>
        {/* Banner de Notificación */}
        {mensajeNotificacion && (
          <div
            style={{
              ...styles.successBanner,
              backgroundColor: mensajeNotificacion.tipo === 'error' ? '#FEE2E2' : '#DCFCE7',
              borderColor: mensajeNotificacion.tipo === 'error' ? '#DC2626' : '#15803D',
            }}
          >
            {mensajeNotificacion.tipo === 'error' ? (
              <AlertCircle size={20} color="#DC2626" />
            ) : (
              <CheckCircle2 size={20} color="#15803D" />
            )}
            <span style={{ fontWeight: 700, fontSize: '13px', color: mensajeNotificacion.tipo === 'error' ? '#991B1B' : '#15803D' }}>
              {mensajeNotificacion.texto}
            </span>
          </div>
        )}

        {/* Métricas Rápidas */}
        <div style={styles.metricsGrid}>
          <div style={styles.metricCard}>
            <div style={styles.metricHeader}>
              <span style={styles.metricLabel}>COTIZACIONES TOTALES</span>
              <FileText size={18} color="var(--color-primary)" />
            </div>
            <div style={styles.metricValue}>{metricas.totalCount}</div>
            <div style={styles.metricSub}>Registradas en el sistema</div>
          </div>

          <div style={styles.metricCard}>
            <div style={styles.metricHeader}>
              <span style={styles.metricLabel}>PENDIENTES / ENVIADAS</span>
              <Clock size={18} color="#D97706" />
            </div>
            <div style={styles.metricValue}>{metricas.pendientesCount}</div>
            <div style={styles.metricSub}>En negociación con clientes</div>
          </div>

          <div style={styles.metricCard}>
            <div style={styles.metricHeader}>
              <span style={styles.metricLabel}>CONVERTIDAS A VENTA</span>
              <PackageCheck size={18} color="#16A34A" />
            </div>
            <div style={styles.metricValue}>{metricas.convertidasCount}</div>
            <div style={styles.metricSub}>Facturadas en POS</div>
          </div>

          <div style={styles.metricCard}>
            <div style={styles.metricHeader}>
              <span style={styles.metricLabel}>MONTO COTIZADO TOTAL</span>
              <DollarSign size={18} color="var(--color-primary)" />
            </div>
            <div style={styles.metricValue}>{formatLempiras(metricas.montoTotalMined)}</div>
            <div style={styles.metricSub}>Valor bruto en cartera</div>
          </div>
        </div>

        {/* Fila Principal de Acciones y Filtros */}
        <div style={styles.actionsBar}>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', flex: 1 }}>
            {/* Buscador */}
            <div style={styles.searchBox}>
              <Search size={16} color="#78716C" />
              <input
                type="text"
                placeholder="Buscar por #, Cliente, RTN o Vendedor..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={styles.searchInput}
              />
              {searchTerm && (
                <button type="button" onClick={() => setSearchTerm('')} style={styles.clearBtn}>
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Filtro por Estado */}
            <select
              value={filterEstado}
              onChange={(e) => setFilterEstado(e.target.value)}
              className="form-input"
              style={{ width: '180px', height: '38px', fontSize: '12px', fontWeight: 700 }}
            >
              <option value="TODOS">TODOS LOS ESTADOS</option>
              <option value="BORRADOR">BORRADOR</option>
              <option value="ENVIADA">ENVIADA</option>
              <option value="APROBADA">APROBADA</option>
              <option value="RECHAZADA">RECHAZADA</option>
              <option value="CONVERTIDA">CONVERTIDA A VENTA</option>
            </select>

            {/* Ordenamiento */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="form-input"
              style={{ width: '160px', height: '38px', fontSize: '12px', fontWeight: 700 }}
            >
              <option value="RECIENTE">MÁS RECIENTES</option>
              <option value="ANTIGUO">MÁS ANTIGUAS</option>
            </select>
          </div>

          {isAdminOrSeller && (
            <button type="button" className="btn btn-primary" onClick={handleAbrirNueva}>
              <Plus size={18} strokeWidth={2.5} />
              <span>NUEVA COTIZACIÓN</span>
            </button>
          )}
        </div>

        {/* Tabla Industrial de Cotizaciones */}
        <div className="table-container" style={{ marginTop: '20px' }}>
          <table className="industrial-table">
            <thead>
              <tr>
                <th>COTIZACIÓN N°</th>
                <th>CLIENTE / RTN</th>
                <th>VENDEDOR</th>
                <th style={{ textAlign: 'center' }}>VENCE</th>
                <th style={{ textAlign: 'center' }}>ITEMS</th>
                <th style={{ textAlign: 'right' }}>SUBTOTAL</th>
                <th style={{ textAlign: 'right' }}>ISV (15%)</th>
                <th style={{ textAlign: 'right' }}>TOTAL</th>
                <th style={{ textAlign: 'center' }}>ESTADO</th>
                <th style={{ textAlign: 'center' }}>ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              {cotizacionesFiltradas.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: '36px', color: '#78716C' }}>
                    No se encontraron cotizaciones registradas.
                  </td>
                </tr>
              ) : (
                cotizacionesFiltradas.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontFamily: 'var(--font-display)', fontWeight: 800 }}>
                      COT-{c.numero.toString().padStart(4, '0')}
                    </td>
                    <td>
                      <div style={{ fontWeight: 700 }}>{c.cliente}</div>
                      {c.rtn && <div style={{ fontSize: '11px', color: '#78716C' }}>RTN: {c.rtn}</div>}
                    </td>
                    <td style={{ fontSize: '12px', color: '#57534E' }}>
                      {c.usuarioNombre || 'Sistema'}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ fontWeight: 700, fontSize: '12px' }}>{c.fechaValidez}</span>
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 700 }}>{c.itemsCount || (c.detalles ? c.detalles.length : 1)}</td>
                    <td style={{ textAlign: 'right', color: '#78716C', whiteSpace: 'nowrap' }}>
                      {formatLempiras(c.subtotal)}
                    </td>
                    <td style={{ textAlign: 'right', color: '#78716C', whiteSpace: 'nowrap' }}>
                      {formatLempiras(c.isv)}
                    </td>
                    <td
                      style={{
                        textAlign: 'right',
                        fontFamily: 'var(--font-display)',
                        fontWeight: 800,
                        fontSize: '14px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {formatLempiras(c.total)}
                    </td>
                    <td style={{ textAlign: 'center' }}>{getStatusBadge(c.estado)}</td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap' }}>
                        {/* Ver PDF Proforma */}
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => setModalPdf(c)}
                          title="Ver e Imprimir Documento Proforma"
                        >
                          <FileText size={13} /> PDF
                        </button>

                        {/* Duplicar */}
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleDuplicar(c)}
                          title="Duplicar esta cotización"
                        >
                          <Copy size={13} />
                        </button>

                        {/* Editar draft/emitted */}
                        {(c.estado === 'BORRADOR' || c.estado === 'ENVIADA') && isAdminOrSeller && (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleAbrirEditar(c)}
                            title="Editar borrador de cotización"
                          >
                            <Edit3 size={13} />
                          </button>
                        )}

                        {/* Convertir a Venta */}
                        {(c.estado === 'APROBADA' || c.estado === 'ENVIADA') && (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => setModalConvertir(c)}
                            title="Convertir a Factura/Venta POS"
                          >
                            <ArrowRightCircle size={13} /> A VENTA
                          </button>
                        )}

                        {/* Cambiar Estado Dropdown */}
                        {isAdminOrSeller && c.estado !== 'CONVERTIDA' && (
                          <select
                            value={c.estado}
                            onChange={(e) => handleCambiarEstado(c.id, e.target.value as any)}
                            style={styles.stateSelect}
                            title="Cambiar estado manualmente"
                          >
                            <option value="BORRADOR">BORRADOR</option>
                            <option value="ENVIADA">ENVIADA</option>
                            <option value="APROBADA">APROBADA</option>
                            <option value="RECHAZADA">RECHAZADA</option>
                          </select>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>

      {/* Modal Crear/Editar Cotización */}
      {modalForm && (
        <div style={styles.modalOverlay}>
          <div className="industrial-card" style={styles.largeModalCard}>
            <div style={styles.modalHeader}>
              <div>
                <h2 style={{ fontSize: '18px', textTransform: 'uppercase', color: 'var(--color-primary)' }}>
                  {editingCotizacionId ? 'EDITAR COTIZACIÓN' : 'CREAR NUEVA COTIZACIÓN'}
                </h2>
                <span style={{ fontSize: '12px', color: '#78716C' }}>
                  Complete los datos del cliente y agregue los productos desde el inventario.
                </span>
              </div>
              <button type="button" onClick={() => setModalForm(false)} style={styles.closeBtn}>
                <X size={22} />
              </button>
            </div>

            <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Sección 1: Datos del Cliente */}
              <div style={styles.formSection}>
                <h3 style={styles.sectionTitle}>1. INFORMACIÓN DEL CLIENTE</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">CLIENTE O RAZÓN SOCIAL *</label>
                    <input
                      type="text"
                      className="form-input"
                      required
                      placeholder="Ej. Constructora del Norte S. de R.L."
                      value={formClienteNombre}
                      onChange={(e) => setFormClienteNombre(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">RTN DEL CLIENTE (OPCIONAL)</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="05019000123456"
                      value={formClienteRtn}
                      onChange={(e) => setFormClienteRtn(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">TELÉFONO DE CONTACTO</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="+504 9999-0000"
                      value={formClienteTelefono}
                      onChange={(e) => setFormClienteTelefono(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">CORREO ELECTRÓNICO</label>
                    <input
                      type="email"
                      className="form-input"
                      placeholder="cliente@empresa.hn"
                      value={formClienteEmail}
                      onChange={(e) => setFormClienteEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group" style={{ marginTop: '8px' }}>
                  <label className="form-label">DIRECCIÓN DE ENTREGA O FISCAL</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Ej. Barrio El Centro, Ave. Roosevelt, San Pedro Sula"
                    value={formClienteDireccion}
                    onChange={(e) => setFormClienteDireccion(e.target.value)}
                  />
                </div>
              </div>

              {/* Sección 2: Condiciones y Validez */}
              <div style={styles.formSection}>
                <h3 style={styles.sectionTitle}>2. CONDICIONES Y VIGENCIA</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">DÍAS DE VALIDEZ</label>
                    <input
                      type="number"
                      min={1}
                      className="form-input"
                      value={formDiasValidez}
                      onChange={(e) => setFormDiasValidez(Math.max(1, parseInt(e.target.value) || 15))}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">CONDICIONES DE PAGO</label>
                    <select
                      className="form-input"
                      value={formCondicionesPago}
                      onChange={(e) => setFormCondicionesPago(e.target.value)}
                    >
                      <option value="Contado / Transferencia">Contado / Transferencia</option>
                      <option value="Crédito 15 días">Crédito 15 días</option>
                      <option value="Crédito 30 días">Crédito 30 días</option>
                      <option value="50% Anticipo, 50% Contra entrega">50% Anticipo, 50% Contra entrega</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">IMPUESTO ISV (% Default 15%)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-input"
                      value={formPorcentajeIsv}
                      onChange={(e) => setFormPorcentajeIsv(Math.max(0, parseFloat(e.target.value) || 0))}
                    />
                  </div>
                </div>

                <div className="form-group" style={{ marginTop: '8px' }}>
                  <label className="form-label">OBSERVACIONES / NOTAS ADICIONALES</label>
                  <textarea
                    className="form-input"
                    rows={2}
                    placeholder="Términos especiales, flete, condiciones de garantía..."
                    value={formNotas}
                    onChange={(e) => setFormNotas(e.target.value)}
                    style={{ resize: 'vertical' }}
                  />
                </div>
              </div>

              {/* Sección 3: Detalle de Productos */}
              <div style={styles.formSection}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h3 style={{ ...styles.sectionTitle, margin: 0 }}>3. PRODUCTOS EN LA COTIZACIÓN</h3>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => setModalProductoPicker(true)}
                  >
                    <Plus size={16} strokeWidth={2.5} />
                    <span>+ AGREGAR PRODUCTO DESDE INVENTARIO</span>
                  </button>
                </div>

                {formItems.length === 0 ? (
                  <div style={styles.emptyItemsBox}>
                    <PackageCheck size={32} color="#A8A29E" />
                    <p style={{ marginTop: '8px', color: '#78716C', fontWeight: 600 }}>
                      No se han agregado productos. Presione "+ Agregar Producto" para buscar en el inventario.
                    </p>
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="industrial-table" style={{ fontSize: '12px' }}>
                      <thead>
                        <tr>
                          <th>CÓDIGO</th>
                          <th>DESCRIPCIÓN</th>
                          <th style={{ width: '90px', textAlign: 'center' }}>CANTIDAD</th>
                          <th style={{ width: '90px', textAlign: 'center' }}>MEDIDA</th>
                          <th style={{ width: '90px', textAlign: 'center' }}>TOTAL MED.</th>
                          <th>UNIDAD</th>
                          <th style={{ width: '120px', textAlign: 'right' }}>PRECIO UNIT (L.)</th>
                          <th style={{ width: '100px', textAlign: 'right' }}>DESC.</th>
                          <th style={{ width: '60px', textAlign: 'center' }}>EXENTO</th>
                          <th style={{ width: '120px', textAlign: 'right' }}>TOTAL LÍNEA</th>
                          <th style={{ width: '50px', textAlign: 'center' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {formItems.map((item, idx) => (
                          <tr key={item.id || idx}>
                            <td style={{ fontFamily: 'var(--font-display)', fontWeight: 800 }}>
                              {item.codigoProducto}
                            </td>
                            <td>
                              <div style={{ fontWeight: 600 }}>{item.descripcionProducto}</div>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <input
                                type="number"
                                min={0.001}
                                step="any"
                                className="form-input"
                                style={styles.tableInput}
                                value={item.cantidad}
                                onChange={(e) => handleActualizarLinea(idx, 'cantidad', e.target.value)}
                              />
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <input
                                type="number"
                                min={0.001}
                                step="any"
                                disabled={!item.usaMedida}
                                className="form-input"
                                style={{
                                  ...styles.tableInput,
                                  backgroundColor: !item.usaMedida ? '#F5F5F4' : '#FFFFFF',
                                }}
                                value={item.usaMedida ? item.medida : 1}
                                onChange={(e) => handleActualizarLinea(idx, 'medida', e.target.value)}
                              />
                            </td>
                            <td style={{ textAlign: 'center', fontWeight: 800, color: 'var(--color-primary)' }}>
                              {item.totalMedida}
                            </td>
                            <td style={{ fontWeight: 700, fontSize: '11px', textTransform: 'uppercase' }}>
                              {item.unidadMedida}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <input
                                type="number"
                                min={0}
                                step="any"
                                disabled={!canModifyPrice}
                                className="form-input"
                                style={{
                                  ...styles.tableInput,
                                  borderColor: item.precioModificado ? '#D97706' : 'var(--color-border)',
                                }}
                                value={item.precioUnitario}
                                onChange={(e) => handleActualizarLinea(idx, 'precioUnitario', e.target.value)}
                              />
                              {item.precioModificado && (
                                <div style={{ fontSize: '9px', color: '#D97706', fontWeight: 700 }}>
                                  L. {item.precioLista.toFixed(2)} (Mod)
                                </div>
                              )}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
                                <input
                                  type="number"
                                  min={0}
                                  step="any"
                                  className="form-input"
                                  style={{ ...styles.tableInput, width: '60px' }}
                                  value={item.descuento}
                                  onChange={(e) => handleActualizarLinea(idx, 'descuento', e.target.value)}
                                />
                                <button
                                  type="button"
                                  style={styles.toggleBtn}
                                  onClick={() =>
                                    handleActualizarLinea(
                                      idx,
                                      'tipoDescuento',
                                      item.tipoDescuento === 'PORCENTAJE' ? 'MONTO' : 'PORCENTAJE'
                                    )
                                  }
                                >
                                  {item.tipoDescuento === 'PORCENTAJE' ? '%' : 'L'}
                                </button>
                              </div>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={item.exento}
                                onChange={(e) => handleActualizarLinea(idx, 'exento', e.target.checked)}
                              />
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 800, whiteSpace: 'nowrap' }}>
                              {formatLempiras(item.subtotal + item.isv)}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <button
                                type="button"
                                style={styles.deleteBtn}
                                onClick={() => handleEliminarLinea(idx)}
                                title="Eliminar producto"
                              >
                                <Trash2 size={14} color="#DC2626" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Sección 4: Descuento General y Totales */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: '260px' }}>
                  <div className="form-group">
                    <label className="form-label">DESCUENTO GENERAL SOBRE LA COTIZACIÓN</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        className="form-input"
                        placeholder="0.00"
                        value={formDescuentoGeneral}
                        onChange={(e) => setFormDescuentoGeneral(Math.max(0, parseFloat(e.target.value) || 0))}
                        style={{ flex: 1 }}
                      />
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: '0 12px', fontWeight: 800 }}
                        onClick={() =>
                          setFormTipoDescuentoGeneral((prev) => (prev === 'PORCENTAJE' ? 'MONTO' : 'PORCENTAJE'))
                        }
                      >
                        {formTipoDescuentoGeneral === 'PORCENTAJE' ? '% PORCENTAJE' : 'L. MONTO FIJO'}
                      </button>
                    </div>
                  </div>
                </div>

                <div style={styles.summaryTotalsCard}>
                  <div style={styles.summaryRow}>
                    <span>Subtotal Líneas:</span>
                    <span>{formatLempiras(calculosGlobales.subtotalLineas)}</span>
                  </div>

                  {calculosGlobales.descGenMonto > 0 && (
                    <div style={{ ...styles.summaryRow, color: '#D97706' }}>
                      <span>Descuento General:</span>
                      <span>- {formatLempiras(calculosGlobales.descGenMonto)}</span>
                    </div>
                  )}

                  <div style={styles.summaryRow}>
                    <span>Subtotal Neto:</span>
                    <span>{formatLempiras(calculosGlobales.subtotalGravadoNeto)}</span>
                  </div>

                  <div style={styles.summaryRow}>
                    <span>ISV ({formPorcentajeIsv}%):</span>
                    <span>{formatLempiras(calculosGlobales.isvTotal)}</span>
                  </div>

                  <div style={{ borderTop: '2px solid #292524', marginTop: '8px', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: 900, color: 'var(--color-primary)' }}>
                    <span>TOTAL COTIZADO:</span>
                    <span>{formatLempiras(calculosGlobales.totalFinal)}</span>
                  </div>
                </div>
              </div>

              {/* Botones de Guardado */}
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '12px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setModalForm(false)}
                >
                  CANCELAR
                </button>

                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ backgroundColor: '#F5F5F4', color: '#1C1917', border: '1.5px solid #A8A29E' }}
                  onClick={() => handleGuardarFormulario('BORRADOR')}
                >
                  GUARDAR BORRADOR
                </button>

                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => handleGuardarFormulario('ENVIADA')}
                >
                  <Check size={16} strokeWidth={2.6} /> EMITIR COTIZACIÓN
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Selector de Productos del Inventario */}
      {modalProductoPicker && (
        <div style={styles.modalOverlay}>
          <div className="industrial-card" style={styles.modalCardPicker}>
            <div style={styles.modalHeader}>
              <h2 style={{ fontSize: '16px', textTransform: 'uppercase' }}>SELECCIONAR PRODUCTO DEL INVENTARIO</h2>
              <button type="button" onClick={() => setModalProductoPicker(false)} style={styles.closeBtn}>
                <X size={20} />
              </button>
            </div>

            <div style={{ marginTop: '14px' }}>
              <div style={styles.searchBox}>
                <Search size={16} color="#78716C" />
                <input
                  type="text"
                  placeholder="Buscar por Código/SKU, Nombre, Descripción o Categoría..."
                  value={searchProducto}
                  onChange={(e) => setSearchProducto(e.target.value)}
                  style={styles.searchInput}
                  autoFocus
                />
              </div>

              <div style={{ marginTop: '14px', maxHeight: '380px', overflowY: 'auto' }}>
                <table className="industrial-table" style={{ fontSize: '12px' }}>
                  <thead>
                    <tr>
                      <th>CÓDIGO</th>
                      <th>PRODUCTO</th>
                      <th>CATEGORÍA</th>
                      <th>UNIDAD</th>
                      <th style={{ textAlign: 'right' }}>PRECIO (L.)</th>
                      <th style={{ textAlign: 'center' }}>STOCK</th>
                      <th style={{ textAlign: 'center' }}>ACCIÓN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productosFiltradosModal.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', padding: '24px', color: '#78716C' }}>
                          No se encontraron productos coincidentes en inventario.
                        </td>
                      </tr>
                    ) : (
                      productosFiltradosModal.map((p) => (
                        <tr key={p.id} style={{ opacity: p.activo ? 1 : 0.5 }}>
                          <td style={{ fontFamily: 'var(--font-display)', fontWeight: 800 }}>{p.codigo}</td>
                          <td>
                            <div style={{ fontWeight: 700 }}>{p.nombre}</div>
                            {p.descripcion && <div style={{ fontSize: '10px', color: '#78716C' }}>{p.descripcion}</div>}
                          </td>
                          <td style={{ fontSize: '11px' }}>{p.categoria}</td>
                          <td style={{ fontSize: '11px', fontWeight: 700 }}>{p.unidadMedida}</td>
                          <td style={{ textAlign: 'right', fontWeight: 800 }}>{formatLempiras(p.precioVenta)}</td>
                          <td style={{ textAlign: 'center' }}>
                            <span
                              style={{
                                fontWeight: 800,
                                color: p.stockActual <= p.stockMinimo ? '#DC2626' : '#15803D',
                              }}
                            >
                              {p.stockActual}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {p.activo ? (
                              <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                onClick={() => handleSeleccionarProducto(p)}
                              >
                                SELECCIONAR
                              </button>
                            ) : (
                              <span style={{ fontSize: '10px', color: '#DC2626', fontWeight: 700 }}>INACTIVO</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Confirmar Conversión Directa a Venta */}
      {modalConvertir && (
        <div style={styles.modalOverlay}>
          <div className="industrial-card" style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <h2 style={{ fontSize: '16px', textTransform: 'uppercase' }}>
                CONVERTIR COTIZACIÓN A VENTA POS
              </h2>
              <button type="button" onClick={() => setModalConvertir(null)} style={styles.closeBtn}>
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '16px 0', fontSize: '13px', lineHeight: 1.5 }}>
              <p>
                ¿Desea convertir la <strong>Cotización #COT-{modalConvertir.numero.toString().padStart(4, '0')}</strong> en una factura de venta oficial?
              </p>
              <div style={styles.convertDetailBox}>
                <div><strong>Cliente:</strong> {modalConvertir.cliente}</div>
                {modalConvertir.rtn && <div><strong>RTN:</strong> {modalConvertir.rtn}</div>}
                <div><strong>Total a cobrar:</strong> {formatLempiras(modalConvertir.total)} (ISV 15% Incluido)</div>
                <div style={{ color: '#D97706', fontWeight: 700, marginTop: '4px' }}>
                  ⚡ Impacto en Inventario: Descontará automáticamente el stock correspondiente a los ítems solicitados.
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setModalConvertir(null)}
              >
                CANCELAR
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => handleConfirmarConvertir(modalConvertir)}
              >
                CONFIRMAR Y CONVERTIR A VENTA
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Vista Previa / Impresión de Documento Proforma PDF */}
      {modalPdf && (
        <div style={styles.modalOverlay}>
          <div className="industrial-card" style={styles.pdfModalCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <span className="badge badge-dark" style={{ letterSpacing: '0.05em' }}>
                DOCUMENTO OFICIAL PROFORMA DE COTIZACIÓN
              </span>
              <button type="button" onClick={() => setModalPdf(null)} style={styles.closeBtn}>
                <X size={20} />
              </button>
            </div>

            {/* Hoja Imprimible Proforma */}
            <div style={styles.pdfPaper}>
              {/* Header Empresa */}
              <div style={styles.pdfHeader}>
                <div>
                  <h2 style={{ color: 'var(--color-primary)', fontSize: '22px', textTransform: 'uppercase', fontFamily: 'var(--font-display)', fontWeight: 900 }}>
                    {tenant.nombreComercial || 'FERRETERÍA LA MUNDIAL'}
                  </h2>
                  <div style={{ fontSize: '11px', color: '#444' }}>
                    {tenant.direccion || 'Barrio El Centro, 3ra Ave, 4ta Calle • San Pedro Sula, Honduras'}
                  </div>
                  <div style={{ fontSize: '11px', color: '#444' }}>
                    Teléfono: {tenant.telefono || '+504 2550-1234'} • Email: {tenant.email || 'ventas@ferretek.hn'}
                  </div>
                  <div style={{ fontSize: '11px', color: '#444', fontWeight: 700 }}>
                    RTN EMPRESA: 05019002345678
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '18px', color: '#1C1917' }}>
                    COTIZACIÓN #COT-{modalPdf.numero.toString().padStart(4, '0')}
                  </div>
                  <div style={{ fontSize: '11px', color: '#78716C', marginTop: '2px' }}>
                    Fecha Emisión: {modalPdf.fechaEmision || '25/09/2026'}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--color-primary)', fontWeight: 800, marginTop: '2px' }}>
                    Válida hasta: {modalPdf.fechaValidez}
                  </div>
                  <div style={{ fontSize: '10px', color: '#78716C', marginTop: '2px' }}>
                    Condiciones: {modalPdf.condicionesPago || 'Contado'}
                  </div>
                </div>
              </div>

              <div style={{ borderBottom: '2px solid #292524', margin: '14px 0' }} />

              {/* Datos Cliente */}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <div><strong>COTIZADO A:</strong> {modalPdf.cliente}</div>
                  {modalPdf.rtn && <div><strong>RTN:</strong> {modalPdf.rtn}</div>}
                  {modalPdf.telefono && <div><strong>TELÉFONO:</strong> {modalPdf.telefono}</div>}
                  {modalPdf.direccion && <div><strong>DIRECCIÓN:</strong> {modalPdf.direccion}</div>}
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div><strong>VENDEDOR:</strong> {modalPdf.usuarioNombre || 'Atención en Tienda'}</div>
                  <div><strong>ESTADO:</strong> {modalPdf.estado}</div>
                </div>
              </div>

              {/* Tabla de Productos Proforma */}
              <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse', marginBottom: '16px' }}>
                <thead>
                  <tr style={{ borderBottom: '1.5px solid #292524', backgroundColor: '#FAFAF9' }}>
                    <th style={{ textAlign: 'left', padding: '6px' }}>CÓDIGO</th>
                    <th style={{ textAlign: 'left', padding: '6px' }}>DESCRIPCIÓN</th>
                    <th style={{ textAlign: 'center', padding: '6px' }}>CANT</th>
                    <th style={{ textAlign: 'center', padding: '6px' }}>MEDIDA</th>
                    <th style={{ textAlign: 'center', padding: '6px' }}>TOTAL MED.</th>
                    <th style={{ textAlign: 'right', padding: '6px' }}>PRECIO UNIT</th>
                    <th style={{ textAlign: 'right', padding: '6px' }}>DESC.</th>
                    <th style={{ textAlign: 'right', padding: '6px' }}>TOTAL LÍNEA</th>
                  </tr>
                </thead>
                <tbody>
                  {modalPdf.detalles && modalPdf.detalles.length > 0 ? (
                    modalPdf.detalles.map((d, i) => (
                      <tr key={d.id || i} style={{ borderBottom: '1px solid #E7E5E4' }}>
                        <td style={{ padding: '6px', fontFamily: 'var(--font-display)', fontWeight: 800 }}>{d.codigoProducto}</td>
                        <td style={{ padding: '6px', fontWeight: 600 }}>{d.descripcionProducto}</td>
                        <td style={{ padding: '6px', textAlign: 'center' }}>{d.cantidad}</td>
                        <td style={{ padding: '6px', textAlign: 'center' }}>{d.usaMedida ? d.medida : '-'}</td>
                        <td style={{ padding: '6px', textAlign: 'center', fontWeight: 700 }}>{d.totalMedida} {d.unidadMedida}</td>
                        <td style={{ padding: '6px', textAlign: 'right' }}>{formatLempiras(d.precioUnitario)}</td>
                        <td style={{ padding: '6px', textAlign: 'right' }}>{d.descuento > 0 ? formatLempiras(d.descuento) : 'L. 0.00'}</td>
                        <td style={{ padding: '6px', textAlign: 'right', fontWeight: 800 }}>{formatLempiras(d.subtotal + d.isv)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td style={{ padding: '8px 6px' }}>PARTIDA-01</td>
                      <td style={{ padding: '8px 6px' }}>Partida General de Materiales de Construcción</td>
                      <td style={{ padding: '8px 6px', textAlign: 'center' }}>1</td>
                      <td style={{ padding: '8px 6px', textAlign: 'center' }}>-</td>
                      <td style={{ padding: '8px 6px', textAlign: 'center' }}>1 UNIDAD</td>
                      <td style={{ padding: '8px 6px', textAlign: 'right' }}>{formatLempiras(modalPdf.subtotal)}</td>
                      <td style={{ padding: '8px 6px', textAlign: 'right' }}>L. 0.00</td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 800 }}>{formatLempiras(modalPdf.total)}</td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* Sección de Totales */}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1.5px solid #292524', paddingTop: '10px' }}>
                <div style={{ fontSize: '10px', color: '#57534E', maxWidth: '320px' }}>
                  {modalPdf.notas && (
                    <div style={{ marginBottom: '6px' }}>
                      <strong>Notas:</strong> {modalPdf.notas}
                    </div>
                  )}
                  <div>* Precios expresados en Lempiras (HNL) sujetas a disponibilidad al momento de la orden.</div>
                  <div>* Esta proforma no representa un documento fiscal de venta.</div>
                </div>

                <div style={{ textAlign: 'right', fontSize: '12px', minWidth: '200px' }}>
                  <div>Subtotal: {formatLempiras(modalPdf.subtotal)}</div>
                  {(modalPdf.descuento || 0) > 0 && <div>Descuento: - {formatLempiras(modalPdf.descuento || 0)}</div>}
                  <div>ISV (15%): {formatLempiras(modalPdf.isv)}</div>
                  <div style={{ fontSize: '16px', fontWeight: 900, color: 'var(--color-primary)', marginTop: '6px', borderTop: '1px solid #292524', paddingTop: '4px' }}>
                    VALOR A PAGAR: {formatLempiras(modalPdf.total)}
                  </div>
                </div>
              </div>

              {/* Firmas */}
              <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: '36px', textAlign: 'center', fontSize: '10px', color: '#78716C' }}>
                <div>
                  <div style={{ borderBottom: '1px solid #A8A29E', width: '160px', marginBottom: '4px' }} />
                  <div>Elaborado Por / Vendedor</div>
                </div>
                <div>
                  <div style={{ borderBottom: '1px solid #A8A29E', width: '160px', marginBottom: '4px' }} />
                  <div>Aceptado Por / Cliente</div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
              <button type="button" className="btn btn-secondary" onClick={() => window.print()} style={{ flex: 1 }}>
                <Printer size={16} /> IMPRIMIR PDF PROFORMA
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setModalPdf(null)} style={{ flex: 1 }}>
                CERRAR VISTA PREVIA
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minHeight: '100vh',
    backgroundColor: 'var(--color-bg)',
  },
  content: {
    padding: '24px 32px 48px',
    maxWidth: '1400px',
    width: '100%',
  },
  successBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 18px',
    border: '2px solid',
    borderRadius: 'var(--radius-xs)',
    marginBottom: '20px',
  },
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '16px',
    marginBottom: '20px',
  },
  metricCard: {
    backgroundColor: '#FFFFFF',
    border: '2px solid var(--color-border)',
    borderRadius: 'var(--radius-xs)',
    padding: '16px',
    boxShadow: 'var(--shadow-sm)',
  },
  metricHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: '11px',
    fontWeight: 800,
    color: '#78716C',
    letterSpacing: '0.04em',
  },
  metricValue: {
    fontSize: '22px',
    fontWeight: 900,
    fontFamily: 'var(--font-display)',
    marginTop: '6px',
    color: '#1C1917',
  },
  metricSub: {
    fontSize: '11px',
    color: '#A8A29E',
    marginTop: '2px',
  },
  actionsBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '14px',
    backgroundColor: '#FFFFFF',
    padding: '12px 16px',
    border: '2px solid var(--color-border)',
    borderRadius: 'var(--radius-xs)',
  },
  searchBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: '#FAFAF9',
    border: '1.5px solid var(--color-border)',
    borderRadius: 'var(--radius-xs)',
    padding: '0 12px',
    height: '38px',
    flex: 1,
    minWidth: '240px',
  },
  searchInput: {
    border: 'none',
    outline: 'none',
    backgroundColor: 'transparent',
    width: '100%',
    fontSize: '13px',
    fontFamily: 'inherit',
  },
  clearBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    color: '#78716C',
  },
  stateSelect: {
    height: '28px',
    fontSize: '10px',
    fontWeight: 800,
    borderRadius: 'var(--radius-xs)',
    border: '1.5px solid var(--color-border)',
    backgroundColor: '#FAFAF9',
    cursor: 'pointer',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.65)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
    padding: '20px',
    overflowY: 'auto',
  },
  modalCard: {
    width: '100%',
    maxWidth: '520px',
    backgroundColor: '#FFFFFF',
  },
  modalCardPicker: {
    width: '100%',
    maxWidth: '850px',
    backgroundColor: '#FFFFFF',
  },
  largeModalCard: {
    width: '100%',
    maxWidth: '1100px',
    backgroundColor: '#FFFFFF',
    maxHeight: '90vh',
    overflowY: 'auto',
  },
  pdfModalCard: {
    width: '100%',
    maxWidth: '750px',
    backgroundColor: '#FFFFFF',
    maxHeight: '92vh',
    overflowY: 'auto',
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: '12px',
    borderBottom: '2px solid var(--color-border)',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#1C1917',
  },
  formSection: {
    backgroundColor: '#FAFAF9',
    border: '1.5px solid var(--color-border)',
    borderRadius: 'var(--radius-xs)',
    padding: '14px 16px',
  },
  sectionTitle: {
    fontSize: '12px',
    fontWeight: 800,
    color: '#292524',
    letterSpacing: '0.04em',
    marginBottom: '10px',
  },
  emptyItemsBox: {
    padding: '30px',
    textAlign: 'center',
    backgroundColor: '#FFFFFF',
    border: '2px dashed #D6D3D1',
    borderRadius: 'var(--radius-xs)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tableInput: {
    height: '30px',
    padding: '2px 6px',
    fontSize: '12px',
    textAlign: 'center',
  },
  toggleBtn: {
    height: '30px',
    padding: '0 8px',
    fontSize: '11px',
    fontWeight: 800,
    backgroundColor: '#E7E5E4',
    border: '1px solid #A8A29E',
    borderRadius: 'var(--radius-xs)',
    cursor: 'pointer',
  },
  deleteBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px',
  },
  summaryTotalsCard: {
    backgroundColor: '#FFFFFF',
    border: '2px solid var(--color-border)',
    borderRadius: 'var(--radius-xs)',
    padding: '14px 18px',
    minWidth: '280px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    fontSize: '13px',
    fontWeight: 700,
  },
  summaryRow: {
    display: 'flex',
    justifyContent: 'space-between',
    color: '#44403C',
  },
  convertDetailBox: {
    backgroundColor: '#FAFAF9',
    border: '1.5px solid var(--color-border)',
    borderRadius: 'var(--radius-xs)',
    padding: '12px',
    marginTop: '10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    fontSize: '12px',
  },
  pdfPaper: {
    backgroundColor: '#FFFFFF',
    border: '2px solid #292524',
    padding: '28px',
    boxShadow: '4px 4px 0px #292524',
  },
  pdfHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
};
