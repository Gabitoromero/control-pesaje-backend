import { BaseService } from './base.service.js';
import { RutaPasadaEtapa } from '../models/RutaPasadaEtapa.js';

export class RutaPasadaEtapaService extends BaseService<RutaPasadaEtapa> {
  constructor() {
    super(RutaPasadaEtapa);
  }

  // Leaf entity — no restrict needed
}
