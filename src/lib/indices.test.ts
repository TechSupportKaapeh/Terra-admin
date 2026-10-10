import { describe, expect, it } from 'vitest'
import { ESCALAS, escalaDe, fueraDeEscala, INDICES, PALETAS, rescaleDe, valorDelIndice, esColorReal } from '@/lib/indices'

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
    // Un índice que el worker sume antes que el panel se pinta con algo razonable hasta que
    // tenga su fila. (Hasta M.9.3 el ejemplo era SAVI, que ya la tiene.)
    const escala = escalaDe('gndvi')
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
      // El color real va sin paleta a propósito: son tres bandas y TiTiler las pinta en color.
      if (esColorReal(nombre)) continue
      expect(PALETAS[escala.paleta], `${nombre} → ${escala.paleta}`).toBeDefined()
    }
  })

  it('el color real no tiene paleta y va en reflectancia', () => {
    // M.9.7f: con una paleta, TiTiler pintaría sólo la primera de las tres bandas.
    expect(esColorReal('rgb')).toBe(true)
    expect(esColorReal('ndvi')).toBe(false)
    expect(escalaDe('rgb').paleta).toBe('')
    expect(rescaleDe(escalaDe('rgb').rango, 10000)).toBe('0,3000')
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

describe('rescaleDe', () => {
  // M.9.7 (Geocore DECISIONS #53): el COG multibanda guarda el índice ×10.000. Pedir el rango
  // sin escalar pinta todo del color del extremo, y no da ningún error: se ve "de un solo color".

  it('un COG de antes, sin escala, pide el rango tal cual', () => {
    expect(rescaleDe(escalaDe('ndvi').rango, null)).toBe('0,0.8')
    expect(rescaleDe(escalaDe('ndvi').rango)).toBe('0,0.8')
  })

  it('un COG multibanda pide el rango multiplicado por su escala', () => {
    expect(rescaleDe(escalaDe('ndvi').rango, 10000)).toBe('0,8000')
    expect(rescaleDe(escalaDe('ndre').rango, 10000)).toBe('0,5000')
  })

  it('el rango negativo de NDMI también se escala', () => {
    expect(rescaleDe(escalaDe('ndmi').rango, 10000)).toBe('-4000,4000')
  })

  it('sin ruido de float en la URL', () => {
    expect(rescaleDe([0.1, 0.3], 3)).toBe('0.3,0.9')
  })
})

describe('valorDelIndice', () => {
  it('pasa un valor guardado como entero a las unidades del índice', () => {
    expect(valorDelIndice(6150, 10000)).toBeCloseTo(0.615)
  })

  it('sin escala lo deja igual', () => {
    expect(valorDelIndice(0.615, null)).toBe(0.615)
  })
})

describe('una escala inválida', () => {
  // La base la rechaza (ck_layers_escala), pero el panel no depende de eso: con 0, el valor
  // de un píxel saldría Infinity. Auditoría de M.9.7b, 2026-09-26.
  it('se trata como sin escala, y no divide por cero', () => {
    for (const mala of [0, -10000, Number.NaN]) {
      expect(valorDelIndice(6150, mala), String(mala)).toBe(6150)
      expect(rescaleDe([0, 0.8], mala), String(mala)).toBe('0,0.8')
    }
  })
})

describe('SAVI y LAI (M.9.3, worker DECISIONS #81)', () => {
  it('la lista de índices es la de la receta v4, en su orden, sin el color real', () => {
    expect([...INDICES]).toEqual(['ndvi', 'evi', 'ndre', 'ndmi', 'savi', 'lai'])
    for (const i of INDICES) expect(ESCALAS[i], i).toBeDefined()
  })

  it('el LAI se pinta en todo su rango, 0 a 3,5, y con su escala de 1.000', () => {
    expect(escalaDe('lai').rango).toEqual([0, 3.5])
    // La capa del LAI trae escala 1000: 3,5 por 1.000 es 3500, no 35000.
    expect(rescaleDe(escalaDe('lai').rango, 1000)).toBe('0,3500')
  })

  it('SAVI tiene su escala de vegetación, y no la de reserva', () => {
    expect(escalaDe('savi')).toMatchObject({ rango: [0, 0.7], paleta: 'rdylgn' })
  })
})
