import { describe, expect, it } from 'vitest'
import { LIMITE_CAPAS, queryCapas } from '@/lib/capas'

/**
 * La query del listado de capas (M.9.7c).
 *
 * Lo que importa es que el rancho **viaje**: si se cayera de la query, Geocore devolvería
 * las capas de todo el tenant y el mapa del rancho mezclaría las de otros ranchos, sin
 * ningún error.
 */
describe('queryCapas', () => {
  it('manda el rancho y las fechas a Geocore', () => {
    const q = new URLSearchParams(queryCapas('t1', { ranchoId: 'r1', desde: '2026-08-01', hasta: '2026-08-31' }))

    expect(q.get('tenantId')).toBe('t1')
    expect(q.get('ranchoId')).toBe('r1')
    expect(q.get('desde')).toBe('2026-08-01')
    expect(q.get('hasta')).toBe('2026-08-31')
  })

  it('sin filtros pide el tenant con el techo por defecto, y nada más', () => {
    // El control del anterior: lo que aparece arriba lo puso el filtro.
    const q = new URLSearchParams(queryCapas('t1'))

    expect([...q.keys()].sort()).toEqual(['limit', 'tenantId'])
    expect(q.get('limit')).toBe(String(LIMITE_CAPAS))
  })

  it('respeta un límite propio', () => {
    expect(new URLSearchParams(queryCapas('t1', { limit: 50 })).get('limit')).toBe('50')
  })

  it('escapa los valores', () => {
    // Los ids vienen de la API, pero la query no confía en eso.
    const q = queryCapas('t1', { ranchoId: 'a&tenantId=otro' })

    expect(new URLSearchParams(q).getAll('tenantId')).toEqual(['t1'])
  })
})
