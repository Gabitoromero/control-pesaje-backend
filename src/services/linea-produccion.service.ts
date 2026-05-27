import { BaseService } from './base.service.js';
import { LineaProduccion } from '../models/LineaProduccion.js';

export class LineaProduccionService extends BaseService<LineaProduccion> {
  constructor() {
    super(LineaProduccion);
  }

  // No restrict needed — no active children in current model
}
