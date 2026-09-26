import React, { useState, useEffect } from 'react';
import {
  Plus,
  CheckCircle,
  Building,
  Power,
  Users,
  ShieldCheck,
  KeyRound,
  Edit2,
  Check,
  Lock,
  UserCheck,
  GitBranch,
  ExternalLink,
  Search,
  X,
  Server,
  Trash2,
} from 'lucide-react';
import { TopBar } from '../components/TopBar';
import { useTenant } from '../context/TenantContext';
import { useNavigate } from 'react-router-dom';

interface SubSucursalItem {
  id: string;
  nombre: string;
  direccion: string;
  telefono: string;
  encargado: string;
  activa: boolean;
}

interface TenantItem {
  id: string;
  nombreComercial: string;
  contacto: string;
  telefono: string;
  plan: string;
  estado: 'ACTIVO' | 'SUSPENDIDO';
  usuariosCount: number;
  sucursalesCount: number;
  colorPrimario: string;
  sucursalesList?: SubSucursalItem[];
}

interface AdminUserItem {
  id: string;
  nombre: string;
  email: string;
  tenantId: string;
  tenantNombre: string;
  activo: boolean;
  fechaCreacion: string;
}

interface AdminUserItem {
  id: string;
  nombre: string;
  email: string;
  tenantId: string;
  tenantNombre: string;
  activo: boolean;
  fechaCreacion: string;
}

const INITIAL_TENANTS: TenantItem[] = [
  {
    id: 't-1',
    nombreComercial: 'LA MUNDIAL - SUCURSAL CENTRO',
    contacto: 'admin@lamundial.hn',
    telefono: '+504 2550-1234',
    plan: 'Plan Enterprise',
    estado: 'ACTIVO',
    usuariosCount: 4,
    sucursalesCount: 3,
    colorPrimario: '#EA580C',
    sucursalesList: [
      { id: 'suc-1', nombre: 'Sucursal Centro (Principal)', direccion: 'Barrio El Centro', telefono: '+504 2550-1234', encargado: 'Carlos Ramos', activa: true },
      { id: 'suc-2', nombre: 'Sucursal Circunvalación', direccion: 'Ave. Circunvalación', telefono: '+504 2550-5678', encargado: 'Mario Rivera', activa: true },
      { id: 'suc-3', nombre: 'Sucursal Chamelecón', direccion: 'Col. Chamelecón', telefono: '+504 2550-9900', encargado: 'Ana Martínez', activa: true },
    ],
  },
  {
    id: 't-2',
    nombreComercial: 'FERRETERÍA EL MARTILLO DE ORO',
    contacto: 'admin@elmartillodeoro.hn',
    telefono: '+504 2233-4455',
    plan: 'Plan Pyme Ferretero',
    estado: 'ACTIVO',
    usuariosCount: 2,
    sucursalesCount: 1,
    colorPrimario: '#0284C7',
  },
  {
    id: 't-3',
    nombreComercial: 'DISTRIBUIDORA FERRETERA DEL SUR',
    contacto: 'gerencia@ferreterasur.hn',
    telefono: '+504 2780-9988',
    plan: 'Plan Básico',
    estado: 'SUSPENDIDO',
    usuariosCount: 1,
    sucursalesCount: 1,
    colorPrimario: '#DC2626',
  },
];

const INITIAL_ADMIN_USERS: AdminUserItem[] = [
  {
    id: 'adm-1',
    nombre: 'Carlos Ramos',
    email: 'admin@lamundial.hn',
    tenantId: 't-1',
    tenantNombre: 'LA MUNDIAL - SUCURSAL CENTRO',
    activo: true,
    fechaCreacion: '2026-01-15',
  },
  {
    id: 'adm-2',
    nombre: 'Mario Rivera',
    email: 'admin@elmartillodeoro.hn',
    tenantId: 't-2',
    tenantNombre: 'FERRETERÍA EL MARTILLO DE ORO',
    activo: true,
    fechaCreacion: '2026-02-10',
  },
  {
    id: 'adm-3',
    nombre: 'Ing. Gustavo Santos',
    email: 'gerencia@ferreterasur.hn',
    tenantId: 't-3',
    tenantNombre: 'DISTRIBUIDORA FERRETERA DEL SUR',
    activo: false,
    fechaCreacion: '2026-03-01',
  },
];

export const SuperAdminPage: React.FC = () => {
  const { impersonateTenantAdmin } = useTenant();
  const navigate = useNavigate();

  const [tabActiva, setTabActiva] = useState<'tenants' | 'admins' | 'analisis'>('tenants');
  const [tenants, setTenants] = useState<TenantItem[]>(INITIAL_TENANTS);
  const [adminUsers, setAdminUsers] = useState<AdminUserItem[]>(() => {
    const saved = localStorage.getItem('ferre_saas_admins');
    return saved ? JSON.parse(saved) : INITIAL_ADMIN_USERS;
  });

  useEffect(() => {
    localStorage.setItem('ferre_saas_tenants', JSON.stringify(tenants));
  }, [tenants]);

  useEffect(() => {
    localStorage.setItem('ferre_saas_admins', JSON.stringify(adminUsers));
  }, [adminUsers]);

  // Modales
  const [modalNuevoTenant, setModalNuevoTenant] = useState(false);
  const [modalEditarTenant, setModalEditarTenant] = useState<TenantItem | null>(null);
  const [modalSucursalesTenant, setModalSucursalesTenant] = useState<TenantItem | null>(null);
  const [modalNuevoAdmin, setModalNuevoAdmin] = useState(false);
  const [modalEditarAdmin, setModalEditarAdmin] = useState<AdminUserItem | null>(null);
  const [modalResetPassAdmin, setModalResetPassAdmin] = useState<AdminUserItem | null>(null);
  const [modalSuplantarUser, setModalSuplantarUser] = useState<TenantItem | null>(null);
  const [busquedaSuplantar, setBusquedaSuplantar] = useState('');

  // Formulario Nueva Sub-Sucursal
  const [nuevaSucursalNombre, setNuevaSucursalNombre] = useState('');
  const [nuevaSucursalDireccion, setNuevaSucursalDireccion] = useState('');
  const [nuevaSucursalTelefono, setNuevaSucursalTelefono] = useState('');
  const [nuevaSucursalEncargado, setNuevaSucursalEncargado] = useState('');

  // Formulario Editar Tenant / Marca
  const [editNombreComercial, setEditNombreComercial] = useState('');
  const [editTelefono, setEditTelefono] = useState('');
  const [editPlan, setEditPlan] = useState('');
  const [editColorPrimario, setEditColorPrimario] = useState('#EA580C');

  // Formulario nuevo tenant
  const [nombreComercial, setNombreComercial] = useState('');
  const [adminNombre, setAdminNombre] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [telefono, setTelefono] = useState('');
  const [colorPrimario, setColorPrimario] = useState('#EA580C');

  // Formulario Admin User
  const [formAdminNombre, setFormAdminNombre] = useState('');
  const [formAdminEmail, setFormAdminEmail] = useState('');
  const [formAdminPassword, setFormAdminPassword] = useState('');
  const [formAdminTenantId, setFormAdminTenantId] = useState('t-1');
  const [formAdminActivo, setFormAdminActivo] = useState(true);
  const [nuevaPasswordInput, setNuevaPasswordInput] = useState('');

  const [mensajeExito, setMensajeExito] = useState<string | null>(null);

  const toggleEstadoTenant = (id: string) => {
    setTenants(
      tenants.map((t) =>
        t.id === id ? { ...t, estado: t.estado === 'ACTIVO' ? 'SUSPENDIDO' : 'ACTIVO' } : t,
      ),
    );
  };

  const abrirModalSuplantar = (tenantItem: TenantItem) => {
    setModalSuplantarUser(tenantItem);
    setBusquedaSuplantar('');
  };

  const ejecutarSuplantacion = (usrObj: { id: string; nombre: string; email: string; rol: any }) => {
    if (!modalSuplantarUser) return;

    impersonateTenantAdmin(
      {
        id: modalSuplantarUser.id,
        nombreComercial: modalSuplantarUser.nombreComercial,
        sucursal: 'Sucursal Centro (Principal)',
        colorPrimario: modalSuplantarUser.colorPrimario,
      },
      {
        id: usrObj.id,
        nombre: usrObj.nombre,
        email: usrObj.email,
        rol: usrObj.rol,
        permisos: [
          'pos.vender',
          'pos.anular_venta',
          'pos.aplicar_descuento',
          'inventario.ver',
          'inventario.editar',
          'cotizaciones.crear',
          'cotizaciones.aprobar',
          'cotizaciones.convertir_venta',
          'reportes.ver',
          'usuarios.gestionar',
          'configuracion.editar',
        ],
        descuentoMaximo: 100,
        activo: true,
      },
    );

    setModalSuplantarUser(null);
    navigate('/');
  };

  const toggleEstadoAdmin = (id: string) => {
    setAdminUsers(
      adminUsers.map((a) => (a.id === id ? { ...a, activo: !a.activo } : a)),
    );
    setMensajeExito('¡Estado del usuario Administrador actualizado correctamente!');
    setTimeout(() => setMensajeExito(null), 4000);
  };

  const handleCrearTenant = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombreComercial || !adminEmail || !adminPassword) return;

    const newTenantId = `t-${Date.now()}`;
    const nuevoTenant: TenantItem = {
      id: newTenantId,
      nombreComercial: nombreComercial.toUpperCase().trim(),
      contacto: adminEmail.trim(),
      telefono: telefono || '+504 9000-0000',
      plan: 'Plan Pro (Trial)',
      estado: 'ACTIVO',
      usuariosCount: 1,
      sucursalesCount: 1,
      colorPrimario,
    };

    const nuevoAdmin: AdminUserItem = {
      id: `adm-${Date.now()}`,
      nombre: adminNombre.trim() || 'Admin Ferretería',
      email: adminEmail.trim(),
      tenantId: newTenantId,
      tenantNombre: nuevoTenant.nombreComercial,
      activo: true,
      fechaCreacion: new Date().toISOString().split('T')[0],
    };

    setTenants([nuevoTenant, ...tenants]);
    setAdminUsers([nuevoAdmin, ...adminUsers]);
    setModalNuevoTenant(false);
    setMensajeExito(`¡Ferretería "${nuevoTenant.nombreComercial}" y su usuario Admin creados exitosamente!`);
    setTimeout(() => setMensajeExito(null), 5000);

    // Limpiar
    setNombreComercial('');
    setAdminNombre('');
    setAdminEmail('');
    setAdminPassword('');
    setTelefono('');
  };

  const handleCrearAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formAdminNombre || !formAdminEmail || !formAdminPassword) return;

    const t = tenants.find((item) => item.id === formAdminTenantId);
    const nuevoAdmin: AdminUserItem = {
      id: `adm-${Date.now()}`,
      nombre: formAdminNombre.trim(),
      email: formAdminEmail.trim(),
      tenantId: formAdminTenantId,
      tenantNombre: t ? t.nombreComercial : 'Ferretería General',
      activo: formAdminActivo,
      fechaCreacion: new Date().toISOString().split('T')[0],
    };

    setAdminUsers([nuevoAdmin, ...adminUsers]);
    setModalNuevoAdmin(false);
    setMensajeExito(`¡Administrador "${nuevoAdmin.nombre}" asignado a "${nuevoAdmin.tenantNombre}"!`);
    setTimeout(() => setMensajeExito(null), 4000);

    setFormAdminNombre('');
    setFormAdminEmail('');
    setFormAdminPassword('');
  };

  const handleGuardarEdicionAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalEditarAdmin) return;

    const t = tenants.find((item) => item.id === formAdminTenantId);
    setAdminUsers(
      adminUsers.map((a) =>
        a.id === modalEditarAdmin.id
          ? {
              ...a,
              nombre: formAdminNombre.trim(),
              email: formAdminEmail.trim(),
              tenantId: formAdminTenantId,
              tenantNombre: t ? t.nombreComercial : a.tenantNombre,
              activo: formAdminActivo,
            }
          : a,
      ),
    );

    setModalEditarAdmin(null);
    setMensajeExito(`¡Datos de Administrador "${formAdminNombre}" actualizados!`);
    setTimeout(() => setMensajeExito(null), 4000);
  };

  const handleResetPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalResetPassAdmin || !nuevaPasswordInput) return;

    setModalResetPassAdmin(null);
    setNuevaPasswordInput('');
    setMensajeExito(`¡Contraseña restablecida exitosamente para ${modalResetPassAdmin.email}!`);
    setTimeout(() => setMensajeExito(null), 4000);
  };

  const abrirEditarAdmin = (adm: AdminUserItem) => {
    setModalEditarAdmin(adm);
    setFormAdminNombre(adm.nombre);
    setFormAdminEmail(adm.email);
    setFormAdminTenantId(adm.tenantId);
    setFormAdminActivo(adm.activo);
  };

  return (
    <div style={styles.container}>
      <TopBar title="PANEL SUPER-ADMIN (SAAS)" subtitle="Portal del Dueño de FerreSystem • Control Global & Menús" />

      <main style={styles.content}>
        {mensajeExito && (
          <div style={styles.successBanner}>
            <CheckCircle size={20} strokeWidth={2.5} color="#15803D" />
            <span style={{ fontWeight: 700, fontSize: '13px' }}>{mensajeExito}</span>
          </div>
        )}

        {/* Resumen Superior de Métricas SaaS */}
        <div style={styles.metricsRow}>
          <div className="industrial-card" style={styles.metricCard}>
            <Building size={24} strokeWidth={2.4} color="var(--color-primary)" />
            <div style={styles.metricValue}>{tenants.length}</div>
            <div style={styles.metricLabel}>FERRETERÍAS REGISTRADAS</div>
          </div>

          <div className="industrial-card" style={styles.metricCard}>
            <UserCheck size={24} strokeWidth={2.4} color="#0284C7" />
            <div style={styles.metricValue}>{adminUsers.length}</div>
            <div style={styles.metricLabel}>USUARIOS ADMINISTRADORES</div>
          </div>

          <div className="industrial-card" style={styles.metricCard}>
            <CheckCircle size={24} strokeWidth={2.4} color="#15803D" />
            <div style={styles.metricValue}>{tenants.filter((t) => t.estado === 'ACTIVO').length}</div>
            <div style={styles.metricLabel}>SUSCRIPCIONES ACTIVAS</div>
          </div>

          <div className="industrial-card" style={styles.metricCard}>
            <Server size={24} strokeWidth={2.4} color="var(--color-primary)" />
            <div style={styles.metricValue}>
              {tenants.reduce((acc, t) => acc + t.sucursalesCount, 0)}
            </div>
            <div style={styles.metricLabel}>TOTAL SUCURSALES CONECTADAS</div>
          </div>
        </div>

        {/* Navegación por Tabs del Super Admin */}
        <div style={styles.tabsContainer}>
          <button
            type="button"
            onClick={() => setTabActiva('tenants')}
            style={{
              ...styles.tabBtn,
              ...(tabActiva === 'tenants' ? styles.tabBtnActive : {}),
            }}
          >
            <Building size={16} />
            <span>FERRETERÍAS (TENANTS)</span>
          </button>

          <button
            type="button"
            onClick={() => setTabActiva('admins')}
            style={{
              ...styles.tabBtn,
              ...(tabActiva === 'admins' ? styles.tabBtnActive : {}),
            }}
          >
            <Users size={16} />
            <span>MANTENIMIENTO DE USUARIOS ADMIN</span>
          </button>

          <button
            type="button"
            onClick={() => setTabActiva('analisis')}
            style={{
              ...styles.tabBtn,
              ...(tabActiva === 'analisis' ? styles.tabBtnActive : {}),
            }}
          >
            <ShieldCheck size={16} />
            <span>ANÁLISIS DE PERMISOS Y MENÚS</span>
          </button>
        </div>

        {/* TAB 1: GESTIÓN DE TENANTS */}
        {tabActiva === 'tenants' && (
          <div>
            <div style={styles.headerRow}>
              <div>
                <h2 style={{ fontSize: '16px', textTransform: 'uppercase' }}>CLIENTES TENANTS (FERRETERÍAS)</h2>
                <p style={{ fontSize: '12px', color: '#78716C' }}>
                  Aprovisionamiento de nuevos clientes independientes y control de estado de suscripción.
                </p>
              </div>

              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setModalNuevoTenant(true)}
              >
                <Plus size={18} strokeWidth={2.5} />
                <span>NUEVO TENANT (FERRETERÍA)</span>
              </button>
            </div>

            <div className="table-container" style={{ marginTop: '20px' }}>
              <table className="industrial-table">
                <thead>
                  <tr>
                    <th>NOMBRE COMERCIAL</th>
                    <th>CONTACTO PRINCIPAL</th>
                    <th>TELÉFONO</th>
                    <th style={{ textAlign: 'center' }}>PLAN SUSCRIPCIÓN</th>
                    <th style={{ textAlign: 'center' }}>COLOR MARCA</th>
                    <th style={{ textAlign: 'center' }}>USUARIOS</th>
                    <th style={{ textAlign: 'center' }}>ESTADO</th>
                    <th style={{ textAlign: 'center' }}>ACCIONES</th>
                  </tr>
                </thead>
                <tbody>
                  {tenants.map((t) => (
                    <tr key={t.id}>
                      <td style={{ fontFamily: 'var(--font-display)', fontWeight: 800 }}>
                        <div>{t.nombreComercial}</div>
                        <div style={{ fontSize: '10px', color: '#78716C', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                          <GitBranch size={11} /> <span>{t.sucursalesCount} Sucursal(es) Conectada(s)</span>
                        </div>
                      </td>
                      <td style={{ fontWeight: 600 }}>{t.contacto}</td>
                      <td style={{ color: '#78716C' }}>{t.telefono}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span className="badge badge-dark" style={{ fontSize: '11px' }}>{t.plan}</span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <span
                            style={{
                              width: '16px',
                              height: '16px',
                              borderRadius: '2px',
                              border: '1px solid #1C1917',
                              backgroundColor: t.colorPrimario,
                            }}
                          />
                          <span style={{ fontSize: '11px', fontFamily: 'monospace' }}>{t.colorPrimario}</span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 700 }}>{t.usuariosCount}</td>
                      <td style={{ textAlign: 'center' }}>
                        {t.estado === 'ACTIVO' ? (
                          <span className="badge badge-success">ACTIVO</span>
                        ) : (
                          <span className="badge badge-danger">SUSPENDIDO</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', gap: '6px' }}>
                          <button
                            type="button"
                            className="btn btn-sm btn-secondary"
                            onClick={() => {
                              setModalSucursalesTenant(t);
                              setNuevaSucursalNombre('');
                              setNuevaSucursalDireccion('');
                              setNuevaSucursalTelefono('');
                              setNuevaSucursalEncargado('');
                            }}
                            title="Gestionar y crear sub-sucursales para esta empresa"
                          >
                            <GitBranch size={13} /> SUCURSALES
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-secondary"
                            onClick={() => {
                              setModalEditarTenant(t);
                              setEditNombreComercial(t.nombreComercial);
                              setEditTelefono(t.telefono);
                              setEditPlan(t.plan);
                              setEditColorPrimario(t.colorPrimario);
                            }}
                            title="Editar marca, color y datos de la ferretería"
                          >
                            <Edit2 size={13} /> MARCA
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-primary"
                            onClick={() => abrirModalSuplantar(t)}
                            title="Elegir usuario del cliente para entrar en modo soporte remoto"
                            style={{ backgroundColor: '#EA580C', borderColor: '#C2410C', fontWeight: 800 }}
                          >
                            <ExternalLink size={13} /> SOPORTE REMOTO (SUPLANTAR)
                          </button>
                          <button
                            type="button"
                            className={`btn btn-sm ${t.estado === 'ACTIVO' ? 'btn-secondary' : 'btn-primary'}`}
                            onClick={() => toggleEstadoTenant(t.id)}
                          >
                            <Power size={13} strokeWidth={2.5} />
                            {t.estado === 'ACTIVO' ? 'SUSPENDER' : 'ACTIVAR'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: MANTENIMIENTO DE USUARIOS ADMIN */}
        {tabActiva === 'admins' && (
          <div>
            <div style={styles.headerRow}>
              <div>
                <h2 style={{ fontSize: '16px', textTransform: 'uppercase' }}>
                  MANTENIMIENTO DE USUARIOS ADMINISTRADORES (ADMIN)
                </h2>
                <p style={{ fontSize: '12px', color: '#78716C' }}>
                  Gestión centralizada por el Super Admin sobre los administradores de cada ferretería.
                </p>
              </div>

              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setFormAdminNombre('');
                  setFormAdminEmail('');
                  setFormAdminPassword('FerreAdmin2026!');
                  setFormAdminTenantId(tenants[0]?.id || 't-1');
                  setFormAdminActivo(true);
                  setModalNuevoAdmin(true);
                }}
              >
                <Plus size={18} strokeWidth={2.5} />
                <span>NUEVO USUARIO ADMIN</span>
              </button>
            </div>

            <div className="table-container" style={{ marginTop: '20px' }}>
              <table className="industrial-table">
                <thead>
                  <tr>
                    <th>NOMBRE DEL ADMINISTRADOR</th>
                    <th>CORREO ELECTRÓNICO (LOGIN)</th>
                    <th>FERRETERÍA (TENANT)</th>
                    <th style={{ textAlign: 'center' }}>FECHA ALTA</th>
                    <th style={{ textAlign: 'center' }}>ESTADO</th>
                    <th style={{ textAlign: 'center' }}>ACCIONES DE SUPER ADMIN</th>
                  </tr>
                </thead>
                <tbody>
                  {adminUsers.map((a) => (
                    <tr key={a.id}>
                      <td style={{ fontFamily: 'var(--font-display)', fontWeight: 800 }}>{a.nombre}</td>
                      <td style={{ fontWeight: 600, color: '#1C1917' }}>{a.email}</td>
                      <td>
                        <span className="badge badge-dark">{a.tenantNombre}</span>
                      </td>
                      <td style={{ textAlign: 'center', fontSize: '12px', color: '#78716C' }}>
                        {a.fechaCreacion}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {a.activo ? (
                          <span className="badge badge-success">ACTIVO</span>
                        ) : (
                          <span className="badge badge-danger">SUSPENDIDO</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', gap: '6px' }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => abrirEditarAdmin(a)}
                          >
                            <Edit2 size={13} /> EDITAR
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => setModalResetPassAdmin(a)}
                            title="Restablecer Contraseña"
                          >
                            <KeyRound size={13} /> CONTRASEÑA
                          </button>
                          <button
                            type="button"
                            className={`btn btn-sm ${a.activo ? 'btn-danger' : 'btn-primary'}`}
                            onClick={() => toggleEstadoAdmin(a.id)}
                          >
                            <Power size={13} />
                            {a.activo ? 'BLOQUEAR' : 'DESBLOQUEAR'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: ANÁLISIS DE PERMISOS Y MENÚS */}
        {tabActiva === 'analisis' && (
          <div>
            <div style={styles.headerRow}>
              <div>
                <h2 style={{ fontSize: '16px', textTransform: 'uppercase' }}>
                  ANÁLISIS DE CONTROL DE ACCESOS Y MENÚS POR ROL
                </h2>
                <p style={{ fontSize: '12px', color: '#78716C' }}>
                  Auditoría completa de visibilidad de menús y niveles de jerarquía operacional.
                </p>
              </div>
            </div>

            {/* Matriz de Visibilidad de Menús */}
            <div className="table-container" style={{ marginTop: '20px' }}>
              <table className="industrial-table">
                <thead>
                  <tr>
                    <th>RUTAS Y MENÚS DEL SISTEMA</th>
                    <th style={{ textAlign: 'center', backgroundColor: '#1C1917', color: '#FFFFFF' }}>
                      SUPER ADMIN (SAAS)
                    </th>
                    <th style={{ textAlign: 'center' }}>ADMIN FERRETERÍA</th>
                    <th style={{ textAlign: 'center' }}>CAJERO</th>
                    <th style={{ textAlign: 'center' }}>BODEGUERO</th>
                    <th style={{ textAlign: 'center' }}>VENDEDOR</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ fontWeight: 800 }}>PANEL SUPER ADMIN (/admin)</td>
                    <td style={{ textAlign: 'center', backgroundColor: '#DCFCE7', color: '#15803D', fontWeight: 800 }}>
                      <CheckCircle size={16} style={{ verticalAlign: 'middle', marginRight: 4, display: 'inline-block' }} /> ACCESO TOTAL
                    </td>
                    <td style={{ textAlign: 'center', backgroundColor: '#FEE2E2', color: '#991B1B', fontWeight: 700 }}>
                      <Lock size={14} style={{ verticalAlign: 'middle', marginRight: 4, display: 'inline-block' }} /> OCULTO / DENEGADO
                    </td>
                    <td style={{ textAlign: 'center', backgroundColor: '#FEE2E2', color: '#991B1B' }}>OCULTO</td>
                    <td style={{ textAlign: 'center', backgroundColor: '#FEE2E2', color: '#991B1B' }}>OCULTO</td>
                    <td style={{ textAlign: 'center', backgroundColor: '#FEE2E2', color: '#991B1B' }}>OCULTO</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 800 }}>PANEL DE CONTROL TIENDA (/)</td>
                    <td style={{ textAlign: 'center', backgroundColor: '#FEF3C7', color: '#B45309', fontWeight: 700 }}>
                      REDIRECCIONA A /ADMIN
                    </td>
                    <td style={{ textAlign: 'center', backgroundColor: '#DCFCE7', color: '#15803D', fontWeight: 800 }}>
                      PERMITIDO
                    </td>
                    <td style={{ textAlign: 'center', backgroundColor: '#DCFCE7', color: '#15803D' }}>PERMITIDO</td>
                    <td style={{ textAlign: 'center', backgroundColor: '#DCFCE7', color: '#15803D' }}>PERMITIDO</td>
                    <td style={{ textAlign: 'center', backgroundColor: '#DCFCE7', color: '#15803D' }}>PERMITIDO</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 800 }}>PUNTO DE VENTA POS (/pos)</td>
                    <td style={{ textAlign: 'center', backgroundColor: '#FEE2E2', color: '#991B1B', fontWeight: 700 }}>
                      <Lock size={14} style={{ verticalAlign: 'middle', marginRight: 4, display: 'inline-block' }} /> OCULTO / DENEGADO
                    </td>
                    <td style={{ textAlign: 'center', backgroundColor: '#DCFCE7', color: '#15803D', fontWeight: 800 }}>
                      PERMITIDO
                    </td>
                    <td style={{ textAlign: 'center', backgroundColor: '#DCFCE7', color: '#15803D', fontWeight: 800 }}>
                      PERMITIDO
                    </td>
                    <td style={{ textAlign: 'center', backgroundColor: '#FEE2E2', color: '#991B1B' }}>OCULTO</td>
                    <td style={{ textAlign: 'center', backgroundColor: '#DCFCE7', color: '#15803D' }}>PERMITIDO</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 800 }}>INVENTARIO Y CATALOGO (/inventario)</td>
                    <td style={{ textAlign: 'center', backgroundColor: '#FEE2E2', color: '#991B1B', fontWeight: 700 }}>
                      <Lock size={14} style={{ verticalAlign: 'middle', marginRight: 4, display: 'inline-block' }} /> OCULTO / DENEGADO
                    </td>
                    <td style={{ textAlign: 'center', backgroundColor: '#DCFCE7', color: '#15803D', fontWeight: 800 }}>
                      PERMITIDO
                    </td>
                    <td style={{ textAlign: 'center', backgroundColor: '#FEE2E2', color: '#991B1B' }}>OCULTO</td>
                    <td style={{ textAlign: 'center', backgroundColor: '#DCFCE7', color: '#15803D', fontWeight: 800 }}>
                      PERMITIDO
                    </td>
                    <td style={{ textAlign: 'center', backgroundColor: '#FEE2E2', color: '#991B1B' }}>OCULTO</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 800 }}>COTIZACIONES (/cotizaciones)</td>
                    <td style={{ textAlign: 'center', backgroundColor: '#FEE2E2', color: '#991B1B', fontWeight: 700 }}>
                      <Lock size={14} style={{ verticalAlign: 'middle', marginRight: 4, display: 'inline-block' }} /> OCULTO / DENEGADO
                    </td>
                    <td style={{ textAlign: 'center', backgroundColor: '#DCFCE7', color: '#15803D', fontWeight: 800 }}>
                      PERMITIDO
                    </td>
                    <td style={{ textAlign: 'center', backgroundColor: '#DCFCE7', color: '#15803D' }}>PERMITIDO</td>
                    <td style={{ textAlign: 'center', backgroundColor: '#FEE2E2', color: '#991B1B' }}>OCULTO</td>
                    <td style={{ textAlign: 'center', backgroundColor: '#DCFCE7', color: '#15803D', fontWeight: 800 }}>
                      PERMITIDO
                    </td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 800 }}>GESTIÓN DE USUARIOS LOCAL (/usuarios)</td>
                    <td style={{ textAlign: 'center', backgroundColor: '#FEF3C7', color: '#B45309', fontWeight: 700 }}>
                      GESTIONA ADMINS EN SAAS
                    </td>
                    <td style={{ textAlign: 'center', backgroundColor: '#DCFCE7', color: '#15803D', fontWeight: 800 }}>
                      PERMITIDO (Su Tienda)
                    </td>
                    <td style={{ textAlign: 'center', backgroundColor: '#FEE2E2', color: '#991B1B' }}>OCULTO</td>
                    <td style={{ textAlign: 'center', backgroundColor: '#FEE2E2', color: '#991B1B' }}>OCULTO</td>
                    <td style={{ textAlign: 'center', backgroundColor: '#FEE2E2', color: '#991B1B' }}>OCULTO</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 800 }}>CONFIGURACIÓN DE LA FERRETERÍA (/configuracion)</td>
                    <td style={{ textAlign: 'center', backgroundColor: '#FEF3C7', color: '#B45309', fontWeight: 700 }}>
                      VÍA MODO SOPORTE
                    </td>
                    <td style={{ textAlign: 'center', backgroundColor: '#DCFCE7', color: '#15803D', fontWeight: 800 }}>
                      PERMITIDO (Su Tienda)
                    </td>
                    <td style={{ textAlign: 'center', backgroundColor: '#FEE2E2', color: '#991B1B' }}>OCULTO</td>
                    <td style={{ textAlign: 'center', backgroundColor: '#FEE2E2', color: '#991B1B' }}>OCULTO</td>
                    <td style={{ textAlign: 'center', backgroundColor: '#FEE2E2', color: '#991B1B' }}>OCULTO</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Resumen de Hallazgos y Ajustes Aplicados */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginTop: '24px' }}>
              <div className="industrial-card" style={{ padding: '20px', backgroundColor: '#FFFFFF' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <ShieldCheck size={20} color="var(--color-primary)" />
                  <h3 style={{ fontSize: '14px', textTransform: 'uppercase', fontFamily: 'var(--font-display)', fontWeight: 800 }}>
                    1. ROL Y PROPÓSITO DEL SUPER ADMIN
                  </h3>
                </div>
                <ul style={{ fontSize: '13px', lineHeight: '1.6', color: '#44403C', paddingLeft: '18px' }}>
                  <li>
                    <strong>Dueño de la Aplicación (Proveedor SaaS):</strong> No gestiona operaciones comerciales cotidianas. Su función es dar mantenimiento a los clientes, controlar suscripciones y usuarios Admin.
                  </li>
                  <li style={{ marginTop: '8px' }}>
                    <strong>Soporte Técnico por Suplantación Remota:</strong> Para resolver dudas o corregir errores del cliente en vivo, el Super Admin usa la opción <code>SOPORTE REMOTO (SUPLANTAR)</code> para ver e interactuar temporalmente con el menú exacto del cliente.
                  </li>
                </ul>
              </div>

              <div className="industrial-card" style={{ padding: '20px', backgroundColor: '#FFFFFF' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <GitBranch size={20} color="#0284C7" />
                  <h3 style={{ fontSize: '14px', textTransform: 'uppercase', fontFamily: 'var(--font-display)', fontWeight: 800 }}>
                    2. AISLAMIENTO MULTI-SUCURSAL Y CLIENTES
                  </h3>
                </div>
                <ul style={{ fontSize: '13px', lineHeight: '1.6', color: '#44403C', paddingLeft: '18px' }}>
                  <li>
                    <strong>Aislamiento Total de Datos:</strong> Cada ferretería/sucursal maneja su inventario, ventas y caja de forma 100% aislada sin mezcla de información.
                  </li>
                  <li style={{ marginTop: '8px' }}>
                    <strong>Selector de Sucursal para el Cliente:</strong> Un cliente con múltiples sucursales puede cambiar entre ellas desde el selector de la barra superior sin contaminar reportes inter-sucursales.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* MODAL GESTIONAR SUB-SUCURSALES DE UN TENANT */}
      {modalSucursalesTenant && (
        <div style={styles.modalOverlay}>
          <div className="industrial-card" style={{ ...styles.modalContent, maxWidth: '650px' }}>
            <div style={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <div>
                  <h2 style={{ fontSize: '16px', textTransform: 'uppercase' }}>
                    GESTIÓN DE SUB-SUCURSALES PARA EL ADMIN
                  </h2>
                  <div style={{ fontSize: '12px', color: '#EA580C', fontWeight: 700, marginTop: '2px' }}>
                    EMPRESA: {modalSucursalesTenant.nombreComercial}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setModalSucursalesTenant(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div style={{ marginTop: '16px' }}>
              {/* Formulario Crear Nueva Sub-Sucursal */}
              <div style={{ padding: '14px', backgroundColor: '#FAFAF9', border: '1.5px solid #D6D3D1', borderRadius: '4px', marginBottom: '16px' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '12px', textTransform: 'uppercase', marginBottom: '8px' }}>
                  AÑADIR NUEVA SUCURSAL A ESTE CLIENTE
                </div>

                <div className="form-group">
                  <label className="form-label">NOMBRE DE LA SUCURSAL / SEDE</label>
                  <input
                    type="text"
                    placeholder="Ej. Sucursal Choloma / Norte"
                    value={nuevaSucursalNombre}
                    onChange={(e) => setNuevaSucursalNombre(e.target.value)}
                    className="form-input"
                  />
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">DIRECCIÓN</label>
                    <input
                      type="text"
                      placeholder="Barrio / Plaza Comercial"
                      value={nuevaSucursalDireccion}
                      onChange={(e) => setNuevaSucursalDireccion(e.target.value)}
                      className="form-input"
                    />
                  </div>

                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">TELÉFONO</label>
                    <input
                      type="text"
                      placeholder="+504 2550-0000"
                      value={nuevaSucursalTelefono}
                      onChange={(e) => setNuevaSucursalTelefono(e.target.value)}
                      className="form-input"
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      if (!nuevaSucursalNombre.trim()) return;

                      const nuevaSubSucursal: SubSucursalItem = {
                        id: `suc-${Date.now()}`,
                        nombre: nuevaSucursalNombre.trim(),
                        direccion: nuevaSucursalDireccion.trim() || 'Dirección Principal',
                        telefono: nuevaSucursalTelefono.trim() || modalSucursalesTenant.telefono,
                        encargado: nuevaSucursalEncargado.trim() || 'Administrador Asignado',
                        activa: true,
                      };

                      const currentList = modalSucursalesTenant.sucursalesList || [];
                      const updatedList = [...currentList, nuevaSubSucursal];

                      setTenants(
                        tenants.map((t) =>
                          t.id === modalSucursalesTenant.id
                            ? {
                                ...t,
                                sucursalesCount: updatedList.length,
                                sucursalesList: updatedList,
                              }
                            : t,
                        ),
                      );

                      setModalSucursalesTenant({
                        ...modalSucursalesTenant,
                        sucursalesCount: updatedList.length,
                        sucursalesList: updatedList,
                      });

                      setNuevaSucursalNombre('');
                      setNuevaSucursalDireccion('');
                      setNuevaSucursalTelefono('');
                      setMensajeExito(`¡Sub-sucursal "${nuevaSubSucursal.nombre}" habilitada para ${modalSucursalesTenant.nombreComercial}!`);
                      setTimeout(() => setMensajeExito(null), 4000);
                    }}
                  >
                    <Plus size={14} /> CREAR SUCURSAL
                  </button>
                </div>
              </div>

              {/* Lista de Sucursales de esta Empresa */}
              <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
                <table className="industrial-table">
                  <thead>
                    <tr>
                      <th>SUCURSAL</th>
                      <th>DIRECCIÓN</th>
                      <th>TELÉFONO</th>
                      <th style={{ textAlign: 'center' }}>ESTADO</th>
                      <th style={{ textAlign: 'center' }}>ACCIONES</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(modalSucursalesTenant.sucursalesList || [
                      { id: 's1', nombre: 'Sucursal Principal', direccion: 'Barrio El Centro', telefono: modalSucursalesTenant.telefono, encargado: 'Admin', activa: true },
                    ]).map((s) => (
                      <tr key={s.id}>
                        <td style={{ fontWeight: 800 }}>{s.nombre}</td>
                        <td style={{ color: '#78716C' }}>{s.direccion}</td>
                        <td style={{ color: '#78716C' }}>{s.telefono}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span className="badge badge-success">HABILITADA</span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            className="btn btn-sm btn-danger"
                            title="Eliminar Sub-Sucursal"
                            onClick={() => {
                              const currentList = modalSucursalesTenant.sucursalesList || [];
                              const updatedList = currentList.filter((item) => item.id !== s.id);

                              setTenants(
                                tenants.map((t) =>
                                  t.id === modalSucursalesTenant.id
                                    ? {
                                        ...t,
                                        sucursalesCount: updatedList.length,
                                        sucursalesList: updatedList,
                                      }
                                    : t,
                                ),
                              );

                              setModalSucursalesTenant({
                                ...modalSucursalesTenant,
                                sucursalesCount: updatedList.length,
                                sucursalesList: updatedList,
                              });

                              setMensajeExito(`¡Sub-sucursal "${s.nombre}" eliminada exitosamente!`);
                              setTimeout(() => setMensajeExito(null), 4000);
                            }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setModalSucursalesTenant(null)}
                >
                  CERRAR
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EDITAR TENANT Y MARCA */}
      {modalEditarTenant && (
        <div style={styles.modalOverlay}>
          <div className="industrial-card" style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <h2 style={{ fontSize: '16px', textTransform: 'uppercase' }}>
                CONFIGURAR MARCA Y COLOR DE TENANT
              </h2>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setTenants(
                  tenants.map((t) =>
                    t.id === modalEditarTenant.id
                      ? {
                          ...t,
                          nombreComercial: editNombreComercial.toUpperCase().trim(),
                          telefono: editTelefono,
                          plan: editPlan,
                          colorPrimario: editColorPrimario,
                        }
                      : t,
                  ),
                );
                setModalEditarTenant(null);
                setMensajeExito(`¡Configuración de marca para "${editNombreComercial}" actualizada!`);
                setTimeout(() => setMensajeExito(null), 4000);
              }}
              style={{ marginTop: '16px' }}
            >
              <div className="form-group">
                <label className="form-label">NOMBRE COMERCIAL DE LA FERRETERÍA</label>
                <input
                  type="text"
                  required
                  value={editNombreComercial}
                  onChange={(e) => setEditNombreComercial(e.target.value)}
                  className="form-input"
                />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">TELÉFONO DE CONTACTO</label>
                  <input
                    type="text"
                    value={editTelefono}
                    onChange={(e) => setEditTelefono(e.target.value)}
                    className="form-input"
                  />
                </div>

                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">PLAN DE SUSCRIPCIÓN</label>
                  <input
                    type="text"
                    value={editPlan}
                    onChange={(e) => setEditPlan(e.target.value)}
                    className="form-input"
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">COLOR ASIGNADO A LA FERRETERÍA (HEX)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <input
                    type="color"
                    value={editColorPrimario}
                    onChange={(e) => setEditColorPrimario(e.target.value)}
                    style={{ width: '50px', height: '42px', cursor: 'pointer', border: '2px solid #292524' }}
                  />
                  <input
                    type="text"
                    value={editColorPrimario}
                    onChange={(e) => setEditColorPrimario(e.target.value)}
                    className="form-input"
                    style={{ fontFamily: 'monospace', fontWeight: 700 }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setModalEditarTenant(null)}
                >
                  CANCELAR
                </button>
                <button type="submit" className="btn btn-primary">
                  <Check size={16} strokeWidth={2.6} /> GUARDAR CONFIGURACIÓN
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 1: NUEVO TENANT */}
      {modalNuevoTenant && (
        <div style={styles.modalOverlay}>
          <div className="industrial-card" style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <h2 style={{ fontSize: '16px', textTransform: 'uppercase' }}>
                CREAR NUEVO TENANT (FERRETERÍA)
              </h2>
            </div>

            <form onSubmit={handleCrearTenant} style={{ marginTop: '16px' }}>
              <div className="form-group">
                <label className="form-label">NOMBRE COMERCIAL DE LA FERRETERÍA</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. FERRETERÍA SAN PEDRO S. DE R.L."
                  value={nombreComercial}
                  onChange={(e) => setNombreComercial(e.target.value)}
                  className="form-input"
                />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">TELÉFONO</label>
                  <input
                    type="text"
                    placeholder="+504 2550-0000"
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                    className="form-input"
                  />
                </div>

                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">COLOR DE MARCA</label>
                  <input
                    type="color"
                    value={colorPrimario}
                    onChange={(e) => setColorPrimario(e.target.value)}
                    style={{ width: '100%', height: '42px', cursor: 'pointer', border: '2px solid #292524' }}
                  />
                </div>
              </div>

              <div style={{ borderTop: '1px solid #D6D3D1', margin: '14px 0 12px', paddingTop: '10px' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', marginBottom: '8px' }}>
                  ADMINISTRADOR INICIAL DE LA FERRETERÍA
                </div>

                <div className="form-group">
                  <label className="form-label">NOMBRE DEL DUEÑO / GERENTE</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Mario Rivera"
                    value={adminNombre}
                    onChange={(e) => setAdminNombre(e.target.value)}
                    className="form-input"
                  />
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">EMAIL DE ACCESO</label>
                    <input
                      type="email"
                      required
                      placeholder="admin@ferreteria.hn"
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      className="form-input"
                    />
                  </div>

                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">CONTRASEÑA TEMPORAL</label>
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      className="form-input"
                    />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setModalNuevoTenant(false)}
                >
                  CANCELAR
                </button>
                <button type="submit" className="btn btn-primary">
                  <CheckCircle size={16} strokeWidth={2.6} /> CREAR Y ACTIVAR TENANT
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: ELECCIÓN / BÚSQUEDA DE USUARIO A SUPLANTAR */}
      {modalSuplantarUser && (
        <div style={styles.modalOverlay}>
          <div className="industrial-card" style={{ ...styles.modalContent, maxWidth: '600px' }}>
            <div style={styles.modalHeader}>
              <div>
                <h2 style={{ fontSize: '16px', textTransform: 'uppercase' }}>
                  SOPORTE REMOTO • SELECCIONAR USUARIO A SUPLANTAR
                </h2>
                <div style={{ fontSize: '12px', color: '#EA580C', fontWeight: 700 }}>
                  CLIENTE: {modalSuplantarUser.nombreComercial}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalSuplantarUser(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ marginTop: '16px' }}>
              {/* Input Búsqueda de Usuario */}
              <div className="form-group">
                <label className="form-label">BUSCAR USUARIO POR NOMBRE O CORREO</label>
                <div style={{ position: 'relative' }}>
                  <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#78716C' }} />
                  <input
                    type="text"
                    placeholder="Ej. Carlos Ramos, cajero, admin..."
                    value={busquedaSuplantar}
                    onChange={(e) => setBusquedaSuplantar(e.target.value)}
                    className="form-input"
                    style={{ paddingLeft: '36px' }}
                  />
                </div>
              </div>

              {/* Lista de Usuarios de la Empresa Disponibles para Suplantar */}
              <div style={{ maxHeight: '280px', overflowY: 'auto', border: '1.5px solid #D6D3D1', borderRadius: '4px', marginTop: '12px' }}>
                {[
                  {
                    id: 'usr-admin-1',
                    nombre: `Carlos Ramos (Administrador General)`,
                    email: modalSuplantarUser.contacto,
                    rol: 'ADMIN',
                    cargo: 'Dueño / Gerente de Sucursal',
                  },
                  {
                    id: 'usr-cajero-1',
                    nombre: 'Carlos Ramos (Cajero Principal)',
                    email: 'cajero@lamundial.hn',
                    rol: 'CAJERO',
                    cargo: 'Cajero POS / Facturación',
                  },
                  {
                    id: 'usr-bodega-1',
                    nombre: 'Jorge Mendoza (Bodeguero)',
                    email: 'bodega@lamundial.hn',
                    rol: 'BODEGUERO',
                    cargo: 'Encargado de Inventario & Stock',
                  },
                  {
                    id: 'usr-vendedor-1',
                    nombre: 'Ana Martínez (Vendedora)',
                    email: 'vendedor@lamundial.hn',
                    rol: 'VENDEDOR',
                    cargo: 'Ventas de Mostrador & Cotizaciones',
                  },
                ]
                  .filter(
                    (u) =>
                      u.nombre.toLowerCase().includes(busquedaSuplantar.toLowerCase().trim()) ||
                      u.email.toLowerCase().includes(busquedaSuplantar.toLowerCase().trim()) ||
                      u.cargo.toLowerCase().includes(busquedaSuplantar.toLowerCase().trim()),
                  )
                  .map((u) => (
                    <div
                      key={u.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 16px',
                        borderBottom: '1px solid #E7E5E4',
                        backgroundColor: '#FAFAF9',
                      }}
                    >
                      <div>
                        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '13px' }}>
                          {u.nombre}
                        </div>
                        <div style={{ fontSize: '11px', color: '#78716C' }}>
                          {u.email} • <span style={{ fontWeight: 600 }}>{u.cargo}</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => ejecutarSuplantacion(u)}
                        className="btn btn-sm btn-primary"
                        style={{ backgroundColor: '#EA580C', borderColor: '#C2410C', fontWeight: 800, padding: '6px 12px' }}
                      >
                        <ExternalLink size={13} /> SUPLANTAR ESTE USUARIO
                      </button>
                    </div>
                  ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setModalSuplantarUser(null)}
                >
                  CANCELAR
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: NUEVO USUARIO ADMIN */}
      {modalNuevoAdmin && (
        <div style={styles.modalOverlay}>
          <div className="industrial-card" style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <h2 style={{ fontSize: '16px', textTransform: 'uppercase' }}>
                NUEVO USUARIO ADMINISTRADOR DE FERRETERÍA
              </h2>
            </div>

            <form onSubmit={handleCrearAdmin} style={{ marginTop: '16px' }}>
              <div className="form-group">
                <label className="form-label">FERRETERÍA (TENANT PERTENECIENTE)</label>
                <select
                  value={formAdminTenantId}
                  onChange={(e) => setFormAdminTenantId(e.target.value)}
                  className="form-select"
                >
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nombreComercial}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">NOMBRE DEL ADMIN</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Roberto Flores"
                    value={formAdminNombre}
                    onChange={(e) => setFormAdminNombre(e.target.value)}
                    className="form-input"
                  />
                </div>

                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">CORREO DE LOGIN</label>
                  <input
                    type="email"
                    required
                    placeholder="admin2@ferreteria.hn"
                    value={formAdminEmail}
                    onChange={(e) => setFormAdminEmail(e.target.value)}
                    className="form-input"
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">CONTRASEÑA TEMPORAL</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={formAdminPassword}
                  onChange={(e) => setFormAdminPassword(e.target.value)}
                  className="form-input"
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setModalNuevoAdmin(false)}
                >
                  CANCELAR
                </button>
                <button type="submit" className="btn btn-primary">
                  <Check size={16} strokeWidth={2.6} /> REGISTRAR ADMIN
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: EDITAR ADMIN */}
      {modalEditarAdmin && (
        <div style={styles.modalOverlay}>
          <div className="industrial-card" style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <h2 style={{ fontSize: '16px', textTransform: 'uppercase' }}>
                EDITAR USUARIO ADMINISTRADOR
              </h2>
            </div>

            <form onSubmit={handleGuardarEdicionAdmin} style={{ marginTop: '16px' }}>
              <div className="form-group">
                <label className="form-label">FERRETERÍA ASIGNADA</label>
                <select
                  value={formAdminTenantId}
                  onChange={(e) => setFormAdminTenantId(e.target.value)}
                  className="form-select"
                >
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nombreComercial}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">NOMBRE COMPLETO</label>
                  <input
                    type="text"
                    required
                    value={formAdminNombre}
                    onChange={(e) => setFormAdminNombre(e.target.value)}
                    className="form-input"
                  />
                </div>

                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">CORREO ELECTRÓNICO</label>
                  <input
                    type="email"
                    required
                    value={formAdminEmail}
                    onChange={(e) => setFormAdminEmail(e.target.value)}
                    className="form-input"
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">ESTADO DEL USUARIO</label>
                <div style={{ display: 'flex', gap: '16px', marginTop: '6px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600 }}>
                    <input
                      type="radio"
                      name="adminActivo"
                      checked={formAdminActivo === true}
                      onChange={() => setFormAdminActivo(true)}
                    />
                    Activo (Permitir Ingreso)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: '#DC2626' }}>
                    <input
                      type="radio"
                      name="adminActivo"
                      checked={formAdminActivo === false}
                      onChange={() => setFormAdminActivo(false)}
                    />
                    Inactivo / Suspendido
                  </label>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setModalEditarAdmin(null)}
                >
                  CANCELAR
                </button>
                <button type="submit" className="btn btn-primary">
                  <Check size={16} strokeWidth={2.6} /> GUARDAR CAMBIOS
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: RESTABLECER CONTRASEÑA */}
      {modalResetPassAdmin && (
        <div style={styles.modalOverlay}>
          <div className="industrial-card" style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <h2 style={{ fontSize: '16px', textTransform: 'uppercase' }}>
                RESTABLECER CONTRASEÑA DE ADMINISTRADOR
              </h2>
            </div>

            <form onSubmit={handleResetPassword} style={{ marginTop: '16px' }}>
              <p style={{ fontSize: '13px', color: '#444' }}>
                Cambiar contraseña para el usuario <strong>{modalResetPassAdmin.nombre}</strong> (<code>{modalResetPassAdmin.email}</code>).
              </p>

              <div className="form-group" style={{ marginTop: '12px' }}>
                <label className="form-label">NUEVA CONTRASEÑA TEMPORAL</label>
                <input
                  type="password"
                  required
                  placeholder="Mínimo 8 caracteres"
                  value={nuevaPasswordInput}
                  onChange={(e) => setNuevaPasswordInput(e.target.value)}
                  className="form-input"
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setModalResetPassAdmin(null)}
                >
                  CANCELAR
                </button>
                <button type="submit" className="btn btn-primary">
                  <KeyRound size={16} strokeWidth={2.6} /> RESTABLECER CONTRASEÑA
                </button>
              </div>
            </form>
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
    padding: '14px 18px',
    backgroundColor: '#DCFCE7',
    border: '2px solid #15803D',
    borderRadius: 'var(--radius-xs)',
    marginBottom: '20px',
  },
  metricsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: '20px',
    marginBottom: '28px',
  },
  metricCard: {
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  metricValue: {
    fontFamily: 'var(--font-display)',
    fontWeight: 900,
    fontSize: '28px',
    color: 'var(--color-text-main)',
  },
  metricLabel: {
    fontFamily: 'var(--font-display)',
    fontWeight: 800,
    fontSize: '11px',
    letterSpacing: '0.04em',
    color: '#78716C',
  },
  tabsContainer: {
    display: 'flex',
    gap: '10px',
    marginBottom: '24px',
    borderBottom: '2px solid #292524',
    paddingBottom: '8px',
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
    transition: 'all 150ms ease',
  },
  tabBtnActive: {
    backgroundColor: '#1C1917',
    color: '#FAFAF9',
    borderColor: '#1C1917',
    boxShadow: '2px 2px 0px rgba(0,0,0,0.3)',
  },
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '14px',
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
  },
  modalContent: {
    width: '100%',
    maxWidth: '540px',
    backgroundColor: '#FFFFFF',
  },
  modalHeader: {
    paddingBottom: '12px',
    borderBottom: '2px solid var(--color-border)',
  },
};
