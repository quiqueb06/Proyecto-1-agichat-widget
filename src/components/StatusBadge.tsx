export interface StatusBadgeProps {
  /** Texto a mostrar dentro del indicador. */
  label: string;
  /** Si es `true`, el indicador se muestra como conectado. */
  online?: boolean;
}

/**
 * Componente de ejemplo que valida el pipeline (lint, tests, cobertura, build).
 * Sirve de referencia para el estilo de componentes y tests del proyecto.
 */
export function StatusBadge({ label, online = false }: StatusBadgeProps) {
  return (
    <span
      role="status"
      data-online={online}
      aria-label={`${label}: ${online ? 'en línea' : 'desconectado'}`}
    >
      {online ? '●' : '○'} {label}
    </span>
  );
}
