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
