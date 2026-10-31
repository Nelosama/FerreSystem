# Checklist de pruebas físicas y aceptación del cliente — Jowa System 1.0 (2026-10-30)

> Lista de verificación para una persona en la tienda con el equipo real. **Ninguno de estos puntos está verificado.** Esta auditoría no tiene acceso a hardware, red ni dispositivos del cliente. Ampliar los checklists existentes: [CHECKLIST_EQUIPOS_REALES.md](CHECKLIST_EQUIPOS_REALES.md) y [POS_PILOTO_CHECKLIST_FISICO.md](POS_PILOTO_CHECKLIST_FISICO.md). Los resultados se registran en la última sección con fecha, equipo, responsable y evidencia (foto o captura).

## A. Equipos y red

| # | Prueba | Cómo | Resultado esperado | Estado |
|---|---|---|---|---|
| A1 | Computadora del administrador: navegador, sesión y cierre | Ingresar, cerrar sesión y volver a ingresar | Entra con su cuenta; la sesión cierra al salir | [ ] |
| A2 | Computadora del cajero: venta de punta a punta | Vender en efectivo, tarjeta y transferencia | Cada venta aparece en caja con el método correcto | [ ] |
| A3 | Wi-Fi local | Cargar la aplicación y completar una venta | Sin errores de conexión en condiciones normales | [ ] |
| A4 | Caída de internet durante una venta | Cortar la red a mitad de una venta, restaurarla | La venta se completa o se conserva en contingencia sin duplicarse (ver B) | [ ] |
| A5 | Recarga de página en medio de un cobro | Recargar justo después de cobrar | No se cobra dos veces; la venta queda una sola vez | [ ] |

## B. Contingencia offline (apagón)

| # | Prueba | Resultado esperado | Estado |
|---|---|---|---|
| B1 | Vender sin internet con efectivo | Comprobante interno de contingencia con correlativo local | [ ] |
| B2 | Al volver la conexión, reconciliar | Cada venta de contingencia aparece una vez en el servidor; ninguna duplicada | [ ] |
| B3 | Venta de contingencia con importe incoherente | Queda como conflicto `IMPORTE_FISCAL_INCONSISTENTE`, no se cobra como venta (decisión D11 pendiente) | [ ] |
| B4 | Ensayo del protocolo de apagón con el dueño | Procedimiento de [POS_CONTINGENCIA_PROTOCOLO_APAGON.md](POS_CONTINGENCIA_PROTOCOLO_APAGON.md) firmado por el dueño | [ ] |

## C. Impresión

| # | Prueba | Resultado esperado | Estado |
|---|---|---|---|
| C1 | Impresora térmica de 80 mm | Ticket legible, sin cortes; el texto coincide con la vista previa | [ ] |
| C2 | Impresora térmica de 58 mm | Igual que C1 en el formato 58 mm | [ ] |
| C3 | Hoja A4 | Encabezado completo y totales correctos | [ ] |
| C4 | Texto del comprobante | Coincide con el texto aprobado por el contador (AUD-FIS-01) | [ ] |

## D. Lector y cámara

| # | Prueba | Resultado esperado | Estado |
|---|---|---|---|
| D1 | Lector de código de barras USB | Escanear un producto agrega la línea correcta; el foco vuelve al campo de búsqueda | [ ] |
| D2 | Cámara en la computadora | Permiso solicitado una vez; el escaneo funciona | [ ] |
| D3 | iPhone con Safari | Permiso de cámara, escaneo, y que la cámara se libera al salir (no probado nunca; Safari no está en el entorno de pruebas) | [ ] |
| D4 | Cajón de dinero | Se abre al cobrar en efectivo, según la configuración de la impresora | [ ] |

## E. Cuentas, caja y cierre con el equipo real

| # | Prueba | Resultado esperado | Estado |
|---|---|---|---|
| E1 | Apertura de caja con monto inicial | Caja abierta con el monto correcto | [ ] |
| E2 | Cierre con diferencia y nota | Diferencia registrada y auditada | [ ] |
| E3 | Abono a crédito de un cliente | Saldo del cliente actualizado; un solo abono aunque se pulse dos veces | [ ] |
| E4 | Recepción de compra con el proveedor real | Existencias suben una vez; el ISV de la factura se revisa a mano (C-02) | [ ] |

## F. Aceptación del cliente (dueño y personal)

Cada punto se marca solo con la persona que lo confirma. Sin estas firmas el piloto no empieza.

| # | Criterio | Responsable | Firma y fecha | Estado |
|---|---|---|---|---|
| F1 | Alcance del piloto aprobado: módulos incluidos y excluidos, según la auditoría | Dueño | | [ ] |
| F2 | Decisiones fiscales D1–D11 respondidas por escrito por el contador (ver la matriz) | Contador | | [ ] |
| F3 | Texto del comprobante de venta aprobado por el contador (AUD-FIS-01) | Contador | | [ ] |
| F4 | Módulo Comisiones oculto o corregido con la regla de negocio aprobada | Dueño | | [ ] |
| F5 | RPO y RTO aceptados y respaldo productivo con destino independiente configurado | Dueño | | [ ] |
| F6 | Capacitación del administrador y de los cajeros realizada con los equipos de la tienda | Dueño | | [ ] |
| F7 | Protocolo de apagón entregado y entendido por el personal | Dueño | | [ ] |
| F8 | Consentimiento para usar datos reales del negocio en el piloto | Dueño | | [ ] |

## G. Registro de resultados

| Fecha | Equipo o prueba | Responsable | Resultado (aprobado / fallido / no aplica) | Evidencia | Observaciones |
|---|---|---|---|---|---|
| | | | | | |

Un fallo en A2, B2, C1 o D1 bloquea el piloto hasta corregirlo y repetir la prueba. Un fallo en los demás puntos se trata con el responsable antes de decidir.

## Historial

- 2026-10-30: lista creada a partir de los checklists existentes y de la auditoría. Sin resultados registrados.
