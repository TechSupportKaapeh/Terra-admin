import { describe, expect, it, vi } from 'vitest'
import type { Measurement } from '@/lib/api'
import {
  COBERTURA_MINIMA, etiquetaDe, HUECO_LARGO_MS, instanteDe, marcasDeTiempo, querySerie, recetasDe, serieDe, tramosDe,
} from '@/lib/serie'

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

  it('el dominio vertical sale de los valores, con aire', () => {
    const s = serieDe([
      fila('2026-03-01', { valor: 0.4 }),
      fila('2026-04-01', { valor: 0.6 }),
    ], 'mensual')
    // Un NDVI que se mueve entre 0,4 y 0,6 dibujado en [-1, 1] sería una línea plana.
    expect(s.dominioY.desde).toBeLessThan(0.4)
    expect(s.dominioY.hasta).toBeGreaterThan(0.6)
    expect(s.dominioY.hasta - s.dominioY.desde).toBeLessThan(0.5)
  })

  it('una banda extrema NO estira el eje: es el borde de una nube, no el cultivo', () => {
    // El caso real del 2026-09-26: una pasada con pocos píxeles limpios traía un p10 de −1,0 y
    // el eje iba de −1,2 a 1,2 para un NDVI que vive entre 0,4 y 0,8.
    const s = serieDe([
      fila('2025-12-01', { valor: 0.7, estadisticas: { p10: -1.0, p90: 0.9 } }),
      fila('2025-12-05', { valor: 0.5, estadisticas: { p10: 0.4, p90: 0.6 } }),
    ], 'pasada')
    expect(s.dominioY.desde).toBeGreaterThan(0.3)
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

describe('tramosDe', () => {
  // La línea une cada punto con valor con el siguiente (pedido del usuario, 2026-09-26): cortada
  // en cada hueco, la serie por pasada no se leía. Lo que se conserva es no mentir sobre el hueco.
  const p = (fecha: string, valor: number | null) => ({ t: instanteDe(fecha), valor })

  it('une cada punto con el siguiente, sin cortar', () => {
    const tramos = tramosDe([p('2025-07-01', 0.4), p('2025-07-14', 0.5), p('2025-07-24', 0.6)])
    expect(tramos).toHaveLength(2)
    expect(tramos.every(t => !t.largo)).toBe(true)
  })

  it('un punto sin valor no corta la línea: se saltea y los vecinos se unen', () => {
    const tramos = tramosDe([p('2025-07-01', 0.4), p('2025-07-03', null), p('2025-07-14', 0.5)])
    expect(tramos).toHaveLength(1)
    expect(tramos[0].desde.valor).toBe(0.4)
    expect(tramos[0].hasta.valor).toBe(0.5)
  })

  it('más de 40 días sin observación útil: el tramo es largo y se dibuja punteado', () => {
    const [corto, largo] = tramosDe([p('2025-04-01', 0.4), p('2025-04-20', 0.5), p('2025-07-01', 0.6)])
    expect(corto.largo).toBe(false)
    expect(largo.largo).toBe(true)
  })

  it('en la serie mensual, meses seguidos no se puntean; sólo un mes que falta', () => {
    // 28 a 31 días entre dos meses consecutivos: por eso el umbral es 40 y no 30.
    const [feb, mar, may] = tramosDe([
      p('2025-01-01', 0.4), p('2025-02-01', 0.5), p('2025-03-01', 0.5), p('2025-05-01', 0.6),
    ])
    expect(feb.largo).toBe(false)
    expect(mar.largo).toBe(false)
    expect(may.largo).toBe(true)
    expect(HUECO_LARGO_MS).toBeGreaterThan(31 * UN_DIA)
  })

  it('con uno o ningún punto con valor no hay línea', () => {
    expect(tramosDe([p('2025-07-01', 0.4), p('2025-07-03', null)])).toEqual([])
    expect(tramosDe([])).toEqual([])
  })
})

describe('COBERTURA_MINIMA', () => {
  it('es la de la receta, y una fracción: la API rechaza con 400 un porcentaje', () => {
    // `cobertura_minima` vale 0,3 en s2-mensual-v1 y en s2-pasada-v2. Si una receta nueva lo
    // cambia, este número cambia con ella: la API no expone la receta.
    expect(COBERTURA_MINIMA).toBe(0.3)
  })
})

describe('querySerie', () => {
  it('lleva el mínimo de cobertura cuando se lo pasan: es lo que se rompió el 2026-09-26', () => {
    const q = new URLSearchParams(querySerie('p1', 'ndvi', 'pasada', COBERTURA_MINIMA))
    expect(q.get('coberturaMinima')).toBe('0.3')
    expect(q.get('cadencia')).toBe('pasada')
    expect(q.get('indice')).toBe('ndvi')
    expect(q.get('parcelaId')).toBe('p1')
  })

  it('manda una fracción y no un porcentaje: con "30" la API contesta 400', () => {
    const q = new URLSearchParams(querySerie('p1', 'ndvi', 'mensual', COBERTURA_MINIMA))
    expect(Number(q.get('coberturaMinima'))).toBeLessThanOrEqual(1)
  })

  it('sin mínimo no manda el parámetro, en vez de mandarlo vacío', () => {
    expect(new URLSearchParams(querySerie('p1')).has('coberturaMinima')).toBe(false)
  })
})
