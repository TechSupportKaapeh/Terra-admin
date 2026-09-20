import { useEffect, useRef, useState } from 'react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Label } from '@/components/ui/label'
import Selector from '@/components/Selector'
import DeslizadorDeMeses from '@/components/mapas/DeslizadorDeMeses'
import MapaRancho from '@/components/mapas/MapaRancho'
import { useCapa, useCapasDeRancho, useMetricasRancho, useParcelas } from '@/lib/useEntidades'
import { useMapToken } from '@/lib/useMapToken'
import { escalaDe } from '@/lib/indices'
import type { Rancho } from '@/lib/api'

/** Los cuatro índices de la receta `s2-mensual-v1`, en su orden. */
const OPCIONES_INDICE = ['ndvi', 'evi', 'ndre', 'ndmi'].map(i => ({
  value: i,
  label: i.toUpperCase(),
  detalle: `· ${escalaDe(i).que}`,
}))

/**
 * Panel lateral con el mapa mensual de un rancho. `rancho` null = cerrado.
 *
 * El contenido va con `key={rancho.id}`, como la bitácora y la serie: al abrir otro
 * rancho el índice y el mes arrancan de cero en vez de mostrar un instante el mapa del
 * anterior.
 */
export default function MapaRanchoSheet({ rancho, tenantId, onClose }: {
  rancho: Rancho | null
  tenantId: string
  onClose: () => void
}) {
  return (
    <Sheet open={rancho !== null} onOpenChange={abierto => { if (!abierto) onClose() }}>
      <SheetContent className="data-[side=right]:w-full data-[side=right]:sm:max-w-3xl">
        {rancho && <Mapa key={rancho.id} rancho={rancho} tenantId={tenantId} />}
      </SheetContent>
    </Sheet>
  )
}

function Mapa({ rancho, tenantId }: { rancho: Rancho; tenantId: string }) {
  const [indice, setIndice] = useState('ndvi')
  // null = "el más nuevo", que es donde arranca y adonde vuelve al cambiar de índice: un
  // índice puede tener otros meses, y quedarse en la posición 7 de otra lista no significa
  // nada. Derivar la posición en vez de corregirla en un efecto evita el render de más.
  const [posicion, setPosicion] = useState<number | null>(null)
  // La posición que ya pidió su capa. El deslizador se mueve al instante y el mapa la
  // alcanza 250 ms después: sin la pausa, arrastrarlo de punta a punta pide una capa por
  // mes. Es la misma pausa que usa el catálogo de Tiles.
  const [posicionConCapa, setPosicionConCapa] = useState<number | null>(null)
  const espera = useRef<number | null>(null)

  useEffect(() => () => { if (espera.current !== null) window.clearTimeout(espera.current) }, [])

  function irAMes(j: number) {
    setPosicion(j)
    if (espera.current !== null) window.clearTimeout(espera.current)
    espera.current = window.setTimeout(() => setPosicionConCapa(j), 250)
  }

  const { capas, error: errorCapas } = useCapasDeRancho(rancho.id, tenantId)
  const { parcelas } = useParcelas(rancho.id, tenantId)
  const { metricas, error: errorMetricas } = useMetricasRancho(rancho.id, tenantId, indice)
  const { token, error: errorToken } = useMapToken(true)

  // Los meses que este índice tiene, del más viejo al más nuevo. Un mes sin un píxel
  // limpio no tiene COG (worker `DECISIONS #51`), así que la lista tiene huecos a
  // propósito: son los meses que no se pueden mirar.
  const meses = (capas ?? [])
    .filter(c => c.product === indice)
    .sort((a, b) => a.acquiredTs.localeCompare(b.acquiredTs))
    .map(c => ({ id: c.id, mes: c.acquiredTs.slice(0, 7) }))

  // `i` es dónde está el deslizador; `elegido` es el mes que el mapa y la métrica están
  // mostrando, que durante un arrastre va un cuarto de segundo atrás.
  const i = posicion === null ? meses.length - 1 : Math.min(posicion, meses.length - 1)
  const conCapa = posicionConCapa === null ? meses.length - 1 : Math.min(posicionConCapa, meses.length - 1)
  const elegido = meses[conCapa]
  const { capa, error: errorCapa } = useCapa(elegido?.id ?? '')

  // La métrica del mes que se está mirando. Puede no estar: el rancho puede tener COG de
  // un mes en el que ninguna parcela llegó a la cobertura mínima.
  const metrica = metricas?.data.find(m => m.periodo === elegido?.mes)
  const error = errorCapas || errorCapa || errorMetricas || errorToken

  return (
    <>
      <SheetHeader className="gap-2 border-b pr-12">
        <SheetTitle>{rancho.name}</SheetTitle>
        <SheetDescription>
          Un mapa por mes y por índice, del pipeline mensual. Los meses que faltan son
          meses sin un solo píxel limpio: no tienen ráster.
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-6">
        <div className="flex flex-wrap items-end gap-4">
          <div className="w-40 space-y-1">
            <Label className="text-xs">Índice</Label>
            <Selector
              items={OPCIONES_INDICE}
              value={indice}
              onValueChange={v => { if (v) { setIndice(v); setPosicion(null); setPosicionConCapa(null) } }}
              className="w-full"
            />
          </div>

          {meses.length > 0 && (
            <div className="min-w-64 flex-1 space-y-1">
              <Label className="text-xs">Mes ({i + 1} de {meses.length})</Label>
              <DeslizadorDeMeses
                etiquetas={meses.map(m => m.mes)}
                posicion={i}
                onPosicion={irAMes}
                nombre="Mes del mapa"
              />
            </div>
          )}
        </div>

        {/* La métrica va **arriba del mapa y con la fracción del área al lado**: el
            promedio divide por el área con dato, no por la total (`DECISIONS #29` de
            Geocore), así que el número solo se puede leer mal. Un NDVI de 0,62 del 20 %
            del rancho no dice lo mismo que el mismo 0,62 del 95 %. */}
        {elegido && (
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-md border px-3 py-2">
            <span className="text-2xl font-semibold tabular-nums">
              {metrica?.valor != null ? metrica.valor.toFixed(3) : '—'}
            </span>
            <span className="text-sm text-muted-foreground">
              {indice.toUpperCase()} del rancho en {elegido.mes}, promedio de sus parcelas ponderado por área
            </span>
            <span className="w-full text-xs text-muted-foreground tabular-nums">
              {metrica
                ? `${(metrica.fraccionArea * 100).toFixed(0)} % del área con dato · ${metrica.parcelasConDato} de ${metricas?.parcelas ?? '—'} parcelas · ${metrica.areaConDatoHa.toFixed(1)} de ${metricas?.areaTotalHa.toFixed(1) ?? '—'} ha`
                : metricas
                  ? 'Ninguna parcela tuvo dato este mes: hay ráster del rancho, pero ninguna parcela llegó a la cobertura mínima de la receta.'
                  : 'Cargando la métrica…'}
            </span>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        {capas === null
          ? <p className="text-sm text-muted-foreground">Cargando las capas…</p>
          : meses.length === 0
            ? (
              <p className="text-sm text-muted-foreground">
                Este rancho no tiene ningún mapa de {indice.toUpperCase()}. O nunca se procesó, o
                ningún mes tuvo un píxel limpio.
              </p>
            )
            : (
              <MapaRancho
                rancho={rancho}
                parcelas={parcelas ?? []}
                capa={capa}
                indice={indice}
                token={token}
              />
            )}
      </div>
    </>
  )
}
