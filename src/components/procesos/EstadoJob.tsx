import { ESTADOS } from '@/lib/procesos'

/**
 * Chip del estado de un job. Como en el diagnóstico, el estado va en la forma
 * (punto + texto) y no sólo en el color; el punto late mientras procesa.
 */
const COLOR: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  running: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  completed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  failed: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
}

export default function EstadoJob({ status }: { status: string }) {
  const color = COLOR[status] ?? 'bg-muted text-muted-foreground'
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-xs font-medium ${color}`}>
      <span className={`size-1.5 rounded-full bg-current ${status === 'running' ? 'animate-pulse motion-reduce:animate-none' : ''}`} aria-hidden />
      {ESTADOS[status] ?? status}
    </span>
  )
}

/** Barra de avance (0–100, lo que escribe el worker en `processing_jobs.progress`). */
export function Avance({ progress, status }: { progress: number; status: string }) {
  const valor = Math.min(100, Math.max(0, progress))
  const color = status === 'failed' ? 'bg-red-500' : status === 'completed' ? 'bg-emerald-500' : 'bg-sky-500'
  return (
    <div className="flex min-w-28 items-center gap-2">
      <div
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={valor}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={`h-full ${color} transition-[width] duration-500`} style={{ width: `${valor}%` }} />
      </div>
      <span className="w-9 text-right font-mono text-xs tabular-nums text-muted-foreground">{valor}%</span>
    </div>
  )
}
