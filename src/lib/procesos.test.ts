import { describe, expect, it } from 'vitest'
import type { EventoProceso, Proceso } from '@/lib/api'
import { alerta, datosDeEvento, duracion, duracionDe, entidad, esActivo, etiquetaTipo, hace, ultimoPorEntidad } from '@/lib/procesos'

/**
 * Los primeros tests del panel (M.7.6).
 *
 * `src/lib/` es lo que se puede probar sin un DOM: son funciones puras, y las que más
 * se equivocan en silencio. Un error acá no rompe la pantalla, la hace mentir — que es
 * peor, porque nadie lo mira dos veces.
 *
 * Nada de esto toca la red: `api.ts` no se importa más que por sus tipos.
 */

/** Un proceso con lo mínimo, más lo que cada test necesite. */
function proceso(extra: Partial<Proceso> = {}): Proceso {
  return {
    id: 'job-1',
    tenantId: 't1',
    ranchoId: null,
    parcelaId: null,
    ranchoNombre: null,
    parcelaNombre: null,
    tenantNombre: null,
    requestType: 'ParcelaInicial',
    status: 'completed',
    progress: 100,
    createdAt: '2026-09-20T10:00:00Z',
    startedAt: null,
    finishedAt: null,
    errorMessage: null,
    intentos: 1,
    ultimoEvento: null,
    ...extra,
  } as Proceso
}

const T = (iso: string) => Date.parse(iso)

describe('etiquetaTipo', () => {
  it('traduce los tipos del cierre de mes, que hoy son la mayoría de los jobs', () => {
    expect(etiquetaTipo('ParcelaMensual')).toBe('Mes de parcela')
    expect(etiquetaTipo('RanchoMensual')).toBe('Mes de rancho')
  })

  it('un tipo que no conoce se muestra tal cual, no se pierde', () => {
    expect(etiquetaTipo('AlgoNuevoDelWorker')).toBe('AlgoNuevoDelWorker')
  })
})

describe('esActivo', () => {
  it('activo es lo que todavía puede cambiar solo', () => {
    expect(esActivo('pending')).toBe(true)
    expect(esActivo('running')).toBe(true)
    expect(esActivo('completed')).toBe(false)
    expect(esActivo('failed')).toBe(false)
  })
})

describe('ultimoPorEntidad', () => {
  // La lista viene de más nuevo a más viejo: el primero de cada entidad es el último.
  const lista = [
    proceso({ id: 'nuevo', parcelaId: 'p1', ranchoId: 'r1' }),
    proceso({ id: 'viejo', parcelaId: 'p1', ranchoId: 'r1' }),
    proceso({ id: 'del-rancho', ranchoId: 'r1' }),
  ]

  it('se queda con el primero de cada entidad, que es el más nuevo', () => {
    const { porParcela } = ultimoPorEntidad(lista)
    expect(porParcela.get('p1')?.id).toBe('nuevo')
  })

  it('un job de parcela NO cuenta como job de su rancho', () => {
    // Un job de parcela lleva también el ranchoId de su rancho. Sin el `else`, la fila
    // del rancho mostraría el proceso de una de sus parcelas.
    const { porRancho } = ultimoPorEntidad(lista)
    expect(porRancho.get('r1')?.id).toBe('del-rancho')
  })

  it('sin procesos —o mientras cargan— devuelve mapas vacíos, no explota', () => {
    const { porParcela, porRancho } = ultimoPorEntidad(null)
    expect(porParcela.size).toBe(0)
    expect(porRancho.size).toBe(0)
  })
})

describe('entidad', () => {
  it('una parcela se muestra con su rancho al lado', () => {
    expect(entidad(proceso({ parcelaId: 'p1', parcelaNombre: 'El Sauce', ranchoNombre: 'Norte' })))
      .toBe('El Sauce · Norte')
  })

  it('sin nombre cae al id recortado, para que la fila siga diciendo cuál es', () => {
    expect(entidad(proceso({ parcelaId: '0123456789abcdef' }))).toBe('parcela 01234567')
  })

  it('un job sin entidad es un polígono libre', () => {
    expect(entidad(proceso())).toBe('polígono libre')
  })
})

describe('duracion', () => {
  it('redondea a segundos, minutos u horas según cuánto sea', () => {
    expect(duracion(3_000)).toBe('3 s')
    expect(duracion(90_000)).toBe('1 min 30 s')
    expect(duracion(120_000)).toBe('2 min')
    expect(duracion(3_900_000)).toBe('1 h 5 min')
  })

  it('un negativo no imprime "-3 s": el reloj del navegador puede ir adelantado', () => {
    expect(duracion(-3_000)).toBe('0 s')
  })
})

describe('hace', () => {
  it('menos de 45 s es "recién"', () => {
    expect(hace('2026-09-20T10:00:00Z', T('2026-09-20T10:00:30Z'))).toBe('recién')
  })

  it('con `ahora` en 0 —todavía no cargó— no inventa una cuenta', () => {
    // Sin respuesta no hay contra qué comparar: leer el reloj en el render es lo que
    // este parámetro existe para evitar.
    expect(hace('2026-09-20T10:00:00Z', 0)).not.toContain('hace')
  })
})

describe('duracionDe', () => {
  it('un job que el worker no arrancó no tiene duración', () => {
    expect(duracionDe(proceso({ status: 'pending' }), T('2026-09-20T10:10:00Z'))).toBeNull()
  })

  it('si sigue, cuenta hasta ahora; si terminó, hasta su fin', () => {
    const arrancado = { startedAt: '2026-09-20T10:00:00Z' }
    expect(duracionDe(proceso(arrancado), T('2026-09-20T10:02:00Z'))).toBe('2 min')
    expect(duracionDe(proceso({ ...arrancado, finishedAt: '2026-09-20T10:01:00Z' }), T('2026-09-20T23:00:00Z')))
      .toBe('1 min')
  })
})

describe('alerta', () => {
  it('no avisa nada antes de la primera carga', () => {
    expect(alerta(proceso({ status: 'pending' }), 0)).toBeNull()
  })

  it('un pending que nadie tomó en 10 minutos manda a mirar Inngest', () => {
    const a = alerta(proceso({ status: 'pending' }), T('2026-09-20T10:11:00Z'))
    expect(a).toContain('Inngest')
  })

  it('9 minutos en cola todavía no es raro', () => {
    expect(alerta(proceso({ status: 'pending' }), T('2026-09-20T10:09:00Z'))).toBeNull()
  })

  it('un running sin novedades cuenta desde su última línea de bitácora, no desde que empezó', () => {
    const p = proceso({
      status: 'running',
      startedAt: '2026-09-20T10:00:00Z',
      ultimoEvento: { createdAt: '2026-09-20T10:25:00Z' } as EventoProceso,
    })
    // 30 min desde que arrancó, pero 5 desde la última línea: está trabajando.
    expect(alerta(p, T('2026-09-20T10:30:00Z'))).toBeNull()
    expect(alerta(p, T('2026-09-20T10:46:00Z'))).toContain('Sin novedades')
  })

  it('un job terminado nunca avisa, por viejo que sea', () => {
    expect(alerta(proceso({ status: 'completed' }), T('2026-10-20T10:00:00Z'))).toBeNull()
  })
})

describe('datosDeEvento', () => {
  const evento = (detail: Record<string, unknown>) => ({ detail } as EventoProceso)

  it('la ventana de fechas va junta cuando están las dos puntas', () => {
    expect(datosDeEvento(evento({ desde: '2026-08-01', hasta: '2026-09-01' })))
      .toEqual(['2026-08-01 → 2026-09-01'])
  })

  it('un 0 se muestra: "0 imágenes" es justamente lo que hay que ver', () => {
    // El bug clásico de escribir `if (v('imagenes'))`: el mes sin imágenes desaparece.
    expect(datosDeEvento(evento({ imagenes: 0 }))).toEqual(['0 imágenes'])
  })

  it('un evento sin detail no produce etiquetas', () => {
    expect(datosDeEvento({} as EventoProceso)).toEqual([])
  })

  it('los `ms` se muestran como duración, no como número', () => {
    expect(datosDeEvento(evento({ ms: 90_000 }))).toEqual(['1 min 30 s'])
  })
})
