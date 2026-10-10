# Propuesta de registro de identidades de agentes en AGENTS.md — CENTINELA

**Propuesta, no aplicada.** `AGENTS.md` es un documento compartido y no se modifica en esta rama. El responsable decide si lo adopta.

## 1. Principio: solo añadir, nunca reemplazar

- El archivo actual tiene SHA-256 `04cc8d182d9b9cc3444592977b1b20ad17a960542294fb2798070abf6c8cbc3b`. Sus cuatro párrafos se conservan literalmente.
- La adición va **al final**, como sección nueva, separada por una línea en blanco.
- Verificación antes de integrar: el archivo resultante debe tener **cero líneas eliminadas** en `git diff --numstat AGENTS.md` (solo adiciones). Comando: `git diff --numstat -- AGENTS.md` → la primera columna debe ser `0` para borrados.

## 2. Texto propuesto (para añadir al final de AGENTS.md)

```markdown

## Identidades de agentes

Cada agente que trabaje en FerreSystem se identifica con su nombre oficial en commits, PR, informes y resúmenes. Nombres vigentes:

| Identidad | Responsabilidad | Documento de referencia |
|---|---|---|
| CENTINELA | Seguridad: autenticación, autorización, aislamiento entre empresas, configuración sensible, migraciones con impacto de seguridad | `docs/agentes/CENTINELA.md` |
| KARDEX | Inventario | Pendiente de documento propio |
| FARO | Auditoría y QA | Pendiente de documento propio |
| BALANCE | Integridad financiera y procesos económicos | Pendiente de documento propio |
| ATLAS | Integración de ramas y POS offline (PR #129) | Pendiente de documento propio |

Reglas comunes:
- Trabajar en ramas independientes; no hacer merge ni desplegar sin autorización del responsable.
- No ejecutar migraciones productivas ni modificar infraestructura productiva sin autorización.
- Los cambios transversales se coordinan con la identidad afectada antes de tocar sus archivos.
```

## 3. Lo que NO debe ir en AGENTS.md

- Credenciales, claves, URLs de producción, correos personales ni identificadores de sesión.
- Estado de bloqueos o veredictos (esos viven en `docs/CONTEXTO_MAESTRO.md` y en los informes).

## 4. Pasos para integrar (cuando lo autorice el responsable)

1. Confirmar que ninguna otra rama modifica `AGENTS.md` al mismo tiempo (conflicto de texto probable si se añade al final en paralelo).
2. Añadir el bloque de la sección 2 al final, sin tocar el texto existente.
3. Verificar: `git diff --numstat -- AGENTS.md` muestra cero líneas eliminadas.
4. Incluir la verificación en la revisión del PR; CODEOWNERS ya protege `docs/agentes/`, pero no `AGENTS.md`: añadir `/AGENTS.md @Nelosama` si se quiere la misma protección.
