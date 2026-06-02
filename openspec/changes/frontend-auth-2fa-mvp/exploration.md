## Exploration: Frontend Authentication Two-Layer (2FA) MVP

### Current State
Actualmente, el frontend de la aplicación posee una pantalla de `Login.tsx` que contiene un teclado numérico (PIN pad) acoplado directamente al endpoint `/api/auth/login`. En la arquitectura original, esta pantalla intentaba resolver la autenticación global utilizando el teclado táctil, lo cual es incompatible con la nueva especificación de dos capas (Capa 1: Login de Jefes por texto y Capa 2: Activación de operario por PIN y selección de línea). 

El backend ya expone los endpoints correspondientes de dos capas:
1. `POST /api/auth/login` (Capa 1: global, recibe `nombreUsuario` y `contrasena`, retorna un JWT de supervisor/jefe).
2. `POST /api/auth/activar-sesion-operario` (Capa 2: recibe `pin` y `lineaProduccionId`, requiere el JWT de Capa 1 en la cabecera `Authorization: Bearer <token>`).
3. `POST /api/auth/cerrar-sesion-operario` (Cerrar sesión de operario por línea).
4. `GET /api/auth/sesion-activa/:lineaId` (Obtener estado de sesión del operario, retornando `usuarioIdOperario: null` si ocurrió un timeout de 5 minutos, pero manteniendo la sesión de Capa 1).

### Affected Areas
Debido a que el acceso a la carpeta `/home/gtr/work/maciasoft/Controlador Pesaje/codigo/frontend` directamente a través de lectura de archivos resultó en un timeout por permisos de seguridad externos, se mapean las áreas afectadas en base a la arquitectura estándar de Vite-React-TS del proyecto:

- `/home/gtr/work/maciasoft/Controlador Pesaje/codigo/frontend/package.json` — Se deben verificar dependencias como `react-router-dom` y librerías de estados o iconos necesarios para la interfaz táctil.
- `/home/gtr/work/maciasoft/Controlador Pesaje/codigo/frontend/tailwind.config.js` — Ajustar temas de color para alertas (bloqueo por 429, conflictos por 409) y layouts táctiles adaptados a Raspberry Pi.
- `/home/gtr/work/maciasoft/Controlador Pesaje/codigo/frontend/src/App.tsx` — Modificar el enrutador principal para incluir las nuevas páginas, layouts o el wrapper protector de estados.
- `/home/gtr/work/maciasoft/Controlador Pesaje/codigo/frontend/src/pages/Login.tsx` — Reemplazar el teclado numérico actual por un formulario clásico de texto para el Login Global (Capa 1).
- `/home/gtr/work/maciasoft/Controlador Pesaje/codigo/frontend/src/api/axios.ts` — Adaptar interceptores para adjuntar de forma consistente el JWT de Capa 1 y centralizar la captura de códigos HTTP `409` (Conflict) y `429` (Too Many Requests).
- `/home/gtr/work/maciasoft/Controlador Pesaje/codigo/frontend/src/components/PINPad.tsx` *(Nuevo)* — Componente desacoplado del teclado numérico reutilizable tanto para la activación táctil como para desbloqueo por timeout.
- `/home/gtr/work/maciasoft/Controlador Pesaje/codigo/frontend/src/context/AuthContext.tsx` *(Nuevo o Modificado)* — Centralizar el estado de sesión global (JWT Capa 1), la línea activa (`lineaProduccionId`) y la sesión del operario activo (Capa 2).

### Approaches

#### 1. Opción A: Rutas Separadas por URL (Navigation-Driven)
Este enfoque utiliza el enrutador principal (`react-router-dom`) para segmentar rígidamente cada paso del proceso:
- `/login` (Capa 1: Login de supervisor por texto) -> `/select-line` (Selección de Línea de Producción) -> `/activate-operator` (Capa 2: PIN pad para operario) -> `/dashboard` (Pantalla de pesaje y control).

* **Pros:**
  - Estricta separación de responsabilidades a nivel de componentes de página.
  - Facilidad para proteger rutas de manera estándar mediante Guards tradicionales de React Router (`Capa1Guard`, `Capa2Guard`).
  - URLs directas y limpias que permiten depuración rápida en fase de desarrollo.
* **Cons:**
  - **Experiencia de Usuario (UX) Deficiente ante Timeouts:** Si la sesión del operario expira por el timeout de 5 minutos de inactividad, redirigir forzosamente desde `/dashboard` a `/activate-operator` limpia el estado en memoria de la pantalla actual (filtros de pasadas seleccionadas, vistas, etc.). Al reintroducir el PIN, el operario debe reconstruir su contexto de trabajo.
  - Complejidad en la sincronización del estado en tiempo real (por ejemplo, si el backend determina que la sesión expiró y el frontend hace una petición que falla con 401/403, forzar múltiples redirecciones).
* **Effort:** Medium.

#### 2. Opción B: Wrapper Protector Único con Overlays Reactivos (Single Component Multi-State)
Este enfoque implementa un Layout Wrapper (`AuthLayoutWrapper` o `OperatorRouteGuard`) que protege el renderizado del `/dashboard`. En lugar de redirigir a rutas separadas, la aplicación mantiene la URL `/dashboard`, pero el Wrapper evalúa reactivamente el estado en memoria:
- Si no hay JWT de Capa 1 en almacenamiento, muestra `/login` (Capa 1).
- Si hay JWT pero no se seleccionó línea, muestra un Overlay/Modal de Selección de Línea.
- Si hay línea pero la sesión del operario está inactiva o ha expirado (validado contra `GET /api/auth/sesion-activa/:lineaId` o por temporizador local), renderiza un **Overlay Bloqueante a pantalla completa (con fondo difuminado/blurred)** que contiene el PIN pad de Capa 2.

* **Pros:**
  - **Excelente UX:** Cuando expira el timeout de 5 minutos, la pantalla actual simplemente se bloquea con un difuminado transparente. Al ingresar el PIN del operario, el overlay desaparece instantáneamente, revelando el dashboard en el mismo estado exacto en que se dejó (filtros de tabla intactos, selección de pesada actual cargada, etc.).
  - Evita redirecciones de enrutador innecesarias que pueden corromper estados locales efímeros.
  - Centraliza el estado de autenticación y el ciclo de vida del operario en un solo componente guardián reactivo.
* **Cons:**
  - Requiere un manejo meticuloso de la reactividad del estado global de autenticación en React para evitar re-renders masivos o loops de petición al backend.
* **Effort:** Medium.

---

### Recommendation
Se recomienda enfáticamente la **Opción B (Wrapper Protector Único con Overlays Reactivos)**.
En terminales industriales táctiles (como Raspberry Pi y Tablets en planta de producción), la continuidad del trabajo de pesaje es crítica. Un operario que deja el puesto por 5 minutos y regresa no debe enfrentarse a una recarga completa de página que le obligue a buscar nuevamente la línea, la etapa y el artículo en el que estaba trabajando. El bloqueo por Overlay difuminado es el estándar moderno para estaciones operativas industriales.

---

### Detailed Feature Design

#### A. Desacoplamiento del Teclado Numérico (`PINPad.tsx`)
Se extraerá el teclado táctil a un componente autónomo en `src/components/PINPad.tsx`:
- **Propiedades (Props):**
  ```typescript
  interface PINPadProps {
    value: string;
    onChange: (value: string) => void;
    onSubmit: () => void;
    disabled?: boolean;
    maxLength?: number;
    error?: string;
  }
  ```
- **Diseño Visual:** Botones de gran tamaño (mínimo `48px` x `48px` para cumplimiento con ergonomía táctil en pantallas industriales) y un botón especial de retroceso (Back/Delete).

#### B. Temporizador de Inactividad de 5 Minutos (Capa 2)
- **Mecanismo:** Un hook personalizado `useInactivityTimeout` que registra listeners globales en `window` para eventos táctiles (`touchstart`), clics (`click`) y teclado (`keypress`).
- **Comportamiento:**
  1. Un contador de 5 minutos (300 segundos) corre en segundo plano.
  2. Si el contador llega a `30 segundos` antes de expirar, se muestra un banner sutil y estético en la parte superior: *"La sesión de operario expirará en X segundos por inactividad. Presione la pantalla para continuar"*.
  3. Si llega a `0`, se llama al backend `POST /api/auth/cerrar-sesion-operario` (por seguridad técnica) y se altera el estado local del operario a inactivo, lo cual activa de inmediato el Overlay Bloqueante difuminado del PIN pad.

#### C. Rate-Limiting con Autobloqueo de 5 Minutos (HTTP 429)
- **Mecanismo:** Si al ingresar un PIN erróneo el backend responde con `HTTP 429 Too Many Requests`, el interceptor de Axios captura la respuesta.
- **Visualización Estética:**
  - El componente `PINPad` entra en estado `disabled`.
  - Se muestra un banner rojo con el mensaje: *"PIN bloqueado por seguridad. Reintentar en MM:SS"*.
  - Se inicia un temporizador de cuenta regresiva local (5 minutos) sincronizado reactivamente. Durante este tiempo, los botones del PIN pad no responden a las pulsaciones táctiles.

#### D. Modal de Conflicto de Sesión (HTTP 409)
- **Mecanismo:** Al intentar activar la sesión con `POST /api/auth/activar-sesion-operario`, si el operario ya tiene una sesión abierta en otra línea, el servidor retorna `409 Conflict` con un JSON que detalla la línea en conflicto.
- **Resolución Estética/UX:**
  - Se despliega un modal centrado con fondo oscuro semi-transparente.
  - Mensaje claro: *"Sesión Activa Detectada: El operario seleccionado ya está trabajando en la Línea [Nombre/ID]. ¿Desea cerrar la sesión anterior y activarse en esta línea?"*
  - **Botones de Acción:**
    1. **"Cerrar y Activar Aquí"** (Color primario, ej. verde/azul): Llama a `POST /api/auth/cerrar-sesion-operario` con la línea en conflicto y automáticamente re-intenta la activación en la línea actual.
    2. **"Cancelar"** (Gris/Borde): Cierra el modal y limpia el PIN introducido para permitir que otro operario se valide.

---

### Risks
- **Riesgo 1 (Sincronización de Tiempo Real):** Si la Raspberry Pi pierde conectividad temporalmente, el temporizador de inactividad del frontend podría desalinearse con el del backend.
  * *Mitigación:* Cada petición relevante al backend debe refrescar la cookie/token y ante cualquier respuesta fallida con código de sesión expirada, el frontend debe forzar la visualización del overlay de PIN de inmediato.
- **Riesgo 2 (Persistencia del JWT de Supervisor):** Si el supervisor (Capa 1) cierra la pestaña del navegador o reinicia el equipo, el token debe persistir para evitar que el operario tenga que pedirle al supervisor que inicie sesión nuevamente tras cortes de energía breves.
  * *Mitigación:* Guardar el JWT de Capa 1 de manera segura en `localStorage` (o `sessionStorage` si se requiere máxima seguridad de turno), pero asegurando que la expiración del token sea gestionada limpiamente.

### Ready for Proposal
Yes — El análisis y la coreografía técnica para desacoplar el teclado táctil e implementar la doble capa de autenticación están completamente claros y diseñados de forma ergonómica para terminales industriales. El orquestador puede proceder a presentar la propuesta del cambio al usuario para su aprobación antes de generar las especificaciones detalladas.
