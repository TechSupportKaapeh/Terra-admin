import { useEffect, useState } from 'react'
import { describeError, getProceso, type DetalleProceso, type EventoProceso } from '@/lib/api'
import { alerta, datosDeEvento, duracionDe, entidad, esActivo, etiquetaTipo, hace, hora } from '@/lib/procesos'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import EstadoJob, { Avance } from '@/components/procesos/EstadoJob'

const REFRESCO_MS = 4000

/**
 * Panel lateral con la bitácora de un job. `jobId` null = cerrado.
 *
 * El contenido va en un componente aparte con `key={jobId}`: al abrir otro job el
 * estado arranca de cero, en vez de mostrar un instante la bitácora del anterior.
 */
export default function BitacoraSheet({ jobId, onClose }: { jobId: string | null; onClose: () => void }) {
  return (
    <Sheet open={jobId !== null} onOpenChange={abierto => { if (!abierto) onClose() }}>
      <SheetContent className="data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
        {jobId && <Bitacora key={jobId} jobId={jobId} />}
      </SheetContent>
    </Sheet>
  )
}

const BORDE: Record<string, string> = {
  info: 'border-border',
  warning: 'border-amber-500',
  error: 'border-red-500',
}

function Bitacora({ jobId }: { jobId: string }) {
  const [detalle, setDetalle] = useState<DetalleProceso | null>(null)
  const [error, setError] = useState('')
  const [ahora, setAhora] = useState(0)

  // Se vuelve a pedir sola mientras el job siga en cola o procesando.
  useEffect(() => {
    let vivo = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const cargar = async () => {
      try {
        const d = await getProceso(jobId)
        if (!vivo) return
        setDetalle(d)
        setError('')
        setAhora(Date.now())
        if (esActivo(d.job.status)) timer = setTimeout(cargar, REFRESCO_MS)
      } catch (err) {
        if (!vivo) return
        const msg = describeError(err)
        if (msg) setError(msg)
      }
    }
    cargar()
    return () => { vivo = false; clearTimeout(timer) }
  }, [jobId])

  if (!detalle) {
    return (
      <SheetHeader>
        <SheetTitle>Bitácora</SheetTitle>
        <SheetDescription>{error || 'Cargando…'}</SheetDescription>
      </SheetHeader>
    )
  }

  const { job, eventos } = detalle
  const aviso = alerta(job, ahora)
  const dura = duracionDe(job, ahora)

  return (
    <>
      <SheetHeader className="gap-2 border-b pr-12">
        <SheetTitle>{etiquetaTipo(job.requestType)}</SheetTitle>
        <SheetDescription>
          {entidad(job)}{job.tenantNombre ? ` — ${job.tenantNombre}` : ''}
        </SheetDescription>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <EstadoJob status={job.status} />
          <div className="flex-1"><Avance progress={job.progress} status={job.status} /></div>
        </div>
        <p className="text-xs text-muted-foreground">
          Creado {hace(job.createdAt, ahora)}
          {dura && ` · ${job.finishedAt ? 'tardó' : 'lleva'} ${dura}`}
          {job.intentos && job.intentos > 1 && ` · ${job.intentos} intentos`}
          {esActivo(job.status) && ' · se actualiza solo'}
        </p>
      </SheetHeader>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-6">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {aviso && (
          <div className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
            {aviso}
          </div>
        )}
        {job.status === 'failed' && job.errorMessage && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <p className="font-medium">Por qué falló</p>
            <p className="mt-0.5 break-words font-mono text-xs">{job.errorMessage}</p>
          </div>
        )}

        {eventos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todavía no hay líneas en la bitácora.
            {job.startedAt && ' El worker ya lo arrancó, así que si esto sigue vacío falta aplicar la migración ProcessingJobEvents en la base de GeoData.'}
          </p>
        ) : (
          <ol className="space-y-3">
            {eventos.map((e, i) => (
              <Linea key={e.id} evento={e} nuevoIntento={i > 0 && e.attempt !== eventos[i - 1].attempt} />
            ))}
          </ol>
        )}
      </div>
    </>
  )
}

function Linea({ evento: e, nuevoIntento }: { evento: EventoProceso; nuevoIntento: boolean }) {
  const datos = datosDeEvento(e)
  return (
    <li>
      {nuevoIntento && (
        <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Intento {e.attempt}</p>
      )}
      <div className={`border-l-2 pl-3 ${BORDE[e.level] ?? BORDE.info}`}>
        <div className="flex items-baseline gap-2 text-xs text-muted-foreground">
          <span className="font-mono tabular-nums">{hora(e.createdAt)}</span>
          <span className="truncate font-mono">{e.stage}</span>
          {e.level === 'warning' && <span className="font-medium text-amber-700 dark:text-amber-400">reintento</span>}
          {e.level === 'error' && <span className="font-medium text-red-700 dark:text-red-400">error</span>}
        </div>
        <p className={`text-sm ${e.level === 'error' ? 'text-red-700 dark:text-red-400' : ''}`}>{e.message}</p>
        {datos.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {datos.map(d => (
              <span key={d} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] tabular-nums">{d}</span>
            ))}
          </div>
        )}
      </div>
    </li>
  )
}
