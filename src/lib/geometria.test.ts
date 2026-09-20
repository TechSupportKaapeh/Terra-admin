import { describe, expect, it } from 'vitest'
import { cierra, mismasCoordenadas } from '@/lib/geometria'

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
