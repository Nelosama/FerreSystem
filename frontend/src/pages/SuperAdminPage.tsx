import React, { useState, useEffect } from 'react';
import { generatePassword } from '../utils/generatePassword';
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
  Layers,
  Layout,
  AlertCircle,
} from 'lucide-react';
import { TopBar } from '../components/TopBar';
import { useTenant } from '../context/TenantContext';
import { useNavigate } from 'react-router-dom';
import { CATALOGO_MODULOS, PENDING_MODULES } from '../config/modulesCatalog';
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
  rol?: string;
  id: string;
  nombre: string;
  email: string;
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

export interface SupportHistoryItem {
  id: string;
  superAdminNombre: string;
  tenantId: string;
  tenantNombre: string;
  categoria: 'Reporte de error' | 'Solicitud del cliente' | 'Verificación de pago' | 'Otro';
  descripcion: string;
  fechaInicio: string;
  fechaFin: string | null;
  modoEdicionActivado: boolean;
}

interface AdminTenantApiRecord {
  id: string;
  nombreComercial: string;
  direccion?: string | null;
  telefono?: string | null;
  email?: string | null;
  logoUrl?: string | null;
  colorPrimario?: string | null;
  modoNavegacion?: 'SIDEBAR' | 'TOPNAV';
  plan: string;
  estado: 'ACTIVO' | 'SUSPENDIDO';
  cantidadUsuarios: number;
  modulosHabilitados: string[];
  usuarios: { id: string; nombre: string; email: string; rol?: string; activo: boolean; createdAt: string }[];
}

function mapAdminTenantResponse(records: AdminTenantApiRecord[]) {
  const tenants: TenantItem[] = records.map((record) => ({
    id: record.id,
    nombreComercial: record.nombreComercial,
    contacto: record.email || '',
    telefono: record.telefono || '',
    plan: record.plan,
    estado: record.estado,
    usuariosCount: record.cantidadUsuarios,
    sucursalesCount: 1,
    colorPrimario: record.colorPrimario || '#EA580C',
    logoUrl: record.logoUrl,
    modoNavegacion: record.modoNavegacion,
    modulosHabilitados: record.modulosHabilitados,
  }));

  const adminUsers: AdminUserItem[] = records.flatMap((record) =>
    (record.usuarios || []).map((user) => ({
      id: user.id,
      rol: user.rol || 'ADMIN',
      nombre: user.nombre,
      email: user.email,
      tenantId: record.id,
      tenantNombre: record.nombreComercial,
      activo: user.activo,
      fechaCreacion: user.createdAt.slice(0, 10),
    })),
  );

  return { tenants, adminUsers };
}

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

  const [tabActiva, setTabActiva] = useState<'dashboard' | 'tenants' | 'modulos' | 'admins' | 'auditoria' | 'soporte_historial'>('tenants');

  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUserItem[]>([]);

  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>(() => {
    const saved = localStorage.getItem('ferre_saas_audit');
    return saved ? JSON.parse(saved) : INITIAL_AUDIT_LOGS;
  });

  const [supportLogs, setSupportLogs] = useState<SupportHistoryItem[]>(() => {
    const saved = localStorage.getItem('ferre_mock_auditoria_soporte');
    return saved ? JSON.parse(saved) : [];
  });

  const [errorText, setErrorText] = useState<string | null>(null);
  const [creatingTenant, setCreatingTenant] = useState(false);

  useEffect(() => {
    api
      .get<AdminTenantApiRecord[]>('/admin/tenants')
      .then(({ data }) => {
        if (Array.isArray(data)) {
          const mapped = mapAdminTenantResponse(data);
          setTenants(mapped.tenants);
          setAdminUsers(mapped.adminUsers);
        }
      })
      .catch((err) => {
        console.error('Error al obtener tenants desde la API real:', err);
        setErrorText(t('uxAudit.admin_message_0'));
      });
  }, []);

  // Modales
  const [modalNuevoTenant, setModalNuevoTenant] = useState(false);
  const [modalEditarTenant, setModalEditarTenant] = useState<TenantItem | null>(null);
  const [modalModulosTenant, setModalModulosTenant] = useState<TenantItem | null>(null);
  const [tempModulosTenant, setTempModulosTenant] = useState<string[]>([]);
  const [modalNavegacionTenant, setModalNavegacionTenant] = useState<TenantItem | null>(null);
  const [modalNuevoAdmin, setModalNuevoAdmin] = useState(false);
  const [modalEditarAdmin, setModalEditarAdmin] = useState<AdminUserItem | null>(null);
  const [modalResetPassAdmin, setModalResetPassAdmin] = useState<AdminUserItem | null>(null);
  const [modalSuplantarUser, setModalSuplantarUser] = useState<TenantItem | null>(null);
  const [busquedaSuplantar, setBusquedaSuplantar] = useState('');

  // Modal obligatorio de motivo de soporte
  const [usuarioASuplantar, setUsuarioASuplantar] = useState<{ id: string; nombre: string; email: string; rol: any } | null>(null);
  const [soporteCategoria, setSoporteCategoria] = useState<'Reporte de error' | 'Solicitud del cliente' | 'Verificación de pago' | 'Otro'>('Reporte de error');
  const [soporteDescripcion, setSoporteDescripcion] = useState('');

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

  // Formulario Admin User
  const [formAdminNombre, setFormAdminNombre] = useState('');
  const [formAdminEmail, setFormAdminEmail] = useState('');
  const [formAdminPassword, setFormAdminPassword] = useState('');
  const [formAdminTenantId, setFormAdminTenantId] = useState('t-1');
  const [formAdminActivo, setFormAdminActivo] = useState(true);
  const [nuevaPasswordInput, setNuevaPasswordInput] = useState('');

  const [adminSaving, setAdminSaving] = useState(false);
  const [brandSaving, setBrandSaving] = useState(false);
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

  const toggleEstadoTenant = async (id: string) => {
    const target = tenants.find((t) => t.id === id);
    if (!target) return;
    const nuevoEstado = target.estado === 'ACTIVO' ? 'SUSPENDIDO' : 'ACTIVO';
    try {
      await api.patch(`/admin/tenants/${id}/status`, { estado: nuevoEstado });
      setTenants((current) => current.map((t) => (t.id === id ? { ...t, estado: nuevoEstado } : t)));
      registrarAuditoria('CAMBIO_ESTADO_TENANT', target.nombreComercial, `Estado cambiado a ${nuevoEstado}`);
      setMensajeExito(t('uxAudit.admin_success_0', { name: target.nombreComercial, status: t(nuevoEstado === 'ACTIVO' ? 'uxAudit.active' : 'uxAudit.suspended') }));
      setTimeout(() => setMensajeExito(null), 4000);
    } catch (err: any) {
      setErrorText(err.response?.data?.message || t('uxAudit.admin_message_1'));
    }
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

  const guardarModulosTenant = async () => {
    if (!modalModulosTenant) return;
    const modulesPayload = CATALOGO_MODULOS.map((m) => ({
      moduleKey: m.key,
      enabled: !!m.isCore || tempModulosTenant.includes(m.key),
    }));

    try {
      await api.put(`/admin/tenants/${modalModulosTenant.id}/modules`, { modules: modulesPayload });
      setTenants((current) => current.map((tItem) =>
        tItem.id === modalModulosTenant.id ? { ...tItem, modulosHabilitados: tempModulosTenant } : tItem,
      ));
      registrarAuditoria(
        'ACTUALIZAR_SERVICIOS',
        modalModulosTenant.nombreComercial,
        `Módulos activos actualizados: ${tempModulosTenant.length} de ${CATALOGO_MODULOS.length}`,
      );
      setMensajeExito(t('uxAudit.admin_success_1', { name: modalModulosTenant.nombreComercial }));
      setModalModulosTenant(null);
      setTimeout(() => setMensajeExito(null), 4000);
    } catch (err: any) {
      setErrorText(err.response?.data?.message || t('uxAudit.admin_message_2'));
    }
  };

  const guardarNavegacionTenant = async (tenantId: string, modo: 'SIDEBAR' | 'TOPNAV') => {
    const target = tenants.find((tItem) => tItem.id === tenantId);
    if (!target) return;

    try {
      await api.patch(`/admin/tenants/${tenantId}`, { modoNavegacion: modo });
      setTenants((current) => current.map((tItem) => (tItem.id === tenantId ? { ...tItem, modoNavegacion: modo } : tItem)));
      registrarAuditoria('CAMBIO_NAVEGACION', target.nombreComercial, `Modo de navegación cambiado a ${modo}`);
      setModalNavegacionTenant(null);
      setMensajeExito(t('uxAudit.admin_success_2', { name: target.nombreComercial, mode: modo }));
      setTimeout(() => setMensajeExito(null), 4000);
    } catch (err: any) {
      setErrorText(err.response?.data?.message || t('uxAudit.admin_message_3'));
    }
  };

  const abrirModalSuplantar = (tenantItem: TenantItem) => {
    setModalSuplantarUser(tenantItem);
    setBusquedaSuplantar('');
  };

  const abrirFormularioMotivoSuplantar = (usrObj: { id: string; nombre: string; email: string; rol: any }) => {
    setUsuarioASuplantar(usrObj);
    setSoporteCategoria('Reporte de error');
    setSoporteDescripcion('');
  };

  const ejecutarSuplantacionConMotivo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalSuplantarUser || !usuarioASuplantar) return;
    if (soporteDescripcion.trim().length < 10) return;

    const sessionId = `sup-${Date.now()}`;
    const nowFormatted = new Date().toISOString().replace('T', ' ').slice(0, 16);

    const nuevoRegistroSoporte: SupportHistoryItem = {
      id: sessionId,
      superAdminNombre: 'Super Admin',
      tenantId: modalSuplantarUser.id,
      tenantNombre: modalSuplantarUser.nombreComercial,
      categoria: soporteCategoria,
      descripcion: soporteDescripcion.trim(),
      fechaInicio: nowFormatted,
      fechaFin: null,
      modoEdicionActivado: false,
    };

    try {
      await impersonateTenantAdmin(
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
          id: usuarioASuplantar.id,
          nombre: usuarioASuplantar.nombre,
          email: usuarioASuplantar.email,
          rol: usuarioASuplantar.rol,
          activo: true,
        },
        sessionId,
        `[${soporteCategoria}] ${soporteDescripcion.trim()}`.slice(0, 500)
      );

      const updatedSupportLogs = [nuevoRegistroSoporte, ...supportLogs];
      setSupportLogs(updatedSupportLogs);
      localStorage.setItem('ferre_mock_auditoria_soporte', JSON.stringify(updatedSupportLogs));

      registrarAuditoria(
        'IMPERSONACION_INICIADA',
        modalSuplantarUser.nombreComercial,
        `Suplantando a ${usuarioASuplantar.nombre} (${usuarioASuplantar.email}) - Motivo: [${soporteCategoria}] ${soporteDescripcion.trim()}`
      );

      setUsuarioASuplantar(null);
      setModalSuplantarUser(null);
      navigate('/');
    } catch (error: any) {
      setErrorText(error.response?.data?.message || t('uxAudit.admin_message_4'));
    }
  };

  const toggleEstadoAdmin = async (id: string) => {
    const admin = adminUsers.find(item => item.id === id); if (!admin) return;
    try {
      const { data } = await api.patch(`/admin/tenants/${admin.tenantId}/admins/${id}`, { activo: !admin.activo });
      setAdminUsers(current => current.map(item => item.id === id ? { ...item, ...data } : item));
      setMensajeExito(t('uxAudit.admin_message_5'));
    } catch (error: any) { setErrorText(error.response?.data?.message || t('uxAudit.admin_message_6')); }
  };

  const handleCrearTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombreComercial || !adminEmail || !adminPassword) return;
    setCreatingTenant(true);
    setErrorText(null);
    try {
      const { data } = await api.post('/admin/tenants', {
        nombreComercial: nombreComercial.trim(),
        telefono: telefono.trim() || undefined,
        email: adminEmail.trim(),
        adminNombre: adminNombre.trim(),
        adminEmail: adminEmail.trim(),
        adminPassword,
        colorPrimario,
      });
      const createdTenant: TenantItem = {
        id: data.tenant.id,
        nombreComercial: data.tenant.nombreComercial,
        contacto: data.tenant.email || data.adminUsuario.email,
        telefono: data.tenant.telefono || '',
        plan: data.tenant.plan,
        estado: data.tenant.estado,
        usuariosCount: 1,
        sucursalesCount: 1,
        colorPrimario: data.tenant.colorPrimario,
        modoNavegacion: data.tenant.modoNavegacion,
        modulosHabilitados: data.modulosHabilitados,
      };
      const createdAdmin: AdminUserItem = {
        id: data.adminUsuario.id,
        nombre: data.adminUsuario.nombre,
        email: data.adminUsuario.email,
        tenantId: data.tenant.id,
        tenantNombre: data.tenant.nombreComercial,
        activo: true,
        fechaCreacion: new Date(data.tenant.createdAt).toISOString().slice(0, 10),
      };
      setTenants((current) => [createdTenant, ...current]);
      setAdminUsers((current) => [createdAdmin, ...current]);
      setModalNuevoTenant(false);
      registrarAuditoria('CREAR_TENANT', createdTenant.nombreComercial, `Cliente y Administrador (${createdAdmin.email}) aprovisionados`);
      setMensajeExito(t('uxAudit.admin_success_3', { name: createdTenant.nombreComercial }));
      setTimeout(() => setMensajeExito(null), 5000);
      setNombreComercial('');
      setAdminNombre('');
      setAdminEmail('');
      setAdminPassword('');
      setTelefono('');
    } catch (err: any) {
      setErrorText(err.response?.data?.message || t('uxAudit.admin_message_7'));
    } finally {
      setCreatingTenant(false);
    }
  };

  const handleCrearAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (adminSaving) return;
    setAdminSaving(true); setErrorText(null); setMensajeExito(null);
    try {
      const { data } = await api.post(`/admin/tenants/${formAdminTenantId}/admins`, { nombre: formAdminNombre.trim(), email: formAdminEmail.trim(), password: formAdminPassword, activo: formAdminActivo });
      const company = tenants.find(item => item.id === formAdminTenantId);
      setAdminUsers(current => [{ ...data, tenantNombre: company?.nombreComercial || '', fechaCreacion: data.createdAt?.split('T')[0] }, ...current]);
      setModalNuevoAdmin(false); setFormAdminPassword('');
      setMensajeExito(t('uxAudit.admin_message_8'));
    } catch (error: any) { setErrorText(error.response?.data?.message || t('uxAudit.admin_message_9')); } finally { setAdminSaving(false); }
  };
  const handleGuardarEdicionAdmin = async (e: React.FormEvent) => {
    e.preventDefault(); if (!modalEditarAdmin) return;
    if (formAdminTenantId !== modalEditarAdmin.tenantId) { setErrorText(t('uxAudit.admin_message_10')); return; }
    if (adminSaving) return;
    setAdminSaving(true); setErrorText(null);
    try {
      const { data } = await api.patch(`/admin/tenants/${modalEditarAdmin.tenantId}/admins/${modalEditarAdmin.id}`, { nombre: formAdminNombre.trim(), email: formAdminEmail.trim(), activo: formAdminActivo });
      setAdminUsers(current => current.map(item => item.id === modalEditarAdmin.id ? { ...item, ...data } : item));
      setModalEditarAdmin(null); setMensajeExito(t('uxAudit.admin_message_11'));
    } catch (error: any) { setErrorText(error.response?.data?.message || t('uxAudit.admin_message_12')); } finally { setAdminSaving(false); }
  };
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault(); if (!modalResetPassAdmin) return;
    if (adminSaving) return;
    setAdminSaving(true); setErrorText(null);
    try {
      await api.patch(`/admin/tenants/${modalResetPassAdmin.tenantId}/admins/${modalResetPassAdmin.id}`, { password: nuevaPasswordInput });
      setModalResetPassAdmin(null); setNuevaPasswordInput(''); setMensajeExito(t('uxAudit.admin_message_13'));
    } catch (error: any) { setErrorText(error.response?.data?.message || t('uxAudit.admin_message_14')); } finally { setAdminSaving(false); }
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
      <TopBar title={t('superadmin.title') || "PANEL SUPER-ADMIN (SAAS)"} subtitle={t('uxAudit.ferresystem_owner_portal_global_control_modules')} />

      <main style={styles.content}>
        {errorText && (
          <div style={{
            marginBottom: '16px',
            padding: '12px 16px',
            backgroundColor: '#FEE2E2',
            border: '1px solid #EF4444',
            borderRadius: '4px',
            color: '#991B1B',
            fontSize: '13px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}>
            <AlertCircle size={18} />
            <span>{errorText}</span>
          </div>
        )}

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

          <button
            type="button"
            onClick={() => setTabActiva('soporte_historial')}
            style={{
              ...styles.tabBtn,
              ...(tabActiva === 'soporte_historial' ? styles.tabBtnActive : {}),
            }}
          >
            <KeyRound size={16} />
            <span>{t('uxAudit.support_history')} </span>
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
                <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                  {t('superadmin.tenants_desc') || "Aprovisionamiento de nuevos clientes, contratación de servicios y modo de navegación."}
                </p>
              </div>

              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setModalNuevoTenant(true)}
              >
                <Plus size={18} strokeWidth={2.5} />
                <span>{t('uxAudit.new_customer_tenant')} </span>
              </button>
            </div>

            <div className="table-container" style={{ marginTop: '20px' }}>
              <table className="industrial-table">
                <thead>
                  <tr>
                    <th>{t('uxAudit.company_customer')} </th>
                    <th>{t('uxAudit.main_contact')} </th>
                    <th style={{ textAlign: 'center' }}>PLAN</th>
                    <th style={{ textAlign: 'center' }}>{t('uxAudit.navigation')} </th>
                    <th style={{ textAlign: 'center' }}>{t('uxAudit.enabled_services')} </th>
                    <th style={{ textAlign: 'center' }}>{t('uxAudit.status')} </th>
                    <th style={{ textAlign: 'center' }}>{t('uxAudit.saas_actions')} </th>
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
                          <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                            <GitBranch size={11} /> <span>{tItem.sucursalesCount || 1}{t('uxAudit.connected_branch_es')} </span>
                          </div>
                        </td>
                        <td style={{ fontWeight: 600 }}>
                          <div>{tItem.contacto}</div>
                          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{tItem.telefono}</div>
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
                            title={t('uxAudit.switch_between_side_menu_and_top_menu')}
                          >
                            <Layout size={12} color="var(--color-primary)" /> {modoNav}
                          </button>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            className="btn btn-sm btn-secondary"
                            onClick={() => abrirModalModulos(tItem)}
                            title={t('uxAudit.manage_subscribed_services_and_modules')}
                            style={{ fontWeight: 800 }}
                          >
                            <Layers size={13} color="var(--color-primary)" /> {modCount} / {CATALOGO_MODULOS.length}{t('uxAudit.services')} </button>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {tItem.estado === 'ACTIVO' ? (
                            <span className="badge badge-success">{t('uxAudit.active')} </span>
                          ) : (
                            <span className="badge badge-danger">{t('uxAudit.suspended')} </span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: "inline-flex", gap: "6px" }}>
                            <button
                              type="button"
                              className="btn btn-sm btn-primary"
                              onClick={() => abrirModalSuplantar(tItem)}
                              title={t('uxAudit.enter_as_an_administrator_or_user_for_remote_support')}
                              style={{ backgroundColor: '#EA580C', borderColor: '#C2410C', fontWeight: 800 }}
                            >
                              <ExternalLink size={13} /> {t('navigation.support')}
                            </button>
<details className="tenant-context-actions"><summary>{t('navigation.company')}</summary><div>                            <button
                              type="button"
                              className="btn btn-sm btn-secondary"
                              onClick={() => abrirModalModulos(tItem)}
                              title={t('uxAudit.manage_subscribed_services')}
                            >{t('uxAudit.services')} </button>
                            <p>{t('pending.branches')}</p>
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
                              title={t('uxAudit.edit_branding_and_company_details')}
                            >
                              <Edit2 size={13} />{t('uxAudit.branding')} </button>

                            <button
                              type="button"
                              className={`btn btn-sm ${tItem.estado === 'ACTIVO' ? 'btn-secondary' : 'btn-primary'}`}
                              onClick={() => toggleEstadoTenant(tItem.id)}
                            >
                              <Power size={13} strokeWidth={2.5} />
                              {tItem.estado === 'ACTIVO' ? t('uxAudit.admin_message_17') : t('uxAudit.admin_message_18')}
                            </button>
</div></details>
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

        {/* TAB 5: HISTORIAL DE SOPORTE */}
        {tabActiva === 'soporte_historial' && (
          <div>
            <div style={styles.headerRow}>
              <div>
                <h2 style={{ fontSize: '16px', textTransform: 'uppercase' }}>{t('uxAudit.access_and_remote_support_history')} </h2>
                <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{t('uxAudit.required_record_of_customer_impersonations_including_reasons_duration_and_edit_mode_activation')} </p>
              </div>
            </div>

            <div className="table-container" style={{ marginTop: '20px' }}>
              <table className="industrial-table">
                <thead>
                  <tr>
                    <th>SUPERADMIN</th>
                    <th>{t('uxAudit.tenant_customer')} </th>
                    <th>{t('uxAudit.reason_category')} </th>
                    <th>{t('uxAudit.description')} </th>
                    <th style={{ textAlign: 'center' }}>{t('uxAudit.start')} </th>
                    <th style={{ textAlign: 'center' }}>{t('uxAudit.end_duration')} </th>
                    <th style={{ textAlign: 'center' }}>{t('uxAudit.edit_mode')} </th>
                  </tr>
                </thead>
                <tbody>
                  {supportLogs.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '24px', color: 'var(--color-text-muted)' }}>{t('uxAudit.no_remote_support_sessions_recorded')} </td>
                    </tr>
                  ) : (
                    supportLogs.map((s) => (
                      <tr key={s.id}>
                        <td style={{ fontWeight: 800 }}>{s.superAdminNombre}</td>
                        <td style={{ fontWeight: 700 }}>{s.tenantNombre}</td>
                        <td>
                          <span className="badge badge-dark" style={{ fontSize: '10px' }}>{s.categoria}</span>
                        </td>
                        <td style={{ fontSize: '12px', color: '#444' }}>{s.descripcion}</td>
                        <td style={{ textAlign: 'center', fontSize: '11px', fontFamily: 'monospace' }}>{s.fechaInicio}</td>
                        <td style={{ textAlign: 'center', fontSize: '11px', fontFamily: 'monospace' }}>
                          {s.fechaFin ? s.fechaFin : <span className="badge badge-warning" style={{ fontSize: '9px' }}>{t('uxAudit.in_progress')} </span>}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {s.modoEdicionActivado ? (
                            <span className="badge badge-danger" style={{ fontSize: '10px' }}>{t('uxAudit.enabled')} </span>
                          ) : (
                            <span className="badge badge-secondary" style={{ fontSize: '10px' }}>{t('uxAudit.read_only')} </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
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
                <h2 style={{ fontSize: '16px', textTransform: 'uppercase' }}>{t('uxAudit.global_module_and_service_catalog')} </h2>
                <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{t('uxAudit.technical_and_commercial_description_of_modules_available_on_the_saas_platform')} </p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px', marginTop: '20px' }}>
              {CATALOGO_MODULOS.map((mod) => (
                <div key={mod.key} className="industrial-card" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span className="badge badge-dark" style={{ fontSize: '10px' }}>{t('moduleCategories.' + mod.categoria)}</span>
                    {mod.isCore ? (
                      <span className="badge badge-warning" style={{ fontSize: '10px' }}>{t('uxAudit.core_essential')} </span>
                    ) : (
                      <span className="badge badge-success" style={{ fontSize: '10px' }}>{t('uxAudit.optional')} </span>
                    )}
                  </div>

                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '15px', color: 'var(--color-sidebar-bg)' }}>
                    {t(mod.labelKey)}
                  </div>

                  <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', flex: 1 }}>
                    {t('moduleDescriptions.' + mod.key)}
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
                <h2 style={{ fontSize: '16px', textTransform: 'uppercase' }}>{t('uxAudit.administrator_user_management_admin')} </h2>
                <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{t('uxAudit.central_management_of_each_customer_s_authorized_administrators_tenant_administrators_can_also_manage_administrators_within_their_own_tenant')} </p>
              </div>

              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setFormAdminNombre('');
                  setFormAdminEmail('');
                  setFormAdminPassword('');
                  setFormAdminTenantId(tenants[0]?.id || 't-1');
                  setFormAdminActivo(true);
                  setModalNuevoAdmin(true);
                }}
              >
                <Plus size={18} strokeWidth={2.5} />
                <span>{t('uxAudit.new_admin_user')} </span>
              </button>
            </div>

            <div className="table-container" style={{ marginTop: '20px' }}>
              <table className="industrial-table">
                <thead>
                  <tr>
                    <th>{t('uxAudit.administrator_name')} </th>
                    <th>{t('uxAudit.email_login')} </th>
                    <th>{t('uxAudit.company_tenant')} </th>
                    <th style={{ textAlign: 'center' }}>{t('uxAudit.created_on')} </th>
                    <th style={{ textAlign: 'center' }}>{t('uxAudit.status')} </th>
                    <th style={{ textAlign: 'center' }}>{t('uxAudit.super_admin_actions')} </th>
                  </tr>
                </thead>
                <tbody>
                  {adminUsers.filter(a => !a.rol || a.rol === 'ADMIN').map((a) => (
                    <tr key={a.id}>
                      <td style={{ fontFamily: 'var(--font-display)', fontWeight: 800 }}>{a.nombre}</td>
                      <td style={{ fontWeight: 600, color: 'var(--color-sidebar-bg)' }}>{a.email}</td>
                      <td>
                        <span className="badge badge-dark">{a.tenantNombre}</span>
                      </td>
                      <td style={{ textAlign: 'center', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                        {a.fechaCreacion}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {a.activo ? (
                          <span className="badge badge-success">{t('uxAudit.active')} </span>
                        ) : (
                          <span className="badge badge-danger">{t('uxAudit.suspended')} </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', gap: '6px' }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => abrirEditarAdmin(a)}
                          >
                            <Edit2 size={13} />{t('uxAudit.edit')} </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => setModalResetPassAdmin(a)}
                            title={t('uxAudit.reset_password')}
                          >
                            <KeyRound size={13} />{t('uxAudit.password')} </button>
                          <button
                            type="button"
                            className={`btn btn-sm ${a.activo ? 'btn-danger' : 'btn-primary'}`}
                            onClick={() => toggleEstadoAdmin(a.id)}
                          >
                            <Power size={13} />
                            {a.activo ? t('uxAudit.admin_message_19') : t('uxAudit.admin_message_20')}
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
                <h2 style={{ fontSize: '16px', textTransform: 'uppercase' }}>{t('uxAudit.critical_saas_action_audit_log')} </h2>
                <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{t('uxAudit.history_of_subscription_changes_module_activation_and_impersonations')} </p>
              </div>
            </div>

            <div className="table-container" style={{ marginTop: '20px' }}>
              <table className="industrial-table">
                <thead>
                  <tr>
                    <th>{t('uxAudit.date_time')} </th>
                    <th>{t('uxAudit.action')} </th>
                    <th>{t('uxAudit.customer_tenant')} </th>
                    <th>{t('uxAudit.operation_details')} </th>
                    <th style={{ textAlign: 'center' }}>{t('uxAudit.performed_by')} </th>
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
                  <h2 style={{ fontSize: '16px', textTransform: 'uppercase' }}>{t('uxAudit.manage_subscribed_services_and_modules')} </h2>
                  <div style={{ fontSize: '13px', color: '#EA580C', fontWeight: 800, marginTop: '2px' }}>{t('uxAudit.customer')} {modalModulosTenant.nombreComercial} ({modalModulosTenant.plan})
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
                <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{t('uxAudit.select_the_customer_s_enabled_modules_changes_apply_only_after_clicking')} <strong>{t('uxAudit.save_changes')} </strong>.
                </span>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    onClick={activarTodosModulos}
                    style={{ fontSize: '10px', fontWeight: 800 }}
                  >{t('uxAudit.enable_all')} </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    onClick={desactivarOpcionalesModulos}
                    style={{ fontSize: '10px', fontWeight: 800 }}
                  >{t('uxAudit.disable_optional_modules')} </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '12px' }}>
                {CATALOGO_MODULOS.map((m) => {
                  const isEnabled = !!m.isCore || tempModulosTenant.includes(m.key);

                  return (
                    <label
                      key={m.key}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '12px',
                        padding: '12px',
                        backgroundColor: isEnabled ? '#DCFCE7' : 'var(--color-bg)',
                        border: isEnabled ? '1.5px solid #16A34A' : '1.5px solid var(--color-sidebar-text)',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        transition: 'all 150ms ease',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isEnabled}
                        disabled={m.isCore || PENDING_MODULES.has(m.key)}
                        onChange={() => toggleTempModulo(m.key)}
                        style={{ marginTop: '3px', cursor: 'pointer', width: '16px', height: '16px' }}
                      />
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 800, fontSize: '13px', color: isEnabled ? '#15803D' : '#44403C' }}>
                            {t(m.labelKey)} {PENDING_MODULES.has(m.key) ? '· ' + t('pending.label') : m.isCore ? '· ' + t('uxAudit.core_essential') : ''}
                          </span>
                          <span className="badge badge-dark" style={{ fontSize: '9px' }}>{t('moduleCategories.' + m.categoria)}</span>
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>{t('moduleDescriptions.' + m.key)}</div>
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
              >{t('uxAudit.cancel')} </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={guardarModulosTenant}
              >
                <Check size={16} strokeWidth={2.6} />{t('uxAudit.save_service_changes')} </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: CONFIGURAR TIPO DE NAVEGACIÓN */}
      {modalNavegacionTenant && (
        <div style={styles.modalOverlay}>
          <div className="industrial-card" style={{ ...styles.modalContent, maxWidth: '480px' }}>
            <div style={styles.modalHeader}>
              <h2 style={{ fontSize: '16px', textTransform: 'uppercase' }}>{t('uxAudit.navigation_settings')} </h2>
              <div style={{ fontSize: '12px', color: '#EA580C', fontWeight: 800, marginTop: '2px' }}>{t('uxAudit.company')} {modalNavegacionTenant.nombreComercial}
              </div>
            </div>

            <div style={{ marginTop: '16px' }}>
              <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{t('uxAudit.select_the_menu_format_for_this_company_s_users')} </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '14px' }}>
                <button
                  type="button"
                  onClick={() => guardarNavegacionTenant(modalNavegacionTenant.id, 'SIDEBAR')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 18px',
                    backgroundColor: (modalNavegacionTenant.modoNavegacion || 'SIDEBAR') === 'SIDEBAR' ? 'var(--color-sidebar-bg)' : 'var(--color-bg)',
                    color: (modalNavegacionTenant.modoNavegacion || 'SIDEBAR') === 'SIDEBAR' ? '#FFFFFF' : 'var(--color-sidebar-bg)',
                    border: '2px solid var(--color-sidebar-bg)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-display)',
                    fontWeight: 800,
                  }}
                >
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: '13px' }}>{t('uxAudit.circle_side_menu_sidebar')} </div>
                    <div style={{ fontSize: '11px', opacity: 0.8, fontWeight: 400 }}>{t('uxAudit.traditional_left_side_panel')} </div>
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
                    backgroundColor: modalNavegacionTenant.modoNavegacion === 'TOPNAV' ? 'var(--color-sidebar-bg)' : 'var(--color-bg)',
                    color: modalNavegacionTenant.modoNavegacion === 'TOPNAV' ? '#FFFFFF' : 'var(--color-sidebar-bg)',
                    border: '2px solid var(--color-sidebar-bg)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-display)',
                    fontWeight: 800,
                  }}
                >
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: '13px' }}>{t('uxAudit.circle_top_menu_topnav')} </div>
                    <div style={{ fontSize: '11px', opacity: 0.8, fontWeight: 400 }}>{t('uxAudit.horizontal_top_navigation_bar')} </div>
                  </div>
                  {modalNavegacionTenant.modoNavegacion === 'TOPNAV' && <CheckCircle size={18} color="#EA580C" />}
                </button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setModalNavegacionTenant(null)}
                >{t('uxAudit.close')} </button>
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
              <h2 style={{ fontSize: '16px', textTransform: 'uppercase' }}>{t('uxAudit.configure_branding_and_company_details')} </h2>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (brandSaving) return;
                setBrandSaving(true); setErrorText(null); setMensajeExito(null);
                try {
                  const { data } = await api.patch(`/admin/tenants/${modalEditarTenant.id}`, {
                    nombreComercial: editNombreComercial.trim(), telefono: editTelefono,
                    plan: editPlan, colorPrimario: editColorPrimario,
                    logoUrl: editLogoUrl.trim() || null, modoNavegacion: editModoNavegacion,
                  });
                  setTenants(current => current.map(item => item.id === modalEditarTenant.id ? { ...item, ...data } : item));
                  setModalEditarTenant(null);
                  setMensajeExito(t('uxAudit.admin_message_15'));
                } catch (error: any) {
                  setErrorText(error.response?.data?.message || t('uxAudit.admin_message_16'));
                } finally { setBrandSaving(false); }
              }}
              style={{ marginTop: '16px' }}
            >
              {errorText && <p role="alert">{errorText}</p>}
              <div className="form-group">
                <label className="form-label">{t('uxAudit.business_name')} </label>
                <input
                  type="text"
                  required
                  value={editNombreComercial}
                  onChange={(e) => setEditNombreComercial(e.target.value)}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label">{t('uxAudit.custom_logo_url_company_image')} </label>
                <input
                  type="url"
                  placeholder="https://ejemplo.com/logo.png"
                  value={editLogoUrl}
                  onChange={(e) => setEditLogoUrl(e.target.value)}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label">{t('uxAudit.navigation_mode')} </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setEditModoNavegacion('SIDEBAR')}
                    style={{
                      padding: '8px',
                      fontWeight: 800,
                      fontSize: '11px',
                      backgroundColor: editModoNavegacion === 'SIDEBAR' ? 'var(--color-sidebar-bg)' : 'var(--color-bg)',
                      color: editModoNavegacion === 'SIDEBAR' ? 'var(--color-bg)' : 'var(--color-sidebar-bg)',
                      border: editModoNavegacion === 'SIDEBAR' ? '2px solid #EA580C' : '1px solid var(--color-sidebar-text)',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                  >{t('uxAudit.side_menu_sidebar')} </button>
                  <button
                    type="button"
                    onClick={() => setEditModoNavegacion('TOPNAV')}
                    style={{
                      padding: '8px',
                      fontWeight: 800,
                      fontSize: '11px',
                      backgroundColor: editModoNavegacion === 'TOPNAV' ? 'var(--color-sidebar-bg)' : 'var(--color-bg)',
                      color: editModoNavegacion === 'TOPNAV' ? 'var(--color-bg)' : 'var(--color-sidebar-bg)',
                      border: editModoNavegacion === 'TOPNAV' ? '2px solid #EA580C' : '1px solid var(--color-sidebar-text)',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                  >{t('uxAudit.top_menu_topnav')} </button>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">{t('uxAudit.contact_phone')} </label>
                  <input
                    type="text"
                    value={editTelefono}
                    onChange={(e) => setEditTelefono(e.target.value)}
                    className="form-input"
                  />
                </div>

                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">{t('uxAudit.subscription_plan')} </label>
                  <input
                    type="text"
                    value={editPlan}
                    onChange={(e) => setEditPlan(e.target.value)}
                    className="form-input"
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">{t('uxAudit.business_color_hex')} </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <input
                    type="color"
                    value={editColorPrimario}
                    onChange={(e) => setEditColorPrimario(e.target.value)}
                    style={{ width: '50px', height: '42px', cursor: 'pointer', border: '2px solid var(--color-text-main)' }}
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
                >{t('uxAudit.cancel')} </button>
                <button type="submit" disabled={adminSaving || brandSaving} className="btn btn-primary">
                  <Check size={16} strokeWidth={2.6} />{t('uxAudit.save_settings')} </button>
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
              <h2 style={{ fontSize: '16px', textTransform: 'uppercase' }}>{t('uxAudit.create_new_tenant_customer')} </h2>
            </div>

            <form onSubmit={handleCrearTenant} style={{ marginTop: '16px' }}>
              <div className="form-group">
                <label className="form-label">{t('uxAudit.company_name')} </label>
                <input
                  type="text"
                  required
                  placeholder={t('uxAudit.e_g_san_pedro_hardware_ltd')}
                  value={nombreComercial}
                  onChange={(e) => setNombreComercial(e.target.value)}
                  className="form-input"
                />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">{t('uxAudit.phone')} </label>
                  <input
                    type="text"
                    placeholder="+504 2550-0000"
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                    className="form-input"
                  />
                </div>

                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">{t('uxAudit.brand_color')} </label>
                  <input
                    type="color"
                    value={colorPrimario}
                    onChange={(e) => setColorPrimario(e.target.value)}
                    style={{ width: '100%', height: '42px', cursor: 'pointer', border: '2px solid var(--color-text-main)' }}
                  />
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--color-sidebar-text)', margin: '14px 0 12px', paddingTop: '10px' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', marginBottom: '8px' }}>{t('uxAudit.initial_business_administrator')} </div>

                <div className="form-group">
                  <label className="form-label">{t('uxAudit.owner_manager_name')} </label>
                  <input
                    type="text"
                    required
                    placeholder={t('uxAudit.e_g_mario_rivera')}
                    value={adminNombre}
                    onChange={(e) => setAdminNombre(e.target.value)}
                    className="form-input"
                  />
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">{t('uxAudit.login_email')} </label>
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
                    <label className="form-label">{t('uxAudit.temporary_password')} </label>
                    <input
                      type="password"
                      required
                      minLength={8}
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
                >{t('uxAudit.cancel')} </button>
                <button type="submit" disabled={creatingTenant} className="btn btn-primary">
                  <CheckCircle size={16} strokeWidth={2.6} /> {creatingTenant ? t('uxAudit.admin_message_21') : t('uxAudit.admin_message_22')}
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
                <h2 style={{ fontSize: '16px', textTransform: 'uppercase' }}>{t('uxAudit.remote_support_select_user_to_impersonate')} </h2>
                <div style={{ fontSize: '12px', color: '#EA580C', fontWeight: 700 }}>{t('uxAudit.customer')} {modalSuplantarUser.nombreComercial}
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
                <label className="form-label">{t('uxAudit.find_user_by_name_or_email')} </label>
                <div style={{ position: 'relative' }}>
                  <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                  <input
                    type="text"
                    placeholder={t('uxAudit.e_g_carlos_ramos_cashier_admin')}
                    value={busquedaSuplantar}
                    onChange={(e) => setBusquedaSuplantar(e.target.value)}
                    className="form-input"
                    style={{ paddingLeft: '36px' }}
                  />
                </div>
              </div>

              <div style={{ maxHeight: '280px', overflowY: 'auto', border: '1.5px solid var(--color-sidebar-text)', borderRadius: '4px', marginTop: '12px' }}>
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
                        backgroundColor: 'var(--color-bg)',
                      }}
                    >
                      <div>
                        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '13px' }}>
                          {u.nombre}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                          {u.email} • <span style={{ fontWeight: 600 }}>{u.cargo}</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => abrirFormularioMotivoSuplantar(u)}
                        className="btn btn-sm btn-primary"
                        style={{ backgroundColor: '#EA580C', borderColor: '#C2410C', fontWeight: 800, padding: '6px 12px' }}
                      >
                        <ExternalLink size={13} />{t('uxAudit.impersonate_user')} </button>
                    </div>
                  ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setModalSuplantarUser(null)}
                >{t('uxAudit.cancel')} </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6.1: MOTIVO OBLIGATORIO DE IMPERSONACIÓN */}
      {usuarioASuplantar && modalSuplantarUser && (
        <div style={styles.modalOverlay}>
          <div className="industrial-card" style={{ ...styles.modalContent, maxWidth: '500px' }}>
            <div style={styles.modalHeader}>
              <h2 style={{ fontSize: '16px', textTransform: 'uppercase' }}>{t('uxAudit.required_reason_for_support_access')} </h2>
              <div style={{ fontSize: '12px', color: '#EA580C', fontWeight: 800, marginTop: '2px' }}>{t('uxAudit.entering_as')} {usuarioASuplantar.nombre} ({modalSuplantarUser.nombreComercial})
              </div>
            </div>

            <form onSubmit={ejecutarSuplantacionConMotivo} style={{ marginTop: '16px' }}>
              <div className="form-group">
                <label className="form-label">{t('uxAudit.reason_category')} </label>
                <select
                  value={soporteCategoria}
                  onChange={(e) => setSoporteCategoria(e.target.value as any)}
                  className="form-select"
                  required
                >
                  <option value="Reporte de error">{t('uxAudit.bug_report')} </option>
                  <option value="Solicitud del cliente">{t('uxAudit.customer_request')} </option>
                  <option value="Verificación de pago">{t('uxAudit.payment_verification')} </option>
                  <option value="Otro">{t('uxAudit.other')} </option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">{t('uxAudit.brief_description_required')} </label>
                <textarea
                  required
                  rows={3}
                  placeholder={t('uxAudit.describe_the_request_or_reason_for_support')}
                  value={soporteDescripcion}
                  onChange={(e) => setSoporteDescripcion(e.target.value)}
                  className="form-input"
                  style={{ resize: 'vertical' }}
                />
              </div>

              <div style={{ padding: '10px 12px', backgroundColor: '#FEF3C7', borderRadius: '4px', fontSize: '11px', color: '#B45309', fontWeight: 600 }}>{t('uxAudit.the_session_starts_automatically_in')} <strong>{t('uxAudit.read_only_mode')} </strong>{t('uxAudit.for_security')} </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setUsuarioASuplantar(null)}
                >{t('uxAudit.cancel')} </button>
                <button
                  type="submit"
                  disabled={soporteDescripcion.trim().length < 10}
                  className="btn btn-primary"
                  style={{ backgroundColor: '#EA580C', borderColor: '#C2410C', fontWeight: 800 }}
                >{t('uxAudit.start_remote_support')} </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 7: NUEVO USUARIO ADMIN */}
      {modalNuevoAdmin && (
        <div style={styles.modalOverlay}>
          <div className="industrial-card" style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <h2 style={{ fontSize: '16px', textTransform: 'uppercase' }}>{t('uxAudit.new_administrator_user')} </h2>
            </div>

            <form onSubmit={handleCrearAdmin} aria-busy={adminSaving} style={{ marginTop: '16px' }}>
              {errorText && <p role="alert">{errorText}</p>}
              <div className="form-group">
                <label className="form-label">{t('uxAudit.company_tenant')} </label>
                <select
                  disabled={!!modalEditarAdmin} value={formAdminTenantId}
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
                  <label className="form-label">{t('uxAudit.admin_name')} </label>
                  <input
                    type="text"
                    required
                    placeholder={t('uxAudit.e_g_roberto_flores')}
                    value={formAdminNombre}
                    onChange={(e) => setFormAdminNombre(e.target.value)}
                    className="form-input"
                  />
                </div>

                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">{t('uxAudit.login_email')} </label>
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
                <label className="form-label">{t('uxAudit.temporary_password')} </label>
                <input
                  type="text"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="Mínimo 8 caracteres, letras y números"
                  value={formAdminPassword}
                  onChange={(e) => setFormAdminPassword(e.target.value)}
                  className="form-input"
                />
                <button type="button" className="btn btn-secondary" style={{ marginTop: 6 }} onClick={() => setFormAdminPassword(generatePassword())}>Generar contraseña segura</button>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setModalNuevoAdmin(false)}
                >{t('uxAudit.cancel')} </button>
                <button type="submit" className="btn btn-primary">
                  <Check size={16} strokeWidth={2.6} />{t('uxAudit.register_admin')} </button>
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
              <h2 style={{ fontSize: '16px', textTransform: 'uppercase' }}>{t('uxAudit.edit_administrator_user')} </h2>
            </div>

            <form onSubmit={handleGuardarEdicionAdmin} aria-busy={adminSaving} style={{ marginTop: '16px' }}>
              {errorText && <p role="alert">{errorText}</p>}
              <div className="form-group">
                <label className="form-label">{t('uxAudit.company_tenant')} </label>
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
                  <label className="form-label">{t('uxAudit.full_name')} </label>
                  <input
                    type="text"
                    required
                    value={formAdminNombre}
                    onChange={(e) => setFormAdminNombre(e.target.value)}
                    className="form-input"
                  />
                </div>

                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">{t('uxAudit.email')} </label>
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
                <label className="form-label">{t('uxAudit.user_status')} </label>
                <div style={{ display: 'flex', gap: '16px', marginTop: '6px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600 }}>
                    <input
                      type="radio"
                      name="adminActivo"
                      checked={formAdminActivo === true}
                      onChange={() => setFormAdminActivo(true)}
                    />{t('uxAudit.active')} </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: '#DC2626' }}>
                    <input
                      type="radio"
                      name="adminActivo"
                      checked={formAdminActivo === false}
                      onChange={() => setFormAdminActivo(false)}
                    />{t('uxAudit.inactive_suspended')} </label>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setModalEditarAdmin(null)}
                >{t('uxAudit.cancel')} </button>
                <button type="submit" className="btn btn-primary">
                  <Check size={16} strokeWidth={2.6} />{t('uxAudit.save_changes')} </button>
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
              <h2 style={{ fontSize: '16px', textTransform: 'uppercase' }}>{t('uxAudit.reset_admin_password')} </h2>
            </div>

            <form onSubmit={handleResetPassword} aria-busy={adminSaving} style={{ marginTop: '16px' }}>
              {errorText && <p role="alert">{errorText}</p>}
              <p style={{ fontSize: '13px', color: '#444' }}>{t('uxAudit.change_password_for')} <strong>{modalResetPassAdmin.nombre}</strong> (<code>{modalResetPassAdmin.email}</code>).
              </p>

              <div className="form-group" style={{ marginTop: '12px' }}>
                <label className="form-label">{t('uxAudit.new_temporary_password')} </label>
                <input
                  type="password"
                  required
                  placeholder={t('uxAudit.at_least_8_characters')}
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
                >{t('uxAudit.cancel')} </button>
                <button type="submit" className="btn btn-primary">
                  <KeyRound size={16} strokeWidth={2.6} />{t('uxAudit.reset_password')} </button>
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
    color: 'var(--color-text-muted)',
  },
  tabsContainer: {
    display: 'flex',
    gap: '10px',
    marginBottom: '24px',
    borderBottom: '2px solid var(--color-text-main)',
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
    color: 'var(--color-text-muted)',
    backgroundColor: 'var(--color-bg)',
    border: '2px solid var(--color-sidebar-text)',
    borderRadius: 'var(--radius-xs)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'all 150ms ease',
  },
  tabBtnActive: {
    backgroundColor: 'var(--color-sidebar-bg)',
    color: 'var(--color-bg)',
    borderColor: 'var(--color-sidebar-bg)',
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
