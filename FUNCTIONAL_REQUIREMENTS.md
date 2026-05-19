# Requerimientos Funcionales

---

## Captura y registro de pesajes

**RF-01** — Recibir y mostrar en tiempo real el peso enviado por la Raspberry de la línea activa, sin intervención manual del operario.

**RF-02** — Permitir al operario confirmar el peso de cada muestra. El registro definitivo se realiza exclusivamente mediante acción del operario desde la interfaz, tomando el valor visible en ese momento. Esto evita duplicaciones, elimina almacenamiento intermedio y garantiza validación humana del dato.

**RF-03** — Vincular automáticamente cada muestra registrada con: usuario activo, hora exacta, etapa, número de pasada, artículo y línea de producción.

**RF-04** — Validar el peso neto de cada muestra contra los parámetros de la etapa (peso ideal, mínimo y máximo). Mostrar estado resultante (`OK` / `Fuera de rango`) con indicación visual clara.

**RF-05** — Permitir registrar una observación textual opcional vinculada a una muestra (ej: temperatura de la cobertura).

**RF-06** — Permitir al operario eliminar una muestra registrada mientras está tomando muestras en una etapa.

---

## Gestión de pasadas

**RF-08** — Permitir al operario iniciar una nueva pasada para la línea y artículo activos. El sistema genera un identificador autoincremental por línea por día.

**RF-09** — Mantener y mostrar un listado de pasadas en curso por línea de producción, indicando para cada una: número de pasada, hora de inicio, última etapa registrada y último operario que registró.

**RF-10** — Permitir a cualquier operario con sesión activa retomar una pasada en curso iniciada por otro operario.

**RF-11** — Permitir que coexistan múltiples pasadas en curso simultáneamente para la misma línea y artículo.

**RF-12** — Gestionar el avance secuencial del operario por las etapas de la ruta de pasada.

**RF-13** — Permitir al operario finalizar una pasada al completar todas las etapas. El sistema cambia el estado a `completa` y registra la hora de cierre.

**RF-14** — Permitir realizar un "control al azar": registrar el control de peso de una etapa en cualquier línea, sin que quede asociado a una pasada.

---

## Lógica de contexto y seguridad de datos

**RF-15** — El servidor actúa como orquestador de contexto. Si no hay un operario con sesión activa en una línea, el servidor descarta los datos que lleguen de esa Raspberry (modo puesta a punto).

**RF-16** — La tablet no está atada a un operario específico ni a una etapa, sino a una línea de producción. Desde cualquier tablet se puede operar cualquier línea, seleccionándola desde la interfaz.

**RF-17** — Un operario no puede tener sesión activa en más de una tablet simultáneamente.

---

## Promedios y visualización

**RF-18** — Mostrar en la tablet los datos de cada etapa en tiempo real:
- Peso actual leído por la balanza
- Peso neto calculado
- Cantidad de muestras registradas en la pasada actual
- Estado de la última muestra (`OK` / `Fuera de rango`)

**RF-19** — Proveer un dashboard de monitoreo accesible desde web (para jefes, gerentes, rol visualización) que muestre por línea de producción:
- Artículo en producción
- Pasadas en curso con su avance por etapa
- Promedio acumulado por etapa
- Gráfico de muestras (eje X: tiempo, eje Y: peso, con líneas de peso ideal, máximo y mínimo)

**RF-20** — El dashboard debe actualizarse en tiempo real.

---

## Reportes

**RF-21** — Permitir la descarga de un reporte en formato Excel (`.xlsx`) con las líneas de producción, filtrando por rango de fechas.

**RF-22** — El reporte debe incluir todas las pasadas (cualquier estado) y por cada muestra: línea, artículo, número de balanza, número de pasada, etapa, número de muestra, peso bruto, peso neto, peso ideal, mínimo, máximo, estado de validación, operario y hora.

---

## Administración (ABM)

Todas las entidades se dan de baja de forma lógica (campo `activo/inactivo`), nunca se eliminan físicamente.

**RF-23** — ABM de Rutas de pasada: nombre de artículo, descripción, estado, secuencia ordenada de etapas, parámetros por par `artículo-etapa` (peso ideal, mínimo, máximo, cantidad de muestras requeridas).

**RF-24** — ABM de Etapas: nombre, descripción, estado.

**RF-25** — ABM de Usuarios: nombre, rol, credenciales, estado activo/inactivo.

**RF-26** — ABM de Líneas de producción: nombre/número, balanza asociada.

**RF-27** — Alta de Muestras.
