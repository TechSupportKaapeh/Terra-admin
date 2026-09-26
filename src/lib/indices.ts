/**
 * Cómo se pinta cada índice en el mapa.
 *
 * Los COG guardan el índice **crudo en float32** —números, no colores—, y la plantilla de
 * tiles que arma Geocore sale sin `rescale` ni `colormap_name`: los agrega el front
 * (`viaje-de-un-tile.html` del tileserver). Esta tabla es el "los agrega el front".
 *
 * **Cada índice necesita su escala, porque no miden lo mismo.** NDVI y NDMI pintados con el
 * mismo rango dan dos mapas que parecen comparables y no lo son: un NDMI de 0,2 es húmedo y
 * un NDVI de 0,2 es casi suelo desnudo.
 *
 * Las paletas son la **convención agronómica** (decisión del usuario, 2026-09-20): es lo que
 * quien mira ya sabe leer.
 *
 * **Desde el 2026-09-25 es la única escala del panel**: la pestaña Tiles del Diagnóstico
 * dejaba moverla a mano, y se podó. Pintar un COG distinto de como lo pinta el mapa del
 * rancho no ayudaba a contestar "¿por qué no se ve?"; lo que sí ayudaba —que el ráster
 * caiga entero fuera de la escala— lo dice {@link fueraDeEscala}.
 */

/**
 * Las paradas de ColorBrewer que usa matplotlib, de donde rio-tiler saca sus colormaps.
 *
 * Están acá y no junto a un mapa porque son las dos puntas de lo mismo: TiTiler pinta el
 * tile con `colormap_name`, y la leyenda tiene que salir del **mismo** degradado o el
 * mapa dice una cosa y su escala otra.
 */
export const PALETAS: Record<string, string> = {
  rdylgn: '#a50026,#d73027,#f46d43,#fdae61,#fee08b,#ffffbf,#d9ef8b,#a6d96a,#66bd63,#1a9850,#006837',
  ylgn: '#ffffe5,#f7fcb9,#d9f0a3,#addd8e,#78c679,#41ab5d,#238443,#006837,#004529',
  greens: '#f7fcf5,#e5f5e0,#c7e9c0,#a1d99b,#74c476,#41ab5d,#238b45,#006d2c,#00441b',
  viridis: '#440154,#482878,#3e4989,#31688e,#26828e,#1f9e89,#35b779,#6ece58,#b5de2b,#fde725',
  spectral: '#9e0142,#d53e4f,#f46d43,#fdae61,#fee08b,#ffffbf,#e6f598,#abdda4,#66c2a5,#3288bd,#5e4fa2',
  rdbu: '#67001f,#b2182b,#d6604d,#f4a582,#fddbc7,#f7f7f7,#d1e5f0,#92c5de,#4393c3,#2166ac,#053061',
}

export interface EscalaDeIndice {
  /** Qué mide, en una línea: va en la leyenda. */
  que: string
  /** El rango que se pinta. Fuera de él, TiTiler satura al extremo. */
  rango: [number, number]
  /** El `colormap_name` de TiTiler. */
  paleta: string
  /** Si la escala tiene un centro con significado, para marcarlo en la leyenda. */
  centro?: number
}

export const ESCALAS: Record<string, EscalaDeIndice> = {
  // Vegetación. El rango arranca en 0 y no en -1: lo negativo es agua o nube, y gastar
  // media rampa en eso aplana justo donde están los cultivos.
  ndvi: { que: 'vegetación', rango: [0, 0.8], paleta: 'rdylgn' },
  evi: { que: 'vegetación densa', rango: [0, 0.8], paleta: 'rdylgn' },

  // Clorofila. Se mueve en un rango más chico que el NDVI: con 0 a 0,8 casi no se ve nada.
  ndre: { que: 'clorofila', rango: [0, 0.5], paleta: 'greens' },

  // Humedad. **Divergente y centrada en 0**, que acá sí significa algo: bajo cero es seco y
  // sobre cero es húmedo. Es el único de los cuatro con un centro con sentido.
  ndmi: { que: 'humedad', rango: [-0.4, 0.4], paleta: 'rdbu', centro: 0 },
}

/** La escala de un índice; para uno que no esté en la tabla, la de vegetación. */
export function escalaDe(indice: string): EscalaDeIndice {
  return ESCALAS[indice.toLowerCase()] ?? { que: indice, rango: [0, 0.8], paleta: 'rdylgn' }
}

/**
 * De qué lado de la escala cae un ráster **entero**, o `null` si la escala lo corta.
 *
 * Es lo que antes se descubría en Diagnóstico → Tiles moviendo el rescale a mano: un COG
 * cuyos valores caen todos de un lado de la escala se pinta **entero del color del
 * extremo**, y se ve "de un solo color" sin que el dato lo sea. Desde que la escala es fija
 * (poda del 2026-09-25), se dice en vez de dejar que se descubra.
 *
 * Un ráster de un solo valor no entra acá: ese ya tiene su aviso, y es otro problema.
 */
export function fueraDeEscala(
  valores: { min: number; max: number },
  escala: EscalaDeIndice,
): 'abajo' | 'arriba' | null {
  const [desde, hasta] = escala.rango
  if (valores.max <= desde) return 'abajo'
  if (valores.min >= hasta) return 'arriba'
  return null
}

/**
 * El `rescale` de TiTiler para un rango, en las unidades en que está guardado el COG.
 *
 * Desde M.9.7 los COG guardan el índice como **entero ×10.000** (Geocore `DECISIONS #53`), y la
 * capa trae esa `escala`. Un NDVI de 0,8 guardado así es 8000: pedir `rescale=0,0.8` pintaría
 * todo el rancho del color del extremo alto, sin ningún error. Sin escala (`null`, los COG de
 * antes, en decimales) el rango va tal cual.
 */
export function rescaleDe(rango: readonly [number, number], escala?: number | null): string {
  const factor = factorDe(escala)
  // `toPrecision` saca el ruido de float: 0,1 × 3 no es 0,3 en binario.
  const escalar = (v: number) => Number((v * factor).toPrecision(12))
  return `${escalar(rango[0])},${escalar(rango[1])}`
}

/** Un valor leído del COG —un píxel, un mínimo— en las unidades del índice. */
export function valorDelIndice(crudo: number, escala?: number | null): number {
  return crudo / factorDe(escala)
}

/**
 * La escala que se usa: la de la capa si es un número positivo, 1 si no.
 *
 * La base ya rechaza una escala de 0 o negativa (`ck_layers_escala`, Geocore `DECISIONS #53`),
 * pero el panel no depende de eso: con 0, `valorDelIndice` dividiría por cero y mostraría
 * `Infinity` como valor de un píxel. Defensa en profundidad, encontrada en la auditoría de M.9.7b.
 */
function factorDe(escala?: number | null): number {
  return typeof escala === 'number' && Number.isFinite(escala) && escala > 0 ? escala : 1
}
