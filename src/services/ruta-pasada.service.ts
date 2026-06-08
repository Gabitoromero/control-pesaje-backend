import { BaseService } from './base.service.js';
import { RutaPasada } from '../models/RutaPasada.js';

export class RutaPasadaService extends BaseService<RutaPasada> {
  constructor() {
    super(RutaPasada);
  }
}
