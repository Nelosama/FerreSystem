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
  UserCheck,
  GitBranch,
  ExternalLink,
  Search,
  X,
  Server,
  Trash2,
  Layers,
  Layout,
} from 'lucide-react';
import { TopBar } from '../components/TopBar';
import { useTenant } from '../context/TenantContext';
import { useNavigate } from 'react-router-dom';
import { CATALOGO_MODULOS } from '../config/modulesCatalog';
import { useI18n } from '../context/I18nContext';
import { api } from '../utils/api';
import { Rubro } from '../types';

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
  logoUrl?: string | null;
  modoNavegacion?: 'SIDEBAR' | 'TOPNAV';
  rubro?: Rubro | keyof typeof Rubro;
  sucursalesList?: SubSucursalItem[];
  modulosHabilitados?: string[];
}

interface AdminUserItem {
  id: string;
  nombre: string;
  email: string;
  password?: string;
  tenantId: string;
  tenantNombre: string;
  activo: boolean;
  fechaCreacion: string;
}

interface AuditLogItem {
  id: string;
  fecha: string;
  accion: string;
  tenantNombre: string;
  detalles: string;
  usuario: string;
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
    modoNavegacion: 'SIDEBAR',
    modulosHabilitados: CATALOGO_MODULOS.map((m) => m.key),
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
    modoNavegacion: 'SIDEBAR',
    modulosHabilitados: ['inventario', 'pos', 'cotizaciones', 'usuarios', 'configuracion', 'arqueo_caja'],
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
    modoNavegacion: 'TOPNAV',
    modulosHabilitados: ['inventario', 'pos', 'cotizaciones'],
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

const INITIAL_AUDIT_LOGS: AuditLogItem[] = [
  {
    id: 'log-1',
    fecha: '2026-03-15 10:30',
    accion: 'CREAR_TENANT',
    tenantNombre: 'LA MUNDIAL - SUCURSAL CENTRO',
    detalles: 'Empresa aprovisionada con plan Enterprise',
    usuario: 'Super Admin',
  },
  {
    id: 'log-2',
    fecha: '2026-03-16 14:15',
    accion: 'ACTUALIZAR_SERVICIOS',
    tenantNombre: 'FERRETERÍA EL MARTILLO DE ORO',
    detalles: 'Servicios de Arqueo de Caja activados',
    usuario: 'Super Admin',
  },
];

export const SuperAdminPage: React.FC = () => {
  const { impersonateTenantAdmin } = useTenant();
  const navigate = useNavigate();
  const { t } = useI18n();

  const [tabActiva, setTabActiva] = useState<'dashboard' | 'tenants' | 'modulos' | 'admins' | 'auditoria'>('tenants');

  const [tenants, setTenants] = useState<TenantItem[]>(() => {
    const saved = localStorage.getItem('ferre_saas_tenants');
    return saved ? JSON.parse(saved) : INITIAL_TENANTS;
  });

  const [adminUsers, setAdminUsers] = useState<AdminUserItem[]>(() => {
    const saved = localStorage.getItem('ferre_saas_admins');
    return saved ? JSON.parse(saved) : INITIAL_ADMIN_USERS;
  });

  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>(() => {
    const saved = localStorage.getItem('ferre_saas_audit');
    return saved ? JSON.parse(saved) : INITIAL_AUDIT_LOGS;
  });

  useEffect(() => {
    // Intentar cargar la lista real desde el backend NestJS si está disponible
    api
      .get('/admin/tenants')
      .then((res) => {
        if (res.data && Array.isArray(res.data) && res.data.length > 0) {
          setTenants(res.data);
        }
      })
      .catch(() => {
        // Fallback a localStorage / datos iniciales si corre en modo standalone
      });
  }, []);

  useEffect(() => {
    localStorage.setItem('ferre_saas_tenants', JSON.stringify(tenants));
  }, [tenants]);

  useEffect(() => {
    localStorage.setItem('ferre_saas_admins', JSON.stringify(adminUsers));
  }, [adminUsers]);

  useEffect(() => {
    localStorage.setItem('ferre_saas_audit', JSON.stringify(auditLogs));
  }, [auditLogs]);

  // Modales
  const [modalNuevoTenant, setModalNuevoTenant] = useState(false);
  const [modalEditarTenant, setModalEditarTenant] = useState<TenantItem | null>(null);
  const [modalSucursalesTenant, setModalSucursalesTenant] = useState<TenantItem | null>(null);
  const [modalModulosTenant, setModalModulosTenant] = useState<TenantItem | null>(null);
  const [tempModulosTenant, setTempModulosTenant] = useState<string[]>([]);
  const [modalNavegacionTenant, setModalNavegacionTenant] = useState<TenantItem | null>(null);
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
  const [editLogoUrl, setEditLogoUrl] = useState('');
  const [editModoNavegacion, setEditModoNavegacion] = useState<'SIDEBAR' | 'TOPNAV'>('SIDEBAR');

  // Formulario nuevo tenant
  const [nombreComercial, setNombreComercial] = useState('');
  const [adminNombre, setAdminNombre] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [telefono, setTelefono] = useState('');
  const [colorPrimario, setColorPrimario] = useState('#EA580C');
  const [nuevoRubro, setNuevoRubro] = useState<Rubro>(Rubro.FERRETERIA);

  // Formulario Admin User
  const [formAdminNombre, setFormAdminNombre] = useState('');
  const [formAdminEmail, setFormAdminEmail] = useState('');
  const [formAdminPassword, setFormAdminPassword] = useState('');
  const [formAdminTenantId, setFormAdminTenantId] = useState('t-1');
  const [formAdminActivo, setFormAdminActivo] = useState(true);
  const [nuevaPasswordInput, setNuevaPasswordInput] = useState('');

  const [mensajeExito, setMensajeExito] = useState<string | null>(null);

  const registrarAuditoria = (accion: string, tenantNombre: string, detalles: string) => {
    const nuevoLog: AuditLogItem = {
      id: `log-${Date.now()}`,
      fecha: new Date().toISOString().replace('T', ' ').slice(0, 16),
      accion,
      tenantNombre,
      detalles,
      usuario: 'Super Admin',
    };
    setAuditLogs([nuevoLog, ...auditLogs]);
  };

  const toggleEstadoTenant = (id: string) => {
    const target = tenants.find((t) => t.id === id);
    if (!target) return;
    const nuevoEstado = target.estado === 'ACTIVO' ? 'SUSPENDIDO' : 'ACTIVO';
    setTenants(
      tenants.map((t) => (t.id === id ? { ...t, estado: nuevoEstado } : t)),
    );
    registrarAuditoria('CAMBIO_ESTADO_TENANT', target.nombreComercial, `Estado cambiado a ${nuevoEstado}`);
    setMensajeExito(`¡Estado de ${target.nombreComercial} actualizado a ${nuevoEstado}!`);
    setTimeout(() => setMensajeExito(null), 4000);
  };

  const abrirModalModulos = (tenantItem: TenantItem) => {
    setModalModulosTenant(tenantItem);
    setTempModulosTenant(tenantItem.modulosHabilitados || CATALOGO_MODULOS.map((m) => m.key));
  };

  const toggleTempModulo = (moduleKey: string) => {
    if (tempModulosTenant.includes(moduleKey)) {
      setTempModulosTenant(tempModulosTenant.filter((k) => k !== moduleKey));
    } else {
      setTempModulosTenant([...tempModulosTenant, moduleKey]);
    }
  };

  const activarTodosModulos = () => {
    setTempModulosTenant(CATALOGO_MODULOS.map((m) => m.key));
  };

  const desactivarOpcionalesModulos = () => {
    const coreKeys = CATALOGO_MODULOS.filter((m) => m.isCore).map((m) => m.key);
    setTempModulosTenant(coreKeys.length > 0 ? coreKeys : ['configuracion', 'pos']);
  };

  const guardarModulosTenant = () => {
    if (!modalModulosTenant) return;
    const modulesPayload = CATALOGO_MODULOS.map((m) => ({
      moduleKey: m.key,
      enabled: tempModulosTenant.includes(m.key),
    }));

    api
      .put(`/admin/tenants/${modalModulosTenant.id}/modules`, { modules: modulesPayload })
      .catch(() => {});

    setTenants(
      tenants.map((tItem) =>
        tItem.id === modalModulosTenant.id ? { ...tItem, modulosHabilitados: tempModulosTenant } : tItem,
      ),
    );
    registrarAuditoria(
      'ACTUALIZAR_SERVICIOS',
      modalModulosTenant.nombreComercial,
      `Módulos activos actualizados: ${tempModulosTenant.length} de ${CATALOGO_MODULOS.length}`,
    );
    setMensajeExito(`¡Servicios y módulos para "${modalModulosTenant.nombreComercial}" guardados correctamente!`);
    setModalModulosTenant(null);
    setTimeout(() => setMensajeExito(null), 4000);
  };

  const guardarNavegacionTenant = (tenantId: string, modo: 'SIDEBAR' | 'TOPNAV') => {
    const target = tenants.find((tItem) => tItem.id === tenantId);
    if (!target) return;

    api
      .patch(`/admin/tenants/${tenantId}`, { modoNavegacion: modo })
      .catch(() => {});

    setTenants(
      tenants.map((tItem) => (tItem.id === tenantId ? { ...tItem, modoNavegacion: modo } : tItem)),
    );
    registrarAuditoria('CAMBIO_NAVEGACION', target.nombreComercial, `Modo de navegación cambiado a ${modo}`);
    setModalNavegacionTenant(null);
    setMensajeExito(`¡Tipo de navegación para "${target.nombreComercial}" cambiado a ${modo}!`);
    setTimeout(() => setMensajeExito(null), 4000);
  };

  const abrirModalSuplantar = (tenantItem: TenantItem) => {
    setModalSuplantarUser(tenantItem);
    setBusquedaSuplantar('');
  };

  const ejecutarSuplantacion = (usrObj: { id: string; nombre: string; email: string; rol: any }) => {
    if (!modalSuplantarUser) return;

    registrarAuditoria('IMPERSONACION_INICIADA', modalSuplantarUser.nombreComercial, `Suplantando a ${usrObj.nombre} (${usrObj.email})`);

    impersonateTenantAdmin(
      {
        id: modalSuplantarUser.id,
        nombreComercial: modalSuplantarUser.nombreComercial,
        sucursal: 'Sucursal Centro (Principal)',
        colorPrimario: modalSuplantarUser.colorPrimario,
        logoUrl: modalSuplantarUser.logoUrl,
        modoNavegacion: modalSuplantarUser.modoNavegacion || 'SIDEBAR',
        rubro: modalSuplantarUser.rubro || Rubro.FERRETERIA,
        modulosHabilitados: modalSuplantarUser.modulosHabilitados || CATALOGO_MODULOS.map((m) => m.key),
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
      plan: 'Plan Pro',
      estado: 'ACTIVO',
      usuariosCount: 1,
      sucursalesCount: 1,
      colorPrimario,
      modoNavegacion: 'SIDEBAR',
      rubro: nuevoRubro,
      modulosHabilitados: CATALOGO_MODULOS.map((m) => m.key),
    };

    const nuevoAdmin: AdminUserItem = {
      id: `adm-${Date.now()}`,
      nombre: adminNombre.trim() || 'Admin Ferretería',
      email: adminEmail.trim(),
      password: adminPassword.trim(),
      tenantId: newTenantId,
      tenantNombre: nuevoTenant.nombreComercial,
      activo: true,
      fechaCreacion: new Date().toISOString().split('T')[0],
    };

    setTenants([nuevoTenant, ...tenants]);
    setAdminUsers([nuevoAdmin, ...adminUsers]);
    setModalNuevoTenant(false);

    registrarAuditoria('CREAR_TENANT', nuevoTenant.nombreComercial, `Cliente y Administrador (${nuevoAdmin.email}) aprovisionados`);

    setMensajeExito(`¡Ferretería "${nuevoTenant.nombreComercial}" y su usuario Admin creados exitosamente!`);
    setTimeout(() => setMensajeExito(null), 5000);

    setNombreComercial('');
    setAdminNombre('');
    setAdminEmail('');
    setAdminPassword('');
    setTelefono('');
  };

  const handleCrearAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formAdminNombre || !formAdminEmail || !formAdminPassword) return;

    const tObj = tenants.find((item) => item.id === formAdminTenantId);
    const nuevoAdmin: AdminUserItem = {
      id: `adm-${Date.now()}`,
      nombre: formAdminNombre.trim(),
      email: formAdminEmail.trim(),
      password: formAdminPassword.trim(),
      tenantId: formAdminTenantId,
      tenantNombre: tObj ? tObj.nombreComercial : 'Ferretería General',
      activo: formAdminActivo,
      fechaCreacion: new Date().toISOString().split('T')[0],
    };

    setAdminUsers([nuevoAdmin, ...adminUsers]);
    setModalNuevoAdmin(false);

    registrarAuditoria('CREAR_ADMIN', nuevoAdmin.tenantNombre, `Nuevo Administrador asignado: ${nuevoAdmin.nombre}`);

    setMensajeExito(`¡Administrador "${nuevoAdmin.nombre}" asignado a "${nuevoAdmin.tenantNombre}"!`);
    setTimeout(() => setMensajeExito(null), 4000);

    setFormAdminNombre('');
    setFormAdminEmail('');
    setFormAdminPassword('');
  };

  const handleGuardarEdicionAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalEditarAdmin) return;

    const tObj = tenants.find((item) => item.id === formAdminTenantId);
    setAdminUsers(
      adminUsers.map((a) =>
        a.id === modalEditarAdmin.id
          ? {
              ...a,
              nombre: formAdminNombre.trim(),
              email: formAdminEmail.trim(),
              tenantId: formAdminTenantId,
              tenantNombre: tObj ? tObj.nombreComercial : a.tenantNombre,
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

    setAdminUsers(
      adminUsers.map((a) =>
        a.id === modalResetPassAdmin.id
          ? { ...a, password: nuevaPasswordInput.trim() }
          : a,
      ),
    );

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
      <TopBar title={t('superadmin.title') || "PANEL SUPER-ADMIN (SAAS)"} subtitle="Portal del Dueño de FerreSystem • Control Global & Módulos" />

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
            <div style={styles.metricLabel}>{t('superadmin.tenants_count') || "FERRETERÍAS REGISTRADAS"}</div>
          </div>

          <div className="industrial-card" style={styles.metricCard}>
            <UserCheck size={24} strokeWidth={2.4} color="#0284C7" />
            <div style={styles.metricValue}>{adminUsers.length}</div>
            <div style={styles.metricLabel}>{t('superadmin.admins_count') || "USUARIOS ADMINISTRADORES"}</div>
          </div>

          <div className="industrial-card" style={styles.metricCard}>
            <CheckCircle size={24} strokeWidth={2.4} color="#15803D" />
            <div style={styles.metricValue}>{tenants.filter((tItem) => tItem.estado === 'ACTIVO').length}</div>
            <div style={styles.metricLabel}>{t('superadmin.active_subscriptions') || "SUSCRIPCIONES ACTIVAS"}</div>
          </div>

          <div className="industrial-card" style={styles.metricCard}>
            <Server size={24} strokeWidth={2.4} color="var(--color-primary)" />
            <div style={styles.metricValue}>
              {tenants.reduce((acc, tItem) => acc + (tItem.sucursalesCount || 1), 0)}
            </div>
            <div style={styles.metricLabel}>{t('superadmin.total_branches') || "TOTAL SUCURSALES CONECTADAS"}</div>
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
            <span>{t('superadmin.tab_tenants') || "CLIENTES (EMPRESAS)"}</span>
          </button>

          <button
            type="button"
            onClick={() => setTabActiva('modulos')}
            style={{
              ...styles.tabBtn,
              ...(tabActiva === 'modulos' ? styles.tabBtnActive : {}),
            }}
          >
            <Layers size={16} />
            <span>{t('superadmin.tab_services') || "CATÁLOGO DE SERVICIOS"}</span>
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
            <span>{t('superadmin.tab_admins') || "USUARIOS ADMIN"}</span>
          </button>

          <button
            type="button"
            onClick={() => setTabActiva('auditoria')}
            style={{
              ...styles.tabBtn,
              ...(tabActiva === 'auditoria' ? styles.tabBtnActive : {}),
            }}
          >
            <ShieldCheck size={16} />
            <span>{t('superadmin.tab_audit') || "AUDITORÍA SAAS"}</span>
          </button>
        </div>

        {/* TAB 1: GESTIÓN DE TENANTS / CLIENTES */}
        {tabActiva === 'tenants' && (
          <div>
            <div style={styles.headerRow}>
              <div>
                <h2 style={{ fontSize: '16px', textTransform: 'uppercase' }}>
                  {t('superadmin.tenants_header') || "ADMINISTRACIÓN DE CLIENTES & EMPRESAS (TENANTS)"}
                </h2>
                <p style={{ fontSize: '12px', color: '#78716C' }}>
                  {t('superadmin.tenants_desc') || "Aprovisionamiento de nuevos clientes, contratación de servicios y modo de navegación."}
                </p>
              </div>

              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setModalNuevoTenant(true)}
              >
                <Plus size={18} strokeWidth={2.5} />
                <span>NUEVO CLIENTE / TENANT</span>
              </button>
            </div>

            <div className="table-container" style={{ marginTop: '20px' }}>
              <table className="industrial-table">
                <thead>
                  <tr>
                    <th>EMPRESA / CLIENTE</th>
                    <th>CONTACTO PRINCIPAL</th>
                    <th style={{ textAlign: 'center' }}>PLAN</th>
                    <th style={{ textAlign: 'center' }}>NAVEGACIÓN</th>
                    <th style={{ textAlign: 'center' }}>SERVICIOS HABILITADOS</th>
                    <th style={{ textAlign: 'center' }}>ESTADO</th>
                    <th style={{ textAlign: 'center' }}>ACCIONES SAAS</th>
                  </tr>
                </thead>
                <tbody>
                  {tenants.map((tItem) => {
                    const activeMods = tItem.modulosHabilitados || CATALOGO_MODULOS.map((m) => m.key);
                    const modCount = activeMods.length;
                    const modoNav = tItem.modoNavegacion || 'SIDEBAR';

                    return (
                      <tr key={tItem.id}>
                        <td style={{ fontFamily: 'var(--font-display)', fontWeight: 800 }}>
                          <div>{tItem.nombreComercial}</div>
                          <div style={{ fontSize: '10px', color: '#78716C', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                            <GitBranch size={11} /> <span>{tItem.sucursalesCount || 1} Sucursal(es) Conectada(s)</span>
                          </div>
                        </td>
                        <td style={{ fontWeight: 600 }}>
                          <div>{tItem.contacto}</div>
                          <div style={{ fontSize: '11px', color: '#78716C' }}>{tItem.telefono}</div>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className="badge badge-dark" style={{ fontSize: '11px' }}>{tItem.plan || 'Plan Pro'}</span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            className="btn btn-sm btn-secondary"
                            onClick={() => setModalNavegacionTenant(tItem)}
                            style={{ fontWeight: 800, fontSize: '10px' }}
                            title="Cambiar entre Menú Lateral o Menú Superior"
                          >
                            <Layout size={12} color="var(--color-primary)" /> {modoNav}
                          </button>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            className="btn btn-sm btn-secondary"
                            onClick={() => abrirModalModulos(tItem)}
                            title="Administrar Servicios y Módulos Contratados"
                            style={{ fontWeight: 800 }}
                          >
                            <Layers size={13} color="var(--color-primary)" /> {modCount} / {CATALOGO_MODULOS.length} SERVICIOS
                          </button>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {tItem.estado === 'ACTIVO' ? (
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
                              onClick={() => abrirModalModulos(tItem)}
                              title="Administrar Servicios Contratados"
                            >
                              SERVICIOS
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-secondary"
                              onClick={() => {
                                setModalSucursalesTenant(tItem);
                                setNuevaSucursalNombre('');
                                setNuevaSucursalDireccion('');
                                setNuevaSucursalTelefono('');
                                setNuevaSucursalEncargado('');
                              }}
                              title="Gestionar sub-sucursales"
                            >
                              <GitBranch size={13} /> SUCURSALES
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-secondary"
                              onClick={() => {
                                setModalEditarTenant(tItem);
                                setEditNombreComercial(tItem.nombreComercial);
                                setEditTelefono(tItem.telefono);
                                setEditPlan(tItem.plan);
                                setEditColorPrimario(tItem.colorPrimario);
                                setEditLogoUrl(tItem.logoUrl || '');
                                setEditModoNavegacion(tItem.modoNavegacion || 'SIDEBAR');
                              }}
                              title="Editar Marca y Datos General"
                            >
                              <Edit2 size={13} /> MARCA
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-primary"
                              onClick={() => abrirModalSuplantar(tItem)}
                              title="Entrar como administrador o usuario para soporte remoto"
                              style={{ backgroundColor: '#EA580C', borderColor: '#C2410C', fontWeight: 800 }}
                            >
                              <ExternalLink size={13} /> IMPERSONAR
                            </button>
                            <button
                              type="button"
                              className={`btn btn-sm ${tItem.estado === 'ACTIVO' ? 'btn-secondary' : 'btn-primary'}`}
                              onClick={() => toggleEstadoTenant(tItem.id)}
                            >
                              <Power size={13} strokeWidth={2.5} />
                              {tItem.estado === 'ACTIVO' ? 'SUSPENDER' : 'ACTIVAR'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: CATÁLOGO DE SERVICIOS GLOBAL */}
        {tabActiva === 'modulos' && (
          <div>
            <div style={styles.headerRow}>
              <div>
                <h2 style={{ fontSize: '16px', textTransform: 'uppercase' }}>
                  CATÁLOGO GLOBAL DE MÓDULOS & SERVICIOS
                </h2>
                <p style={{ fontSize: '12px', color: '#78716C' }}>
                  Especificación técnica y comercial de los módulos disponibles en la plataforma SaaS.
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px', marginTop: '20px' }}>
              {CATALOGO_MODULOS.map((mod) => (
                <div key={mod.key} className="industrial-card" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span className="badge badge-dark" style={{ fontSize: '10px' }}>{mod.categoria}</span>
                    {mod.isCore ? (
                      <span className="badge badge-warning" style={{ fontSize: '10px' }}>CORE / ESENCIAL</span>
                    ) : (
                      <span className="badge badge-success" style={{ fontSize: '10px' }}>CONTRATABLE</span>
                    )}
                  </div>

                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '15px', color: '#1C1917' }}>
                    {mod.nombre}
                  </div>

                  <div style={{ fontSize: '12px', color: '#78716C', flex: 1 }}>
                    {mod.descripcion}
                  </div>

                  <div style={{ fontSize: '11px', fontFamily: 'monospace', color: '#EA580C', fontWeight: 700, paddingTop: '8px', borderTop: '1px solid #E7E5E4' }}>
                    key: {mod.key}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: MANTENIMIENTO DE USUARIOS ADMIN */}
        {tabActiva === 'admins' && (
          <div>
            <div style={styles.headerRow}>
              <div>
                <h2 style={{ fontSize: '16px', textTransform: 'uppercase' }}>
                  MANTENIMIENTO DE USUARIOS ADMINISTRADORES (ADMIN)
                </h2>
                <p style={{ fontSize: '12px', color: '#78716C' }}>
                  Gestión centralizada sobre los administradores autorizados de cada cliente.
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
                    <th>EMPRESA / TENANT</th>
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

        {/* TAB 4: AUDITORÍA SAAS */}
        {tabActiva === 'auditoria' && (
          <div>
            <div style={styles.headerRow}>
              <div>
                <h2 style={{ fontSize: '16px', textTransform: 'uppercase' }}>
                  REGISTRO DE AUDITORÍA DE ACCIONES CRÍTICAS SAAS
                </h2>
                <p style={{ fontSize: '12px', color: '#78716C' }}>
                  Historial de cambios en suscripciones, habilitación de módulos e impersonaciones.
                </p>
              </div>
            </div>

            <div className="table-container" style={{ marginTop: '20px' }}>
              <table className="industrial-table">
                <thead>
                  <tr>
                    <th>FECHA / HORA</th>
                    <th>ACCIÓN</th>
                    <th>CLIENTE / TENANT</th>
                    <th>DETALLES DE LA OPERACIÓN</th>
                    <th style={{ textAlign: 'center' }}>EJECUTADO POR</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log) => (
                    <tr key={log.id}>
                      <td style={{ fontSize: '11px', fontFamily: 'monospace' }}>{log.fecha}</td>
                      <td>
                        <span className="badge badge-dark" style={{ fontSize: '10px' }}>{log.accion}</span>
                      </td>
                      <td style={{ fontWeight: 800 }}>{log.tenantNombre}</td>
                      <td style={{ fontSize: '12px', color: '#444' }}>{log.detalles}</td>
                      <td style={{ textAlign: 'center', fontWeight: 700 }}>{log.usuario}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* MODAL 1: ADMINISTRAR SERVICIOS Y MÓDULOS DE UN TENANT */}
      {modalModulosTenant && (
        <div style={styles.modalOverlay}>
          <div className="industrial-card" style={{ ...styles.modalContent, maxWidth: '750px' }}>
            <div style={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <div>
                  <h2 style={{ fontSize: '16px', textTransform: 'uppercase' }}>
                    ADMINISTRAR SERVICIOS Y MÓDULOS CONTRATADOS
                  </h2>
                  <div style={{ fontSize: '13px', color: '#EA580C', fontWeight: 800, marginTop: '2px' }}>
                    CLIENTE: {modalModulosTenant.nombreComercial} ({modalModulosTenant.plan})
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setModalModulosTenant(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div style={{ marginTop: '16px', maxHeight: '420px', overflowY: 'auto', paddingRight: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                <span style={{ fontSize: '12px', color: '#78716C' }}>
                  Marque los módulos que el cliente tiene habilitados. Los cambios no se aplican hasta pulsar <strong>Guardar Cambios</strong>.
                </span>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    onClick={activarTodosModulos}
                    style={{ fontSize: '10px', fontWeight: 800 }}
                  >
                    ACTIVAR TODOS
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    onClick={desactivarOpcionalesModulos}
                    style={{ fontSize: '10px', fontWeight: 800 }}
                  >
                    DESACTIVAR OPCIONALES
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '12px' }}>
                {CATALOGO_MODULOS.map((m) => {
                  const isEnabled = tempModulosTenant.includes(m.key);

                  return (
                    <label
                      key={m.key}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '12px',
                        padding: '12px',
                        backgroundColor: isEnabled ? '#DCFCE7' : '#FAFAF9',
                        border: isEnabled ? '1.5px solid #16A34A' : '1.5px solid #D6D3D1',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        transition: 'all 150ms ease',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isEnabled}
                        onChange={() => toggleTempModulo(m.key)}
                        style={{ marginTop: '3px', cursor: 'pointer', width: '16px', height: '16px' }}
                      />
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 800, fontSize: '13px', color: isEnabled ? '#15803D' : '#44403C' }}>
                            {m.nombre}
                          </span>
                          <span className="badge badge-dark" style={{ fontSize: '9px' }}>{m.categoria}</span>
                        </div>
                        <div style={{ fontSize: '11px', color: '#78716C', marginTop: '2px' }}>{m.descripcion}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px', paddingTop: '12px', borderTop: '1px solid #E7E5E4' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setModalModulosTenant(null)}
              >
                CANCELAR
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={guardarModulosTenant}
              >
                <Check size={16} strokeWidth={2.6} /> GUARDAR CAMBIOS DE SERVICIO
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: CONFIGURAR TIPO DE NAVEGACIÓN */}
      {modalNavegacionTenant && (
        <div style={styles.modalOverlay}>
          <div className="industrial-card" style={{ ...styles.modalContent, maxWidth: '480px' }}>
            <div style={styles.modalHeader}>
              <h2 style={{ fontSize: '16px', textTransform: 'uppercase' }}>
                CONFIGURACIÓN DE NAVEGACIÓN
              </h2>
              <div style={{ fontSize: '12px', color: '#EA580C', fontWeight: 800, marginTop: '2px' }}>
                EMPRESA: {modalNavegacionTenant.nombreComercial}
              </div>
            </div>

            <div style={{ marginTop: '16px' }}>
              <p style={{ fontSize: '12px', color: '#78716C' }}>
                Seleccione el formato de menú visual con el que interactuarán los usuarios de este cliente:
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '14px' }}>
                <button
                  type="button"
                  onClick={() => guardarNavegacionTenant(modalNavegacionTenant.id, 'SIDEBAR')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 18px',
                    backgroundColor: (modalNavegacionTenant.modoNavegacion || 'SIDEBAR') === 'SIDEBAR' ? '#1C1917' : '#FAFAF9',
                    color: (modalNavegacionTenant.modoNavegacion || 'SIDEBAR') === 'SIDEBAR' ? '#FFFFFF' : '#1C1917',
                    border: '2px solid #1C1917',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-display)',
                    fontWeight: 800,
                  }}
                >
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: '13px' }}>○ MENÚ LATERAL (SIDEBAR)</div>
                    <div style={{ fontSize: '11px', opacity: 0.8, fontWeight: 400 }}>Panel lateral izquierdo tradicional</div>
                  </div>
                  {(modalNavegacionTenant.modoNavegacion || 'SIDEBAR') === 'SIDEBAR' && <CheckCircle size={18} color="#EA580C" />}
                </button>

                <button
                  type="button"
                  onClick={() => guardarNavegacionTenant(modalNavegacionTenant.id, 'TOPNAV')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 18px',
                    backgroundColor: modalNavegacionTenant.modoNavegacion === 'TOPNAV' ? '#1C1917' : '#FAFAF9',
                    color: modalNavegacionTenant.modoNavegacion === 'TOPNAV' ? '#FFFFFF' : '#1C1917',
                    border: '2px solid #1C1917',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-display)',
                    fontWeight: 800,
                  }}
                >
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: '13px' }}>○ MENÚ SUPERIOR (TOPNAV)</div>
                    <div style={{ fontSize: '11px', opacity: 0.8, fontWeight: 400 }}>Barra de navegación horizontal superior</div>
                  </div>
                  {modalNavegacionTenant.modoNavegacion === 'TOPNAV' && <CheckCircle size={18} color="#EA580C" />}
                </button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setModalNavegacionTenant(null)}
                >
                  CERRAR
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: SUB-SUCURSALES */}
      {modalSucursalesTenant && (
        <div style={styles.modalOverlay}>
          <div className="industrial-card" style={{ ...styles.modalContent, maxWidth: '650px' }}>
            <div style={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <div>
                  <h2 style={{ fontSize: '16px', textTransform: 'uppercase' }}>
                    GESTIÓN DE SUB-SUCURSALES
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
                        tenants.map((tItem) =>
                          tItem.id === modalSucursalesTenant.id
                            ? {
                                ...tItem,
                                sucursalesCount: updatedList.length,
                                sucursalesList: updatedList,
                              }
                            : tItem,
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
                      setMensajeExito(`¡Sub-sucursal "${nuevaSubSucursal.nombre}" habilitada!`);
                      setTimeout(() => setMensajeExito(null), 4000);
                    }}
                  >
                    <Plus size={14} /> CREAR SUCURSAL
                  </button>
                </div>
              </div>

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
                                tenants.map((tItem) =>
                                  tItem.id === modalSucursalesTenant.id
                                    ? {
                                        ...tItem,
                                        sucursalesCount: updatedList.length,
                                        sucursalesList: updatedList,
                                      }
                                    : tItem,
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

      {/* MODAL 4: EDITAR TENANT MARCA */}
      {modalEditarTenant && (
        <div style={styles.modalOverlay}>
          <div className="industrial-card" style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <h2 style={{ fontSize: '16px', textTransform: 'uppercase' }}>
                CONFIGURAR MARCA Y DATOS DE EMPRESA
              </h2>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setTenants(
                  tenants.map((tItem) =>
                    tItem.id === modalEditarTenant.id
                      ? {
                          ...tItem,
                          nombreComercial: editNombreComercial.toUpperCase().trim(),
                          telefono: editTelefono,
                          plan: editPlan,
                          colorPrimario: editColorPrimario,
                          logoUrl: editLogoUrl.trim() || null,
                          modoNavegacion: editModoNavegacion,
                        }
                      : tItem,
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

              <div className="form-group">
                <label className="form-label">RUBRO O GIRO COMERCIAL</label>
                <select
                  value={nuevoRubro}
                  onChange={(e) => setNuevoRubro(e.target.value as Rubro)}
                  className="form-select"
                >
                  <option value={Rubro.FERRETERIA}>Ferretería y Materiales de Construcción</option>
                  <option value={Rubro.PULPERIA}>Pulpería / Mini Abastos</option>
                  <option value={Rubro.MINIMARKET}>Minimarket / Súper Conveniencia</option>
                  <option value={Rubro.FARMACIA}>Farmacia y Salud</option>
                  <option value={Rubro.PAPELERIA}>Papelería y Útiles de Oficina</option>
                  <option value={Rubro.DISTRIBUIDORA}>Distribuidora Mayorista</option>
                  <option value={Rubro.AGROSERVICIO}>Agroservicio y Veterinaria</option>
                  <option value={Rubro.REPUESTOS_AUTOMOTRICES}>Repuestos Automotrices</option>
                  <option value={Rubro.ELECTRODOMESTICOS}>Electrodomésticos y Tecnología</option>
                  <option value={Rubro.GENERAL}>Comercio General</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">URL LOGO PERSONALIZADO (IMAGEN CORPORATIVA)</label>
                <input
                  type="url"
                  placeholder="https://ejemplo.com/logo.png"
                  value={editLogoUrl}
                  onChange={(e) => setEditLogoUrl(e.target.value)}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label">MODO DE NAVEGACIÓN</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setEditModoNavegacion('SIDEBAR')}
                    style={{
                      padding: '8px',
                      fontWeight: 800,
                      fontSize: '11px',
                      backgroundColor: editModoNavegacion === 'SIDEBAR' ? '#1C1917' : '#FAFAF9',
                      color: editModoNavegacion === 'SIDEBAR' ? '#FAFAF9' : '#1C1917',
                      border: editModoNavegacion === 'SIDEBAR' ? '2px solid #EA580C' : '1px solid #D6D3D1',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    MENÚ LATERAL (SIDEBAR)
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditModoNavegacion('TOPNAV')}
                    style={{
                      padding: '8px',
                      fontWeight: 800,
                      fontSize: '11px',
                      backgroundColor: editModoNavegacion === 'TOPNAV' ? '#1C1917' : '#FAFAF9',
                      color: editModoNavegacion === 'TOPNAV' ? '#FAFAF9' : '#1C1917',
                      border: editModoNavegacion === 'TOPNAV' ? '2px solid #EA580C' : '1px solid #D6D3D1',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    MENÚ SUPERIOR (TOPNAV)
                  </button>
                </div>
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

      {/* MODAL 5: NUEVO TENANT */}
      {modalNuevoTenant && (
        <div style={styles.modalOverlay}>
          <div className="industrial-card" style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <h2 style={{ fontSize: '16px', textTransform: 'uppercase' }}>
                CREAR NUEVO TENANT / CLIENTE
              </h2>
            </div>

            <form onSubmit={handleCrearTenant} style={{ marginTop: '16px' }}>
              <div className="form-group">
                <label className="form-label">NOMBRE COMERCIAL DE LA EMPRESA</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. FERRETERÍA SAN PEDRO S. DE R.L."
                  value={nombreComercial}
                  onChange={(e) => setNombreComercial(e.target.value)}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label">RUBRO O GIRO COMERCIAL</label>
                <select
                  value={nuevoRubro}
                  onChange={(e) => setNuevoRubro(e.target.value as Rubro)}
                  className="form-select"
                >
                  <option value={Rubro.FERRETERIA}>Ferretería y Materiales de Construcción</option>
                  <option value={Rubro.PULPERIA}>Pulpería / Mini Abastos</option>
                  <option value={Rubro.MINIMARKET}>Minimarket / Súper Conveniencia</option>
                  <option value={Rubro.FARMACIA}>Farmacia y Salud</option>
                  <option value={Rubro.PAPELERIA}>Papelería y Útiles de Oficina</option>
                  <option value={Rubro.DISTRIBUIDORA}>Distribuidora Mayorista</option>
                  <option value={Rubro.AGROSERVICIO}>Agroservicio y Veterinaria</option>
                  <option value={Rubro.REPUESTOS_AUTOMOTRICES}>Repuestos Automotrices</option>
                  <option value={Rubro.ELECTRODOMESTICOS}>Electrodomésticos y Tecnología</option>
                  <option value={Rubro.GENERAL}>Comercio General</option>
                </select>
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

      {/* MODAL 6: IMPERSONACIÓN DE USUARIO */}
      {modalSuplantarUser && (
        <div style={styles.modalOverlay}>
          <div className="industrial-card" style={{ ...styles.modalContent, maxWidth: '600px' }}>
            <div style={styles.modalHeader}>
              <div>
                <h2 style={{ fontSize: '16px', textTransform: 'uppercase' }}>
                  SOPORTE REMOTO • SELECCIONAR USUARIO A IMPERSONAR
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
                        <ExternalLink size={13} /> IMPERSONAR USUARIO
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

      {/* MODAL 7: NUEVO USUARIO ADMIN */}
      {modalNuevoAdmin && (
        <div style={styles.modalOverlay}>
          <div className="industrial-card" style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <h2 style={{ fontSize: '16px', textTransform: 'uppercase' }}>
                NUEVO USUARIO ADMINISTRADOR
              </h2>
            </div>

            <form onSubmit={handleCrearAdmin} style={{ marginTop: '16px' }}>
              <div className="form-group">
                <label className="form-label">EMPRESA / TENANT</label>
                <select
                  value={formAdminTenantId}
                  onChange={(e) => setFormAdminTenantId(e.target.value)}
                  className="form-select"
                >
                  {tenants.map((tItem) => (
                    <option key={tItem.id} value={tItem.id}>
                      {tItem.nombreComercial}
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

      {/* MODAL 8: EDITAR ADMIN */}
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
                <label className="form-label">EMPRESA / TENANT</label>
                <select
                  value={formAdminTenantId}
                  onChange={(e) => setFormAdminTenantId(e.target.value)}
                  className="form-select"
                >
                  {tenants.map((tItem) => (
                    <option key={tItem.id} value={tItem.id}>
                      {tItem.nombreComercial}
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
                    Activo
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

      {/* MODAL 9: RESTABLECER CONTRASEÑA */}
      {modalResetPassAdmin && (
        <div style={styles.modalOverlay}>
          <div className="industrial-card" style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <h2 style={{ fontSize: '16px', textTransform: 'uppercase' }}>
                RESTABLECER CONTRASEÑA DE ADMIN
              </h2>
            </div>

            <form onSubmit={handleResetPassword} style={{ marginTop: '16px' }}>
              <p style={{ fontSize: '13px', color: '#444' }}>
                Cambiar contraseña para <strong>{modalResetPassAdmin.nombre}</strong> (<code>{modalResetPassAdmin.email}</code>).
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
