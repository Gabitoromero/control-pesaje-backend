# Proposal: Rediseño del Modelo de Rutas

## Intent
Reestructurar la relación entre artículos y rutas de pesaje para garantizar trazabilidad e integridad histórica ante eliminaciones de relaciones, usando baja lógica en lugar de borrado físico.

## Scope

### In Scope
- Crear entidad intermedia explícita `ArticuloRutaPasada` (tabla `articulo_ruta_pasada`).
- Implementar soft-delete (`activo: boolean`) en la tabla intermedia.
- Migraciones destructivas (drop/recreate) en desarrollo y staging local.
- Despliegue dockerizado simulado en servidor de staging.

### Out of Scope
- Migración de datos históricos existentes en producción.
- Cambios en offline sync para tablets/Raspberry.

## Capabilities
### New Capabilities
- `trazabilidad-rutas-articulos`: Auditoría e integridad histórica de qué artículos pertenecían a qué rutas en pesajes pasados.

### Modified Capabilities
- `gestion-rutas-articulos`: Modificación de asignaciones de artículos a rutas sin pérdida de histórico.

## Approach
- **Validación Opción A**: Uso de entidad intermedia `ArticuloRutaPasada`. Aunque eliminar un registro en N:M puro no rompe FK, el borrado físico destruye la auditoría. La baja lógica (`activo: boolean`) preserva qué artículos eran válidos bajo qué rutas en ejecuciones pasadas.
- **Migración**: Destructiva en desarrollo/staging (drop & recreate schemas) para agilizar tiempos.
- **Staging/Despliegue**: Simulación dockerizada en servidor de contenedores de staging.

## Affected Areas
| Area | Impact | Description |
|------|--------|-------------|
| `src/models/ArticuloRutaPasada.ts` | New | Entidad intermedia con soft delete |
| `src/models/Articulo.ts` | Modified | Relación OneToMany a `ArticuloRutaPasada` |
| `src/models/RutaPasada.ts` | Modified | Relación OneToMany a `ArticuloRutaPasada` |

## Risks
| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Pérdida de histórico por borrado físico accidental | Low | Configurar restricción a nivel ORM para prohibir borrados duros |

## Rollback Plan
Reversión mediante Git de los cambios en modelos y ejecución de `docker compose down -v` para restablecer el esquema limpio desde cero.

## Dependencies
- Servidor de staging con soporte Docker.

## Success Criteria
- [ ] Relación intermedia `ArticuloRutaPasada` persistida con campo `activo`.
- [ ] Desasociación de artículo-ruta se traduce en `activo = false` en DB.
- [ ] Contenedor de staging dockerizado levantado y verificado.
