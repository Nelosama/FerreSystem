import React, { useState, useMemo } from 'react';
import {
  BarChart3,
  TrendingUp,
  Download,
  Calendar,
  Filter,
  DollarSign,
  ShoppingBag,
  AlertTriangle,
  FileText,
  Users,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle,
  Clock,
  Truck,
  Bookmark,
  Shield,
  GitBranch,
  RotateCcw,
} from 'lucide-react';
import { TopBar } from '../components/TopBar';
import { MetricCard } from '../components/MetricCard';
import { useMockData } from '../context/MockDataContext';
import { useTenant } from '../context/TenantContext';
import { exportToCSV } from '../utils/csvExport';

type PresetRango = 'HOY' | 'SEMANA' | 'MES' | 'PERSONALIZADO';
type TabName = 'VENTAS' | 'INVENTARIO' | 'COTIZACIONES' | 'OPERACIONES' | 'CLIENTES';

export const ReportesPage: React.FC = () => {
  const { productos, cotizaciones, ventas } = useMockData();
  const { tenant } = useTenant();

  // Permisos de módulos habilitados para el tenant
  const modulosHabilitados = useMemo(
    () =>
      tenant.modulosHabilitados || [
        'inventario',
        'pos',
        'cotizaciones',
        'usuarios',
        'configuracion',
        'apartados',
        'arqueo_caja',
        'ordenes_compra',
        'transferencias_sucursal',
        'garantias',
        'pedidos_especiales',
        'listas_precio',
        'comisiones_venta',
        'reportes',
      ],
    [tenant.modulosHabilitados],
  );

  const isModuleEnabled = React.useCallback(
    (moduleKey: string) => modulosHabilitados.includes(moduleKey),
    [modulosHabilitados],
  );

  // Pestaña Activa
  const [tabActiva, setTabActiva] = useState<TabName>('VENTAS');

  // Filtro de Rango de Fechas Global
  const [presetRango, setPresetRango] = useState<PresetRango>('MES');
  const [fechaInicio, setFechaInicio] = useState<string>(() => {
    const d = new Date();
    d.setDate(1); // Primer día del mes actual
    return d.toISOString().split('T')[0];
  });
  const [fechaFin, setFechaFin] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });

  // Días de inactividad para filtro de productos sin movimiento (default 30 días)
  const [diasSinMovimiento, setDiasSinMovimiento] = useState<number>(30);

  // Manejador del cambio de preset
  const handlePresetChange = (preset: PresetRango) => {
    setPresetRango(preset);
    const hoy = new Date();
    const hoyStr = hoy.toISOString().split('T')[0];

    if (preset === 'HOY') {
      setFechaInicio(hoyStr);
      setFechaFin(hoyStr);
    } else if (preset === 'SEMANA') {
      const inicioSem = new Date(hoy);
      const day = inicioSem.getDay();
      const diff = inicioSem.getDate() - day + (day === 0 ? -6 : 1); // lunes
      inicioSem.setDate(diff);
      setFechaInicio(inicioSem.toISOString().split('T')[0]);
      setFechaFin(hoyStr);
    } else if (preset === 'MES') {
      const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      setFechaInicio(inicioMes.toISOString().split('T')[0]);
      setFechaFin(hoyStr);
    }
  };

  // Cálculo de fechas de inicio y fin en timestamp (rango inclusivo todo el día)
  const { startMs, endMs, prevStartMs, prevEndMs, daysDiff } = useMemo(() => {
    const start = new Date(fechaInicio + 'T00:00:00.000Z').getTime();
    const end = new Date(fechaFin + 'T23:59:59.999Z').getTime();
    const duration = end - start;

    const prevEnd = start - 1;
    const prevStart = prevEnd - duration;

    const days = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)));

    return {
      startMs: start,
      endMs: end,
      prevStartMs: prevStart,
      prevEndMs: prevEnd,
      daysDiff: days,
    };
  }, [fechaInicio, fechaFin]);

  // ==========================================
  // FILTRADO REACTIVO DE DATOS
  // ==========================================

  // Ventas del período actual
  const ventasPeriodo = useMemo(() => {
    return ventas.filter((v) => {
      const vTime = new Date(v.fecha).getTime();
      return vTime >= startMs && vTime <= endMs;
    });
  }, [ventas, startMs, endMs]);

  // Ventas del período anterior equivalente
  const ventasPeriodoAnterior = useMemo(() => {
    return ventas.filter((v) => {
      const vTime = new Date(v.fecha).getTime();
      return vTime >= prevStartMs && vTime <= prevEndMs;
    });
  }, [ventas, prevStartMs, prevEndMs]);

  // Cotizaciones del período actual
  const cotizacionesPeriodo = useMemo(() => {
    return cotizaciones.filter((c) => {
      // Normalizar fecha de emisión (es-HN format "DD/MM/YYYY" o ISO)
      let cTime = 0;
      if (c.fechaEmision.includes('/')) {
        const parts = c.fechaEmision.split('/');
        cTime = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T12:00:00.000Z`).getTime();
      } else {
        cTime = new Date(c.fechaEmision).getTime();
      }
      return cTime >= startMs && cTime <= endMs;
    });
  }, [cotizaciones, startMs, endMs]);

  // ==========================================
  // METRICAS DE LA PESTAÑA VENTAS
  // ==========================================
  const totalVendido = useMemo(() => ventasPeriodo.reduce((acc, v) => acc + v.total, 0), [ventasPeriodo]);
  const cantidadTransacciones = ventasPeriodo.length;
  const ticketPromedio = cantidadTransacciones > 0 ? totalVendido / cantidadTransacciones : 0;

  const totalVendidoAnterior = useMemo(() => ventasPeriodoAnterior.reduce((acc, v) => acc + v.total, 0), [ventasPeriodoAnterior]);
  const variacionVentas = totalVendidoAnterior > 0
    ? ((totalVendido - totalVendidoAnterior) / totalVendidoAnterior) * 100
    : totalVendido > 0 ? 100 : 0;

  // Ventas por categoría
  const ventasPorCategoria = useMemo(() => {
    const catMap: Record<string, { total: number; cantidad: number }> = {};
    ventasPeriodo.forEach((v) => {
      v.items.forEach((item) => {
        let cat = item.categoria;
        if (!cat) {
          const prodObj = productos.find((p) => p.id === item.productoId);
          cat = prodObj?.categoria || 'General';
        }
        if (!catMap[cat]) catMap[cat] = { total: 0, cantidad: 0 };
        catMap[cat].total += item.precioUnitario * item.cantidad;
        catMap[cat].cantidad += item.cantidad;
      });
    });

    return Object.entries(catMap).map(([categoria, datos]) => ({
      categoria,
      total: datos.total,
      cantidad: datos.cantidad,
      porcentaje: totalVendido > 0 ? (datos.total / totalVendido) * 100 : 0,
    })).sort((a, b) => b.total - a.total);
  }, [ventasPeriodo, productos, totalVendido]);

  // Ventas por vendedor
  const ventasPorVendedor = useMemo(() => {
    const vendMap: Record<string, { total: number; transacciones: number }> = {};
    ventasPeriodo.forEach((v) => {
      const vend = v.vendedorNombre || 'Mostrador / Sistema';
      if (!vendMap[vend]) vendMap[vend] = { total: 0, transacciones: 0 };
      vendMap[vend].total += v.total;
      vendMap[vend].transacciones += 1;
    });

    return Object.entries(vendMap).map(([vendedor, datos]) => ({
      vendedor,
      total: datos.total,
      transacciones: datos.transacciones,
      ticketPromedio: datos.transacciones > 0 ? datos.total / datos.transacciones : 0,
    })).sort((a, b) => b.total - a.total);
  }, [ventasPeriodo]);

  // Ventas por método de pago
  const ventasPorMetodoPago = useMemo(() => {
    const metMap: Record<string, { total: number; transacciones: number }> = {
      EFECTIVO: { total: 0, transacciones: 0 },
      TARJETA: { total: 0, transacciones: 0 },
      CREDITO: { total: 0, transacciones: 0 },
    };

    ventasPeriodo.forEach((v) => {
      const m = v.metodoPago || 'EFECTIVO';
      if (metMap[m]) {
        metMap[m].total += v.total;
        metMap[m].transacciones += 1;
      }
    });

    return [
      { metodo: 'EFECTIVO', label: 'Efectivo en Caja', ...metMap.EFECTIVO },
      { metodo: 'TARJETA', label: 'Tarjeta de Débito/Crédito', ...metMap.TARJETA },
      { metodo: 'CREDITO', label: 'Crédito Directo Cliente', ...metMap.CREDITO },
    ];
  }, [ventasPeriodo]);

  // Top 10 Clientes
  const top10Clientes = useMemo(() => {
    const cliMap: Record<string, { total: number; transacciones: number; rtn?: string }> = {};
    ventasPeriodo.forEach((v) => {
      const cli = v.clienteNombre || 'Consumidor Final';
      if (!cliMap[cli]) cliMap[cli] = { total: 0, transacciones: 0, rtn: v.clienteRtn };
      cliMap[cli].total += v.total;
      cliMap[cli].transacciones += 1;
    });

    return Object.entries(cliMap)
      .map(([cliente, datos]) => ({
        cliente,
        rtn: datos.rtn || 'N/A',
        total: datos.total,
        transacciones: datos.transacciones,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [ventasPeriodo]);

  // ==========================================
  // METRICAS DE LA PESTAÑA INVENTARIO
  // ==========================================
  const valorizacionInventario = useMemo(() => {
    const costoTotal = productos.reduce((acc, p) => acc + p.stockActual * p.precioCosto, 0);
    const ventaTotal = productos.reduce((acc, p) => acc + p.stockActual * p.precioVenta, 0);
    const margenPotencial = ventaTotal - costoTotal;
    const margenPct = ventaTotal > 0 ? (margenPotencial / ventaTotal) * 100 : 0;

    return { costoTotal, ventaTotal, margenPotencial, margenPct };
  }, [productos]);

  // Productos sin movimiento en los últimos X días
  const productosSinMovimiento = useMemo(() => {
    const cutoffTime = Date.now() - diasSinMovimiento * 24 * 60 * 60 * 1000;
    const productosVendidosRecientes = new Set<string>();

    ventas.forEach((v) => {
      if (new Date(v.fecha).getTime() >= cutoffTime) {
        v.items.forEach((item) => productosVendidosRecientes.add(item.productoId));
      }
    });

    return productos.filter((p) => !productosVendidosRecientes.has(p.id));
  }, [productos, ventas, diasSinMovimiento]);

  // Cantidad vendida acumulada por producto en el rango de fechas
  const productosConVentaRango = useMemo(() => {
    const map: Record<string, { cantidad: number; totalMonto: number }> = {};
    ventasPeriodo.forEach((v) => {
      v.items.forEach((item) => {
        if (!map[item.productoId]) map[item.productoId] = { cantidad: 0, totalMonto: 0 };
        map[item.productoId].cantidad += item.cantidad;
        map[item.productoId].totalMonto += item.precioUnitario * item.cantidad;
      });
    });
    return map;
  }, [ventasPeriodo]);

  // Top 10 más vendidos
  const top10MasVendidos = useMemo(() => {
    return productos
      .map((p) => ({
        id: p.id,
        codigo: p.codigo,
        nombre: p.nombre,
        categoria: p.categoria,
        cantidadVendida: productosConVentaRango[p.id]?.cantidad || 0,
        montoTotal: productosConVentaRango[p.id]?.totalMonto || 0,
      }))
      .filter((p) => p.cantidadVendida > 0)
      .sort((a, b) => b.cantidadVendida - a.cantidadVendida)
      .slice(0, 10);
  }, [productos, productosConVentaRango]);

  // Top 10 menor rotación
  const top10MenorRotacion = useMemo(() => {
    return productos
      .map((p) => ({
        id: p.id,
        codigo: p.codigo,
        nombre: p.nombre,
        categoria: p.categoria,
        stockActual: p.stockActual,
        cantidadVendida: productosConVentaRango[p.id]?.cantidad || 0,
      }))
      .sort((a, b) => a.cantidadVendida - b.cantidadVendida)
      .slice(0, 10);
  }, [productos, productosConVentaRango]);

  // Margen de ganancia por producto
  const productosMargenGanancia = useMemo(() => {
    return productos.map((p) => {
      const ganancia = p.precioVenta - p.precioCosto;
      const margenPct = p.precioVenta > 0 ? (ganancia / p.precioVenta) * 100 : 0;
      return {
        id: p.id,
        codigo: p.codigo,
        nombre: p.nombre,
        categoria: p.categoria,
        precioCosto: p.precioCosto,
        precioVenta: p.precioVenta,
        gananciaUnitaria: ganancia,
        margenPct,
      };
    }).sort((a, b) => b.margenPct - a.margenPct);
  }, [productos]);

  // Lista de stock bajo
  const productosStockBajo = useMemo(() => {
    return productos.filter((p) => p.stockBajo || p.stockActual <= p.stockMinimo);
  }, [productos]);

  // ==========================================
  // METRICAS DE LA PESTAÑA COTIZACIONES
  // ==========================================
  const cotizacionesMetricas = useMemo(() => {
    const totalEmitidas = cotizacionesPeriodo.length;
    const convertidas = cotizacionesPeriodo.filter((c) => c.estado === 'CONVERTIDA');
    const tasaConversion = totalEmitidas > 0 ? (convertidas.length / totalEmitidas) * 100 : 0;

    const desgloseEstado = {
      BORRADOR: cotizacionesPeriodo.filter((c) => c.estado === 'BORRADOR').length,
      ENVIADA: cotizacionesPeriodo.filter((c) => c.estado === 'ENVIADA').length,
      APROBADA: cotizacionesPeriodo.filter((c) => c.estado === 'APROBADA').length,
      RECHAZADA: cotizacionesPeriodo.filter((c) => c.estado === 'RECHAZADA').length,
      VENCIDA: cotizacionesPeriodo.filter((c) => c.estado === 'VENCIDA').length,
      CONVERTIDA: convertidas.length,
    };

    const valorTotalCotizado = cotizacionesPeriodo.reduce((acc, c) => acc + c.total, 0);
    const valorConvertido = convertidas.reduce((acc, c) => acc + c.total, 0);

    // Próximas a vencer (siguientes 7 días)
    const hoyMs = Date.now();
    const sieteDiasMs = hoyMs + 7 * 24 * 60 * 60 * 1000;

    const proximasVencer = cotizaciones.filter((c) => {
      if (['CONVERTIDA', 'RECHAZADA', 'VENCIDA'].includes(c.estado)) return false;
      let valTime = 0;
      if (c.fechaValidez && c.fechaValidez.includes('/')) {
        const parts = c.fechaValidez.split('/');
        valTime = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T23:59:59.000Z`).getTime();
      } else if (c.fechaValidez) {
        valTime = new Date(c.fechaValidez).getTime();
      }
      return valTime >= hoyMs && valTime <= sieteDiasMs;
    });

    return {
      totalEmitidas,
      tasaConversion,
      desgloseEstado,
      valorTotalCotizado,
      valorConvertido,
      proximasVencer,
    };
  }, [cotizacionesPeriodo, cotizaciones]);

  // ==========================================
  // METRICAS DE LA PESTAÑA OPERACIONES (MÓDULOS ACTIVOS EN LOCALSTORAGE)
  // ==========================================

  // Apartados
  const apartadosDatos = useMemo(() => {
    if (!isModuleEnabled('apartados')) return null;
    const raw = localStorage.getItem('ferre_mock_apartados');
    const list: any[] = raw ? JSON.parse(raw) : [];
    const activos = list.filter((a) => a.estado === 'ACTIVO');
    const pendienteCobro = activos.reduce((acc, a) => acc + (a.saldoPendiente || 0), 0);
    return { cantidadActivos: activos.length, pendienteCobro };
  }, [isModuleEnabled]);

  // Arqueos de Caja
  const arqueosDatos = useMemo(() => {
    if (!isModuleEnabled('arqueo_caja')) return null;
    const raw = localStorage.getItem('ferre_mock_arqueos');
    const list: any[] = raw ? JSON.parse(raw) : [];

    const filtrados = list.filter((arq) => {
      const aTime = new Date(arq.fechaCierre || arq.fechaApertura || Date.now()).getTime();
      return aTime >= startMs && aTime <= endMs;
    });

    const totalDiferencias = filtrados.reduce((acc, a) => acc + (a.diferencia || 0), 0);
    return { historial: filtrados, totalDiferencias };
  }, [isModuleEnabled, startMs, endMs]);

  // Órdenes de Compra
  const ordenesCompraDatos = useMemo(() => {
    if (!isModuleEnabled('ordenes_compra')) return null;
    const raw = localStorage.getItem('ferre_mock_ordenes');
    const list: any[] = raw ? JSON.parse(raw) : [];

    const filtradas = list.filter((o) => {
      const oTime = new Date(o.fechaEmision || Date.now()).getTime();
      return oTime >= startMs && oTime <= endMs;
    });

    const pendientes = filtradas.filter((o) => o.estado === 'PENDIENTE').length;
    const recibidas = filtradas.filter((o) => o.estado === 'RECIBIDA').length;
    const montoTotal = filtradas.reduce((acc, o) => acc + (o.montoTotal || 0), 0);

    return { pendientes, recibidas, montoTotal, totalCount: filtradas.length };
  }, [isModuleEnabled, startMs, endMs]);

  // Transferencias
  const transferenciasDatos = useMemo(() => {
    if (!isModuleEnabled('transferencias_sucursal')) return null;
    const raw = localStorage.getItem('ferre_mock_transferencias');
    const list: any[] = raw ? JSON.parse(raw) : [];

    const enTransito = list.filter((t) => t.estado === 'EN_TRANSITO').length;
    const recibidas = list.filter((t) => t.estado === 'RECIBIDA').length;

    return { enTransito, recibidas, totalCount: list.length };
  }, [isModuleEnabled]);

  // Garantías
  const garantiasDatos = useMemo(() => {
    if (!isModuleEnabled('garantias')) return null;
    const raw = localStorage.getItem('ferre_mock_garantias');
    const list: any[] = raw ? JSON.parse(raw) : [];

    const vigentes = list.filter((g) => g.estado === 'VIGENTE').length;
    const vencidas = list.filter((g) => g.estado === 'VENCIDA' || g.estado === 'RECHAZADA').length;

    return { vigentes, vencidas, totalCount: list.length };
  }, [isModuleEnabled]);

  // Pedidos Especiales
  const pedidosEspecialesDatos = useMemo(() => {
    if (!isModuleEnabled('pedidos_especiales')) return null;
    const raw = localStorage.getItem('ferre_mock_pedidos_especiales');
    const list: any[] = raw ? JSON.parse(raw) : [];

    const pendientes = list.filter((p) => p.estado === 'PENDIENTE_NOTIFICAR' || p.estado === 'SOLICITADO').length;
    const entregados = list.filter((p) => p.estado === 'ENTREGADO').length;

    return { pendientes, entregados, totalCount: list.length };
  }, [isModuleEnabled]);

  // ==========================================
  // METRICAS DE LA PESTAÑA CLIENTES
  // ==========================================

  // Segmentos de Clientes (Si listas_precio está habilitado)
  const clientesSegmentosDatos = useMemo(() => {
    const rawListas = localStorage.getItem('ferre_mock_listas_precio');
    const listas: any[] = rawListas ? JSON.parse(rawListas) : [];

    // Clientes extraídos de ventas + cotizaciones
    const clienteNombres = new Set<string>();
    ventas.forEach((v) => clienteNombres.add(v.clienteNombre));
    cotizaciones.forEach((c) => clienteNombres.add(c.cliente));

    const segmentosMap: Record<string, number> = {
      'Consumidor Final': 0,
      'Mayorista / Distribuidor': 0,
      'Contratista / Constructor': 0,
    };

    clienteNombres.forEach((cli) => {
      const lower = cli.toLowerCase();
      if (lower.includes('constructora') || lower.includes('ing.') || lower.includes('taller')) {
        segmentosMap['Contratista / Constructor'] += 1;
      } else if (lower.includes('ferretería') || lower.includes('distribuidora') || lower.includes('inversiones')) {
        segmentosMap['Mayorista / Distribuidor'] += 1;
      } else {
        segmentosMap['Consumidor Final'] += 1;
      }
    });

    return {
      segmentosMap,
      listasPrecioHabilitado: isModuleEnabled('listas_precio'),
      listasCount: listas.length,
    };
  }, [ventas, cotizaciones, isModuleEnabled]);

  // Clientes Activos vs Inactivos
  const clientesActividadDatos = useMemo(() => {
    const clientesConCompraRango = new Set<string>();
    ventasPeriodo.forEach((v) => clientesConCompraRango.add(v.clienteNombre));

    const todosLosClientes = new Set<string>();
    ventas.forEach((v) => todosLosClientes.add(v.clienteNombre));
    cotizaciones.forEach((c) => todosLosClientes.add(c.cliente));

    const activosCount = clientesConCompraRango.size;
    const inactivosCount = Math.max(0, todosLosClientes.size - activosCount);

    return {
      activosCount,
      inactivosCount,
      totalClientes: todosLosClientes.size,
    };
  }, [ventasPeriodo, ventas, cotizaciones]);

  return (
    <div style={styles.container}>
      <TopBar title="MÓDULO DE REPORTES & KPIS" subtitle="Análisis Ejecutivo, Métricas Operativas & Inteligencia de Negocio" />

      <main style={styles.content}>
        {/* BARRA SUPERIOR DE FILTRO GLOBAL DE FECHAS */}
        <div className="industrial-card" style={styles.globalFilterCard}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Filter size={20} color="var(--color-primary)" />
            <span style={styles.filterTitle}>FILTRO DE FECHAS GLOBAL:</span>
          </div>

          <div style={styles.presetsRow}>
            {(['HOY', 'SEMANA', 'MES', 'PERSONALIZADO'] as PresetRango[]).map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => handlePresetChange(preset)}
                style={{
                  ...styles.presetBtn,
                  ...(presetRango === preset ? styles.presetBtnActive : {}),
                }}
              >
                {preset === 'HOY' && 'HOY'}
                {preset === 'SEMANA' && 'ESTA SEMANA'}
                {preset === 'MES' && 'ESTE MES'}
                {preset === 'PERSONALIZADO' && 'PERSONALIZADO'}
              </button>
            ))}
          </div>

          <div style={styles.dateInputsRow}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Calendar size={15} color="#78716C" />
              <label style={styles.dateLabel}>DESDE:</label>
              <input
                type="date"
                value={fechaInicio}
                onChange={(e) => {
                  setFechaInicio(e.target.value);
                  setPresetRango('PERSONALIZADO');
                }}
                className="form-input"
                style={{ padding: '4px 8px', fontSize: '12px' }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label style={styles.dateLabel}>HASTA:</label>
              <input
                type="date"
                value={fechaFin}
                onChange={(e) => {
                  setFechaFin(e.target.value);
                  setPresetRango('PERSONALIZADO');
                }}
                className="form-input"
                style={{ padding: '4px 8px', fontSize: '12px' }}
              />
            </div>
          </div>
        </div>

        {/* NAVEGACIÓN POR PESTAÑAS (TABS) */}
        <div style={styles.tabsContainer}>
          <button
            type="button"
            onClick={() => setTabActiva('VENTAS')}
            style={{
              ...styles.tabBtn,
              ...(tabActiva === 'VENTAS' ? styles.tabBtnActive : {}),
            }}
          >
            <DollarSign size={16} />
            <span>VENTAS</span>
          </button>

          <button
            type="button"
            onClick={() => setTabActiva('INVENTARIO')}
            style={{
              ...styles.tabBtn,
              ...(tabActiva === 'INVENTARIO' ? styles.tabBtnActive : {}),
            }}
          >
            <ShoppingBag size={16} />
            <span>INVENTARIO</span>
          </button>

          <button
            type="button"
            onClick={() => setTabActiva('COTIZACIONES')}
            style={{
              ...styles.tabBtn,
              ...(tabActiva === 'COTIZACIONES' ? styles.tabBtnActive : {}),
            }}
          >
            <FileText size={16} />
            <span>COTIZACIONES</span>
          </button>

          <button
            type="button"
            onClick={() => setTabActiva('OPERACIONES')}
            style={{
              ...styles.tabBtn,
              ...(tabActiva === 'OPERACIONES' ? styles.tabBtnActive : {}),
            }}
          >
            <Layers size={16} />
            <span>OPERACIONES</span>
          </button>

          <button
            type="button"
            onClick={() => setTabActiva('CLIENTES')}
            style={{
              ...styles.tabBtn,
              ...(tabActiva === 'CLIENTES' ? styles.tabBtnActive : {}),
            }}
          >
            <Users size={16} />
            <span>CLIENTES</span>
          </button>
        </div>

        {/* ==========================================
            PESTAÑA 1: VENTAS
        ========================================== */}
        {tabActiva === 'VENTAS' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* KPI Cards de Ventas */}
            <div style={styles.metricsGrid}>
              <MetricCard
                title="TOTAL VENDIDO EN PERÍODO"
                value={`L. ${totalVendido.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                highlightValue
                badgeText={`${variacionVentas >= 0 ? '+' : ''}${variacionVentas.toFixed(1)}% vs período anterior`}
                badgeVariant={variacionVentas >= 0 ? 'success' : 'danger'}
                badgeIcon={variacionVentas >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                watermarkIcon={<DollarSign size={80} />}
              />

              <MetricCard
                title="CANTIDAD DE TRANSACCIONES"
                value={cantidadTransacciones}
                badgeText={`${daysDiff} días evaluados`}
                badgeVariant="neutral"
                badgeIcon={<Calendar size={14} />}
                watermarkIcon={<ShoppingBag size={80} />}
              />

              <MetricCard
                title="TICKET PROMEDIO"
                value={`L. ${ticketPromedio.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                badgeText="Promedio por venta"
                badgeVariant="warning"
                badgeIcon={<TrendingUp size={14} />}
                watermarkIcon={<BarChart3 size={80} />}
              />
            </div>

            {/* Ventas por Categoría */}
            <div className="industrial-card" style={styles.sectionCard}>
              <div style={styles.sectionHeader}>
                <div>
                  <h3 style={styles.sectionTitle}>VENTAS POR CATEGORÍA DE PRODUCTO</h3>
                  <span style={styles.sectionSubtitle}>Monto recaudado y proporción del catálogo en el período</span>
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={() => exportToCSV('ventas_por_categoria', ventasPorCategoria)}
                >
                  <Download size={14} /> EXPORTAR CSV
                </button>
              </div>

              <div className="table-container" style={{ marginTop: '14px' }}>
                <table className="industrial-table">
                  <thead>
                    <tr>
                      <th>CATEGORÍA</th>
                      <th style={{ textAlign: 'center' }}>UNIDADES SOLD</th>
                      <th style={{ textAlign: 'right' }}>MONTO TOTAL</th>
                      <th style={{ textAlign: 'center' }}>% DEL TOTAL</th>
                      <th>PARTICIPACIÓN VISUAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ventasPorCategoria.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', color: '#78716C', padding: '20px' }}>
                          No hay registros de ventas en el período seleccionado.
                        </td>
                      </tr>
                    ) : (
                      ventasPorCategoria.map((row) => (
                        <tr key={row.categoria}>
                          <td style={{ fontWeight: 800 }}>{row.categoria}</td>
                          <td style={{ textAlign: 'center' }}>{row.cantidad}</td>
                          <td style={{ textAlign: 'right', fontWeight: 800 }}>
                            L. {row.total.toLocaleString('es-HN', { minimumFractionDigits: 2 })}
                          </td>
                          <td style={{ textAlign: 'center' }}>{row.porcentaje.toFixed(1)}%</td>
                          <td style={{ width: '200px' }}>
                            <div style={styles.progressBarTrack}>
                              <div
                                style={{
                                  ...styles.progressBarFill,
                                  width: `${Math.min(100, row.porcentaje)}%`,
                                }}
                              />
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Ventas por Vendedor y Método de Pago (2 Columnas) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px' }}>
              {/* Ventas por Vendedor */}
              <div className="industrial-card" style={styles.sectionCard}>
                <div style={styles.sectionHeader}>
                  <div>
                    <h3 style={styles.sectionTitle}>VENTAS POR VENDEDOR / USUARIO</h3>
                    <span style={styles.sectionSubtitle}>Rendimiento individual de caja</span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    onClick={() => exportToCSV('ventas_por_vendedor', ventasPorVendedor)}
                  >
                    <Download size={14} /> CSV
                  </button>
                </div>

                <div className="table-container" style={{ marginTop: '14px' }}>
                  <table className="industrial-table">
                    <thead>
                      <tr>
                        <th>VENDEDOR</th>
                        <th style={{ textAlign: 'center' }}>TRANS.</th>
                        <th style={{ textAlign: 'right' }}>TOTAL VENDIDO</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ventasPorVendedor.length === 0 ? (
                        <tr>
                          <td colSpan={3} style={{ textAlign: 'center', color: '#78716C' }}>
                            Sin datos en el rango seleccionado.
                          </td>
                        </tr>
                      ) : (
                        ventasPorVendedor.map((v) => (
                          <tr key={v.vendedor}>
                            <td style={{ fontWeight: 700 }}>{v.vendedor}</td>
                            <td style={{ textAlign: 'center' }}>{v.transacciones}</td>
                            <td style={{ textAlign: 'right', fontWeight: 800 }}>
                              L. {v.total.toLocaleString('es-HN', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Ventas por Método de Pago */}
              <div className="industrial-card" style={styles.sectionCard}>
                <div style={styles.sectionHeader}>
                  <div>
                    <h3 style={styles.sectionTitle}>VENTAS POR MÉTODO DE PAGO</h3>
                    <span style={styles.sectionSubtitle}>Efectivo vs Tarjeta vs Crédito</span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    onClick={() => exportToCSV('ventas_por_metodo_pago', ventasPorMetodoPago)}
                  >
                    <Download size={14} /> CSV
                  </button>
                </div>

                <div className="table-container" style={{ marginTop: '14px' }}>
                  <table className="industrial-table">
                    <thead>
                      <tr>
                        <th>MÉTODO DE PAGO</th>
                        <th style={{ textAlign: 'center' }}>OPERACIONES</th>
                        <th style={{ textAlign: 'right' }}>RECAUDADO</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ventasPorMetodoPago.map((m) => (
                        <tr key={m.metodo}>
                          <td style={{ fontWeight: 800 }}>{m.label}</td>
                          <td style={{ textAlign: 'center' }}>{m.transacciones}</td>
                          <td style={{ textAlign: 'right', fontWeight: 800 }}>
                            L. {m.total.toLocaleString('es-HN', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Top 10 Clientes por Monto Comprado */}
            <div className="industrial-card" style={styles.sectionCard}>
              <div style={styles.sectionHeader}>
                <div>
                  <h3 style={styles.sectionTitle}>TOP 10 CLIENTES POR MONTO COMPRADO</h3>
                  <span style={styles.sectionSubtitle}>Clientes con mayor volumen de compra en el período</span>
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={() => exportToCSV('top_10_clientes', top10Clientes)}
                >
                  <Download size={14} /> EXPORTAR CSV
                </button>
              </div>

              <div className="table-container" style={{ marginTop: '14px' }}>
                <table className="industrial-table">
                  <thead>
                    <tr>
                      <th style={{ width: '60px', textAlign: 'center' }}>RANK</th>
                      <th>NOMBRE DEL CLIENTE</th>
                      <th>RTN / ID</th>
                      <th style={{ textAlign: 'center' }}>COMPRAS</th>
                      <th style={{ textAlign: 'right' }}>MONTO ACUMULADO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {top10Clientes.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', color: '#78716C' }}>
                          No hay clientes registrados en el período.
                        </td>
                      </tr>
                    ) : (
                      top10Clientes.map((c, idx) => (
                        <tr key={c.cliente}>
                          <td style={{ textAlign: 'center', fontWeight: 900, color: 'var(--color-primary)' }}>
                            #{idx + 1}
                          </td>
                          <td style={{ fontWeight: 800 }}>{c.cliente}</td>
                          <td style={{ color: '#78716C' }}>{c.rtn}</td>
                          <td style={{ textAlign: 'center' }}>{c.transacciones}</td>
                          <td style={{ textAlign: 'right', fontWeight: 900 }}>
                            L. {c.total.toLocaleString('es-HN', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ==========================================
            PESTAÑA 2: INVENTARIO
        ========================================== */}
        {tabActiva === 'INVENTARIO' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Valorización de Inventario */}
            <div style={styles.metricsGrid}>
              <MetricCard
                title="VALOR EN COSTO DE INVENTARIO"
                value={`L. ${valorizacionInventario.costoTotal.toLocaleString('es-HN', { minimumFractionDigits: 2 })}`}
                badgeText="Inversión actual en bodega"
                badgeVariant="neutral"
                badgeIcon={<ShoppingBag size={14} />}
                watermarkIcon={<ShoppingBag size={80} />}
              />

              <MetricCard
                title="VALOR EN PRECIO VENTA"
                value={`L. ${valorizacionInventario.ventaTotal.toLocaleString('es-HN', { minimumFractionDigits: 2 })}`}
                highlightValue
                badgeText="Proyección al vender todo el stock"
                badgeVariant="success"
                badgeIcon={<DollarSign size={14} />}
                watermarkIcon={<DollarSign size={80} />}
              />

              <MetricCard
                title="MARGEN POTENCIAL ESTIMADO"
                value={`L. ${valorizacionInventario.margenPotencial.toLocaleString('es-HN', { minimumFractionDigits: 2 })}`}
                valueSuffix={`(${valorizacionInventario.margenPct.toFixed(1)}%)`}
                badgeText="Diferencia Venta vs Costo"
                badgeVariant="warning"
                badgeIcon={<TrendingUp size={14} />}
                watermarkIcon={<TrendingUp size={80} />}
              />
            </div>

            {/* Top 10 Más Vendidos vs Top 10 Menor Rotación */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '20px' }}>
              {/* Top 10 Más Vendidos */}
              <div className="industrial-card" style={styles.sectionCard}>
                <div style={styles.sectionHeader}>
                  <div>
                    <h3 style={styles.sectionTitle}>TOP 10 PRODUCTOS MÁS VENDIDOS</h3>
                    <span style={styles.sectionSubtitle}>Ranking por cantidad de unidades vendidas</span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    onClick={() => exportToCSV('top_10_mas_vendidos', top10MasVendidos)}
                  >
                    <Download size={14} /> CSV
                  </button>
                </div>

                <div className="table-container" style={{ marginTop: '14px' }}>
                  <table className="industrial-table">
                    <thead>
                      <tr>
                        <th>CÓDIGO</th>
                        <th>PRODUCTO</th>
                        <th style={{ textAlign: 'center' }}>UNIDADES</th>
                        <th style={{ textAlign: 'right' }}>RECAUDADO</th>
                      </tr>
                    </thead>
                    <tbody>
                      {top10MasVendidos.length === 0 ? (
                        <tr>
                          <td colSpan={4} style={{ textAlign: 'center', color: '#78716C' }}>
                            Sin ventas en el período.
                          </td>
                        </tr>
                      ) : (
                        top10MasVendidos.map((p) => (
                          <tr key={p.id}>
                            <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{p.codigo}</td>
                            <td style={{ fontWeight: 800 }}>{p.nombre}</td>
                            <td style={{ textAlign: 'center', fontWeight: 900, color: 'var(--color-primary)' }}>
                              {p.cantidadVendida}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 700 }}>
                              L. {p.montoTotal.toLocaleString('es-HN', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Top 10 Menor Rotación */}
              <div className="industrial-card" style={styles.sectionCard}>
                <div style={styles.sectionHeader}>
                  <div>
                    <h3 style={styles.sectionTitle}>TOP 10 MENOR ROTACIÓN</h3>
                    <span style={styles.sectionSubtitle}>Productos con menor volumen de venta en el período</span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    onClick={() => exportToCSV('top_10_menor_rotacion', top10MenorRotacion)}
                  >
                    <Download size={14} /> CSV
                  </button>
                </div>

                <div className="table-container" style={{ marginTop: '14px' }}>
                  <table className="industrial-table">
                    <thead>
                      <tr>
                        <th>CÓDIGO</th>
                        <th>PRODUCTO</th>
                        <th style={{ textAlign: 'center' }}>STOCK</th>
                        <th style={{ textAlign: 'center' }}>VENDIDOS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {top10MenorRotacion.map((p) => (
                        <tr key={p.id}>
                          <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{p.codigo}</td>
                          <td style={{ fontWeight: 700 }}>{p.nombre}</td>
                          <td style={{ textAlign: 'center' }}>{p.stockActual}</td>
                          <td style={{ textAlign: 'center', fontWeight: 800, color: '#DC2626' }}>
                            {p.cantidadVendida}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Productos Sin Movimiento (Configurable días) */}
            <div className="industrial-card" style={styles.sectionCard}>
              <div style={styles.sectionHeader}>
                <div>
                  <h3 style={styles.sectionTitle}>PRODUCTOS SIN MOVIMIENTO</h3>
                  <span style={styles.sectionSubtitle}>
                    Productos que no aparecen en ninguna venta en los últimos {diasSinMovimiento} días
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: '#78716C' }}>
                      DÍAS SIN VENTA:
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={diasSinMovimiento}
                      onChange={(e) => setDiasSinMovimiento(Number(e.target.value) || 30)}
                      className="form-input"
                      style={{ width: '70px', padding: '4px 8px', fontSize: '12px', textAlign: 'center' }}
                    />
                  </div>

                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    onClick={() => exportToCSV(`productos_sin_movimiento_${diasSinMovimiento}_dias`, productosSinMovimiento)}
                  >
                    <Download size={14} /> EXPORTAR CSV
                  </button>
                </div>
              </div>

              <div className="table-container" style={{ marginTop: '14px' }}>
                <table className="industrial-table">
                  <thead>
                    <tr>
                      <th>CÓDIGO</th>
                      <th>PRODUCTO</th>
                      <th>CATEGORÍA</th>
                      <th style={{ textAlign: 'center' }}>STOCK ACTUAL</th>
                      <th style={{ textAlign: 'right' }}>COSTO UNIT.</th>
                      <th style={{ textAlign: 'right' }}>VALOR PARADO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productosSinMovimiento.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', color: '#15803D', fontWeight: 700, padding: '20px' }}>
                          ¡Excelente! Todos los productos han tenido rotación en los últimos {diasSinMovimiento} días.
                        </td>
                      </tr>
                    ) : (
                      productosSinMovimiento.map((p) => {
                        const valorParado = p.stockActual * p.precioCosto;
                        return (
                          <tr key={p.id}>
                            <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{p.codigo}</td>
                            <td style={{ fontWeight: 800 }}>{p.nombre}</td>
                            <td>{p.categoria}</td>
                            <td style={{ textAlign: 'center', fontWeight: 800 }}>{p.stockActual}</td>
                            <td style={{ textAlign: 'right' }}>
                              L. {p.precioCosto.toLocaleString('es-HN', { minimumFractionDigits: 2 })}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 800, color: '#B91C1C' }}>
                              L. {valorParado.toLocaleString('es-HN', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Margen de Ganancia por Producto */}
            <div className="industrial-card" style={styles.sectionCard}>
              <div style={styles.sectionHeader}>
                <div>
                  <h3 style={styles.sectionTitle}>MARGEN DE GANANCIA POR PRODUCTO</h3>
                  <span style={styles.sectionSubtitle}>
                    Fórmula: (Precio Venta - Precio Costo) / Precio Venta • Ordenado de mayor a menor margen
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={() => exportToCSV('margen_ganancia_productos', productosMargenGanancia)}
                >
                  <Download size={14} /> EXPORTAR CSV
                </button>
              </div>

              <div className="table-container" style={{ marginTop: '14px' }}>
                <table className="industrial-table">
                  <thead>
                    <tr>
                      <th>CÓDIGO</th>
                      <th>PRODUCTO</th>
                      <th>CATEGORÍA</th>
                      <th style={{ textAlign: 'right' }}>PRECIO COSTO</th>
                      <th style={{ textAlign: 'right' }}>PRECIO VENTA</th>
                      <th style={{ textAlign: 'right' }}>GANANCIA UNIT.</th>
                      <th style={{ textAlign: 'center' }}>MARGEN %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productosMargenGanancia.map((p) => (
                      <tr key={p.id}>
                        <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{p.codigo}</td>
                        <td style={{ fontWeight: 800 }}>{p.nombre}</td>
                        <td>{p.categoria}</td>
                        <td style={{ textAlign: 'right' }}>
                          L. {p.precioCosto.toLocaleString('es-HN', { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>
                          L. {p.precioVenta.toLocaleString('es-HN', { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 800, color: '#15803D' }}>
                          L. {p.gananciaUnitaria.toLocaleString('es-HN', { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 900 }}>
                          <span className="badge badge-success" style={{ fontSize: '11px' }}>
                            {p.margenPct.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Productos con Stock Bajo */}
            <div className="industrial-card" style={styles.sectionCard}>
              <div style={styles.sectionHeader}>
                <div>
                  <h3 style={{ ...styles.sectionTitle, color: '#B91C1C', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <AlertTriangle size={18} /> ALERTAS DE STOCK BAJO EXPORTABLES
                  </h3>
                  <span style={styles.sectionSubtitle}>Productos cuyo stock actual está en o por debajo del mínimo</span>
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={() => exportToCSV('productos_stock_bajo', productosStockBajo)}
                >
                  <Download size={14} /> EXPORTAR CSV
                </button>
              </div>

              <div className="table-container" style={{ marginTop: '14px' }}>
                <table className="industrial-table">
                  <thead>
                    <tr>
                      <th>CÓDIGO</th>
                      <th>PRODUCTO</th>
                      <th>CATEGORÍA</th>
                      <th style={{ textAlign: 'center' }}>STOCK ACTUAL</th>
                      <th style={{ textAlign: 'center' }}>STOCK MÍNIMO</th>
                      <th style={{ textAlign: 'center' }}>ESTADO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productosStockBajo.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', color: '#15803D', fontWeight: 700, padding: '20px' }}>
                          No hay alertas de stock bajo en este momento.
                        </td>
                      </tr>
                    ) : (
                      productosStockBajo.map((p) => (
                        <tr key={p.id}>
                          <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{p.codigo}</td>
                          <td style={{ fontWeight: 800 }}>{p.nombre}</td>
                          <td>{p.categoria}</td>
                          <td style={{ textAlign: 'center', fontWeight: 900, color: '#B91C1C' }}>{p.stockActual}</td>
                          <td style={{ textAlign: 'center' }}>{p.stockMinimo}</td>
                          <td style={{ textAlign: 'center' }}>
                            <span className="badge badge-danger">REABASTECER</span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ==========================================
            PESTAÑA 3: COTIZACIONES
        ========================================== */}
        {tabActiva === 'COTIZACIONES' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* KPI Cards de Cotizaciones */}
            <div style={styles.metricsGrid}>
              <MetricCard
                title="TASA DE CONVERSIÓN"
                value={`${cotizacionesMetricas.tasaConversion.toFixed(1)}%`}
                highlightValue
                badgeText={`${cotizacionesMetricas.desgloseEstado.CONVERTIDA} de ${cotizacionesMetricas.totalEmitidas} convertidas`}
                badgeVariant={cotizacionesMetricas.tasaConversion >= 20 ? 'success' : 'warning'}
                badgeIcon={<CheckCircle size={14} />}
                watermarkIcon={<TrendingUp size={80} />}
              />

              <MetricCard
                title="VALOR TOTAL COTIZADO"
                value={`L. ${cotizacionesMetricas.valorTotalCotizado.toLocaleString('es-HN', { minimumFractionDigits: 2 })}`}
                badgeText={`${cotizacionesMetricas.totalEmitidas} proformas emitidas`}
                badgeVariant="neutral"
                badgeIcon={<FileText size={14} />}
                watermarkIcon={<FileText size={80} />}
              />

              <MetricCard
                title="EFECTIVAMENTE VENDIDO"
                value={`L. ${cotizacionesMetricas.valorConvertido.toLocaleString('es-HN', { minimumFractionDigits: 2 })}`}
                badgeText="Ventas reales generadas"
                badgeVariant="success"
                badgeIcon={<DollarSign size={14} />}
                watermarkIcon={<DollarSign size={80} />}
              />
            </div>

            {/* Desglose por Estado */}
            <div className="industrial-card" style={styles.sectionCard}>
              <div style={styles.sectionHeader}>
                <div>
                  <h3 style={styles.sectionTitle}>DESGLOSE DE COTIZACIONES POR ESTADO</h3>
                  <span style={styles.sectionSubtitle}>Distribución de presupuestos según su avance comercial</span>
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={() => exportToCSV('desglose_cotizaciones_estado', Object.entries(cotizacionesMetricas.desgloseEstado).map(([estado, cantidad]) => ({ estado, cantidad })))}
                >
                  <Download size={14} /> EXPORTAR CSV
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px', marginTop: '16px' }}>
                <div style={styles.statusCard}>
                  <div style={styles.statusLabel}>BORRADOR</div>
                  <div style={styles.statusValue}>{cotizacionesMetricas.desgloseEstado.BORRADOR}</div>
                </div>
                <div style={styles.statusCard}>
                  <div style={styles.statusLabel}>ENVIADA</div>
                  <div style={{ ...styles.statusValue, color: '#0284C7' }}>{cotizacionesMetricas.desgloseEstado.ENVIADA}</div>
                </div>
                <div style={styles.statusCard}>
                  <div style={styles.statusLabel}>APROBADA</div>
                  <div style={{ ...styles.statusValue, color: '#15803D' }}>{cotizacionesMetricas.desgloseEstado.APROBADA}</div>
                </div>
                <div style={styles.statusCard}>
                  <div style={styles.statusLabel}>RECHAZADA</div>
                  <div style={{ ...styles.statusValue, color: '#DC2626' }}>{cotizacionesMetricas.desgloseEstado.RECHAZADA}</div>
                </div>
                <div style={styles.statusCard}>
                  <div style={styles.statusLabel}>VENCIDA</div>
                  <div style={{ ...styles.statusValue, color: '#D97706' }}>{cotizacionesMetricas.desgloseEstado.VENCIDA}</div>
                </div>
                <div style={styles.statusCard}>
                  <div style={styles.statusLabel}>CONVERTIDA</div>
                  <div style={{ ...styles.statusValue, color: 'var(--color-primary)' }}>{cotizacionesMetricas.desgloseEstado.CONVERTIDA}</div>
                </div>
              </div>
            </div>

            {/* Cotizaciones Próximas a Vencer (Siguientes 7 días) */}
            <div className="industrial-card" style={styles.sectionCard}>
              <div style={styles.sectionHeader}>
                <div>
                  <h3 style={styles.sectionTitle}>COTIZACIONES PRÓXIMAS A VENCER (SIGUIENTES 7 DÍAS)</h3>
                  <span style={styles.sectionSubtitle}>Proformas activas pendientes de seguimiento para no perder la venta</span>
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={() => exportToCSV('cotizaciones_proximas_vencer', cotizacionesMetricas.proximasVencer)}
                >
                  <Download size={14} /> EXPORTAR CSV
                </button>
              </div>

              <div className="table-container" style={{ marginTop: '14px' }}>
                <table className="industrial-table">
                  <thead>
                    <tr>
                      <th>COTIZACIÓN #</th>
                      <th>CLIENTE</th>
                      <th>EMISIÓN</th>
                      <th>VENCIMIENTO</th>
                      <th style={{ textAlign: 'right' }}>MONTO TOTAL</th>
                      <th style={{ textAlign: 'center' }}>ESTADO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cotizacionesMetricas.proximasVencer.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', color: '#15803D', fontWeight: 700, padding: '20px' }}>
                          No hay cotizaciones con vencimiento en los próximos 7 días.
                        </td>
                      </tr>
                    ) : (
                      cotizacionesMetricas.proximasVencer.map((c) => (
                        <tr key={c.id}>
                          <td style={{ fontWeight: 800, fontFamily: 'monospace' }}>
                            COT-{c.numero.toString().padStart(4, '0')}
                          </td>
                          <td style={{ fontWeight: 800 }}>{c.cliente}</td>
                          <td style={{ color: '#78716C' }}>{c.fechaEmision}</td>
                          <td style={{ fontWeight: 800, color: '#D97706' }}>{c.fechaValidez}</td>
                          <td style={{ textAlign: 'right', fontWeight: 900 }}>
                            L. {c.total.toLocaleString('es-HN', { minimumFractionDigits: 2 })}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span className="badge badge-warning">{c.estado}</span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ==========================================
            PESTAÑA 4: OPERACIONES
        ========================================== */}
        {tabActiva === 'OPERACIONES' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ fontSize: '13px', color: '#78716C', fontWeight: 600 }}>
              Nota: Solo se despliegan los reportes operacionales de los módulos que están habilitados para el tenant actual.
            </div>

            {/* SECCIÓN 1: APARTADOS / LAYAWAY */}
            {isModuleEnabled('apartados') && apartadosDatos && (
              <div className="industrial-card" style={styles.sectionCard}>
                <div style={styles.sectionHeader}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Bookmark size={20} color="var(--color-primary)" />
                    <div>
                      <h3 style={styles.sectionTitle}>REPORTES DE APARTADOS & RESERVAS</h3>
                      <span style={styles.sectionSubtitle}>Planes de pago y reservas de mercadería</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginTop: '16px' }}>
                  <div style={styles.statusCard}>
                    <div style={styles.statusLabel}>APARTADOS ACTIVOS</div>
                    <div style={{ ...styles.statusValue, color: '#0284C7' }}>{apartadosDatos.cantidadActivos}</div>
                  </div>

                  <div style={styles.statusCard}>
                    <div style={styles.statusLabel}>MONTO PENDIENTE DE COBRO</div>
                    <div style={{ ...styles.statusValue, color: 'var(--color-primary)' }}>
                      L. {apartadosDatos.pendienteCobro.toLocaleString('es-HN', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SECCIÓN 2: ARQUEOS DE CAJA */}
            {isModuleEnabled('arqueo_caja') && arqueosDatos && (
              <div className="industrial-card" style={styles.sectionCard}>
                <div style={styles.sectionHeader}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <DollarSign size={20} color="var(--color-primary)" />
                    <div>
                      <h3 style={styles.sectionTitle}>HISTORIAL DE ARQUEOS & CIERRES DE CAJA</h3>
                      <span style={styles.sectionSubtitle}>Sobrantes / faltantes acumulados en el período</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    onClick={() => exportToCSV('historial_arqueos_caja', arqueosDatos.historial)}
                  >
                    <Download size={14} /> EXPORTAR CSV
                  </button>
                </div>

                <div style={{ margin: '14px 0' }}>
                  <div style={{ ...styles.statusCard, display: 'inline-block', padding: '12px 20px' }}>
                    <div style={styles.statusLabel}>DIFERENCIA ACUMULADA EN EL PERÍODO</div>
                    <div style={{ ...styles.statusValue, color: arqueosDatos.totalDiferencias < 0 ? '#DC2626' : '#15803D' }}>
                      L. {arqueosDatos.totalDiferencias.toLocaleString('es-HN', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>

                <div className="table-container">
                  <table className="industrial-table">
                    <thead>
                      <tr>
                        <th>CAJERO / USUARIO</th>
                        <th>TURNO / FECHA</th>
                        <th style={{ textAlign: 'right' }}>EFE. SISTEMA</th>
                        <th style={{ textAlign: 'right' }}>EFE. DECLARADO</th>
                        <th style={{ textAlign: 'right' }}>DIFERENCIA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {arqueosDatos.historial.length === 0 ? (
                        <tr>
                          <td colSpan={5} style={{ textAlign: 'center', color: '#78716C' }}>
                            No hay cierres de caja en el período.
                          </td>
                        </tr>
                      ) : (
                        arqueosDatos.historial.map((a: any, idx: number) => (
                          <tr key={idx}>
                            <td style={{ fontWeight: 800 }}>{a.usuarioNombre || 'Cajero Cierre'}</td>
                            <td>{a.fechaCierre || a.fechaApertura || 'Fecha Turno'}</td>
                            <td style={{ textAlign: 'right' }}>
                              L. {(a.montoEsperado || a.totalSistema || 0).toLocaleString('es-HN', { minimumFractionDigits: 2 })}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              L. {(a.montoReal || a.totalDeclarado || 0).toLocaleString('es-HN', { minimumFractionDigits: 2 })}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 900, color: (a.diferencia || 0) < 0 ? '#DC2626' : '#15803D' }}>
                              L. {(a.diferencia || 0).toLocaleString('es-HN', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* SECCIÓN 3: ÓRDENES DE COMPRA */}
            {isModuleEnabled('ordenes_compra') && ordenesCompraDatos && (
              <div className="industrial-card" style={styles.sectionCard}>
                <div style={styles.sectionHeader}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Truck size={20} color="var(--color-primary)" />
                    <div>
                      <h3 style={styles.sectionTitle}>ÓRDENES DE COMPRA & PROVEEDORES</h3>
                      <span style={styles.sectionSubtitle}>Compras y recepción de inventario</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginTop: '16px' }}>
                  <div style={styles.statusCard}>
                    <div style={styles.statusLabel}>PENDIENTES DE RECEPCIÓN</div>
                    <div style={{ ...styles.statusValue, color: '#D97706' }}>{ordenesCompraDatos.pendientes}</div>
                  </div>

                  <div style={styles.statusCard}>
                    <div style={styles.statusLabel}>RECIBIDAS COMPLETADAS</div>
                    <div style={{ ...styles.statusValue, color: '#15803D' }}>{ordenesCompraDatos.recibidas}</div>
                  </div>

                  <div style={styles.statusCard}>
                    <div style={styles.statusLabel}>INVERSIÓN TOTAL EN COMPRAS</div>
                    <div style={{ ...styles.statusValue, color: 'var(--color-primary)' }}>
                      L. {ordenesCompraDatos.montoTotal.toLocaleString('es-HN', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SECCIÓN 4: TRANSFERENCIAS SUCURSAL */}
            {isModuleEnabled('transferencias_sucursal') && transferenciasDatos && (
              <div className="industrial-card" style={styles.sectionCard}>
                <div style={styles.sectionHeader}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <GitBranch size={20} color="var(--color-primary)" />
                    <div>
                      <h3 style={styles.sectionTitle}>TRANSFERENCIAS INTER-SUCURSAL</h3>
                      <span style={styles.sectionSubtitle}>Movimiento de stock entre sedes</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginTop: '16px' }}>
                  <div style={styles.statusCard}>
                    <div style={styles.statusLabel}>EN TRÁNSITO</div>
                    <div style={{ ...styles.statusValue, color: '#0284C7' }}>{transferenciasDatos.enTransito}</div>
                  </div>

                  <div style={styles.statusCard}>
                    <div style={styles.statusLabel}>RECIBIDAS EN DESTINO</div>
                    <div style={{ ...styles.statusValue, color: '#15803D' }}>{transferenciasDatos.recibidas}</div>
                  </div>
                </div>
              </div>
            )}

            {/* SECCIÓN 5: GARANTÍAS */}
            {isModuleEnabled('garantias') && garantiasDatos && (
              <div className="industrial-card" style={styles.sectionCard}>
                <div style={styles.sectionHeader}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Shield size={20} color="var(--color-primary)" />
                    <div>
                      <h3 style={styles.sectionTitle}>GARANTÍAS & CONTROL DE SERIES</h3>
                      <span style={styles.sectionSubtitle}>Coberturas vigentes vs reclamos/vencidas</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginTop: '16px' }}>
                  <div style={styles.statusCard}>
                    <div style={styles.statusLabel}>GARANTÍAS VIGENTES</div>
                    <div style={{ ...styles.statusValue, color: '#15803D' }}>{garantiasDatos.vigentes}</div>
                  </div>

                  <div style={styles.statusCard}>
                    <div style={styles.statusLabel}>VENCIDAS / FINALIZADAS</div>
                    <div style={{ ...styles.statusValue, color: '#78716C' }}>{garantiasDatos.vencidas}</div>
                  </div>
                </div>
              </div>
            )}

            {/* SECCIÓN 6: PEDIDOS ESPECIALES */}
            {isModuleEnabled('pedidos_especiales') && pedidosEspecialesDatos && (
              <div className="industrial-card" style={styles.sectionCard}>
                <div style={styles.sectionHeader}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Clock size={20} color="var(--color-primary)" />
                    <div>
                      <h3 style={styles.sectionTitle}>PEDIDOS ESPECIALES & BACKORDER</h3>
                      <span style={styles.sectionSubtitle}>Encargos de mercadería bajo solicitud</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginTop: '16px' }}>
                  <div style={styles.statusCard}>
                    <div style={styles.statusLabel}>PENDIENTES DE NOTIFICAR / ENTREGAR</div>
                    <div style={{ ...styles.statusValue, color: '#D97706' }}>{pedidosEspecialesDatos.pendientes}</div>
                  </div>

                  <div style={styles.statusCard}>
                    <div style={styles.statusLabel}>ENTREGADOS AL CLIENTE</div>
                    <div style={{ ...styles.statusValue, color: '#15803D' }}>{pedidosEspecialesDatos.entregados}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==========================================
            PESTAÑA 5: CLIENTES
        ========================================== */}
        {tabActiva === 'CLIENTES' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Actividad de Clientes */}
            <div style={styles.metricsGrid}>
              <MetricCard
                title="CLIENTES ACTIVOS EN PERÍODO"
                value={clientesActividadDatos.activosCount}
                highlightValue
                badgeText="Compraron en el rango seleccionado"
                badgeVariant="success"
                badgeIcon={<Users size={14} />}
                watermarkIcon={<Users size={80} />}
              />

              <MetricCard
                title="CLIENTES INACTIVOS"
                value={clientesActividadDatos.inactivosCount}
                badgeText="Sin compras en el período"
                badgeVariant="warning"
                badgeIcon={<RotateCcw size={14} />}
                watermarkIcon={<RotateCcw size={80} />}
              />

              <MetricCard
                title="BASE TOTAL DE CLIENTES"
                value={clientesActividadDatos.totalClientes}
                badgeText="Registrados en el sistema"
                badgeVariant="neutral"
                badgeIcon={<FileText size={14} />}
                watermarkIcon={<FileText size={80} />}
              />
            </div>

            {/* Clientes Agrupados por Segmento */}
            <div className="industrial-card" style={styles.sectionCard}>
              <div style={styles.sectionHeader}>
                <div>
                  <h3 style={styles.sectionTitle}>DISTRIBUCIÓN DE CLIENTES POR SEGMENTO DE PRECIO</h3>
                  <span style={styles.sectionSubtitle}>
                    {clientesSegmentosDatos.listasPrecioHabilitado
                      ? 'Módulo de Listas de Precio activo • Clasificación por Consumidor, Mayorista y Contratista'
                      : 'Clasificación estimada por perfil comercial'}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={() => exportToCSV('clientes_por_segmento', Object.entries(clientesSegmentosDatos.segmentosMap).map(([segmento, cantidad]) => ({ segmento, cantidad })))}
                >
                  <Download size={14} /> EXPORTAR CSV
                </button>
              </div>

              <div className="table-container" style={{ marginTop: '14px' }}>
                <table className="industrial-table">
                  <thead>
                    <tr>
                      <th>SEGMENTO COMERCIAL</th>
                      <th style={{ textAlign: 'center' }}>CANTIDAD DE CLIENTES</th>
                      <th style={{ textAlign: 'center' }}>% PROPORCIÓN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(clientesSegmentosDatos.segmentosMap).map(([segmento, cantidad]) => {
                      const pct = clientesActividadDatos.totalClientes > 0
                        ? (cantidad / clientesActividadDatos.totalClientes) * 100
                        : 0;
                      return (
                        <tr key={segmento}>
                          <td style={{ fontWeight: 800 }}>{segmento}</td>
                          <td style={{ textAlign: 'center', fontWeight: 800, color: 'var(--color-primary)' }}>
                            {cantidad}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span className="badge badge-dark">{pct.toFixed(1)}%</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
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
  globalFilterCard: {
    padding: '16px 20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '16px',
    marginBottom: '20px',
    backgroundColor: '#FFFFFF',
  },
  filterTitle: {
    fontFamily: 'var(--font-display)',
    fontWeight: 900,
    fontSize: '12px',
    letterSpacing: '0.04em',
    color: '#1C1917',
  },
  presetsRow: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },
  presetBtn: {
    padding: '6px 14px',
    fontFamily: 'var(--font-display)',
    fontWeight: 800,
    fontSize: '11px',
    letterSpacing: '0.03em',
    color: '#78716C',
    backgroundColor: '#FAFAF9',
    border: '1.5px solid #D6D3D1',
    borderRadius: 'var(--radius-xs)',
    cursor: 'pointer',
    transition: 'all 150ms ease',
  },
  presetBtnActive: {
    backgroundColor: 'var(--color-primary)',
    color: '#FFFFFF',
    borderColor: 'var(--color-primary)',
    boxShadow: 'var(--shadow-hard-sm)',
  },
  dateInputsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
  },
  dateLabel: {
    fontFamily: 'var(--font-display)',
    fontWeight: 800,
    fontSize: '10px',
    letterSpacing: '0.04em',
    color: '#78716C',
  },
  tabsContainer: {
    display: 'flex',
    gap: '10px',
    marginBottom: '24px',
    borderBottom: '2px solid #292524',
    paddingBottom: '8px',
    overflowX: 'auto',
  },
  tabBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 18px',
    fontFamily: 'var(--font-display)',
    fontWeight: 800,
    fontSize: '12px',
    letterSpacing: '0.04em',
    color: '#78716C',
    backgroundColor: '#FAFAF9',
    border: '2px solid #D6D3D1',
    borderRadius: 'var(--radius-xs)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'all 150ms ease',
  },
  tabBtnActive: {
    backgroundColor: '#1C1917',
    color: '#FAFAF9',
    borderColor: '#1C1917',
    boxShadow: '2px 2px 0px rgba(0,0,0,0.3)',
  },
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '20px',
  },
  sectionCard: {
    padding: '20px 24px',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '12px',
  },
  sectionTitle: {
    fontFamily: 'var(--font-display)',
    fontWeight: 900,
    fontSize: '14px',
    letterSpacing: '0.03em',
    textTransform: 'uppercase',
    color: '#1C1917',
  },
  sectionSubtitle: {
    fontSize: '11px',
    color: '#78716C',
    fontWeight: 500,
  },
  progressBarTrack: {
    width: '100%',
    height: '10px',
    backgroundColor: '#E7E5E4',
    borderRadius: '2px',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: 'var(--color-primary)',
    borderRadius: '2px',
    transition: 'width 300ms ease',
  },
  statusCard: {
    padding: '14px 18px',
    backgroundColor: '#FAFAF9',
    border: '1.5px solid #D6D3D1',
    borderRadius: 'var(--radius-xs)',
  },
  statusLabel: {
    fontFamily: 'var(--font-display)',
    fontWeight: 800,
    fontSize: '10px',
    letterSpacing: '0.04em',
    color: '#78716C',
    textTransform: 'uppercase',
  },
  statusValue: {
    fontFamily: 'var(--font-display)',
    fontWeight: 900,
    fontSize: '22px',
    color: '#1C1917',
    marginTop: '4px',
  },
};
