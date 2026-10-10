import { useEffect, useMemo, useRef, useState } from 'react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Label } from '@/components/ui/label'
import Selector from '@/components/Selector'
import DeslizadorDeMeses from '@/components/mapas/DeslizadorDeMeses'
import MapaRancho from '@/components/mapas/MapaRancho'
import InterruptorCadencia from '@/components/series/InterruptorCadencia'
import ExportarCsv from '@/components/series/ExportarCsv'
import { useCapa, useCapasDeRancho, useMetricasRancho, useParcelas } from '@/lib/useEntidades'
import { useMapToken } from '@/lib/useMapToken'
import { COLOR_REAL, escalaDe, esColorReal, INDICES } from '@/lib/indices'
import {
  COBERTURA_MINIMA_MAPA, SALTO_DUDOSO, fechasDelMapa, tieneModo, ultimaBuena,
} from '@/lib/mapaRancho'
import { LIMITE_CAPAS_RANCHO, recortado } from '@/lib/capas'
import type { Cadencia, Rancho } from '@/lib/api'

/** Los índices de la receta (`INDICES`, en su orden) y el color real si el rancho lo tiene. */
const OPCION_COLOR_REAL = { value: COLOR_REAL, label: 'Color real', detalle: '· rojo, verde y azul' }
const OPCIONES_INDICE = INDICES.map(i => ({
  value: i,
  label: i.toUpperCase(),
  detalle: `· ${escalaDe(i).que}`,
}))

/** Lo que dice cada botón del interruptor en el mapa (M.9.7f). */
const AYUDAS_DEL_MAPA = {
  mensual: 'El compuesto del mes: la mediana por píxel de todas sus pasadas limpias.',
  pasada: 'Cada pasada del satélite tal como se vio, con la fracción del rancho a la vista.',
}

/**
 * Panel lateral con el mapa de un rancho, por mes o por pasada (M.9.7f). `rancho` null =
 * cerrado.
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
  // null = "el que corresponde": por pasada si el rancho tiene pasadas (receta v3), el mes
  // si no. Derivado y no corregido en un efecto, como la posición.
  const [modoElegido, setModoElegido] = useState<Cadencia | null>(null)
  // Por pasada, las que tapan más del mínimo se ofrecen sólo a pedido (d37).
  const [todas, setTodas] = useState(false)
  // null = "la de arranque": la última imagen buena por pasada, el mes más nuevo en el
  // mensual. Vuelve a null al cambiar de índice o de modo, porque la posición 7 de otra
  // lista no significa nada.
  const [posicion, setPosicion] = useState<number | null>(null)
  // La posición que ya pidió su capa. El deslizador se mueve al instante y el mapa la
  // alcanza 250 ms después: sin la pausa, arrastrarlo de punta a punta pide una capa por
  // fecha. Es la misma pausa que usa el catálogo de Tiles.
  const [posicionConCapa, setPosicionConCapa] = useState<number | null>(null)
  const espera = useRef<number | null>(null)

  useEffect(() => () => { if (espera.current !== null) window.clearTimeout(espera.current) }, [])

  function irA(j: number) {
    setPosicion(j)
    if (espera.current !== null) window.clearTimeout(espera.current)
    espera.current = window.setTimeout(() => setPosicionConCapa(j), 250)
  }

  function volverAlArranque() {
    setPosicion(null)
    setPosicionConCapa(null)
  }

  const { capas, error: errorCapas } = useCapasDeRancho(rancho.id, tenantId)
  const { parcelas } = useParcelas(rancho.id, tenantId)
  const { token, error: errorToken } = useMapToken(tenantId, true)

  const tienePasadas = tieneModo(capas ?? [], 'pasada')
  const modo: Cadencia = modoElegido ?? (tienePasadas ? 'pasada' : 'mensual')
  const colorReal = esColorReal(indice)
  const { metricas, error: errorMetricas } = useMetricasRancho(rancho.id, tenantId, colorReal ? '' : indice)
  const opciones = (capas ?? []).some(c => esColorReal(c.product))
    ? [...OPCIONES_INDICE, OPCION_COLOR_REAL]
    : OPCIONES_INDICE

  // Las fechas que este índice tiene en este modo, de la más vieja a la más nueva. Un mes
  // sin un píxel limpio no tiene COG (worker `DECISIONS #51`), así que el mensual tiene
  // huecos a propósito. El color real se marca como dudoso con el NDVI de su pasada.
  // Memorizadas: el deslizador re-renderiza en cada paso, y un rancho con v3 son miles de
  // capas que filtrar y ordenar.
  const fechas = useMemo(
    () => fechasDelMapa(capas ?? [], indice, modo, { todas, referencia: colorReal ? 'ndvi' : undefined }),
    [capas, indice, modo, todas, colorReal],
  )
  const escondidas = useMemo(
    () => modo === 'pasada' && !todas
      ? fechasDelMapa(capas ?? [], indice, 'pasada', { todas: true }).length - fechas.length
      : 0,
    [capas, indice, modo, todas, fechas.length],
  )
  const arranque = modo === 'pasada' ? ultimaBuena(fechas) : fechas.length - 1

  // `i` es dónde está el deslizador; `elegida` es la fecha que el mapa está mostrando, que
  // durante un arrastre va un cuarto de segundo atrás.
  const i = posicion === null ? arranque : Math.min(posicion, fechas.length - 1)
  const conCapa = posicionConCapa === null ? arranque : Math.min(posicionConCapa, fechas.length - 1)
  const elegida = fechas[conCapa]
  const { capa, error: errorCapa } = useCapa(elegida?.id ?? '')

  // La métrica ponderada por área es mensual: sale de las parcelas, no del ráster.
  const metrica = modo === 'mensual' ? metricas?.data.find(m => m.periodo === elegida?.etiqueta) : undefined
  const error = errorCapas || errorCapa || (modo === 'mensual' && !colorReal ? errorMetricas : null) || errorToken

  return (
    <>
      <SheetHeader className="gap-2 border-b pr-12">
        <SheetTitle>{rancho.name}</SheetTitle>
        <SheetDescription>
          {modo === 'mensual'
            ? 'Un mapa por mes y por índice: el compuesto de las pasadas limpias del mes. Los meses que faltan no tuvieron un solo píxel limpio.'
            : 'Un mapa por pasada del satélite, tal como se vio. Se guarda toda pasada con algún píxel despejado en el rancho; las que tapan más del 70 % se muestran a pedido.'}
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-6">
        {/* Las series de todas las parcelas del rancho (Geocore `DECISIONS #65`). Van acá, donde se
            miran los datos del rancho, y no debajo de su geometría en la tabla (pedido del usuario,
            2026-10-04). */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
          <span className="text-xs text-muted-foreground">Las series de todas las parcelas de {rancho.name}</span>
          <ExportarCsv alcance={{ tipo: 'rancho', id: rancho.id, nombre: rancho.name }} tenantId={tenantId} />
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div className="w-40 space-y-1">
            <Label className="text-xs">Índice</Label>
            <Selector
              items={opciones}
              value={indice}
              onValueChange={v => { if (v) { setIndice(v); volverAlArranque() } }}
              className="w-full"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Imagen</Label>
            <InterruptorCadencia
              nombre="Qué imagen mostrar"
              value={modo}
              onValueChange={m => { setModoElegido(m); volverAlArranque() }}
              ayudas={AYUDAS_DEL_MAPA}
              deshabilitada={tienePasadas ? undefined : {
                value: 'pasada',
                porque: 'Este rancho todavía no tiene mapas por pasada: llegan con la receta v3.',
              }}
            />
          </div>

          {fechas.length > 0 && (
            <div className="min-w-64 flex-1 space-y-1">
              <Label className="text-xs">
                {modo === 'mensual' ? 'Mes' : 'Pasada'} ({i + 1} de {fechas.length})
              </Label>
              <DeslizadorDeMeses
                etiquetas={fechas.map(f => f.etiqueta)}
                posicion={i}
                onPosicion={irA}
                nombre={modo === 'mensual' ? 'Mes del mapa' : 'Pasada del mapa'}
              />
            </div>
          )}
        </div>

        {modo === 'pasada' && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={todas} onChange={e => { setTodas(e.target.checked); volverAlArranque() }} />
              Mostrar también las que tapan más del {Math.round((1 - COBERTURA_MINIMA_MAPA) * 100)} % del rancho
              {escondidas > 0 && ` (${escondidas})`}
            </label>
            {fechas.length > 0 && i !== arranque && (
              <button type="button" className="underline underline-offset-2" onClick={() => irA(arranque)}>
                Ir a la última imagen buena
              </button>
            )}
          </div>
        )}

        {/* Lo que dice la fecha elegida, **arriba del mapa**. En el mensual, la métrica con la
            fracción del área al lado: el promedio divide por el área con dato (`DECISIONS #29`
            de Geocore), así que el número solo se puede leer mal. Por pasada, la mediana del
            rancho y cuánto se vio, y si es dudosa. */}
        {elegida && modo === 'mensual' && !colorReal && (
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-md border px-3 py-2">
            <span className="text-2xl font-semibold tabular-nums">
              {metrica?.valor != null ? metrica.valor.toFixed(3) : '—'}
            </span>
            <span className="text-sm text-muted-foreground">
              {indice.toUpperCase()} del rancho en {elegida.etiqueta}, promedio de sus parcelas ponderado por área
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

        {elegida && modo === 'pasada' && (
          <div className="space-y-1 rounded-md border px-3 py-2">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              {!colorReal && (
                <span className="text-2xl font-semibold tabular-nums">
                  {elegida.mediana != null ? elegida.mediana.toFixed(3) : '—'}
                </span>
              )}
              <span className="text-sm text-muted-foreground">
                {colorReal ? 'Color real' : `${indice.toUpperCase()} mediano del rancho`} el {elegida.etiqueta} UTC
              </span>
              <span className="w-full text-xs text-muted-foreground tabular-nums">
                {elegida.cobertura != null
                  ? `${Math.round(elegida.cobertura * 100)} % del rancho a la vista${elegida.util ? '' : ': tapa más de lo que se muestra por defecto'}`
                  : 'Sin la cobertura de esta pasada.'}
              </span>
            </div>
            {/* La regla de worker `DECISIONS #72`: queda un ~3 % de caídas que ninguna máscara
                detecta. Se marca y no se esconde, porque alguna puede ser real. */}
            {elegida.dudosa && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Dudosa: se aparta más de {SALTO_DUDOSO} de la pasada anterior y de la siguiente, que
                coinciden entre sí. Puede ser una nube o una sombra que la máscara no vio.
              </p>
            )}
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        {recortado(capas, LIMITE_CAPAS_RANCHO) && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Este rancho tiene más de {LIMITE_CAPAS_RANCHO} capas: se muestran las más nuevas, y las
            fechas más viejas pueden faltar.
          </p>
        )}

        {capas === null
          ? <p className="text-sm text-muted-foreground">Cargando las capas…</p>
          : fechas.length === 0
            ? (
              <p className="text-sm text-muted-foreground">
                {modo === 'pasada' && escondidas > 0
                  ? `Todas las pasadas de ${colorReal ? 'color real' : indice.toUpperCase()} tapan más del ${Math.round((1 - COBERTURA_MINIMA_MAPA) * 100)} % del rancho. Tildá "Mostrar también" para verlas.`
                  : `Este rancho no tiene ningún mapa de ${colorReal ? 'color real' : indice.toUpperCase()}. O nunca se procesó, o ningún mes tuvo un píxel limpio.`}
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
