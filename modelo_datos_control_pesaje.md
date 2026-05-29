# Modelo de datos — Control de Pesaje
**MaciaSoft | Versión 1.2**

---

## Convenciones

- 🔑 **PK** — clave primaria
- 🔗 **FK** — clave foránea
- ⚪ **NULLABLE** — campo opcional

---

## Tablas

### usuario

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---------------|-------------|
| 🔑 id | INT | PK, AUTO_INCREMENT | Identificador único del usuario |
| nombre_apellido | VARCHAR(100) | NOT NULL | Nombre completo del operario o supervisor |
| nombre_usuario | VARCHAR(50) | NOT NULL, UNIQUE | Nombre de usuario para login |
| password_hash | VARCHAR(255) | NOT NULL | Contraseña hasheada |
| rol | ENUM | NOT NULL | `operario` \| `jefe` \| `visualizacion` \| `administrador` |
| activo | BOOLEAN | NOT NULL, DEFAULT true | Baja lógica. Nunca se elimina físicamente |

---

### linea_produccion

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---------------|-------------|
| 🔑 id | INT | PK, AUTO_INCREMENT | Identificador único de la línea |
| nombre | VARCHAR(100) | NOT NULL | Nombre o número descriptivo de la línea |
| numero_balanza | INT | NOT NULL, UNIQUE | Número de la balanza asociada. Una balanza = una línea |
| activo | BOOLEAN | NOT NULL, DEFAULT true | Baja lógica |

---

### articulo

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---------------|-------------|
| 🔑 id | INT | PK, AUTO_INCREMENT | Identificador único del artículo |
| nombre | VARCHAR(100) | NOT NULL | Nombre del producto base (ej: palito-bombon). Independiente de la marca final |
| descripcion | TEXT | ⚪ NULLABLE | Descripción opcional del artículo |
| activo | BOOLEAN | NOT NULL, DEFAULT true | Baja lógica |

---

### marca

Una marca puede estar asociada a muchos artículos, y un artículo puede tener muchas marcas. La relación se gestiona a través de `articulo_marca`.

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---------------|-------------|
| 🔑 id | INT | PK, AUTO_INCREMENT | Identificador único de la marca |
| nombre | VARCHAR(100) | NOT NULL, UNIQUE | Nombre de la marca (ej: marca A, marca B) |
| activo | BOOLEAN | NOT NULL, DEFAULT true | Baja lógica |

---

### articulo_marca

Tabla intermedia N:M entre artículo y marca. Define qué marcas son válidas para cada artículo.

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---------------|-------------|
| 🔑 id | INT | PK, AUTO_INCREMENT | Identificador único del registro |
| 🔗 articulo_id | INT | FK → articulo.id, NOT NULL | Artículo base |
| 🔗 marca_id | INT | FK → marca.id, NOT NULL | Marca asociada al artículo |
| UNIQUE | | (articulo_id, marca_id) | No se puede repetir la misma combinación |

---

### etapa

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---------------|-------------|
| 🔑 id | INT | PK, AUTO_INCREMENT | Identificador único de la etapa |
| nombre | VARCHAR(100) | NOT NULL | Nombre del proceso (ej: cobertura, crocante mix) |
| descripcion | TEXT | ⚪ NULLABLE | Descripción opcional del proceso |
| activo | BOOLEAN | NOT NULL, DEFAULT true | Baja lógica |

---

### ruta_pasada_etapa

Plantilla de la pasada. Define la secuencia de etapas de un artículo y los parámetros de pesaje para cada par artículo-etapa.

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---------------|-------------|
| 🔑 id | INT | PK, AUTO_INCREMENT | Identificador único del registro |
| 🔗 articulo_id | INT | FK → articulo.id, NOT NULL | Artículo base al que pertenece esta configuración |
| 🔗 etapa_id | INT | FK → etapa.id, NOT NULL | Etapa configurada para este artículo |
| orden | INT | NOT NULL | Posición secuencial de la etapa dentro de la ruta del artículo |
| peso_ideal | DECIMAL(8,3) | NOT NULL | Peso objetivo de la muestra en esta etapa (gramos) |
| peso_minimo | DECIMAL(8,3) | NOT NULL | Límite inferior aceptable. La tolerancia no es simétrica |
| peso_maximo | DECIMAL(8,3) | NOT NULL | Límite superior aceptable |
| cantidad_muestras_requeridas | INT | NOT NULL | Muestras aceptables requeridas para completar la etapa |
| UNIQUE | | (articulo_id, etapa_id) | Un artículo no puede tener la misma etapa dos veces |

---

### pasada

Ejecución física de la ruta de pasada. Puede haber múltiples pasadas simultáneas para la misma línea y artículo.

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---------------|-------------|
| 🔑 id | INT | PK, AUTO_INCREMENT | Identificador único de la pasada |
| 🔗 linea_produccion_id | INT | FK → linea_produccion.id, NOT NULL | Línea donde se ejecuta la pasada |
| 🔗 articulo_id | INT | FK → articulo.id, NOT NULL | Artículo base que se está produciendo |
| 🔗 marca_id | INT | ⚪ FK → marca.id, NULLABLE | Marca de destino opcional. NULL si no se especifica |
| 🔗 usuario_id | INT | FK → usuario.id, NOT NULL | Operario responsable. Se asigna al iniciar y no cambia |
| numero | INT | NOT NULL | Contador autoincremental por artículo en esa línea. Se resetea al cambiar de artículo |
| estado | ENUM | NOT NULL, DEFAULT 'en_curso' | `en_curso` \| `completa` |
| hora_inicio | DATETIME | NOT NULL | Timestamp de inicio de la pasada |
| hora_cierre | DATETIME | ⚪ NULLABLE | Se completa al finalizar. NULL si está en curso |
| CHECK | | articulo_marca(articulo_id, marca_id) existe | Cuando marca_id no es NULL, la combinación artículo-marca debe existir en articulo_marca |

---

### muestra

Medición individual de peso. Siempre tiene usuario, artículo, etapa y línea. La pasada es el único campo opcional (NULL en muestras al azar).

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---------------|-------------|
| 🔑 id | INT | PK, AUTO_INCREMENT | Identificador único de la muestra |
| 🔗 pasada_id | INT | ⚪ FK → pasada.id, NULLABLE | NULL cuando es muestra al azar. Presente en muestras normales |
| 🔗 usuario_id | INT | FK → usuario.id, NOT NULL | Siempre presente. Debe coincidir con el usuario_id de la pasada asociada (RN-12) |
| 🔗 articulo_id | INT | FK → articulo.id, NOT NULL | Siempre presente. En muestras de pasada se copia desde pasada.articulo_id |
| 🔗 etapa_id | INT | FK → etapa.id, NOT NULL | Etapa en la que se tomó la muestra |
| 🔗 linea_produccion_id | INT | FK → linea_produccion.id, NOT NULL | Línea donde se capturó el peso |
| peso_neto | DECIMAL(8,3) | NOT NULL | Peso registrado. Siempre neto (la tara la configura el operario en la balanza) |
| estado_validacion | ENUM | NOT NULL | `ok` \| `fuera_de_rango`. Se calcula contra ruta_pasada_etapa (articulo_id + etapa_id) |
| observacion | TEXT | ⚪ NULLABLE | Nota opcional del operario (ej: temperatura del chocolate) |
| timestamp | DATETIME | NOT NULL | Momento exacto del registro. Clave para trazabilidad (RN-17) |
| CHECK | | pasada.articulo_id = muestra.articulo_id | Cuando pasada_id no es NULL, el artículo debe coincidir con el de la pasada |

---

## Relaciones entre tablas

| Tabla origen | Campo | Referencia | Cardinalidad | Nullable |
|--------------|-------|------------|:------------:|:--------:|
| articulo_marca | articulo_id | articulo.id | N:1 | No |
| articulo_marca | marca_id | marca.id | N:1 | No |
| ruta_pasada_etapa | articulo_id | articulo.id | N:1 | No |
| ruta_pasada_etapa | etapa_id | etapa.id | N:1 | No |
| pasada | linea_produccion_id | linea_produccion.id | N:1 | No |
| pasada | articulo_id | articulo.id | N:1 | No |
| pasada | marca_id | marca.id | N:1 | Sí (opcional) |
| pasada | usuario_id | usuario.id | N:1 | No |
| muestra | pasada_id | pasada.id | N:1 | Sí (muestra al azar) |
| muestra | usuario_id | usuario.id | N:1 | No |
| muestra | articulo_id | articulo.id | N:1 | No |
| muestra | etapa_id | etapa.id | N:1 | No |
| muestra | linea_produccion_id | linea_produccion.id | N:1 | No |
