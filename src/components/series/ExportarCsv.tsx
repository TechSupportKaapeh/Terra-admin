import { useState } from 'react'
import { describeError, descargarCsvSerie, type Cadencia } from '@/lib/api'
import {
  nombreDeArchivo, OPCIONES_FORMATO, OPCIONES_INDICE_CSV, parametrosCsv, TODOS,
  type AlcanceCsv, type FormatoCsv,
} from '@/lib/exportarCsv'
import { Button } from '@/components/ui/button'
import Selector from '@/components/Selector'
import InterruptorCadencia from '@/components/series/InterruptorCadencia'

/**
 * Exportar la serie a CSV (Geocore `DECISIONS #65`): qué métricas, el formato y el botón.
 * Arranca en «Todos los índices»: es la regla del usuario, y el nombre del archivo dice cuál
 * si se elige uno solo.
 *
 * Con `cadencia` la toma de afuera —la serie de la parcela ya tiene su interruptor y se baja lo
 * que se ve—; sin ella muestra el suyo, para el rancho, donde no hay un gráfico al lado.
 *
 * La descarga es un `fetch` con el token y un link temporal al blob: un `<a href>` a la API no
 * llevaría el `Authorization`.
 */
export default function ExportarCsv({ alcance, tenantId, cadencia: deAfuera }: {
  alcance: AlcanceCsv
  tenantId: string
  cadencia?: Cadencia
}) {
  const [indice, setIndice] = useState(TODOS)
  const [formato, setFormato] = useState<FormatoCsv>('excel')
  const [propia, setPropia] = useState<Cadencia>('mensual')
  const [bajando, setBajando] = useState(false)
  const [aviso, setAviso] = useState('')
  const [error, setError] = useState('')
  const cadencia = deAfuera ?? propia

  async function exportar() {
    setBajando(true)
    setError('')
    setAviso('')
    try {
      const { archivo, truncado } = await descargarCsvSerie(parametrosCsv(alcance, cadencia, formato, indice), tenantId)
      const url = URL.createObjectURL(archivo)
      const a = document.createElement('a')
      a.href = url
      a.download = nombreDeArchivo(alcance, cadencia, new Date(), indice)
      a.click()
      // Se libera después de un momento: revocarlo en el acto corta la descarga en algunos
      // navegadores, que leen el blob después del click.
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      if (truncado) setAviso('El archivo llegó recortado en 50.000 filas: faltan las mediciones más viejas.')
    } catch (err) {
      const msg = describeError(err)
      if (msg) setError(msg)
    } finally {
      setBajando(false)
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        {deAfuera === undefined && <InterruptorCadencia value={propia} onValueChange={setPropia} />}
        <Selector
          items={OPCIONES_INDICE_CSV}
          value={indice}
          onValueChange={v => setIndice(v || indice)}
          className="w-44"
        />
        <Selector
          items={OPCIONES_FORMATO}
          value={formato}
          // Siempre hay un formato: `|| formato` deja el de antes si Base UI emite el vacío.
          onValueChange={v => setFormato((v || formato) as FormatoCsv)}
          className="w-36"
        />
        <Button variant="outline" size="sm" onClick={exportar} disabled={bajando}>
          {bajando ? 'Exportando…' : 'Exportar CSV'}
        </Button>
      </div>
      {aviso && <p className="text-xs text-amber-700 dark:text-amber-500">{aviso}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
