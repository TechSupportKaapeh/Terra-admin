import { describe, expect, it } from 'vitest'
import { ESCALAS, escalaDe, fueraDeEscala, PALETAS } from '@/lib/indices'

/**
 * Cómo se pinta cada índice (M.7.6).
 *
 * Esta tabla es la que hace que el mapa no mienta: NDVI y NDMI pintados con el mismo
 * rango dan dos mapas que parecen comparables y no lo son. Los tests fijan lo que no se
 * puede romper sin darse cuenta, porque un rango mal puesto no falla — pinta distinto.
 */

describe('escalaDe', () => {
  it('los cuatro índices de la receta tienen escala propia', () => {
    for (const i of ['ndvi', 'evi', 'ndre', 'ndmi']) {
      expect(ESCALAS[i], i).toBeDefined()
    }
  })

  it('no distingue mayúsculas: la métrica llega en minúsculas de la API y en mayúsculas de la UI', () => {
    expect(escalaDe('NDVI')).toBe(escalaDe('ndvi'))
  })

  it('un índice que la tabla no conoce no rompe el mapa: cae en la escala de vegetación', () => {
    // Cuando M.9.3 sume SAVI, el mapa lo pinta con algo razonable hasta que tenga su fila.
    const escala = escalaDe('savi')
    expect(escala.rango).toEqual([0, 0.8])
    expect(escala.paleta).toBe('rdylgn')
  })

  it('NDMI es la única divergente, y su centro es el 0 que separa seco de húmedo', () => {
    expect(escalaDe('ndmi').centro).toBe(0)
    for (const i of ['ndvi', 'evi', 'ndre']) {
      expect(escalaDe(i).centro, i).toBeUndefined()
    }
  })

  it('el centro, cuando está, cae dentro del rango: si no, la marca de la leyenda queda afuera', () => {
    for (const [nombre, escala] of Object.entries(ESCALAS)) {
      if (escala.centro === undefined) continue
      expect(escala.centro, nombre).toBeGreaterThan(escala.rango[0])
      expect(escala.centro, nombre).toBeLessThan(escala.rango[1])
    }
  })

  it('todo rango va de menor a mayor', () => {
    for (const [nombre, escala] of Object.entries(ESCALAS)) {
      expect(escala.rango[0], nombre).toBeLessThan(escala.rango[1])
    }
  })

  it('cada índice pide una paleta que existe: la leyenda sale del mismo degradado que el tile', () => {
    // Si la paleta no está, la leyenda queda transparente y el mapa igual se pinta: el
    // mapa diría una cosa y su escala otra, sin ningún error a la vista.
    for (const [nombre, escala] of Object.entries(ESCALAS)) {
      expect(PALETAS[escala.paleta], `${nombre} → ${escala.paleta}`).toBeDefined()
    }
  })
})

describe('fueraDeEscala', () => {
  // Lo que antes se veía moviendo el rescale a mano en Diagnóstico → Tiles. Sin este aviso,
  // un ráster entero bajo cero pintado en la escala del NDVI se ve rojo parejo, y parece un
  // COG roto en vez de un dato que la escala no alcanza.

  it('un NDVI entero bajo cero cae por debajo de su escala', () => {
    expect(fueraDeEscala({ min: -0.4, max: -0.05 }, escalaDe('ndvi'))).toBe('abajo')
  })

  it('un ráster por encima del techo cae arriba', () => {
    // NDRE llega sólo a 0,5: un NDRE de 0,55 a 0,7 se pinta entero en el extremo verde.
    expect(fueraDeEscala({ min: 0.55, max: 0.7 }, escalaDe('ndre'))).toBe('arriba')
  })

  it('un ráster que la escala corta, aunque sea en parte, no avisa: se ve con colores', () => {
    expect(fueraDeEscala({ min: -0.2, max: 0.3 }, escalaDe('ndvi'))).toBeNull()
    expect(fueraDeEscala({ min: 0.1, max: 0.6 }, escalaDe('ndvi'))).toBeNull()
  })

  it('NDMI negativo NO está fuera de escala: su escala es divergente y arranca en −0,4', () => {
    expect(fueraDeEscala({ min: -0.3, max: -0.1 }, escalaDe('ndmi'))).toBeNull()
  })
})
