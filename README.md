# Jowa System

Jowa System es una plataforma SaaS multiempresa para apoyar la operación diaria de ferreterías y otros comercios compatibles. El repositorio conserva el nombre histórico **FerreSystem**.

## Propósito

Centralizar en una sola aplicación las tareas comerciales y administrativas del negocio, con separación de datos entre empresas. El alcance incluye punto de venta, inventario, ventas, compras, clientes, cotizaciones, reportes y administración de usuarios y permisos.

El producto también contempla una PWA móvil para que el dueño o administrador pueda supervisar el negocio y realizar tareas de inventario desde el teléfono. La PWA no está concebida como un punto de venta móvil.

## Tecnologías

- **Frontend:** React, TypeScript y Vite.
- **Backend:** NestJS y Prisma.
- **Base de datos:** PostgreSQL.
- **Estructura:** monorepositorio con código de frontend, backend, app móvil y documentación.

## Desarrollo local

El repositorio raíz contiene scripts para iniciar y compilar las aplicaciones:

- `npm run dev:backend`
- `npm run dev:frontend`
- `npm run build:backend`
- `npm run build:frontend`

Consulta la documentación del repositorio para preparar las dependencias y variables de entorno antes de ejecutar estos comandos.

## Documentación

- [Contexto maestro y continuidad](docs/CONTEXTO_MAESTRO.md)
- [Arquitectura de continuidad del punto de venta](docs/ARQUITECTURA_CONTINUIDAD_POS_20261010.md)
- [Aplicación móvil y notificaciones](docs/APP_MOVIL_Y_NOTIFICACIONES.md)
- [Aislamiento multiempresa de la contingencia offline](docs/AISLAMIENTO_OFFLINE_MULTIEMPRESA_20261103.md)

## Repositorio

[Jowa System / FerreSystem en GitHub](https://github.com/Nelosama/FerreSystem)

> La documentación operativa registra el estado y los bloqueos vigentes. Un cambio integrado o un CI verde no certifica por sí solo un despliegue ni la preparación para producción.