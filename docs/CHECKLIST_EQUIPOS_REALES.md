# Checklist de validación en equipos reales (ferretería)

Fecha: 2026-10-12. **Estado de TODOS los puntos: SIN PROBAR.** Esta sesión solo dispone de Chromium en un servidor; ningún equipo, impresora, lector ni red de la ferretería se ha probado. La columna «Resultado» queda vacía a propósito: se llena en la ferretería, contra **preproducción** (no producción) y con datos de prueba.

Cómo usarla: una persona hace cada acción y otra lee el resultado. Anote PASS / FAIL / NO APLICA y qué vio si falla. Un FAIL en un punto **indispensable** detiene la entrega; en uno **pospuesto** se registra y se sigue.

Qué hay en el sistema hoy (para no esperar lo que no existe): el POS en línea cobra por el total (no calcula vuelto), la entrega es **completa** (no parcial), la impresión usa la del navegador (hay impresión en cotizaciones, arqueo de caja y comprobantes), el campo de búsqueda del POS acepta código o código de barras con Enter, y existe lector por cámara en el levantamiento de inventario.

## 1. Computadora del administrador — indispensable
| # | Acción | Esperado | Resultado |
|---|---|---|---|
| A1 | Abrir la dirección del sistema en el navegador de uso diario e iniciar sesión | Entra a la pantalla de inicio con el resumen del negocio | |
| A2 | Crear un producto con precio y existencias; buscarlo | Aparece con su precio y stock | |
| A3 | Crear un usuario cajero con permiso de venta | El cajero puede iniciar sesión | |
| A4 | Después de que el cajero venda: ir a la pantalla de entregas pendientes y confirmar la entrega | El stock baja una sola vez | |
| A5 | Abrir **Auditoría** y el historial de ventas | Se ven la venta y la entrega con usuario y hora | |
| A6 | Cerrar sesión y entrar de nuevo; recargar la página con F5 | Sigue funcionando; no pide datos de más | |

## 2. Computadora del cajero — indispensable
| # | Acción | Esperado | Resultado |
|---|---|---|---|
| C1 | Iniciar sesión como cajero y abrir caja con un fondo | Caja abierta | |
| C2 | Vender de contado en efectivo 2 unidades del producto de prueba | Venta registrada con ISV y total correctos | |
| C3 | Pulsar **dos veces seguidas** el botón de cobrar | Se crea **una sola** venta | |
| C4 | Intentar abrir **Auditoría** | «Acceso Denegado»; no se ven datos | |
| C5 | Intentar vender un producto sin precio aprobado | Se rechaza con un mensaje claro | |
| C6 | Cerrar la caja contando el efectivo | Esperado = fondo + cobros; diferencia 0 | |

## 3. iPhone con Safari — indispensable si el cliente lo usará (no probado nunca: Safari no existe en el entorno de pruebas)
| # | Acción | Esperado | Resultado |
|---|---|---|---|
| I1 | Abrir el sistema en Safari e iniciar sesión | Entra; los botones se pueden tocar sin acercar | |
| I2 | Consultar productos y existencias; ver el resumen móvil | Se lee sin desplazarse hacia los lados | |
| I3 | Cerrar Safari por completo, abrirlo de nuevo y volver al sistema | La sesión persiste o pide iniciar de nuevo sin errores | |
| I4 | (Opcional) Añadir a pantalla de inicio | Abre sin errores | |
| I5 | (Pospuesto) Escanear un código con la cámara en el levantamiento | Reconoce el código; puede requerir permiso de cámara | |

## 4. Impresora de facturas — indispensable si se entregan facturas impresas
| # | Acción | Esperado | Resultado |
|---|---|---|---|
| P1 | Imprimir lo que el sistema ofrece imprimir (cotización, comprobante o factura que el cliente vaya a usar) con la impresión del navegador | Sale legible, sin cortes, con el nombre del negocio. Anote qué documentos NO se pueden imprimir | |
| P2 | Imprimir el cierre de caja (arqueo) | Sale completo en una hoja | |
| P3 | **Numeración fiscal:** el sistema NO emite numeración fiscal (SAR/CAI) propia; la referencia de factura externa es solo informativa | Decidir con el contador cómo se factura legalmente | |

## 5. Lector de códigos de barras — indispensable si el cajero lo usa
| # | Acción | Esperado | Resultado |
|---|---|---|---|
| L1 | Con el cursor en el buscador del POS, escanear un producto con código de barras registrado | Aparece/agrega el producto (el lector actúa como teclado y termina con Enter) | |
| L2 | Escanear un código que no existe | Mensaje claro; no agrega nada | |
| L3 | Registrar el código de barras de un producto nuevo y escanearlo | Se encuentra | |

## 6. Wi-Fi local y conexión — indispensable
| # | Acción | Esperado | Resultado |
|---|---|---|---|
| W1 | Con la computadora del cajero y el iPhone en el Wi-Fi del local, usar el sistema 10 minutos | Sin cortes ni lentitud notable | |
| W2 | Medir el tiempo de «cobrar» en horas de más uso | Menos de 3 segundos | |
| W3 | Dos cajeros vendiendo a la vez | Ninguna venta se pierde ni se duplica | |

## 7. Recuperación después de una interrupción de internet
**Importante:** la modalidad **sin conexión del POS (contingencia) está DESACTIVADA** en la primera entrega. Con la contingencia apagada, **sin internet no se puede cobrar en el sistema**: hace falta un procedimiento manual (libreta/recibos) y pasar las ventas al sistema al volver la conexión.
| # | Acción | Esperado | Resultado |
|---|---|---|---|
| R1 | (Preproducción) Desconectar internet en medio de una venta y reconectar | No queda una venta a medias ni duplicada; si no se confirmó, se vuelve a intentar con el mismo botón | |
| R2 | Con internet cortado, abrir el sistema y luego reconectar | Anote qué muestra; al volver la conexión debe seguir funcionando sin perder datos | |
| R3 | Acordar por escrito el procedimiento manual de ventas sin internet y quién las registra después | Documento firmado por el dueño | |
| R4 | (Pospuesto, solo con autorización y auditoría de CENTINELA/FARO) Habilitar la contingencia en una empresa piloto | Ver `docs/POS_OFFLINE_CONTINGENCIA_DISENO.md` | |

## 8. Qué es indispensable el primer día y qué puede esperar
**Indispensable:** secciones 1, 2, 6 y 7 (R1–R3); 3 si usarán iPhone; 4 y 5 si imprimen o escanean desde el primer día.
**Puede quedar pendiente (el negocio funciona sin ello):** contingencia sin conexión (7-R4); lector por cámara (3-I5); vuelto calculado en el POS (el cajero lo calcula; la caja concilia por totales); entrega parcial (entregar completo o dividir la venta); referencia del datáfono; reporte de ventas por cajero; canal web.

## 9. Resultado final
GO de equipos solo si no hay FAIL en lo indispensable. Firma de quien probó y fecha: ______________________
