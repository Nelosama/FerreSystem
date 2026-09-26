# Sentinel Security Journal - Critical Learnings

## 2026-03-30 - Missing Role Authorization Guard on Tenant Settings Modification
**Vulnerability:** `PUT /api/tenant/settings` was protected by `JwtAuthGuard` and `TenantGuard`, but lacked `RolesGuard` and `@Roles('ADMIN')`. Any authenticated tenant user (including `CAJERO`, `VENDEDOR`, `BODEGUERO`) could update tenant business details and branding.
**Learning:** Controller level `JwtAuthGuard` and `TenantGuard` enforce multi-tenancy authentication, but without `RolesGuard` and explicit `@Roles(...)` decorators, endpoint actions default to being accessible by any authenticated role (BFLA risk).
**Prevention:** Always attach `RolesGuard` to controllers where role checks are required, and explicitly decorate write or sensitive endpoints with `@Roles('ADMIN')`.
