/**
 * Chip de estado para el diagnóstico. El estado se codifica en la forma (punto +
 * texto) y no sólo en el color, para que se lea igual sin distinguir colores.
 *
 * Los valores son los que devuelve `GET /api/admin/diagnostico` y el
 * `/health/ready` del tileserver: ok · degradado · error · falta · sin_configurar.
 */
const COLOR: Record<string, string> = {
  ok: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  degradado: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  error: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  falta: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
}

export default function Estado({ estado }: { estado: string }) {
  const color = COLOR[estado] ?? 'bg-muted text-muted-foreground'
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-xs font-medium ${color}`}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {estado.replace('_', ' ')}
    </span>
  )
}
