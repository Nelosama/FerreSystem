# Retiro del MFA del Super Admin — verificación, plan y riesgos (PR #203)

Fecha: 2026-10-27 UTC · Firma de esquema: **NEXUS** · Estado: **preparado, NO ejecutado**.

## 1. Verificación de la decisión contra la documentación vigente

La instrucción recibida dice que la última decisión funcional del propietario fue retirar el MFA. La documentación del repositorio **no lo respalda**:

| Fuente | Qué dice |
|---|---|
| `docs/CONTEXTO_MAESTRO.md` (sección «Autenticación consolidada #200 + #201») | «**MFA del Super Admin obligatorio** (ambos PR lo habían retirado)». Pendiente real: configurar `AUTH_MFA_ENCRYPTION_KEY` y enrolar el MFA del propietario. |
| `docs/AUTH_CONSOLIDACION_20261026.md` §2 y §4 | MFA «Restaurado (requisito). Ambos [PR] contradecían la instrucción». |
| `docs/AUTH_RECOVERY_SECURITY.md` | MFA, cifrado TOTP y enrolamiento siguen vigentes. |
| Commits `aeb08ec`/`3b347ec` (#200/#201) | Retiran el MFA; es la única traza del retiro y ya fue revertida por `5e04994`. |

**Conclusión:** no hay constancia escrita de una decisión posterior del propietario que retire el MFA; las descripciones de #200/#201 son el origen de la idea y la consolidación las corrigió por contradecir el requisito vigente. Retirar el MFA del Super Admin degrada el control más sensible del sistema (acceso a todas las empresas), por lo que **no se ha tocado código de producto**. Se necesita confirmación explícita del propietario (ver §6).

## 2. Alcance de la eliminación (inventario, no aplicado)

Backend (`backend/src/auth`): `mfa.ts`, `auth.service.ts` (`MFA_REQUERIDO`, `MFA_ENROLAMIENTO_REQUERIDO`, `mfaCode`), `jwt.strategy.ts` (`mfa: true`), `sesiones-auth.ts`, `recovery.service.ts` / `recovery.controller.ts` (`mfa/bootstrap-request`, `bootstrap`, `enroll`, `confirm`, códigos de emergencia), `contrasena-temporal.ts`, `dto/login.dto.ts`, `dto/recovery.dto.ts`, `auth-actions.ts`; `super-admin/super-admin.service.ts`; `usuarios/usuarios.service.ts` (MFA de Admin).
Frontend: `LoginPage.tsx` (campo `#login-mfa`), `RecoveryForm.tsx`, `AccountSecurity.tsx`, `SuperAdminPage.tsx`, `locales/es.json`/`en.json`.
Pruebas a **reemplazar** (no borrar): `mfa.spec.ts`, `login-unico.spec.ts`, `auth.service.spec.ts`, `auth-recovery.postgres.integration.ts`, `autenticacion-fase3`, `seguridad-fase2`, `aislamiento-barrido`, `saas-onboarding`, `administracion-cloud`, `ventas`, `real-settings-browser.mjs`, `settings-http-checks.ts`, `synthetic-platform-mfa.ts`, `synthetic-upgrade-mfa.cjs`, `e2e/auth-security.spec.ts`, `e2e-real/mfa.fixture.ts`, `activation.fixture.ts` y specs que lo usan; `.github/workflows/playwright.yml`.

Orden recomendado: (1) flag de servidor `AUTH_SUPERADMIN_MFA=required|off` por defecto `required`; (2) pruebas de ambas ramas; (3) retirar la rama `off` solo tras aceptación; (4) esquema: **no borrar** columnas `mfa_*` ni `auth_actions` históricas (migración aditiva; los secretos cifrados quedan inertes y pueden purgarse en una migración posterior autorizada). Ninguna migración ya aplicada en producción se modifica.

## 3. Pruebas que deben seguir exigiéndose sin MFA

Bloqueo al 6.º fallo, límites por cuenta/IP, 401 genérico sin enumeración, contraseña temporal de un uso/10 min/hash, cambio obligatorio sin sesión, revocación de sesiones, aislamiento entre tenants, CSRF, inactividad de 15 min, rotación de refresh, CONTADOR de #180. Se añadirían pruebas que fijen que **sin MFA** el Super Admin: (a) conserva límites por IP más estrictos, (b) exige reautenticación para acciones destructivas, (c) no puede recuperarse por correo sin confirmación adicional.

## 4. Riesgos de seguridad al retirar el MFA

1. Una contraseña filtrada, reutilizada o capturada (phishing, keylogger) da control total de todas las empresas, sus datos y la suplantación de soporte.
2. La recuperación por correo pasa a depender solo del buzón: quien controle el correo del Super Admin controla la plataforma (hoy exige además TOTP).
3. Desaparece el segundo factor frente a fuerza bruta distribuida (el bloqueo permanente no aplica al ADMIN/Super Admin por diseño, para no permitir denegación de servicio).
4. Se pierde evidencia no repudiable de la identidad del operador en la auditoría.
5. Reducción de postura frente a auditorías/clientes que exijan MFA para accesos privilegiados.

## 5. Alternativas y controles compensatorios

- **Mantener MFA solo para Super Admin** (estado actual): el costo operativo es una cuenta; es la opción recomendada.
- Passkeys/WebAuthn (requiere dominio y RP ID definitivos) en lugar de TOTP: menos fricción y resistente a phishing.
- OTP por correo como segundo factor (más débil: mismo canal de recuperación).
- Restricción de red del Super Admin (allowlist de IP/VPN) más alertas por correo en cada inicio.
- Contraseña larga obligatoria (≥ 16) con verificación de filtraciones, reautenticación para acciones críticas y cola de aprobación doble para crear/eliminar empresas.
- Sin cambios para Admin y roles operativos: bloqueo, recuperación y revocación permanecen.

## 6. Decisión requerida del propietario

Confirmar por escrito (a) que desea retirar el MFA del Super Admin, y (b) la opción de §5 que lo compensa. Mientras tanto el PR #203 mantiene el MFA obligatorio, coherente con la documentación vigente, y es el valor seguro por defecto.
