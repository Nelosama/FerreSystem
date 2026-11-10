# Constitución de Jowa System

**Ámbito:** SaaS multiempresa FerreSystem/Jowa System: frontend React/TypeScript, backend NestJS, Prisma y PostgreSQL, con módulos web/PWA.

## Principios

### I. Aislamiento por empresa
Toda lectura, escritura, búsqueda, exportación y operación en segundo plano debe quedar limitada a la empresa autenticada. El servidor deriva y valida el tenant desde la sesión; nunca confía en un tenant enviado únicamente por el cliente. Las consultas y relaciones deben conservar el tenant en sus filtros y restricciones.

### II. Autorización mínima y auditable
La autorización se aplica en el servidor según rol, empresa y permiso vigente. Ocultar una ruta o un botón no sustituye la autorización del backend. Operaciones sensibles identifican actor, empresa, objeto, resultado y motivo cuando corresponda. No se permiten elevaciones de rol por el propio usuario.

### III. Integridad comercial y financiera
Ventas, cobros, impuestos, descuentos, caja e inventario deben usar reglas compartidas y explícitas, validar límites y evitar cálculos monetarios imprecisos. Una confirmación al usuario solo ocurre después de persistir la operación. Los reintentos deben ser idempotentes; una respuesta ambigua no autoriza duplicar ni descartar una operación. Los registros confirmados no se reescriben silenciosamente.

### IV. Contingencia offline cerrada por defecto
La contingencia offline permanece desactivada hasta cumplir sus controles de aislamiento, retención, recuperación, pruebas en dispositivos reales y aceptación operativa. Los datos pendientes, en envío, en revisión o con evidencia incompleta se conservan. Solo se purgan datos locales sincronizados tras evidencia fresca e íntegra del servidor, dentro de una transacción local atómica. Un error de red nunca se interpreta como confirmación ni como autorización para borrar. La retención local no elimina registros del servidor.

### V. Privacidad y secretos
Se recopilan y conservan solo los datos necesarios. Los logs y resúmenes de auditoría excluyen contraseñas, tokens y datos personales innecesarios. Secretos y credenciales se mantienen fuera del repositorio, de pruebas compartidas y de artefactos públicos.

### VI. Cambios de base de datos controlados
Todo cambio de Prisma, SQL o migraciones requiere revisión de NEXUS, migración versionada, compatibilidad y pruebas de integridad en una base efímera. No se ejecutan resets, escrituras de prueba ni cambios de esquema en bases reales como parte de una revisión o CI. No se eliminan datos o columnas sin autorización explícita y plan de recuperación.

### VII. Módulos y reglas de negocio explícitos
Las funciones opcionales se habilitan mediante controles de módulo en servidor y cliente, con valor seguro apagado por defecto cuando no estén listas o aprobadas. Las tasas fiscales y políticas comerciales no se inventan ni se infieren del código: deben corresponder a una decisión documentada y validada por el responsable del negocio/contador.

### VIII. Mantenibilidad y compatibilidad
Los cambios deben ser acotados, documentados y compatibles con sesiones, empresas y datos existentes. Se reutilizan contratos y utilidades del proyecto antes de crear variantes. Las nuevas herramientas de desarrollo no deben ejecutar cambios de producto, publicar datos ni desplegar por sí mismas.

## Revisión e integración

- Cada PR describe alcance, riesgos, migraciones y evidencia real. La revisión comprueba aislamiento multiempresa, autorización, privacidad y compatibilidad donde aplique.
- Antes de integrar, se revisa el SHA actual, se confirma base sin conflictos y se exigen los workflows aplicables en verde para ese mismo SHA. Resultados de otro SHA no cuentan.
- Las pruebas usan datos sintéticos y servicios efímeros. La integración en `main`, el despliegue, la activación de funciones y la aceptación del cliente son decisiones distintas.
- No se despliega, activa una bandera productiva ni modifica una base real sin autorización específica y verificación operativa separada.

## Gobierno

Esta constitución guía el diseño y la revisión de Jowa System. Si una regla contradice una instrucción vigente del propietario, una obligación legal o un contrato de datos, se documenta el conflicto y se detiene el cambio afectado hasta resolverlo. Las enmiendas requieren motivo, alcance y aprobación del propietario; las decisiones fiscales requieren además validación del responsable fiscal.

**Versión:** 1.0.0 propuesta  
**Ratificación del propietario:** pendiente
