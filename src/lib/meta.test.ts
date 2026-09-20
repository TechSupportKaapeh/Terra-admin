import { describe, expect, it } from 'vitest'
import { emptyMeta, metaToPayload } from '@/lib/meta'

/**
 * Los campos opcionales de ubicación (M.7.6).
 *
 * El formulario los edita como texto porque un `<input>` no devuelve otra cosa, y esta
 * función es el único lugar donde se traducen a lo que espera la API. Lo que importa es
 * que un campo vacío **no se mande**: mandarlo como `""` guardaría un municipio vacío en
 * vez de dejarlo sin dato.
 */

describe('metaToPayload', () => {
  it('el formulario en blanco no manda ningún campo', () => {
    expect(metaToPayload(emptyMeta)).toEqual({
      municipio: undefined,
      estado: undefined,
      region: undefined,
      altitudM: undefined,
    })
  })

  it('lo que está escrito viaja tal cual', () => {
    const p = metaToPayload({ municipio: 'León', estado: 'Guanajuato', region: 'Bajío', altitudM: '1800' })
    expect(p.municipio).toBe('León')
    expect(p.estado).toBe('Guanajuato')
    expect(p.region).toBe('Bajío')
  })

  it('la altitud viaja como número, no como texto', () => {
    expect(metaToPayload({ ...emptyMeta, altitudM: '1800' }).altitudM).toBe(1800)
  })

  it('una altitud con decimales no se trunca', () => {
    expect(metaToPayload({ ...emptyMeta, altitudM: '1800.5' }).altitudM).toBe(1800.5)
  })

  it('altitud vacía no es 0: son cosas distintas y 0 es una altitud válida', () => {
    expect(metaToPayload({ ...emptyMeta, altitudM: '' }).altitudM).toBeUndefined()
    expect(metaToPayload({ ...emptyMeta, altitudM: '0' }).altitudM).toBe(0)
  })
})
