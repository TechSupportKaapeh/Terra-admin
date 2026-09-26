import { describe, expect, it, vi } from 'vitest'
import type { Measurement } from '@/lib/api'
import { etiquetaDe, instanteDe, marcasDeTiempo, recetasDe, serieDe } from '@/lib/serie'

/**
 * El eje de fechas (M.9.0d).
 *
 * Por qué estos tests y no otros: **un eje mal armado no falla, miente**. Dibuja una serie
 * perfectamente creíble con las pasadas repartidas parejo, y nadie mira dos veces un
 * gráfico que se ve bien. Lo que se fija acá es lo que distingue "el eje es una fecha" de
 * "el eje es el número de la fila".
 */

const UN_DIA = 86_400_000

/** Una fila de la API, con lo mínimo y lo que cada test necesite encima. */
const fila = (fecha: string, extra: Partial<Measurement> = {}): Measurement => ({
  parcelaId: 'p1',
  indice: 'ndvi',
  fecha,
  valor: 0.5,
  cobertura: 0.9,
  observaciones: 3,
  receta: 's2-pasada-v2',
  estadisticas: { mediana: 0.5, p10: 0.4, p90: 0.6 },
  agregadas: 1,
  ...extra,
})

describe('instanteDe', () => {
  it('lee la forma que manda Geocore hoy, que es sólo la fecha', () => {
    expect(instanteDe('2026-08-19')).toBe(Date.UTC(2026, 7, 19))
  })

  it('lee la fecha con hora, que es lo que la API promete con cadencia=pasada', () => {
    expect(instanteDe('2026-08-19T15:42:00Z')).toBe(Date.UTC(2026, 7, 19, 15, 42))
  })

  it('una fecha con hora y sin zona se lee en UTC, no en la hora del que mira', () => {
    // Sin esto, `new Date('2026-08-19T15:42:00')` da un instante distinto en cada máquina:
    // la misma respuesta dibujaría el punto en otro lugar según dónde esté abierto el panel.
    //
    // La zona se fija acá y no se deja a la máquina: en una con UTC —el CI de GitHub— la
    // hora local coincide con la de la API, y el test pasaría con el código roto. Node lee
    // `TZ` de nuevo cada vez que se asigna.
    vi.stubEnv('TZ', 'America/Bogota')
    try {
      expect(instanteDe('2026-08-19T15:42:00')).toBe(Date.UTC(2026, 7, 19, 15, 42))
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('una fecha que no se entiende da NaN, y así se puede descartar en vez de dibujarla', () => {
    // El día 1970 es el peor resultado posible: sale un punto plausible al borde del eje.
    for (const basura of ['', 'ayer', '19/08/2026', '2026-08']) {
      expect(Number.isNaN(instanteDe(basura)), basura).toBe(true)
    }
  })
})

describe('etiquetaDe', () => {
  it('mensual nombra el mes: el punto ES el mes, y decir el día 1 inventaría precisión', () => {
    expect(etiquetaDe(Date.UTC(2026, 7, 1), 'mensual')).toBe('2026-08')
  })

  it('por pasada nombra el día, y la hora sólo si llegó', () => {
    expect(etiquetaDe(Date.UTC(2026, 7, 19), 'pasada')).toBe('2026-08-19')
    expect(etiquetaDe(Date.UTC(2026, 7, 19, 15, 42), 'pasada')).toBe('2026-08-19 15:42')
  })
})

describe('recetasDe', () => {
  it('parte la receta mezclada que la API devuelve a propósito en un mes reprocesado', () => {
    expect(recetasDe('s2-mensual-v1,s2-pasada-v2')).toEqual(['s2-mensual-v1', 's2-pasada-v2'])
  })

  it('sin receta no inventa ninguna', () => {
    expect(recetasDe(null)).toEqual([])
    expect(recetasDe('')).toEqual([])
  })
})

describe('serieDe', () => {
  it('ordena por fecha aunque las filas lleguen desordenadas', () => {
    const s = serieDe([fila('2026-08-19'), fila('2026-03-02'), fila('2026-05-11')], 'pasada')
    expect(s.puntos.map(p => p.etiqueta)).toEqual(['2026-03-02', '2026-05-11', '2026-08-19'])
  })

  it('el eje es el tiempo: dos pasadas juntas quedan juntas y el mes sin pasadas queda vacío', () => {
    // Es el test de la tarea. Con el eje viejo —una posición por fila— estos tres puntos
    // salían a distancias iguales, y la serie decía que en junio hubo una medición.
    const s = serieDe([fila('2026-03-02'), fila('2026-03-05'), fila('2026-08-19')], 'pasada')
    const [a, b, c] = s.puntos.map(p => p.t)
    expect(b - a).toBe(3 * UN_DIA)
    expect(c - b).toBeGreaterThan(160 * UN_DIA)
    expect(s.dominioT).toEqual({ desde: a, hasta: c })
  })

  it('un solo punto no deja el dominio de ancho cero: si no, el pixel sale NaN y no se dibuja nada', () => {
    const s = serieDe([fila('2026-08-19')], 'pasada')
    expect(s.dominioT.hasta).toBeGreaterThan(s.dominioT.desde)
    expect(s.puntos[0].t).toBe((s.dominioT.desde + s.dominioT.hasta) / 2)
  })

  it('dos pasadas del mismo día tampoco: Geocore no manda la hora, así que llegan con la misma fecha', () => {
    const s = serieDe([fila('2026-08-19'), fila('2026-08-19')], 'pasada')
    expect(s.dominioT.hasta).toBeGreaterThan(s.dominioT.desde)
    // Y cada una tiene su clave: con dos iguales, React perdería de vista a una de las dos.
    expect(new Set(s.puntos.map(p => p.id)).size).toBe(2)
  })

  it('una fila con fecha ilegible se cuenta y se deja afuera, no se dibuja en 1970', () => {
    const s = serieDe([fila('2026-08-19'), fila('ayer')], 'pasada')
    expect(s.puntos).toHaveLength(1)
    expect(s.ilegibles).toBe(1)
  })

  it('el dominio vertical sale de los datos, con aire, y toma la banda p10–p90', () => {
    const s = serieDe([
      fila('2026-03-01', { valor: 0.4, estadisticas: { p10: 0.3, p90: 0.5 } }),
      fila('2026-04-01', { valor: 0.6, estadisticas: { p10: 0.5, p90: 0.7 } }),
    ], 'mensual')
    // Un NDVI que se mueve entre 0,3 y 0,7 dibujado en [-1, 1] sería una línea plana.
    expect(s.dominioY.desde).toBeLessThan(0.3)
    expect(s.dominioY.hasta).toBeGreaterThan(0.7)
  })

  it('una serie sin un solo valor no rompe el dominio vertical', () => {
    // Pasa con filas de `s2-mensual-v1`: bajo la cobertura mínima, el valor es null y las
    // estadísticas también.
    const s = serieDe([fila('2026-03-01', { valor: null, estadisticas: null })], 'mensual')
    expect(s.dominioY.hasta).toBeGreaterThan(s.dominioY.desde)
    expect(s.puntos[0].valor).toBeNull()
  })

  it('agregadas viene de la fila, y una respuesta vieja que no lo trae vale 1', () => {
    const s = serieDe([
      fila('2026-03-01', { agregadas: 6 }),
      fila('2026-04-01', { agregadas: undefined }),
    ], 'mensual')
    expect(s.puntos.map(p => p.agregadas)).toEqual([6, 1])
    expect(s.maxAgregadas).toBe(6)
  })

  it('junta las recetas de todas las filas: es lo que delata el mes reprocesado', () => {
    const s = serieDe([
      fila('2026-03-01', { receta: 's2-mensual-v1' }),
      fila('2026-04-01', { receta: 's2-mensual-v1,s2-pasada-v2' }),
    ], 'mensual')
    expect(s.recetas).toEqual(['s2-mensual-v1', 's2-pasada-v2'])
  })
})

describe('marcasDeTiempo', () => {
  it('las marcas caen en bordes de mes, no en los datos', () => {
    const marcas = marcasDeTiempo({ desde: Date.UTC(2026, 0, 17), hasta: Date.UTC(2026, 5, 3) })
    expect(marcas.map(m => m.etiqueta)).toEqual(['2026-02', '2026-03', '2026-04', '2026-05', '2026-06'])
    for (const m of marcas) expect(new Date(m.t).getUTCDate()).toBe(1)
  })

  it('dos años de serie no dan veinticuatro etiquetas encimadas', () => {
    const marcas = marcasDeTiempo({ desde: Date.UTC(2024, 8, 1), hasta: Date.UTC(2026, 8, 1) })
    expect(marcas.length).toBeLessThanOrEqual(8)
    expect(marcas.length).toBeGreaterThan(2)
    // Y el paso es parejo: es lo que hace que la distancia entre dos etiquetas se pueda leer.
    const meses = marcas.map(m => new Date(m.t).getUTCFullYear() * 12 + new Date(m.t).getUTCMonth())
    const pasos = new Set(meses.slice(1).map((m, i) => m - meses[i]))
    expect(pasos.size).toBe(1)
  })

  it('una serie de pocas semanas se marca por día: con una sola etiqueta el eje no ubica nada', () => {
    const marcas = marcasDeTiempo({ desde: Date.UTC(2026, 7, 3), hasta: Date.UTC(2026, 7, 28) })
    expect(marcas.length).toBeGreaterThan(2)
    expect(marcas[0].etiqueta).toMatch(/^\d{2}-\d{2}$/)
  })

  it('muchos años se marcan por año, y en enero', () => {
    const marcas = marcasDeTiempo({ desde: Date.UTC(2010, 0, 1), hasta: Date.UTC(2026, 0, 1) })
    expect(marcas.length).toBeLessThanOrEqual(8)
    for (const m of marcas) {
      expect(m.etiqueta).toMatch(/^\d{4}$/)
      expect(new Date(m.t).getUTCMonth()).toBe(0)
    }
  })

  it('un dominio degenerado no cuelga el render: devuelve una lista vacía', () => {
    expect(marcasDeTiempo({ desde: 0, hasta: 0 })).toEqual([])
    expect(marcasDeTiempo({ desde: 10, hasta: 5 })).toEqual([])
  })
})
