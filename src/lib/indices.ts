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
 * quien mira ya sabe leer. Los controles de la pestaña Tiles siguen estando: esto es de
 * dónde arranca, no una jaula.
 */

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
