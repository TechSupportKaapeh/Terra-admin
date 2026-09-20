import { describe, expect, it } from 'vitest'
import { cierra, mismasCoordenadas, puntoEnAnillo, verticesAfuera } from '@/lib/geometria'

/**
 * Las reglas del anillo (M.7.6).
 *
 * Las dos deciden si se manda un PATCH: `mismasCoordenadas` evita mandar una geometría
 * que no cambió —y el PATCH de geometría **borra lo calculado y encola el reproceso**
 * (`DECISIONS #34` de Geocore), así que mandarlo de más no es gratis— y `cierra` evita
 * un POST que Geocore ya va a rechazar.
 */

const A = { lat: 20.1, lng: -103.1 }
const B = { lat: 20.2, lng: -103.2 }
const C = { lat: 20.3, lng: -103.3 }

describe('mismasCoordenadas', () => {
  it('el mismo anillo es el mismo', () => {
    expect(mismasCoordenadas([A, B, C], [A, B, C])).toBe(true)
  })

  it('el orden importa: el mismo polígono al revés es otra lista', () => {
    // Geocore guarda el anillo con su orden; no es un conjunto de puntos.
    expect(mismasCoordenadas([A, B, C], [C, B, A])).toBe(false)
  })

  it('un punto de más no pasa como igual', () => {
    expect(mismasCoordenadas([A, B, C], [A, B, C, A])).toBe(false)
  })

  it('distinguir por valor, no por identidad: un objeto nuevo con los mismos números es igual', () => {
    expect(mismasCoordenadas([A], [{ lat: 20.1, lng: -103.1 }])).toBe(true)
  })

  it('dos listas vacías son iguales', () => {
    expect(mismasCoordenadas([], [])).toBe(true)
  })
})

describe('cierra', () => {
  it('cierra cuando el último punto repite al primero', () => {
    expect(cierra([A, B, C, A])).toBe(true)
  })

  it('no cierra si el último no vuelve al primero', () => {
    expect(cierra([A, B, C])).toBe(false)
  })

  it('con menos de 3 puntos no hay anillo, aunque el primero y el último coincidan', () => {
    expect(cierra([A, A])).toBe(false)
    expect(cierra([A])).toBe(false)
    expect(cierra([])).toBe(false)
  })
})

describe('puntoEnAnillo', () => {
  // Un cuadrado de 1° de lado, con el vértice inferior izquierdo en (0, 0).
  const cuadrado = [
    { lat: 0, lng: 0 },
    { lat: 1, lng: 0 },
    { lat: 1, lng: 1 },
    { lat: 0, lng: 1 },
    { lat: 0, lng: 0 },
  ]

  it('el centro está adentro y un punto lejano, afuera', () => {
    expect(puntoEnAnillo({ lat: 0.5, lng: 0.5 }, cuadrado)).toBe(true)
    expect(puntoEnAnillo({ lat: 5, lng: 5 }, cuadrado)).toBe(false)
  })

  it('un punto a la misma altura pero fuera del lado no cuenta como adentro', () => {
    // El error clásico del método del rayo: contar los cruces de los dos lados.
    expect(puntoEnAnillo({ lat: 0.5, lng: -1 }, cuadrado)).toBe(false)
    expect(puntoEnAnillo({ lat: 0.5, lng: 2 }, cuadrado)).toBe(false)
  })

  it('una forma cóncava tiene puntos afuera adentro de su caja', () => {
    // Una "U": la caja que la envuelve incluye el hueco del medio, que está afuera.
    const u = [
      { lat: 0, lng: 0 },
      { lat: 3, lng: 0 },
      { lat: 3, lng: 1 },
      { lat: 1, lng: 1 },
      { lat: 1, lng: 2 },
      { lat: 3, lng: 2 },
      { lat: 3, lng: 3 },
      { lat: 0, lng: 3 },
      { lat: 0, lng: 0 },
    ]
    expect(puntoEnAnillo({ lat: 0.5, lng: 1.5 }, u)).toBe(true)
    expect(puntoEnAnillo({ lat: 2, lng: 1.5 }, u)).toBe(false)
  })

  it('sin anillo no hay adentro', () => {
    expect(puntoEnAnillo({ lat: 0.5, lng: 0.5 }, [])).toBe(false)
    expect(puntoEnAnillo({ lat: 0.5, lng: 0.5 }, [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }])).toBe(false)
  })
})

describe('verticesAfuera', () => {
  const cuadrado = [
    { lat: 0, lng: 0 },
    { lat: 1, lng: 0 },
    { lat: 1, lng: 1 },
    { lat: 0, lng: 1 },
    { lat: 0, lng: 0 },
  ]

  it('devuelve la posición de cada vértice de afuera, para poder nombrarlos', () => {
    const coords = [
      { lat: 0.2, lng: 0.2 },
      { lat: 9, lng: 9 },
      { lat: 0.3, lng: 0.3 },
      { lat: -5, lng: 0.5 },
    ]
    expect(verticesAfuera(coords, cuadrado)).toEqual([1, 3])
  })

  it('todo adentro no es aviso', () => {
    expect(verticesAfuera([{ lat: 0.5, lng: 0.5 }], cuadrado)).toEqual([])
  })

  it('sin anillo de referencia no hay nada afuera: no hay contra qué comparar', () => {
    expect(verticesAfuera([{ lat: 9, lng: 9 }], [])).toEqual([])
  })
})
