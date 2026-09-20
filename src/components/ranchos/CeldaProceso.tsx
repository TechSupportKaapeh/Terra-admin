import EstadoJob from '@/components/procesos/EstadoJob'
import type { Proceso } from '@/lib/api'

/**
 * El estado del último procesamiento de un rancho o una parcela. Abre su bitácora;
 * `stopPropagation` para que en la tabla de ranchos no seleccione además la fila.
 * "—" = no hay job: la entidad se creó antes de que existiera el seguimiento, o
 * quedó fuera de los 200 procesos más recientes del tenant.
 */
export default function CeldaProceso({ proceso, onAbrir }: {
  proceso?: Proceso
  onAbrir: (id: string) => void
}) {
  if (!proceso) return <span className="text-xs text-muted-foreground">—</span>
  return (
    <button
      type="button"
      className="inline-flex items-center gap-2 rounded-md px-1 py-0.5 hover:bg-muted"
      title={proceso.ultimoEvento?.message ?? 'Ver bitácora'}
      onClick={e => { e.stopPropagation(); onAbrir(proceso.id) }}
    >
      <EstadoJob status={proceso.status} />
      {proceso.status !== 'completed' && (
        <span className="font-mono text-xs tabular-nums text-muted-foreground">{proceso.progress}%</span>
      )}
    </button>
  )
}
