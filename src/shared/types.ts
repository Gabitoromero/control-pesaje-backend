export const UsuarioRol = {
  OPERARIO: 'operario',
  JEFE: 'jefe',
  VISUALIZACION: 'visualizacion',
  ADMINISTRADOR: 'administrador',
} as const;

export type UsuarioRolType = typeof UsuarioRol[keyof typeof UsuarioRol];

export interface UsuarioMetadata {
  preferenciasInterfaz?: {
    tema?: 'claro' | 'oscuro';
    idioma?: 'es' | 'en';
  };
  configuracionBalanzaDefecto?: {
    estabilizacionMs?: number;
    taraDefecto?: number;
  };
}
