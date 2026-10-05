# Revisión preparada para mañana

Rama `codex/recuperacion-ventas`, PR #59. Esta lista reemplaza la interpretación de que gestión de roles seguía por implementar; los documentos iniciales mantienen el contexto histórico.

| Prioridad | Trabajo | Estado |
|---|---|---|
| P0 | Borradores de venta y recuperación sin duplicar cobro | Implementado y probado; falta prueba física de energía/equipo |
| P0 | Roles, permisos, último ADMIN y dos administradores | Implementado; sesión/menús se sincronizan mientras la ventana está visible |
| P0 | Devoluciones totales/parciales autorizadas, caja, crédito y auditoría | Implementado y probado; falta aceptación del negocio |
| P0 | Migraciones iniciales, adopción histórica y respaldo/restauración | Ensayo aislado aprobado; bloqueada la prueba con copia real por falta de acceso/respaldo |
| P0 | Instalación local, HTTPS, persistencia y arranque de servicios | Ensayo Docker aprobado, incluso sin salida a Internet y tras reinicio abrupto de procesos; faltan equipos/corte físicos |
| P0 | Respaldo automático y estado visible para ADMIN | Programador cada seis horas y panel de estado; falta copia externa/retención y restauraciones periódicas |
| P0 | Importación y dependencias | CSV limitado a 5 MB/5000 filas; retirada lectura Excel vulnerable |
| P0 | Archivos de entorno versionados | Retirados del seguimiento sin leer valores; el historial aún los contiene, revisar/rotar credenciales reales si las hubo |
| P0 | Uso sencillo y piloto | Inicio por tareas/buscador y mensajes de estado implementados; falta observación de cajero/admin y lector/impresora |
| P1 | App instalada y push (requisito del cliente) | Pendiente; web/manifiesto no lo completan. Propuesta en APP_MOVIL_Y_NOTIFICACIONES.md; confirmar plataforma/distribución, sesión móvil y canal push |
| P1 | Autorización fuera del local | Flujo backend real listo; requiere VPN/puente remoto y configuración de red |
| P1 | Garantías y política comercial | Falta vigencia/reglas/responsables y requisitos fiscales del cliente |
| P1 | Fotografías | URL de imagen existente; no captura/subida/almacenamiento durable implementados |
| P2 | Sucursales | Propuesta empresa/sucursal/outbox documentada; selector ficticio retirado; sincronización no implementada |
| P2 | Reportes/entregas adicionales | Núcleo actual operativo; zona horaria, filtros/exportaciones y entregas parciales requieren revisar alcance |
| P2 | Limpieza de artefactos | node_modules y dist retirados de Git; CI/instalación generan dependencias y bundles |
| P3 | Bancos, módulos pendientes y ampliaciones | No implementados; alcance/reglas/proveedores aún por definir |

## Cambios a revisar

- `INSTALACION_LOCAL_Y_CONTINUIDAD.md`: servidor en PC existente, LAN, HTTPS, alta inicial sin demo, respaldos y recuperación.
- `VALIDACION_INTEGRACION_Y_SESIONES.md`: evidencia del ensayo aislado y procedimiento sobre copia real.
- `AVANCE_DEVOLUCIONES_AUTORIZADAS.md`: solicitud, decisión, ejecución y auditoría.
- `SUCURSALES_Y_ACCESO_REMOTO_PROPUESTA.md`: propuesta para expansión sin sustituir el aislamiento de empresa.
- `AUDITORIA_RAMA_20261005.md`: fallos confirmados, correcciones y límites de la revisión.
- `APP_MOVIL_Y_NOTIFICACIONES.md`: app instalada con avisos independientes del navegador, sesión propia, cola de eventos y base operativa local.
- Commit separado de limpieza: elimina artefactos/entornos del seguimiento, conserva las copias locales y no elimina su historial. La cantidad grande de archivos eliminados corresponde a dependencias/bundles, no a módulos de negocio.

## Para cerrar los pendientes externos

Copia reciente de la base y conexiones aisladas; sistema operativo/recursos de las PCs; router/DNS y UPS; lector/impresora; política de respaldo externo/retención; teléfono Android/iOS y acceso remoto; prueba con el cajero y ambos administradores; reglas fiscales, garantías y segunda sucursal.

No se instaló en la ferretería ni se fusionó a main. No se cambiaron datos productivos ni se activaron pagos/servicios remotos. Estas dependencias no se consideran cerradas por compilar o pasar pruebas.

## Pruebas de código de esta etapa

58 pruebas frontend, 88 backend, 55 PostgreSQL real aislado y 7 scripts aprobadas (208) tras la auditoría. Builds de producción con `/api`, backend e imágenes Docker aprobados. Login ADMIN/cajero, recuperación de venta, devolución autorizada/reintento, respaldo y restauración aprobados en el ensayo; HTTPS e inicio sin salida a Internet comprobados. Auditoría npm de dependencias productivas: cero vulnerabilidades conocidas reportadas en ambos paquetes después de retirar XLSX; no es una certificación de seguridad de la instalación del cliente.
