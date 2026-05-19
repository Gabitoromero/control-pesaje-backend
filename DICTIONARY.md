# Diccionario del Dominio

Este glosario define los términos del negocio utilizados en todo el sistema. Es la fuente de verdad para nombres de entidades, variables y conceptos en el código.

---

## Entidades principales

### Artículo
Producto final que se fabrica en planta. Todo artículo atraviesa distintas etapas (procesos intermedios) antes de convertirse en producto final.

### Línea de producción
Entorno físico y logístico dedicado a la fabricación de un artículo. La planta cuenta con ~13 líneas, de las cuales 9 operan de forma constante. Cada línea tiene **una balanza** y **una Raspberry Pi** asociadas de forma fija.

> En el sistema, una balanza = una línea de producción.

### Etapa
Proceso de producción para llegar a un producto intermedio del producto final. En cada etapa el producto consume o incorpora algo (ej: crema, cobertura, crocante mix). Una misma etapa puede formar parte de la ruta de pasada de uno o varios artículos. En cada etapa se toman una o varias **muestras**.

### Ruta de pasada
Definición teórica y secuencial de los controles de pesaje que un artículo debe cumplir a lo largo de sus etapas de producción. Cada artículo tiene su propia ruta de pasada. Cada par `artículo-etapa` tiene parámetros de pesaje propios: peso ideal, mínimo y máximo.

### Pasada
Ejecución física y cronológica de la ruta de pasada en la línea de producción, de inicio a fin. Una pasada puede estar **en curso** o **completa**. Pueden coexistir múltiples pasadas simultáneas en una misma línea para el mismo artículo.

> El número de pasada es un contador autoincremental por línea por día. Se resetea al asignar un nuevo artículo a la línea.

### Muestra
Medición individual del peso de un artículo en una etapa determinada, dentro de una pasada determinada. Cada muestra queda vinculada a: usuario, hora exacta, etapa, balanza y número de pasada. El peso es capturado automáticamente por la balanza via Raspberry Pi.

### Tara
Peso del recipiente utilizado para transportar la muestra a la balanza. Se mide una vez por etapa por pasada, antes de pesar las muestras. **No se registra en el sistema.** El operario configura la tara directamente en la balanza KRETZ; el peso que llega al sistema es siempre el peso **neto**.

### Puesta a punto
Etapa previa al inicio de la producción en la que los operarios configuran las máquinas. Las balanzas se usan con frecuencia durante este período, pero **NO se deben registrar pesajes**. El sistema detecta este estado por la ausencia de sesión activa de un operario en la tablet.

---

## Estados

| Entidad | Estado | Descripción |
|---------|--------|-------------|
| Pasada | `en_curso` | Iniciada pero con etapas pendientes |
| Pasada | `completa` | Todas las etapas finalizadas y confirmadas |
| Muestra | `ok` | Peso neto dentro del rango mínimo-máximo |
| Muestra | `fuera_de_rango` | Peso neto por debajo del mínimo o por encima del máximo |
| Usuario / Etapa / Artículo / Línea | `activo` | Operativo en el sistema |
| Usuario / Etapa / Artículo / Línea | `inactivo` | Dado de baja lógica, no se elimina físicamente |

---

## Roles

| Rol | Descripción |
|-----|-------------|
| `operario` | Acceso a interfaz de planta: iniciar/retomar pasadas, registrar muestras, avanzar etapas, finalizar pasadas |
| `jefe` | Todo lo del operario + dashboard, reportes, algunos ABM |
| `visualizacion` | Solo lectura del resumen de líneas de producción |
| `administrador` | Acceso total. Reservado para el desarrollador |
