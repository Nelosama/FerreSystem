# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Cajeros y vendedores que atienden en mostrador: venta, cotizaciones y cobro con impresión de comprobante (A4, 80 mm o 58 mm).
Administradores de cada negocio: configuración, precios, usuarios y permisos, revisión de operaciones de contingencia, y pendientes del día.

Super Admin y bodegueros existen en el sistema, pero no fueron confirmados como audiencia de este diseño en esta ronda.

## Product Purpose
Jowa System gestiona la operación diaria de una ferretería (negocio multi-tenant): ventas, cotizaciones, caja, inventario, entregas y comprobantes. Debe seguir funcionando cuando se pierde la conexión (contingencia con sincronización posterior).

Éxito, por ahora: que el personal de mostrador venda y cobre sin fricción, y que el administrador vea de un vistazo lo pendiente de hoy.

## Positioning
Undecided: el diferencial frente a otros sistemas de punto de venta no fue confirmado.

## Operating Context
- Uso en navegador, instalable como PWA, en computadora de mostrador, tableta y teléfono.
- Impresoras térmicas y A4 configuradas por el negocio; el formato de impresión lo define el negocio, no el equipo.
- Cámara del dispositivo para escaneo de códigos (levantamiento) en iPhone/Safari.
- Operación en un contexto de conexión inestable (ventas sin conexión en revisión).

## Capabilities and Constraints
- Módulos por negocio: POS, cotizaciones, inventario, entregas, caja, administración, configuración del negocio.
- Navegación configurable por negocio: SIDEBAR o TOPNAV.
- Idioma: español y inglés (textos de interfaz en ES/EN).
- Permisos por rol (ADMIN, BODEGUERO, VENDEDOR, CAJERO, Super Admin) y por módulo habilitado.
- Sin validación física pendiente: Safari/iPhone/PWA instalada, cámaras reales e impresoras A4/80/58 mm.
- Undecided: sucursal no se puede filtrar (el esquema no tiene sucursal en ventas, productos ni operaciones).

## Brand Commitments
- Nombre oficial del producto: Jowa System (el repositorio se llama FerreSystem).
- Un solo diseño visual oficial: superficies claras, bordes suaves, tipografía Archivo/Inter. Solo el color de marca cambia por negocio, junto con el logotipo.
- Sin plantillas alternativas, modos oscuro o estilos múltiples: se retiraron en PR #177 y la decisión se mantiene.

## Evidence on Hand
- docs/CONTEXTO_MAESTRO.md (estado vigente, pruebas y pendientes).
- Decisión de diseño único: sección "Diseño único de Jowa System" en docs/CONTEXTO_MAESTRO.md.
- Ausente: fotografías o materiales de marca no verificados en este repositorio; no inventar testimonios, clientes ni cifras de adopción.

## Product Principles
- Un solo diseño coherente; el color de marca es la única variable por negocio.
- Lo pendiente de hoy se muestra primero y solo con cifras confirmadas por el servidor.
- La contingencia sin conexión no debe ocultar operaciones que requieren revisión.
- Texto claro en español, con traducción completa a inglés.
