import { useEffect, useState } from 'react'
import {
  describeError, getEstimacionReproceso, reprocesar,
  type AlcanceReproceso, type EstimacionReproceso, type ResultadoReproceso,
} from '@/lib/api'
import {
  alcanceDe, espacioTotal, queSeEncola, rangoDeTamano, resumenDe, sePuedeConfirmar, tituloDe,
} from '@/lib/reproceso'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface Props {
  /**
   * Qué reprocesar. El llamador lo monta sólo cuando hay algo, **con `key={alcance.id}`**: la
   * estimación se pide al montar, y la `key` hace que otra entidad empiece de cero en vez de
   * mostrar un instante los números de la anterior.
   */
  alcance: AlcanceReproceso
  /** Se llama cuando el reproceso se encoló: el llamador recarga los procesos. */
  onEncolado: () => void
  onCerrar: () => void
}

/**
 * La confirmación del reproceso (M.9.7g): qué se va a rehacer, cuánto va a ocupar y qué ranchos
 * no van a entrar, **antes** de gastar cuota de GEE. Los números los calcula Geocore (`GET
 * …/reprocesar/estimacion`, `DECISIONS #64`); acá sólo se dibujan, con las cuentas de
 * `lib/reproceso.ts`.
 *
 * Mostrar el botón sólo a TerraAdmin es cosmético: lo que protege es la política de Geocore.
 */
export default function ReprocesarDialog({ alcance, onEncolado, onCerrar }: Props) {
  const [estimacion, setEstimacion] = useState<EstimacionReproceso | null>(null)
  const [resultado, setResultado] = useState<ResultadoReproceso | null>(null)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    let vivo = true
    getEstimacionReproceso(alcance)
      .then(e => { if (vivo) setEstimacion(e) })
      .catch(err => {
        const msg = describeError(err)
        if (vivo && msg) setError(msg)
      })
    return () => { vivo = false }
  }, [alcance])

  async function confirmar() {
    setEnviando(true)
    setError('')
    try {
      setResultado(await reprocesar(alcance))
      onEncolado()
    } catch (err) {
      const msg = describeError(err)
      if (msg) setError(msg)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog open onOpenChange={open => { if (!open) onCerrar() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{tituloDe(alcance)}</DialogTitle>
          <DialogDescription>
            {alcanceDe(alcance)} Se rehace todo con la receta vigente, y lo que ya estaba calculado
            para esos meses se reemplaza.
          </DialogDescription>
        </DialogHeader>

        {resultado ? (
          <p className="text-sm">{resumenDe(resultado)}</p>
        ) : estimacion === null ? (
          !error && <p className="text-sm text-muted-foreground">Calculando cuánto va a ocupar…</p>
        ) : (
          <Detalle e={estimacion} />
        )}

        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <DialogFooter>
          {resultado ? (
            <Button onClick={onCerrar}>Cerrar</Button>
          ) : (
            <>
              <Button variant="outline" onClick={onCerrar} disabled={enviando}>Cancelar</Button>
              <Button onClick={confirmar} disabled={!sePuedeConfirmar(estimacion) || enviando}>
                {enviando ? 'Encolando…' : 'Reprocesar'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Los números de la estimación, y los avisos que cambian la decisión. */
function Detalle({ e }: { e: EstimacionReproceso }) {
  return (
    <div className="space-y-3 text-sm">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="text-muted-foreground">Se encola</dt>
        <dd>{queSeEncola(e)}, {e.meses} meses cada uno</dd>
        <dt className="text-muted-foreground">Espacio</dt>
        <dd className="font-medium">{espacioTotal(e)}</dd>
        {e.ranchos > 0 && (
          <>
            <dt className="text-muted-foreground pl-3">mapas</dt>
            <dd>{rangoDeTamano(e.mbArchivosMinimo, e.mbArchivosMaximo)}</dd>
          </>
        )}
        {e.parcelas > 0 && (
          <>
            <dt className="text-muted-foreground pl-3">números</dt>
            <dd>{rangoDeTamano(e.mbBaseMinimo, e.mbBaseMaximo)}</dd>
          </>
        )}
      </dl>

      <p className="text-xs text-muted-foreground">
        Es un rango medido: cuánto ocupa un mes depende de cuántas pasadas del satélite tengan algo
        despejado, y eso se sabe recién al procesar.
      </p>

      {e.salteadas > 0 && (
        <p className="text-amber-700 dark:text-amber-500">
          {e.salteadas} ya {e.salteadas === 1 ? 'tiene' : 'tienen'} un alta en curso y no se
          {e.salteadas === 1 ? ' encola' : ' encolan'} de nuevo.
        </p>
      )}

      {e.demasiadoGrandes.length > 0 && (
        <p className="text-amber-700 dark:text-amber-500">
          {e.demasiadoGrandes.map(r => r.nombre).join(', ')}: el rectángulo que
          {e.demasiadoGrandes.length === 1 ? ' lo' : ' los'} envuelve pasa el máximo que Google
          Earth Engine deja bajar de una vez, así que sus mapas van a fallar. Sus parcelas sí se
          procesan.
        </p>
      )}

      {e.excedido && (
        <p className="text-destructive">
          Son {e.total} ranchos y parcelas, y el máximo por pedido es {e.maximo}. Pedilo rancho por
          rancho.
        </p>
      )}

      {!e.excedido && e.ranchos + e.parcelas === 0 && (
        <p className="text-muted-foreground">No hay nada para encolar.</p>
      )}
    </div>
  )
}
