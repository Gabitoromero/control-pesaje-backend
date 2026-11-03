export const UsuarioRol = {
  OPERARIO: 'operario',
  JEFE: 'jefe',
  VISUALIZACION: 'visualizacion',
  ADMINISTRADOR: 'administrador',
} as const;

export type UsuarioRol = typeof UsuarioRol[keyof typeof UsuarioRol];

export const SectorUsuario = {
  OFICIALES: 'OF',
  SUPERVISORES: 'SU',
  CONTROL_CALIDAD: 'DD',
  MEJORA_CONTINUA: 'MC',
} as const;

export type SectorUsuario = typeof SectorUsuario[keyof typeof SectorUsuario];

export interface UsuarioMetadata {
  sector?: SectorUsuario;
  preferenciasInterfaz?: {
    tema?: 'claro' | 'oscuro';
    idioma?: 'es' | 'en';
  };
  configuracionBalanzaDefecto?: {
    estabilizacionMs?: number;
    taraDefecto?: number;
  };
}
