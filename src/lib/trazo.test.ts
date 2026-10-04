import { describe, expect, it } from 'vitest'
import { opcionesDeTrazo } from '@/lib/trazo'

const cuadrado = [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }, { lat: 1, lng: 1 }, { lat: 0, lng: 0 }]

describe('opcionesDeTrazo', () => {
  // El bug del 2026-10-04: con `weight: undefined` Leaflet no dibuja el polígono.
  it('no manda ninguna clave en undefined', () => {
    const o = opcionesDeTrazo({ coordinates: cuadrado })
    expect(Object.values(o).some(v => v === undefined)).toBe(false)
    expect(o).not.toHaveProperty('weight')
    expect(o).not.toHaveProperty('dashArray')
  })

  it('usa los defaults de siempre: azul y relleno de 0,15', () => {
    expect(opcionesDeTrazo({ coordinates: cuadrado })).toEqual({ color: '#2563eb', fillOpacity: 0.15 })
  })

  it('pasa el grosor, el relleno y el punteado cuando vienen', () => {
    expect(opcionesDeTrazo({ coordinates: cuadrado, color: '#16a34a', weight: 4, fillOpacity: 0.35, dashed: true }))
      .toEqual({ color: '#16a34a', weight: 4, fillOpacity: 0.35, dashArray: '6 6' })
  })
})
