# Proposal: Implementación de Entidades Core (Fase 2)

## Intent
Definir e implementar las entidades core de la base de datos (Usuario, LineaProduccion, Articulo, Marca, ArticuloMarca, Etapa, RutaPasadaEtapa) en TypeScript utilizando MikroORM v7, alineado a la versión 1.2 del modelo relacional. Esto sienta las bases del dominio y la persistencia para la lógica de pesaje.

## Scope

### In Scope
- Creación de archivos de entidades MikroORM con decoradores TypeScript en `src/models/`.
- Mapeo explícito de relaciones (1:N, N:M con entidad asociativa `ArticuloMarca`).
- Soporte para baja lógica (`activo` por defecto `true`).
- Columna `datos_adicionales` de tipo `jsonb` en `Muestra` (telemetría/sensores Raspberry Pi) y `Usuario` (preferencias/configuración del operario).
- Exportación unificada en `src/models/index.ts`.

### Out of Scope
- Implementación de controladores, servicios o lógica de negocio compleja de pesaje.
- Rutas de API y lógica de autenticación (JWT/sesiones).

## Capabilities

### New Capabilities
- `persistence-core`: Acceso fuertemente tipado a datos core del sistema de pesaje.
- `extensible-telemetry`: Almacenamiento flexible JSONB en muestras para integrar lecturas de sensores de la balanza/Raspberry Pi.

## Approach
Se implementará el **Enfoque de Decoradores de Entidades** directo sobre clases TypeScript en `src/models/` para aprovechar la auto-inferencia y validación de tipos en MikroORM v7. 
Para resolver la extensibilidad solicitada, se utilizará el tipo `jsonb` de PostgreSQL en:
1. `Muestra`: Campo `datos_adicionales` para telemetría estructurada, lecturas de sensores adicionales de la Raspberry Pi y observaciones extendidas.
2. `Usuario`: Campo `datos_adicionales` para almacenar preferencias locales y de interfaz del operario.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/models/Usuario.ts` | New | Entidad mapeada para la tabla `usuario` con campo `datos_adicionales` (`jsonb`). |
| `src/models/LineaProduccion.ts` | New | Entidad para `linea_produccion`. |
| `src/models/Articulo.ts` | New | Entidad para `articulo`. |
| `src/models/Marca.ts` | New | Entidad para `marca`. |
| `src/models/ArticuloMarca.ts` | New | Entidad asociativa explícita para la relación `articulo_marca`. |
| `src/models/Etapa.ts` | New | Entidad para `etapa`. |
| `src/models/RutaPasadaEtapa.ts` | New | Entidad para `ruta_pasada_etapa` mapeando decimales con precisión. |
| `src/models/index.ts` | New | Exportación unificada de entidades. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Conversión de decimales en JS | Med | Configurar `columnType: 'decimal(8,3)'` y mapear a tipo `number` en TS, validando precisión en deserialización. |
| Relaciones cíclicas en JSON | Low | Excluir relaciones bidireccionales en serialización por defecto mediante DTOs o `wrap().toJSON()`. |

## Rollback Plan
En caso de falla en el mapeo o regresión en pruebas, revertir los commits asociados a `src/models/` para regresar al estado limpio de Fase 1.

## Dependencies
- Configuración de base de datos PostgreSQL/MikroORM funcional (Fase 1).

## Success Criteria
- [ ] Las 7 entidades compilan sin errores en TypeScript.
- [ ] MikroORM SchemaGenerator genera el esquema correspondiente con columnas `jsonb` en base de datos.
- [ ] Los tests de conexión y carga de entidades pasan exitosamente.
