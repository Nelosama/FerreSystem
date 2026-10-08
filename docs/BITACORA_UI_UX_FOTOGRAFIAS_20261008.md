# Bitácora de decisiones — UI/UX y fotografías locales
Fecha: 2026-10-08
Estado: requisitos y propuestas aprobadas conceptualmente; **NO implementados ni validados en producción**.

## 1. Objetivo rector de UX
- FerreSystem debe ser extremadamente fácil de aprender, incluso para una persona sin experiencia (la referencia «hasta un niño pueda usarlo» describe simplicidad, NO una interfaz infantil ni permisos para menores).
- Priorizar claridad, pocas acciones visibles, lenguaje directo, consistencia, prevención de errores, accesibilidad, rapidez y navegación por rol.
- Mantener alternativas SIDEBAR y TOPNAV en escritorio, con experiencia responsive móvil.
- No aceptar rediseños por estética solamente: medir pasos, tiempo, errores y facilidad de aprendizaje.

## 2. Evaluación de propuestas de Lovable (mockups, no código)
- A, minimalista empresarial: buena organización y separación catálogo/carrito.
- B, moderna: identidad naranja, contraste y acciones destacadas; exceso de superficie destinada a fotos.
- C, POS optimizada: mejor para escáner, teclado, cantidades y cobro en escritorio.
- Decisión: explorar diseño híbrido A (estructura) + B (identidad y componentes) + C (eficiencia operativa), no copiar directamente ningún mockup.
- Problemas detectados en las imágenes: totales de ejemplo inconsistentes; flujos de cobro incompletos; ausencia de diferenciación suficiente por rol; identidad visual inconsistente; dependencia excesiva de fotos.
- Unificar design system (paleta, tipografía, iconos, formularios, tablas, estados vacíos/error/carga, botones) y probar accesibilidad WCAG 2.2 AA.
- Lovable ya no está disponible; estas propuestas quedan como referencia para futuras tareas de Codex/Jules.

## 3. Prioridad por dispositivo y rol
- **Escritorio:** operación diaria y POS principal; rapidez con lector de códigos, teclado, mouse y pantalla táctil.
- **Móvil ADMIN:** principalmente información, supervisión y gestión; NO iniciar destacando «Nueva venta». Dashboard con ventas del día, transacciones, stock bajo, facturas de proveedor por vencer y pendientes; sin saturación.
- Navegación móvil ADMIN propuesta: Inicio / Inventario / Ventas (consulta) / Reportes / Más.
- Venta móvil: disponible como función secundaria o de emergencia para ADMIN, por ejemplo Más > Nueva venta; para rol CAJERO, navegación según su tarea y permisos.
- Acciones administrativas móviles: consultar inventario, levantamiento y conteo, escanear códigos, tomar fotos, consultar clientes, compras, proveedores, reportes, cierres y auditoría según permisos.
- Mantener separación de roles ADMIN, CAJERO y SUPER ADMIN; el diseño no concede permisos nuevos.

## 4. Fotografías de productos: decisión de almacenamiento
- Se permiten fotografías **opcionales**, tanto en web de escritorio como en móvil (especialmente iPhone/Safari).
- Guardar archivos de imágenes **exclusivamente en la computadora principal Windows de la ferretería**.
- Consultar imágenes **solo dentro de la red local autorizada**. Sin acceso remoto a imágenes, sin túneles públicos, sin publicar puertos.
- Supabase: **sin imágenes, miniaturas, base64 ni binarios**; solo metadatos/referencias lógicas cuando aplique. No guardar rutas absolutas de Windows ni IP local en registros de productos.
- Nota arquitectónica: el repositorio contiene también planes de PostgreSQL local como fuente operativa. **Verificar el despliegue y la arquitectura vigente antes de implementar**; no asumir que Vercel/Render/Supabase sean la única topología futura.
- Fotografías compartidas por ficha de producto, catálogo, inventario y POS; no duplicar sistemas de imágenes.
- Si la PC local no responde, las ventas, conteos y consultas deben continuar sin fotografía mientras los servicios de datos necesarios estén disponibles.
- Respaldar fotos en disco externo/NAS independiente; Supabase NO es respaldo de fotos.

## 5. Levantamiento de inventario: UX requerido
- Integrar «Tomar foto» y «Elegir foto/archivo» en el mismo flujo de escanear/identificar producto, contar, guardar y continuar.
- En iPhone abrir cámara o fototeca; en escritorio usar webcam si existe o selector de archivo.
- La foto es opcional y nunca debe bloquear el conteo.
- Mostrar foto existente, permitir reemplazarla con autorización; comenzar con una foto principal por producto, extensible.
- Confirmar persistencia local antes de mostrar «guardada». Si el servidor local no está accesible, permitir seguir sin foto e indicar estado pendiente; no prometer retención permanente del archivo en navegador.
- Evitar fotos duplicadas y conservar asociación tenant/producto.
- Optimizar miniaturas y no depender de que todos los productos tengan fotos.

## 6. Servicio local de imágenes: diseño propuesto, sujeto a validación
- Servicio independiente Windows (p. ej. Node.js/Fastify o NestJS) con inicio automático, almacenamiento aislado por tenant/producto y generación de miniaturas WebP.
- HTTPS con certificado confiable, nombre DNS controlado y resolución LAN; evaluar DNS-01 para certificado sin exponer servicio a Internet.
- Firewall LAN, sin puertos abiertos al exterior; autenticación de usuario y autorización por tenant, rol y producto, tokens específicos de corta duración y validación criptográfica.
- CORS restrictivo, límites de tamaño y solicitudes, validación real del contenido, eliminación de metadatos, prevención de path traversal.
- **Bloqueador técnico por validar:** compatibilidad real entre frontend HTTPS alojado en Vercel y servicio HTTPS LAN en Safari iOS/Chrome Windows, incluyendo políticas de acceso a redes privadas. No asumir que CORS+HTTPS bastan. Considerar origen local seguro para frontend si falla.
- Nunca colocar secretos en VITE_* ni tokens permanentes en URL.

## 7. Pruebas y criterios de aceptación
- Windows Chrome e iPhone Safari en Wi-Fi LAN: tomar, elegir, ver, reemplazar fotos según permisos.
- iPhone en datos móviles: NO debe acceder a fotografías.
- PC principal apagada: imágenes ausentes pero flujo operativo sin bloqueos indebidos.
- Permisos cruzados: impedir lectura/escritura entre tenants; CAJERO no administra fotografías si no tiene autorización.
- Fotos inexistentes/corruptas: placeholder y recuperación sin error fatal.
- Reconexión, reinicio, restauración de copia externa, manejo de fotos pendientes y consistencia de referencias.
- POS: verificar matemáticas, impuestos, pagos, crédito, ventas bajo pedido y casos de concurrencia; mockups no son evidencia funcional.

## 8. Orden de ejecución recomendado
1. Terminar estabilización actual de inventario y POS por Codex; no mezclar cambios visuales con correcciones en curso.
2. Auditoría UX independiente con Jules u otro agente; contrastar propuestas con flujos reales.
3. Validar conectividad HTTPS LAN y Safari/Chrome mediante prueba técnica mínima.
4. Implementar servicio Windows y respaldo de fotografías con permisos por tenant.
5. Integrar fotos opcionales en levantamiento, ficha de producto y POS en escritorio y móvil.
6. Implementar rediseño híbrido aprobado, por fases y con QA por rol/dispositivo.

## 9. Estado y límites
- **Decisiones de producto:** definidas en conversación; pendientes de desarrollo.
- **Mockups Lovable:** referencias visuales, no pruebas de funcionamiento.
- **Repositorio:** esta bitácora documenta decisiones; no cambia frontend, backend, Prisma ni infraestructura.
- **Pendientes:** confirmar arquitectura operativa final (nube/local), certificados/DNS LAN, experiencia de cámara iPhone, autorización, backups y aprobación de mockups finales.
