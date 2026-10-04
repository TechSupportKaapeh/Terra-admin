import { describe, expect, it } from 'vitest'
import type { EstimacionDeImportacion, PoligonoPrevisto, VistaPreviaImportacion } from '@/lib/api'
import { arbolDe } from '@/lib/importacion'
import {
  altasEnPalabras, aplicarCorrecciones, corregir, huellaDe, ocupacionEnPalabras, planDe,
  porIndice, porQueNoSePuedeCrear, ranchosPosibles, sinCorreccion,
} from '@/lib/planDeImportacion'

/**
 * Corregir y confirmar (K.6). Lo que importa fijar: que lo que se manda sea lo que se ve —el plan
 * sale de la vista corregida—, que un desactivado viaje con `activo: false`, y que no se pueda
 * crear nada que no se haya revisado tal como está en pantalla.
 */

const cuadrado = [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }, { lat: 1, lng: 1 }, { lat: 0, lng: 0 }]

function pol(indice: number, rol: PoligonoPrevisto['rol'], extra: Partial<PoligonoPrevisto> = {}): PoligonoPrevisto {
  return {
    indice, nombre: `P${indice}`, nombreEnElArchivo: `P${indice}`, rol, rancho: null, activo: true,
    motivo: '', areaHa: 1, vertices: 4, pieza: indice + 1, parte: null, carpeta: null, avisos: [],
    coordenadas: cuadrado, ...extra,
  }
}

const vista = (poligonos: PoligonoPrevisto[]): VistaPreviaImportacion =>
  ({ formato: 'Kml', caso: 'Mixto', resumen: { ranchos: 0, parcelas: 0, desactivados: 0, conAvisos: 0 }, poligonos })

// Un rancho con dos parcelas, otro rancho y un caso 4.
const base = vista([
  pol(0, 'Rancho', { nombre: 'Norte' }),
  pol(1, 'Parcela', { rancho: 0 }),
  pol(2, 'Parcela', { rancho: 0 }),
  pol(3, 'Rancho', { nombre: 'Sur' }),
  pol(4, 'RanchoConParcela'),
])

function estimacion(extra: Partial<EstimacionDeImportacion> = {}): EstimacionDeImportacion {
  return {
    valido: true, altas: 6, ranchos: 3, parcelas: 3, maximoDeAltas: 200, ejecucionesAproximadas: 162,
    hectareasRanchos: 10, hectareasParcelas: 3, meses: 24, mbArchivosMinimo: 1.2, mbArchivosMaximo: 6,
    mbBaseMinimo: 0.7, mbBaseMaximo: 2.7, demasiadoGrandes: [], errores: [], avisos: [], ...extra,
  }
}

describe('corregir', () => {
  it('guarda sólo lo que difiere de lo propuesto', () => {
    let c = corregir(base, {}, 1, { nombre: 'Lote A' })
    expect(c).toEqual({ 1: { nombre: 'Lote A' } })

    c = corregir(base, c, 1, { nombre: 'P1' })     // vuelve al propuesto
    expect(c).toEqual({})
  })

  it('pasar a rancho borra el rancho de la parcela; volver a parcela vuelve al propuesto', () => {
    let c = corregir(base, {}, 1, { rol: 'Rancho' })
    expect(aplicarCorrecciones(base, c).poligonos[1]).toMatchObject({ rol: 'Rancho', rancho: null })

    c = corregir(base, c, 1, { rol: 'Parcela' })
    expect(c).toEqual({})
    expect(aplicarCorrecciones(base, c).poligonos[1].rancho).toBe(0)
  })

  it('mueve una parcela a otro rancho', () => {
    const c = corregir(base, {}, 2, { rancho: 3 })
    const a = arbolDe(aplicarCorrecciones(base, c))
    expect(a.ranchos.find(r => r.rancho.indice === 3)?.parcelas.map(p => p.indice)).toEqual([2])
  })

  it('no toca nada si el índice no existe', () => {
    expect(corregir(base, {}, 99, { activo: false })).toEqual({})
  })

  it('sinCorreccion vuelve un polígono a lo propuesto y deja los demás', () => {
    const c = { 1: { nombre: 'A' }, 2: { activo: false } }
    expect(sinCorreccion(c, 1)).toEqual({ 2: { activo: false } })
    expect(c).toHaveProperty('1')
  })
})

describe('aplicarCorrecciones', () => {
  it('no cambia la vista original', () => {
    aplicarCorrecciones(base, { 0: { activo: false } })
    expect(base.poligonos[0].activo).toBe(true)
  })

  it('recuenta el resumen como Geocore: el caso 4 suma en los dos', () => {
    const r = aplicarCorrecciones(base, { 3: { activo: false } }).resumen
    expect(r).toMatchObject({ ranchos: 2, parcelas: 3, desactivados: 1 })
  })

  // Decisión del usuario (2026-10-04): las parcelas no se desactivan solas con su rancho.
  it('desactivar un rancho deja sus parcelas activas, en «sin rancho»', () => {
    const corregida = aplicarCorrecciones(base, corregir(base, {}, 0, { activo: false }))
    const a = arbolDe(corregida)
    expect(a.sinRancho.map(p => p.indice)).toEqual([1, 2])
    expect(corregida.poligonos[1].activo).toBe(true)
  })

  it('pasar un rancho a parcela también deja a las suyas sin rancho', () => {
    const c = corregir(base, {}, 0, { rol: 'Parcela', rancho: 3 })
    const a = arbolDe(aplicarCorrecciones(base, c))
    expect(a.sinRancho.map(p => p.indice)).toEqual([1, 2])
    expect(a.ranchos.find(r => r.rancho.indice === 3)?.parcelas.map(p => p.indice)).toEqual([0])
  })
})

describe('planDe', () => {
  it('lleva todos los polígonos; un desactivado viaja con activo=false', () => {
    const plan = planDe(aplicarCorrecciones(base, { 2: { activo: false } }))
    expect(plan.poligonos).toHaveLength(5)
    expect(plan.poligonos[2]).toEqual({ indice: 2, rol: 'Parcela', rancho: 0, nombre: 'P2', activo: false })
  })

  it('es lo que se ve: el nombre corregido, recortado, y el rancho elegido', () => {
    const c = corregir(base, corregir(base, {}, 1, { nombre: '  Lote A  ' }), 1, { rancho: 3 })
    expect(planDe(aplicarCorrecciones(base, c)).poligonos[1]).toEqual(
      { indice: 1, rol: 'Parcela', rancho: 3, nombre: 'Lote A', activo: true })
  })

  it('un rancho nunca manda rancho, aunque la propuesta lo trajera', () => {
    const v = vista([pol(0, 'Rancho', { rancho: 5 }), pol(1, 'RanchoConParcela', { rancho: 0 })])
    expect(planDe(v).poligonos.map(p => p.rancho)).toEqual([null, null])
  })

  it('la huella cambia con cualquier corrección', () => {
    const a = huellaDe(planDe(base))
    expect(huellaDe(planDe(aplicarCorrecciones(base, {})))).toBe(a)
    expect(huellaDe(planDe(aplicarCorrecciones(base, { 4: { activo: false } })))).not.toBe(a)
  })
})

describe('ranchosPosibles', () => {
  it('son los ranchos activos del archivo, sin el caso 4 ni el propio polígono', () => {
    const corregida = aplicarCorrecciones(base, { 3: { activo: false } })
    expect(ranchosPosibles(corregida, 1)).toEqual([{ value: '0', label: 'Norte' }])
    expect(ranchosPosibles(base, 0).map(o => o.value)).toEqual(['3'])
  })
})

describe('porIndice', () => {
  it('separa lo de cada polígono de lo del plan entero', () => {
    const { delPoligono, generales } = porIndice([
      { indice: 1, codigo: 'SOLAPA', texto: 'a' },
      { indice: null, codigo: 'DEMASIADAS_ALTAS', texto: 'b' },
      { indice: 1, codigo: 'NOMBRE_REPETIDO', texto: 'c' },
    ])
    expect(delPoligono.get(1)?.map(o => o.codigo)).toEqual(['SOLAPA', 'NOMBRE_REPETIDO'])
    expect(generales.map(o => o.codigo)).toEqual(['DEMASIADAS_ALTAS'])
  })
})

describe('porQueNoSePuedeCrear', () => {
  const huella = huellaDe(planDe(base))

  it('sin revisar, no', () => {
    expect(porQueNoSePuedeCrear(null, huella)).toMatch(/Revisá/)
  })

  it('si cambió algo después de revisar, no', () => {
    expect(porQueNoSePuedeCrear({ huella: 'otra', estimacion: estimacion() }, huella)).toMatch(/revisá de nuevo/)
  })

  it('con errores, no, y dice cuántos', () => {
    const e = estimacion({ valido: false, errores: [{ indice: 1, codigo: 'SOLAPA', texto: '' }] })
    expect(porQueNoSePuedeCrear({ huella, estimacion: e }, huella)).toMatch(/1 error:/)
  })

  it('revisado, sin errores y con algo para crear: sí', () => {
    expect(porQueNoSePuedeCrear({ huella, estimacion: estimacion() }, huella)).toBeNull()
    expect(porQueNoSePuedeCrear({ huella, estimacion: estimacion({ altas: 0 }) }, huella)).toMatch(/nada/)
  })
})

describe('textos de la estimación', () => {
  it('las altas, en singular y plural', () => {
    expect(altasEnPalabras(estimacion())).toBe('6 altas (3 ranchos y 3 parcelas), unas 162 ejecuciones de Inngest.')
    expect(altasEnPalabras(estimacion({ altas: 1, ranchos: 1, parcelas: 0, ejecucionesAproximadas: 27 })))
      .toBe('1 alta (1 rancho y 0 parcelas), unas 27 ejecuciones de Inngest.')
  })

  it('la ocupación pasa a GB cuando es mucha', () => {
    expect(ocupacionEnPalabras(estimacion())).toContain('1,2 a 6 MB')
    expect(ocupacionEnPalabras(estimacion({ mbArchivosMinimo: 3291.6, mbArchivosMaximo: 16458.1 }))).toContain('3,2 a 16,1 GB')
  })
})
