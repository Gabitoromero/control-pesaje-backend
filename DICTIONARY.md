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

### Marca
Identificador comercial asociado a un artículo. Un mismo artículo (producto base) puede producirse bajo distintas marcas. La relación es de muchos a muchos (N:M).

### Ruta de pasada (Configuración)
Plantilla que define la secuencia de etapas y los parámetros de pesaje específicos para cada par `artículo-etapa` (peso ideal, mínimo, máximo y cantidad de muestras requeridas). Se gestiona a través de la entidad `RutaPasadaEtapa`.

### Pasada (Ejecución)
Ejecución física y cronológica de la ruta configurada en la línea de producción. Una pasada vincula un operario con un artículo y (opcionalmente) una marca en una línea específica. El número de pasada es un contador autoincremental por artículo en esa línea que se resetea al cambiar de artículo.

### Muestra
Medición individual del peso neto capturada automáticamente por la balanza. Las muestras pueden ser parte de una `Pasada` o ser "al azar" (sin pasada vinculada). Cada muestra queda vinculada obligatoriamente a: usuario, timestamp, artículo, etapa y línea de producción.

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
| `operario` | Acceso a interfaz de planta: iniciar sus propias pasadas, registrar muestras en ellas, avanzar etapas, finalizar sus pasadas |
| `jefe` | Todo lo del operario + dashboard, reportes, algunos ABM |
| `visualizacion` | Solo lectura del resumen de líneas de producción |
| `administrador` | Acceso total. Reservado para el desarrollador |
