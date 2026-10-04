import { describe, expect, it } from 'vitest'
import type { PoligonoPrevisto, VistaPreviaImportacion } from '@/lib/api'
import {
  COLOR_DESACTIVADO,
  MAX_BYTES_IMPORTACION,
  COLOR_POR_ROL,
  arbolDe,
  formasDe,
  hectareas,
  origenDe,
  problemaDelArchivo,
  resumenEnPalabras,
  tamanoDeArchivo,
} from '@/lib/importacion'

/**
 * La vista previa de la importación (K.5). Lo que importa fijar es que lo que se ve sea lo que
 * devolvió Geocore: que una parcela quede bajo su rancho y no bajo otro, que nada desaparezca
 * de la pantalla, y que el mapa no tape las parcelas con sus ranchos.
 */

const cuadrado = [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }, { lat: 1, lng: 1 }, { lat: 0, lng: 0 }]

function pol(indice: number, rol: PoligonoPrevisto['rol'], extra: Partial<PoligonoPrevisto> = {}): PoligonoPrevisto {
  return {
    indice, nombre: `P${indice}`, nombreEnElArchivo: `P${indice}`, rol, rancho: null, activo: true,
    motivo: '', areaHa: 1, vertices: 4, pieza: indice + 1, parte: null, carpeta: null, avisos: [],
    coordenadas: cuadrado, ...extra,
  }
}

function vista(poligonos: PoligonoPrevisto[], resumen = { ranchos: 0, parcelas: 0, desactivados: 0, conAvisos: 0 }): VistaPreviaImportacion {
  return { formato: 'Kml', caso: 'Mixto', resumen, poligonos }
}

describe('arbolDe', () => {
  it('cuelga cada parcela de su rancho, aunque el rancho venga después', () => {
    const a = arbolDe(vista([
      pol(0, 'Parcela', { rancho: 3 }),
      pol(1, 'Rancho'),
      pol(2, 'Parcela', { rancho: 1 }),
      pol(3, 'Rancho'),
    ]))

    expect(a.ranchos.map(r => [r.rancho.indice, r.parcelas.map(p => p.indice)])).toEqual([[1, [2]], [3, [0]]])
  })

  it('separa el caso 4 y lo desactivado, en el orden del archivo', () => {
    const a = arbolDe(vista([
      pol(0, 'RanchoConParcela'),
      pol(1, 'Rancho', { activo: false }),
      pol(2, 'NoImportable', { activo: false }),
      pol(3, 'RanchoConParcela'),
    ]))

    expect(a.ranchos).toEqual([])
    expect(a.caso4.map(p => p.indice)).toEqual([0, 3])
    expect(a.desactivados.map(p => p.indice)).toEqual([1, 2])
  })

  it('una parcela desactivada (un duplicado) no se cuelga de su rancho', () => {
    const a = arbolDe(vista([pol(0, 'Rancho'), pol(1, 'Parcela', { rancho: 0, activo: false })]))

    expect(a.ranchos[0].parcelas).toEqual([])
    expect(a.desactivados.map(p => p.indice)).toEqual([1])
  })

  it('nada se pierde de la pantalla: una parcela sin rancho activo va con lo desactivado', () => {
    const v = vista([pol(0, 'Rancho', { activo: false }), pol(1, 'Parcela', { rancho: 0 }), pol(2, 'Parcela', { rancho: 9 })])
    const a = arbolDe(v)

    const mostrados = a.ranchos.flatMap(r => [r.rancho, ...r.parcelas]).concat(a.caso4, a.desactivados)
    expect(mostrados.map(p => p.indice).sort()).toEqual([0, 1, 2])
  })
})

describe('formasDe', () => {
  it('dibuja los ranchos primero, para que no tapen a sus parcelas', () => {
    const f = formasDe(vista([pol(0, 'Parcela', { rancho: 1 }), pol(1, 'Rancho'), pol(2, 'RanchoConParcela')]), null)

    expect(f.map(s => s.label)).toEqual(['P1 · Rancho', 'P2 · Rancho + parcela', 'P0 · Parcela'])
  })

  it('colorea por rol, y lo desactivado en gris punteado', () => {
    const f = formasDe(vista([pol(0, 'Rancho'), pol(1, 'Rancho', { activo: false })]), null)

    expect(f[0]).toMatchObject({ color: COLOR_POR_ROL.Rancho, dashed: false })
    expect(f[1]).toMatchObject({ color: COLOR_DESACTIVADO, dashed: true, label: 'P1 · Rancho (desactivado)' })
  })

  it('resalta el elegido', () => {
    const f = formasDe(vista([pol(0, 'Rancho'), pol(1, 'Rancho')]), 1)

    expect(f.map(s => s.weight)).toEqual([2, 4])
  })
})

describe('textos', () => {
  it('el resumen cuenta en singular y plural, y dice lo que queda afuera', () => {
    expect(resumenEnPalabras(vista([], { ranchos: 1, parcelas: 3, desactivados: 0, conAvisos: 0 })))
      .toBe('Se crearían 1 rancho y 3 parcelas.')
    expect(resumenEnPalabras(vista([], { ranchos: 5, parcelas: 1, desactivados: 2, conAvisos: 0 })))
      .toBe('Se crearían 5 ranchos y 1 parcela; 2 polígonos quedan afuera.')
  })

  it('el origen ubica el polígono en el archivo', () => {
    expect(origenDe(pol(0, 'Parcela', { pieza: 3, parte: { numero: 2, de: 2 }, carpeta: 'Rancho Buga' })))
      .toBe('Elemento 3 del archivo, parte 2 de 2 · carpeta «Rancho Buga»')
    expect(origenDe(pol(0, 'Rancho', { pieza: 7 }))).toBe('Elemento 7 del archivo')
  })

  it('las hectáreas llevan más decimales cuando son pocas', () => {
    expect(hectareas(9.23)).toBe('9,23 ha')
    expect(hectareas(2494.83)).toBe('2.494,8 ha')
  })
})

describe('problemaDelArchivo', () => {
  // Lo que se arrastra llega sin el filtro del `accept`: esto es lo único que lo frena antes de subirlo.
  it('acepta los formatos de Geocore, sin distinguir mayúsculas', () => {
    for (const n of ['a.kml', 'a.geojson', 'a.json', 'a.wkt', 'a.txt', 'A.KML']) {
      expect(problemaDelArchivo(n, 100)).toBeNull()
    }
  })

  it('un KMZ dice cómo resolverlo', () => {
    expect(problemaDelArchivo('ranchos.kmz', 100)).toContain('descomprimilo')
  })

  it('rechaza otro formato, un archivo sin extensión, uno vacío y uno de más de 10 MB', () => {
    expect(problemaDelArchivo('ranchos.shp', 100)).toContain('no es un formato')
    expect(problemaDelArchivo('ranchos', 100)).toContain('no es un formato')
    expect(problemaDelArchivo('a.kml', 0)).toContain('vacío')
    expect(problemaDelArchivo('a.kml', MAX_BYTES_IMPORTACION + 1)).toContain('el máximo es 10 MB')
    expect(problemaDelArchivo('a.kml', MAX_BYTES_IMPORTACION)).toBeNull()
  })
})

describe('tamanoDeArchivo', () => {
  it('elige la unidad', () => {
    expect(tamanoDeArchivo(512)).toBe('512 B')
    expect(tamanoDeArchivo(73_306)).toBe('72 KB')
    expect(tamanoDeArchivo(2.5 * 1024 * 1024)).toBe('2,5 MB')
  })
})
