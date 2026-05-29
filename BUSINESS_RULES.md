# Reglas de Negocio

Toda la lógica de negocio del sistema está definida aquí. Antes de implementar cualquier feature, verificar si aplica alguna de estas reglas.

---

## Estructura de planta

**RN-01** — La planta tiene ~13 líneas de producción, 9 operan de forma constante.

**RN-02** — Al inicio de cada jornada se define qué artículo se produce en cada línea. Esta asignación puede cambiar entre jornadas.

**RN-03** — La tablet y la balanza (con su Raspberry) quedan asociadas a una línea productiva hasta que se termine de producir.

**RN-04** — Cada línea tiene una única balanza. Para el sistema, **una balanza = una línea de producción**.

**RN-05** — La balanza y la Raspberry se trasladan como una unidad de trabajo.

---

## Parámetros de pesaje

**RN-06** — Cada combinación `artículo-etapa` tiene sus propios parámetros: peso ideal, peso mínimo y peso máximo. Una misma etapa puede tener parámetros distintos según el artículo.

**RN-07** — La tolerancia de cada etapa no es necesariamente simétrica. Los valores de peso mínimo y máximo se definen de forma independiente por `artículo-etapa`.

**RN-08** — La tara se realiza una sola vez por etapa dentro de una pasada. No se registra. La Raspberry envía el peso neto (las balanzas KRETZ no envían pesos negativos).

---

## Gestión de pasadas

**RN-09** — Pueden existir múltiples pasadas en curso simultáneamente para la misma línea y el mismo artículo.

**RN-10** — El número de pasada es un contador autoincremental por línea por día. Se resetea al iniciar en la línea con un nuevo artículo.

**RN-11** — Estados posibles de una pasada: `en_curso`, `completa` y `abortada`. Una pasada puede ser abortada por un usuario con permisos, requiriendo ingresar un `motivo_cierre` obligatorio para justificar el cierre inusual.

**RN-12** — Una pasada en curso queda estrictamente asociada al usuario que la inició. Únicamente el usuario titular de la pasada activa puede registrar muestras o realizar acciones sobre ella.

---

## Flujo de etapas dentro de una pasada

**RN-13** — El sistema guía al operario de forma secuencial por las etapas de la ruta de pasada. **No se permite saltar etapas pendientes.**

**RN-14** — Si se registran muestras fuera de rango (por debajo del mínimo o por encima del máximo), se solicitarán más muestras hasta cumplir con la cantidad de muestras **con valores aceptables** que corresponden a la etapa.

---

## Puesta a punto y contexto de sesión

**RN-15** — Si no hay un operario con sesión activa en la tablet de una línea, el sistema asume que esa línea está en **puesta a punto**. Los datos que lleguen de la Raspberry correspondiente son **descartados por el servidor** y no se persisten.

**RN-16** — Por cada muestra se solicitará PIN de usuario.

**RN-17** (sesiones) — Un operario **no puede tener sesión activa en más de una tablet simultáneamente**.

---

## Control semanal de balanzas

**RN-18** — El control con pesas fijas se registra como cualquier otro artículo: tiene su propia ruta de pasada, etapas y cantidad de muestras por etapa definidas.

---

## Trazabilidad

**RN-19** — Cada muestra debe poder identificar con precisión:
- Qué operario la registró
- En qué momento (timestamp exacto)
- En qué etapa
- En qué pasada
- Con qué balanza/línea
- Cuál fue el resultado de la validación (ok / fuera_de_rango)

---

## Baja lógica de entidades

Ninguna entidad se elimina físicamente de la base de datos. Solo se marca como `inactiva` para preservar la trazabilidad histórica. Aplica a: usuarios, artículos, etapas, líneas de producción, rutas de pasada.

---

## Control al azar

Se permite registrar un control de peso de una etapa en cualquier línea, **sin que quede asociado a una pasada**. Es para uso de gerentes, jefes de producción o personal de calidad.
