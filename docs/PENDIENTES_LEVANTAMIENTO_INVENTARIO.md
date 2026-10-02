# Pendientes — Levantamiento de Inventario

## Objetivo

Convertir el módulo de levantamiento de inventario en una herramienta práctica para digitalizar desde cero el inventario físico de una ferretería, incluyendo trabajo colaborativo, operación sin conexión y aplicación controlada al inventario real.

## 1. Aplicar levantamiento al inventario real

### Estado actual
Al finalizar un levantamiento, el sistema cambia su estado a `FINALIZADO`, pero no convierte automáticamente los registros capturados en productos ni actualiza las existencias del inventario.

### Pendiente
Implementar un flujo separado y explícito:

**Levantamiento → Revisión → Conciliación → Aplicar al inventario**

- Agregar una acción independiente: **Aplicar al inventario**.
- No modificar existencias reales únicamente por marcar un levantamiento como `FINALIZADO`.
- Mostrar una vista previa antes de aplicar cambios.
- Si el producto ya existe, permitir conciliar/actualizar su existencia.
- Si no existe, permitir crear el producto completando los datos faltantes.
- Identificar registros incompletos o con conflictos antes de aplicar.
- Ejecutar la aplicación al inventario de forma transaccional para evitar cargas parciales.
- Registrar quién aplicó el levantamiento y cuándo.

## 2. Levantamiento multiusuario simultáneo

Permitir que varias personas trabajen sobre un mismo levantamiento desde diferentes dispositivos.

### Requisitos
- Registrar el usuario que capturó o modificó cada artículo.
- Registrar fecha/hora de captura y última modificación.
- Permitir organizar el levantamiento por zonas, pasillos, bodegas o secciones.
- Detectar registros potencialmente duplicados.
- Evitar que dos usuarios sobrescriban silenciosamente el trabajo del otro.
- Cuando dos personas registren el mismo producto, enviarlo a conciliación.
- Permitir decidir durante la conciliación si corresponde sumar cantidades, sustituir un conteo, mantener registros separados o corregirlos.
- Diseñar el backend considerando concurrencia real.

## 3. Modo offline y sincronización

El levantamiento debe continuar funcionando si se pierde temporalmente la conexión a Internet.

### Requisitos
- Guardar localmente los registros pendientes, preferiblemente usando IndexedDB.
- Permitir crear y editar conteos mientras el dispositivo está offline.
- Mostrar claramente el estado **Online / Offline**.
- Mostrar cuántos registros están pendientes de sincronización.
- Sincronizar automáticamente cuando vuelva la conexión.
- Permitir reintentar manualmente una sincronización fallida.
- Usar identificadores/idempotencia para evitar duplicados al reintentar.
- Detectar conflictos producidos por otros usuarios mientras un dispositivo estuvo offline.
- No sobrescribir automáticamente información del servidor ante un conflicto.
- Evaluar PWA/service worker para mejorar el uso desde teléfonos.

## 4. Conciliación

Crear una etapa de revisión antes de afectar el inventario definitivo.

Debe permitir identificar:
- Productos nuevos.
- Productos ya existentes.
- Posibles duplicados.
- Conteos realizados por diferentes usuarios.
- Conflictos de cantidades.
- Registros incompletos.
- Registros pendientes de sincronización.

Ningún levantamiento con conflictos críticos o registros pendientes de sincronización debería poder aplicarse al inventario sin resolverlos.

## Criterios de seguridad funcional

- `FINALIZADO` no significa `APLICADO AL INVENTARIO`.
- El levantamiento debe conservar trazabilidad.
- La sincronización offline debe ser idempotente.
- Las operaciones concurrentes no deben causar pérdida silenciosa de datos.
- Aplicar al inventario debe ser una operación explícita, autorizada y transaccional.

## Contexto

Este trabajo está pensado especialmente para el caso de una ferretería que ya opera físicamente pero todavía no posee un inventario digital confiable. El objetivo es permitir que varias personas hagan el conteo físico desde celulares, incluso con conectividad intermitente, y posteriormente convertir ese levantamiento revisado en el inventario inicial real de FerreSystem.


## 5. Captura práctica desde celular

### Código de barras y QR
- Permitir escanear códigos de barras usando la cámara del teléfono.
- Evaluar lectura de QR cuando aplique al tipo de producto o etiquetado utilizado.
- Si el código corresponde a un producto existente, recuperarlo inmediatamente para registrar el conteo.
- Si el código no existe, permitir iniciar el alta del producto desde el levantamiento.
- Mantener captura manual como alternativa cuando la cámara o el código no estén disponibles.

### Fotografías
- Permitir tomar una foto del producto durante el levantamiento.
- Usarla como referencia cuando el producto todavía no pueda identificarse completamente.
- Permitir dejar el registro pendiente de completar durante la etapa de revisión.

### Productos sin código
- No exigir código de barras o QR para poder contar un producto.
- Soportar artículos vendidos o almacenados sin etiquetado individual.

## 6. Unidades, presentaciones y cantidades fraccionarias

El levantamiento debe adaptarse a productos típicos de ferretería.

- Soportar unidad, caja, paquete, metro, pie, libra, galón y otras unidades configurables.
- Permitir cantidades decimales cuando corresponda.
- Contemplar que un mismo artículo pueda manejar presentaciones distintas.
- Evitar conversiones automáticas ambiguas; cualquier equivalencia entre presentaciones debe estar configurada explícitamente.

## 7. Zonas y progreso del levantamiento

- Permitir dividir la tienda en zonas, pasillos, bodegas o secciones.
- Asignar zonas a usuarios cuando sea útil.
- Mostrar qué zonas están pendientes, en proceso y terminadas.
- Mostrar avance general del levantamiento.
- Mostrar avance por usuario o zona sin utilizarlo para sobrescribir conteos de otros participantes.

## 8. Auditoría y trazabilidad

Conservar evidencia completa del proceso.

- Registrar quién creó cada conteo.
- Registrar quién lo modificó y cuándo.
- Registrar valor anterior y valor nuevo en correcciones relevantes.
- Registrar quién resolvió un conflicto.
- Registrar quién aprobó y aplicó el levantamiento al inventario.
- Conservar el levantamiento original aun después de aplicarlo.

## 9. Reconteo y validación

- Permitir marcar artículos para un segundo conteo.
- Permitir solicitar reconteo cuando exista una diferencia o cantidad sospechosa.
- Conservar tanto el conteo original como el reconteo para auditoría.
- Resolver la cantidad definitiva durante la conciliación; no reemplazar silenciosamente el primer conteo.

## 10. Orden sugerido de implementación

Para reducir riesgo, implementar y probar por etapas:

1. Aplicación controlada del levantamiento al inventario.
2. Multiusuario, zonas, concurrencia y conciliación.
3. Modo offline, cola local e idempotencia de sincronización.
4. Código de barras/QR y captura con cámara.
5. Fotografías y registros pendientes de identificación.
6. Progreso, reconteo y mejoras adicionales de auditoría.

Antes de implementar cada etapa, revisar la arquitectura existente y reutilizar modelos, servicios y mecanismos de auditoría que ya existan en FerreSystem. Evitar duplicar funcionalidades o introducir cambios destructivos innecesarios.
