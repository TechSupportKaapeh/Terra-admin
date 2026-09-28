/**
 * Las cuentas del mapa del rancho por fechas (M.9.7f): qué fechas se ofrecen, cuál es la
 * última buena y cuál es dudosa.
 *
 * Vive en `src/lib`, con tests, por lo mismo que `serie.ts` (`DECISIONS #40` de Geocore): un
 * mapa que arranca en la fecha equivocada o que no marca una pasada rara no falla, muestra
 * algo creíble.
 *
 * El dato sale de `GET /api/layers`: cada capa trae `source` (`mensual` o `pasada`), su
 * `cobertura` y su `mediana` desde Geocore `DECISIONS #55`.
 */
import type { Cadencia, LayerSummary } from '@/lib/api'

/**
 * La cobertura del rancho desde la que una pasada se muestra sin pedirla (d37 del tablero
 * de decisiones: "lo útil se decide al leer"). Es el mismo 0,3 de la receta y de la serie.
 */
export const COBERTURA_MINIMA_MAPA = 0.3

/**
 * Cuánto tiene que apartarse una pasada de sus vecinas para ser dudosa, en unidades del
 * índice. Es el corte con el que M.9.7a contó "pasadas malas" (worker `DECISIONS #72`).
 */
export const SALTO_DUDOSO = 0.1

/**
 * Hasta cuántos días puede estar una vecina para servir de referencia. Es la ventana de
 * M.9.7a: más lejos, el cultivo pudo cambiar de verdad —una cosecha— y la regla marcaría
 * como dudoso un cambio real.
 */
export const DIAS_DE_REFERENCIA = 16

const MS_POR_DIA = 24 * 60 * 60 * 1000

/** Una fecha del deslizador: una capa del producto elegido. */
export interface FechaDelMapa {
  /** El id de la capa, para pedir su detalle. */
  id: string
  /** `acquiredTs`: el día 1 en el mensual, el instante de la pasada en la otra. */
  instante: string
  /** Lo que muestra el deslizador: `AAAA-MM` o `AAAA-MM-DD HH:MM` (UTC). */
  etiqueta: string
  /** La fracción del rancho a la vista, o null si la capa no la trae (las de antes). */
  cobertura: number | null
  /** La mediana del índice sobre el rancho, o null (el color real no tiene). */
  mediana: number | null
  /** Si llega a {@link COBERTURA_MINIMA_MAPA}. Sin cobertura conocida, se da por útil. */
  util: boolean
  /** Si se aparta de la anterior y de la siguiente cuando esas dos coinciden. */
  dudosa: boolean
}

/**
 * Las fechas que ofrece el mapa para un producto y un modo, de la más vieja a la más nueva.
 *
 * - **Separa por `source`**: con el ráster por pasada (worker `DECISIONS #77`) el rancho
 *   tiene las dos familias, y mezclarlas pondría el compuesto de agosto al lado de la pasada
 *   del 1 de agosto como si fueran lo mismo.
 * - **Por pasada, sin `todas` se ofrecen sólo las útiles**; las demás, a pedido y marcadas.
 *   En el mensual se ofrecen todas, como siempre.
 * - **La dudosa se decide con `referencia`**, las capas de otro producto con mediana: el
 *   color real no tiene mediana, y se marca con la del NDVI de la misma pasada.
 */
export function fechasDelMapa(
  capas: readonly LayerSummary[],
  producto: string,
  modo: Cadencia,
  { todas = false, referencia }: { todas?: boolean; referencia?: string } = {},
): FechaDelMapa[] {
  const delModo = capas.filter(c => c.source === modo)
  const ordenar = (a: LayerSummary, b: LayerSummary) => a.acquiredTs.localeCompare(b.acquiredTs)
  const fechas = delModo
    .filter(c => c.product === producto)
    .sort(ordenar)
    .map(c => {
      const cobertura = numero(c.cobertura)
      return {
        id: c.id,
        instante: c.acquiredTs,
        etiqueta: etiquetaDe(c.acquiredTs, modo),
        cobertura,
        mediana: numero(c.mediana),
        util: cobertura === null || cobertura >= COBERTURA_MINIMA_MAPA,
        dudosa: false,
      }
    })

  if (modo === 'pasada') {
    // La dudosa se mira sobre las útiles: una tapada no sirve ni de vecina ni de sospechosa.
    const medianas = new Map(
      (referencia ? delModo.filter(c => c.product === referencia) : [])
        .map(c => [c.acquiredTs, numero(c.mediana)] as const),
    )
    const serie = fechas
      .filter(f => f.util)
      .map(f => ({ instante: f.instante, valor: referencia ? medianas.get(f.instante) ?? null : f.mediana }))
    const marcadas = dudosas(serie)
    for (const f of fechas) f.dudosa = marcadas.has(f.instante)
  }

  return modo === 'pasada' && !todas ? fechas.filter(f => f.util) : fechas
}

/**
 * Los instantes de las pasadas dudosas: las que se apartan más de {@link SALTO_DUDOSO} de
 * la anterior **y** de la siguiente, cuando esas dos coinciden entre sí y están a menos de
 * {@link DIAS_DE_REFERENCIA} días.
 *
 * Es la regla de confirmación de worker `DECISIONS #72`: queda un ~3 % de pasadas que
 * ninguna máscara resuelve —el Cauca, 2025-10-19: 0,71 → 0,23 → 0,71— y se atacan mirando
 * el tiempo, no la imagen. **No se esconden**: se marcan, porque alguna puede ser real.
 *
 * La primera y la última no se pueden marcar: les falta una vecina.
 */
export function dudosas(serie: readonly { instante: string; valor: number | null }[]): Set<string> {
  const conValor = serie.filter((p): p is { instante: string; valor: number } => p.valor !== null)
  const marcadas = new Set<string>()
  for (let i = 1; i < conValor.length - 1; i++) {
    const [antes, esta, despues] = [conValor[i - 1], conValor[i], conValor[i + 1]]
    const cerca = dias(antes.instante, esta.instante) <= DIAS_DE_REFERENCIA
      && dias(esta.instante, despues.instante) <= DIAS_DE_REFERENCIA
    const coinciden = Math.abs(antes.valor - despues.valor) <= SALTO_DUDOSO
    const seAparta = Math.abs(esta.valor - antes.valor) > SALTO_DUDOSO
      && Math.abs(esta.valor - despues.valor) > SALTO_DUDOSO
    if (cerca && coinciden && seAparta) marcadas.add(esta.instante)
  }
  return marcadas
}

/**
 * Dónde arranca el deslizador: **la última imagen buena**, útil y no dudosa. Es lo que un
 * técnico de campo quiere ver primero (idea del 2026-09-26, `SPRINTS_FASE_M.md`). Si no hay
 * ninguna, la última; si la lista está vacía, -1.
 */
export function ultimaBuena(fechas: readonly FechaDelMapa[]): number {
  for (let i = fechas.length - 1; i >= 0; i--) {
    if (fechas[i].util && !fechas[i].dudosa) return i
  }
  return fechas.length - 1
}

/** Si el rancho ya tiene capas de esta familia: con v2 no hay ninguna `pasada`. */
export function tieneModo(capas: readonly LayerSummary[], modo: Cadencia): boolean {
  return capas.some(c => c.source === modo)
}

function etiquetaDe(instante: string, modo: Cadencia): string {
  return modo === 'mensual' ? instante.slice(0, 7) : instante.slice(0, 16).replace('T', ' ')
}

function dias(desde: string, hasta: string): number {
  return Math.abs(Date.parse(hasta) - Date.parse(desde)) / MS_POR_DIA
}

/** Un número de la API, o null. Geocore manda null cuando no lo tiene (`DECISIONS #55`). */
function numero(valor: unknown): number | null {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : null
}
