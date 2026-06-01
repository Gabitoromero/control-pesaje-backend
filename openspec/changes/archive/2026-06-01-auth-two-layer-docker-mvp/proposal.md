# Proposal: Autenticación en Dos Capas & Docker MVP

## Intent
Implementar la seguridad base y el flujo operativo de planta de "Control de Pesaje" mediante un MVP contenerizado en Docker. Este MVP permitirá gestionar las entidades básicas (usuarios, artículos, líneas, etapas, rutas) e iniciar sesión global (Capa 1 con JWT) y sesión operativa en planta (Capa 2 con PIN e inactividad), empaquetado en un contenedor autocontenido para pruebas de producción simuladas en el servidor de la oficina.

## Scope

### In Scope
* **Capa 1 (Login Global)**: Endpoint `/api/auth/login` y middleware `authenticateJWT` para roles `administrador` y `jefe`.
* **Capa 2 (Sesión Operativa)**: Endpoint `/api/auth/activar-sesion` con PIN de 4-6 dígitos y rate-limiting en memoria (bloqueo de 5 min al 3er intento fallido).
* **Mantenimiento de Sesión**: Endpoint `/api/auth/sesion-activa/:lineaId` con cálculo de timeout por inactividad de 5 minutos.
* **Cierre de Sesión**: Endpoint `/api/auth/cerrar-sesion-operario` para cierre manual de sesión de planta.
* **Dockerización del Backend**: Creación de un `Dockerfile` multi-stage y actualización de `docker-compose.yaml` para levantar PostgreSQL y la API del backend interconectados.
* **Seeding de Base de Datos**: Script de semilla (`pnpm seed`) para precargar datos iniciales y probar la gestión de entidades básicas de forma simple en la oficina.

### Out of Scope (Pausado temporalmente por falta de Raspberry Pi 5)
* Creación e inicio físico de `Pasada` de producción.
* Captura y registro en tiempo real de `Muestra`.
* Lógica avanzada de secuencialidad estricta y descarte de muestras fuera de rango.

## Risks & Mitigations
* **Acceso a base de datos en Docker**: Mitigado configurando variables de entorno en el compose para esperar a que PostgreSQL esté listo (`depends_on` con healthcheck) antes de arrancar la API.
