import type { Shape } from '@/components/GeometryView'
import type { CasoDeImportacion, PoligonoPrevisto, RolPropuesto, VistaPreviaImportacion } from '@/lib/api'

/**
 * La vista previa de «Crear extensión y subgrupos» (K.5, Geocore `DECISIONS #66` a `#69`): lo
 * que el panel hace con la respuesta de `POST /api/importacion/vista-previa` para dibujarla.
 * Sólo mirar: acá no se decide nada. Lo propuesto lo decide Geocore; corregirlo es K.6.
 */

/** Un rancho que se crearía, con las parcelas que se le proponen. */
export interface RanchoDelArbol {
  rancho: PoligonoPrevisto
  parcelas: PoligonoPrevisto[]
}

/**
 * La propuesta como se lee en pantalla: los ranchos con sus parcelas, los del caso 4 (un rancho
 * por parcela) y lo que arranca desactivado, cada grupo en el orden del archivo.
 */
export interface ArbolDeImportacion {
  ranchos: RanchoDelArbol[]
  caso4: PoligonoPrevisto[]
  desactivados: PoligonoPrevisto[]
}

export function arbolDe(vista: VistaPreviaImportacion): ArbolDeImportacion {
  const ranchos = new Map<number, RanchoDelArbol>()
  const caso4: PoligonoPrevisto[] = []
  const desactivados: PoligonoPrevisto[] = []

  for (const p of vista.poligonos) {
    if (!p.activo) desactivados.push(p)
    else if (p.rol === 'Rancho') ranchos.set(p.indice, { rancho: p, parcelas: [] })
    else if (p.rol === 'RanchoConParcela') caso4.push(p)
  }

  for (const p of vista.poligonos) {
    if (!p.activo || p.rol !== 'Parcela') continue
    // Geocore siempre cuelga una parcela activa de un rancho activo. Si alguna vez no pasara,
    // se muestra entre lo desactivado en vez de perderse de la pantalla.
    const nodo = p.rancho === null ? undefined : ranchos.get(p.rancho)
    if (nodo) nodo.parcelas.push(p)
    else desactivados.push(p)
  }

  return { ranchos: [...ranchos.values()], caso4, desactivados }
}

/** Los colores del mapa y de las marcas del árbol, por rol. Lo desactivado va en gris. */
export const COLOR_POR_ROL: Record<RolPropuesto, string> = {
  Rancho: '#2563eb',
  Parcela: '#16a34a',
  RanchoConParcela: '#d97706',
  NoImportable: '#6b7280',
}
export const COLOR_DESACTIVADO = '#6b7280'

export const colorDe = (p: PoligonoPrevisto) => (p.activo ? COLOR_POR_ROL[p.rol] : COLOR_DESACTIVADO)

/**
 * Las formas para el mapa. Los ranchos van primero para quedar abajo: si no, tapan a sus
 * parcelas y no se las puede tocar. Lo desactivado va punteado; el elegido, con trazo grueso.
 */
export function formasDe(vista: VistaPreviaImportacion, elegido: number | null): Shape[] {
  const capa = (p: PoligonoPrevisto) => (p.rol === 'Rancho' || p.rol === 'RanchoConParcela' ? 0 : 1)
  return [...vista.poligonos]
    .sort((a, b) => capa(a) - capa(b) || a.indice - b.indice)
    .map(p => ({
      coordinates: p.coordenadas,
      color: colorDe(p),
      label: `${p.nombre} · ${TEXTO_ROL[p.rol]}${p.activo ? '' : ' (desactivado)'}`,
      dashed: !p.activo,
      weight: p.indice === elegido ? 4 : 2,
      fillOpacity: p.indice === elegido ? 0.35 : 0.12,
    }))
}

export const TEXTO_ROL: Record<RolPropuesto, string> = {
  Rancho: 'Rancho',
  Parcela: 'Parcela',
  RanchoConParcela: 'Rancho + parcela',
  NoImportable: 'No se puede importar',
}

export const TEXTO_CASO: Record<CasoDeImportacion, string> = {
  VariosRanchosConParcelas: 'Caso 1 · varios ranchos con sus parcelas',
  SoloRanchos: 'Caso 2 · sólo ranchos',
  UnRanchoConParcelas: 'Caso 3 · un rancho con sus parcelas',
  SoloParcelas: 'Caso 4 · sólo parcelas: cada una con su propio rancho',
  Mixto: 'Mixto · ranchos con sus parcelas y polígonos sueltos',
  Vacio: 'No queda nada para crear',
}

export const hectareas = (ha: number) =>
  `${ha.toLocaleString('es-AR', { maximumFractionDigits: ha < 10 ? 2 : 1 })} ha`

/**
 * Lo que se crearía, en una frase. Un caso 4 suma un rancho y una parcela: es lo que hace que
 * cueste el doble (d-K2), y por eso se cuenta en los dos.
 */
export function resumenEnPalabras(vista: VistaPreviaImportacion): string {
  const { ranchos, parcelas, desactivados } = vista.resumen
  const n = (k: number, uno: string, varios: string) => `${k} ${k === 1 ? uno : varios}`
  const crea = `Se crearían ${n(ranchos, 'rancho', 'ranchos')} y ${n(parcelas, 'parcela', 'parcelas')}`
  return desactivados > 0 ? `${crea}; ${n(desactivados, 'polígono queda', 'polígonos quedan')} afuera.` : `${crea}.`
}

/** De dónde salió en el archivo: para encontrarlo si algo no se ve bien. */
export function origenDe(p: PoligonoPrevisto): string {
  const parte = p.parte ? `, parte ${p.parte.numero} de ${p.parte.de}` : ''
  const carpeta = p.carpeta ? ` · carpeta «${p.carpeta}»` : ''
  return `Elemento ${p.pieza} del archivo${parte}${carpeta}`
}
