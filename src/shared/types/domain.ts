export type EstadoValidacion = 'ok' | 'fuera_de_rango' | 'descartado';
export type EstadoPasada = 'en_curso' | 'completa' | 'abortada';

export interface Muestra {
  id?: number;
  peso_neto: number;
  estado_validacion: EstadoValidacion;
  usuario_id: number;
  etapa_id: number;
  linea_produccion_id: number;
  articulo_id?: number;
  timestamp: Date;
}

export interface RutaPasadaEtapa {
  etapa_id: number;
  nombre: string;
  peso_minimo: number;
  peso_maximo: number;
  peso_ideal: number;
  cantidad_muestras_requeridas: number;
}
