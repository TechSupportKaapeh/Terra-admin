import { useState } from 'react'
import { getDiagnostico, describeError, type Diagnostico, type EstadoServicio } from '@/lib/api'
import { Button } from '@/components/ui/button'
import Estado from './Estado'

interface Check { name: string; status: string; detail: string; cause?: string }

/**
 * Lo que un servicio dijo de sí mismo. Cada uno contesta con su propio formato:
 * el tileserver manda `checks` (su `/health/ready`), el worker manda `inngest` y
 * `motivo` (su `/health`). Se muestra lo que haya, sin interpretarlo de más.
 */
function CuerpoDelServicio({ cuerpo }: { cuerpo: unknown }) {
  if (!cuerpo || typeof cuerpo !== 'object') return null
  const c = cuerpo as Record<string, unknown>

  if (Array.isArray(c.checks)) {
    return (
      <ul className="mt-2 space-y-1.5">
        {(c.checks as Check[]).map(k => (
          <li key={k.name} className="flex items-start gap-2 text-sm">
            <Estado estado={k.status} />
            <div className="min-w-0">
              <code className="text-xs">{k.name}</code>
              <p className="text-muted-foreground">{k.detail}</p>
              {k.cause && <p className="font-mono text-xs text-muted-foreground">causa: {k.cause}</p>}
            </div>
          </li>
        ))}
      </ul>
    )
  }

  const filas = Object.entries(c).filter(([k]) => k !== 'status')
  if (filas.length === 0) return null
  return (
    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
      {filas.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="font-mono text-xs text-muted-foreground">{k}</dt>
          <dd className="break-all">{String(v)}</dd>
        </div>
      ))}
    </dl>
  )
}

function Tarjeta({ titulo, s }: { titulo: string; s: EstadoServicio }) {
  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium">{titulo}</h3>
        <Estado estado={s.estado} />
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {s.detalle}
        {s.ms > 0 && <span className="tabular-nums"> · {s.ms} ms</span>}
      </p>
      <CuerpoDelServicio cuerpo={s.cuerpo} />
    </section>
  )
}

/**
 * Estado de la plataforma, pedido a Geocore. Geocore lo junta del lado del
 * servidor —sus bases, su configuración, el tileserver y el worker— y sólo se lo
 * da a TerraAdmin: la política vive en el backend, no en esta pantalla.
 *
 * No se corre solo al abrir la pestaña: le pega a todos los servicios y con uno
 * caído tarda hasta 8 s. Es una acción, y se ve como tal.
 */
export default function ServiciosPanel() {
  const [data, setData] = useState<Diagnostico | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function correr() {
    setCargando(true)
    setError(null)
    try {
      setData(await getDiagnostico())
    } catch (e) {
      const m = describeError(e)
      // Un 403 de la política llega sin cuerpo, y en HTTP/2 tampoco hay statusText:
      // el mensaje queda vacío. Se dice lo más probable en vez de mostrar nada.
      if (m !== null) setError(m || 'Geocore no devolvió detalle. Si fue un 403, tu usuario no es TerraAdmin.')
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-prose text-sm text-muted-foreground">
          Geocore consulta del lado del servidor sus dos bases, su configuración, el
          <code className="mx-1 text-xs">/health/ready</code>del tileserver y el
          <code className="mx-1 text-xs">/health</code>del worker. Nunca muestra secretos:
          de cada clave dice sólo si está.
        </p>
        <Button onClick={correr} disabled={cargando}>{cargando ? 'Consultando…' : 'Correr diagnóstico'}</Button>
      </div>

      {error && <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

      {data && (
        <>
          <p className="text-xs text-muted-foreground">
            Generado {new Date(data.generadoEn).toLocaleString()} · Geocore en <code>{data.geocore.entorno}</code>
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            <section className="rounded-lg border bg-card p-4">
              <h3 className="font-medium">Geocore</h3>
              <ul className="mt-2 space-y-1.5 text-sm">
                {data.geocore.bases.map(b => (
                  <li key={b.nombre} className="flex items-start gap-2">
                    <Estado estado={b.estado} />
                    <span>base <code className="text-xs">{b.nombre}</code>: {b.detalle}
                      {b.ms > 0 && <span className="tabular-nums text-muted-foreground"> · {b.ms} ms</span>}
                    </span>
                  </li>
                ))}
                {data.geocore.configuracion.map(c => (
                  <li key={c.clave} className="flex items-start gap-2">
                    <Estado estado={c.estado} />
                    <span><code className="text-xs">{c.clave}</code> <span className="text-muted-foreground">— {c.paraQue}</span></span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-sm">
                <span className="text-muted-foreground">Orígenes de CORS: </span>
                {data.geocore.corsOrigins.length
                  ? data.geocore.corsOrigins.map(o => <code key={o} className="mr-2 text-xs">{o}</code>)
                  : <span className="text-destructive">ninguno: el navegador bloquea todo pedido de un front.</span>}
              </p>
            </section>

            {data.servicios.map(s => <Tarjeta key={s.nombre} titulo={s.nombre} s={s} />)}
          </div>
        </>
      )}
    </div>
  )
}
