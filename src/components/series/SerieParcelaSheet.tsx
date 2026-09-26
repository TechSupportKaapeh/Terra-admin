import { useState } from 'react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Label } from '@/components/ui/label'
import Selector from '@/components/Selector'
import InterruptorCadencia from '@/components/series/InterruptorCadencia'
import SerieTemporal from '@/components/series/SerieTemporal'
import type { Cadencia } from '@/lib/api'
import { useSerie } from '@/lib/useEntidades'
import { escalaDe } from '@/lib/indices'
import { recetasDe } from '@/lib/serie'

/** Los cuatro índices de la receta. El orden es el de la receta, y no cambió en v2. */
const INDICES = ['ndvi', 'evi', 'ndre', 'ndmi']

const OPCIONES_INDICE = INDICES.map(i => ({
  value: i,
  label: i.toUpperCase(),
  detalle: `· ${escalaDe(i).que}`,
}))

/**
 * Panel lateral con la serie de una parcela. `parcela` null = cerrado.
 *
 * Es el mismo patrón que la bitácora de un proceso
 * ([`BitacoraJob`](../procesos/BitacoraJob.tsx)): el contenido va en un componente aparte
 * con `key={parcela.id}`, así al abrir otra parcela el índice elegido arranca de cero en
 * vez de mostrar un instante la serie de la anterior con el índice de la otra.
 */
export default function SerieParcelaSheet({ parcela, tenantId, onClose }: {
  parcela: { id: string; name: string } | null
  tenantId: string
  onClose: () => void
}) {
  return (
    <Sheet open={parcela !== null} onOpenChange={abierto => { if (!abierto) onClose() }}>
      <SheetContent className="data-[side=right]:w-full data-[side=right]:sm:max-w-3xl">
        {parcela && (
          <Serie key={parcela.id} parcelaId={parcela.id} nombre={parcela.name} tenantId={tenantId} />
        )}
      </SheetContent>
    </Sheet>
  )
}

/**
 * La cadencia arranca en `mensual`, que es también el default de la API.
 *
 * No es sólo consistencia: es la vista que se compara con lo que la gente ya vio los meses
 * anteriores, y la que no depende de cuántas pasadas limpias tuvo cada mes. La serie fina se
 * pide cuando se la quiere (`DECISIONS #48` de Geocore).
 */
function Serie({ parcelaId, nombre, tenantId }: { parcelaId: string; nombre: string; tenantId: string }) {
  const [indice, setIndice] = useState('ndvi')
  const [cadencia, setCadencia] = useState<Cadencia>('mensual')
  const { serie, error } = useSerie(parcelaId, tenantId, indice, cadencia)

  // Las recetas que produjeron lo que se está viendo. Más de una es el caso que la API
  // muestra a propósito: un mes reprocesado mezcla `s2-mensual-v1` (una fila por mes) con
  // `s2-pasada-v2` (una por pasada), y son dos mediciones distintas en el mismo punto.
  const recetas = serie ? [...new Set(serie.data.flatMap(f => recetasDe(f.receta)))].sort() : []

  return (
    <>
      <SheetHeader className="gap-2 border-b pr-12">
        <SheetTitle>{nombre}</SheetTitle>
        <SheetDescription>
          {cadencia === 'mensual'
            ? 'Un punto por mes: la mediana de las pasadas del mes, que la agrega la API.'
            : 'Un punto por pasada del satélite, con su fecha de adquisición. Es lo que el worker guarda desde s2-pasada-v2.'}
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-6">
        <div className="flex flex-wrap items-end gap-4">
          <div className="w-48 space-y-1">
            <Label className="text-xs">Índice</Label>
            {/* El índice no se limpia: siempre hay uno elegido, y `|| indice` deja el de
                antes si Base UI emite el vacío. */}
            <Selector
              items={OPCIONES_INDICE}
              value={indice}
              onValueChange={v => setIndice(v || indice)}
              className="w-full"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Cadencia</Label>
            <InterruptorCadencia value={cadencia} onValueChange={setCadencia} />
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {/* `serie` null es "todavía no llegó": mostrar el gráfico vacío diría "esta
            parcela no tiene mediciones", que es otra cosa. */}
        {serie === null
          ? <p className="text-sm text-muted-foreground">Cargando la serie…</p>
          : (
            <>
              {/* El techo de `limit` recortó la serie, y se lleva las mediciones MÁS
                  VIEJAS: lo que se ve es la ventana reciente y no la historia entera. Con
                  una parcela y un índice no debería pasar ni pidiendo por pasada, así que
                  si aparece es que algo creció más de lo previsto. */}
              {serie.truncado && (
                <p className="text-sm text-amber-700 dark:text-amber-500">
                  La serie llegó recortada en {serie.limit} filas: se ven las más recientes,
                  no todo el historial.
                </p>
              )}

              {/* Las recetas se nombran como llegan y no se explican una por una: el texto
                  tiene que seguir siendo verdad el día que aparezca una tercera. */}
              {recetas.length > 1 && (
                <p className="text-sm text-amber-700 dark:text-amber-500">
                  Esta serie mezcla filas de {recetas.length} recetas ({recetas.join(', ')}), y
                  cada receta mide distinto: no son el mismo dato calculado dos veces. Pasa en
                  los períodos que se reprocesaron con una receta nueva.
                </p>
              )}

              {/* La cadencia que se dibuja es la que la API dijo haber aplicado, no la del
                  interruptor: es la que describe las filas que llegaron. */}
              <SerieTemporal filas={serie.data} indice={indice} cadencia={serie.cadencia ?? cadencia} />
            </>
          )}
      </div>
    </>
  )
}
