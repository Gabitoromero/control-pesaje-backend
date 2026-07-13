// HARD-DELETE EXCEPTION (approved): decommissioned devices are physically
// removed via DELETE /dispositivos/:id. Do NOT convert this to soft-delete
// (activo: false) — see backend/CLAUDE.md "Baja Lógica" for the documented
// rationale (decommissioned hardware must be fully forgettable).
import { Entity, OneToOne, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy';
import { LineaProduccion } from './LineaProduccion.js';

@Entity({ tableName: 'dispositivo' })
export class Dispositivo {
  @PrimaryKey({ type: 'string', length: 255 })
  hardwareId!: string;

  @Property({ type: 'string', length: 100 })
  @Unique()
  nombre!: string;

  @OneToOne(() => LineaProduccion, linea => linea.dispositivo)
  lineaProduccion?: LineaProduccion;

  @Property({ type: 'datetime', nullable: true })
  ultimaConexionAt?: Date | null;

}
