import { describe, expect, it } from 'vitest'
import type { LayerSummary } from '@/lib/api'
import { dudosas, fechasDelMapa, tieneModo, ultimaBuena } from '@/lib/mapaRancho'

/**
 * El mapa del rancho por fechas (M.9.7f). Lo que se prueba es lo que, mal hecho, no falla:
 * un deslizador que mezcla el mes con la pasada, que arranca en una foto tapada, o que no
 * marca la caída que ninguna máscara detecta.
 */

let n = 0
function capa(parcial: Partial<LayerSummary>): LayerSummary {
  n += 1
  return {
    id: `c${n}`, tenantId: 't', parcelaId: null, ranchoId: 'r', product: 'ndvi',
    storageKey: 'k', acquiredTs: '2025-07-01T00:00:00Z', source: 'mensual', createdAt: '',
    cobertura: 0.9, mediana: 0.6, ...parcial,
  }
}

const pasada = (dia: string, cobertura: number | null, mediana: number | null, product = 'ndvi') =>
  capa({ source: 'pasada', acquiredTs: `2025-10-${dia}T15:32:00Z`, cobertura, mediana, product })

describe('fechasDelMapa', () => {
  it('separa el compuesto del mes de las pasadas', () => {
    const capas = [
      capa({ acquiredTs: '2025-08-01T00:00:00Z' }),
      // Una pasada del día 1: es la que el filtro por fechas mezclaba con el mes.
      capa({ source: 'pasada', acquiredTs: '2025-08-01T15:32:00Z' }),
    ]

    expect(fechasDelMapa(capas, 'ndvi', 'mensual').map(f => f.etiqueta)).toEqual(['2025-08'])
    expect(fechasDelMapa(capas, 'ndvi', 'pasada').map(f => f.etiqueta)).toEqual(['2025-08-01 15:32'])
  })

  it('ordena de la más vieja a la más nueva y filtra por producto', () => {
    const capas = [pasada('14', 0.9, 0.7), pasada('02', 0.9, 0.67), pasada('02', 0.9, null, 'rgb')]

    expect(fechasDelMapa(capas, 'ndvi', 'pasada').map(f => f.etiqueta))
      .toEqual(['2025-10-02 15:32', '2025-10-14 15:32'])
  })

  it('por pasada, sin pedirlas, esconde las que tapan más del mínimo', () => {
    const capas = [pasada('02', 1, 0.67), pasada('09', 0.1, 0.61), pasada('14', 0.35, 0.7)]

    expect(fechasDelMapa(capas, 'ndvi', 'pasada').map(f => f.cobertura)).toEqual([1, 0.35])
    const todas = fechasDelMapa(capas, 'ndvi', 'pasada', { todas: true })
    expect(todas.map(f => f.util)).toEqual([true, false, true])
  })

  it('en el mensual muestra todos los meses, aunque cubran poco', () => {
    // Es lo de siempre: un mes con poco a la vista igual tiene mapa (worker `#51`).
    const capas = [capa({ cobertura: 0.1 })]

    expect(fechasDelMapa(capas, 'ndvi', 'mensual')).toHaveLength(1)
  })

  it('sin cobertura conocida da la capa por útil', () => {
    // Las capas de antes de la FASE M no la traen: esconderlas sería perderlas.
    expect(fechasDelMapa([pasada('02', null, 0.6)], 'ndvi', 'pasada')[0].util).toBe(true)
  })

  it('marca la dudosa con el caso real del Cauca', () => {
    const capas = [pasada('14', 1, 0.71), pasada('19', 0.3, 0.23), pasada('31', 0.93, 0.71)]

    expect(fechasDelMapa(capas, 'ndvi', 'pasada').map(f => f.dudosa)).toEqual([false, true, false])
  })

  it('el color real se marca con la mediana del NDVI de la misma pasada', () => {
    const capas = [
      pasada('14', 1, 0.71), pasada('19', 0.3, 0.23), pasada('31', 0.93, 0.71),
      pasada('14', 1, null, 'rgb'), pasada('19', 0.3, null, 'rgb'), pasada('31', 0.93, null, 'rgb'),
    ]

    const rgb = fechasDelMapa(capas, 'rgb', 'pasada', { referencia: 'ndvi' })
    expect(rgb.map(f => f.dudosa)).toEqual([false, true, false])
  })

  it('una tapada no sirve de vecina', () => {
    // La del 16 tapa casi todo: sin excluirla, la del 19 no tendría dos vecinas que coinciden.
    const capas = [pasada('14', 1, 0.71), pasada('16', 0.05, 0.2), pasada('19', 0.4, 0.23), pasada('24', 1, 0.7)]

    const todas = fechasDelMapa(capas, 'ndvi', 'pasada', { todas: true })
    expect(todas.map(f => f.dudosa)).toEqual([false, false, true, false])
  })
})

describe('dudosas', () => {
  const p = (dia: number, valor: number | null) => ({ instante: `2025-10-${String(dia).padStart(2, '0')}T15:32:00Z`, valor })

  it('no marca un cambio que se sostiene: una cosecha', () => {
    // 0,70 → 0,30 → 0,28: la de en medio se aparta de la anterior, pero la siguiente la sigue.
    expect(dudosas([p(1, 0.7), p(6, 0.3), p(11, 0.28)]).size).toBe(0)
  })

  it('no marca con vecinas que no coinciden entre sí', () => {
    expect(dudosas([p(1, 0.7), p(6, 0.3), p(11, 0.5)]).size).toBe(0)
  })

  it('no marca con una vecina demasiado lejos', () => {
    // A más de 16 días el cultivo pudo cambiar de verdad.
    const lejos = { instante: '2025-11-20T15:32:00Z', valor: 0.7 }
    expect(dudosas([p(1, 0.7), p(6, 0.3), lejos]).size).toBe(0)
  })

  it('no marca la primera ni la última', () => {
    expect(dudosas([p(1, 0.2), p(6, 0.7), p(11, 0.7)]).size).toBe(0)
    expect(dudosas([p(1, 0.7), p(6, 0.7), p(11, 0.2)]).size).toBe(0)
  })

  it('salta las que no tienen valor', () => {
    expect([...dudosas([p(1, 0.7), p(3, null), p(6, 0.2), p(11, 0.72)])]).toEqual([p(6, 0).instante])
  })
})

describe('ultimaBuena', () => {
  const f = (util: boolean, dudosa: boolean) =>
    ({ id: '', instante: '', etiqueta: '', cobertura: null, mediana: null, util, dudosa })

  it('arranca en la última útil que no es dudosa', () => {
    expect(ultimaBuena([f(true, false), f(true, false), f(true, true), f(false, false)])).toBe(1)
  })

  it('sin ninguna buena, la última; sin ninguna, -1', () => {
    expect(ultimaBuena([f(false, false), f(true, true)])).toBe(1)
    expect(ultimaBuena([])).toBe(-1)
  })
})

describe('tieneModo', () => {
  it('con v2 un rancho no tiene pasadas', () => {
    expect(tieneModo([capa({})], 'pasada')).toBe(false)
    expect(tieneModo([capa({})], 'mensual')).toBe(true)
  })
})
