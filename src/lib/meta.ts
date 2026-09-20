/**
 * Los datos opcionales de ubicación que llevan un rancho y una parcela.
 *
 * Son los mismos para los dos, y el formulario los edita como texto (un `<input>` no
 * devuelve otra cosa): `metaToPayload` es el único lugar donde se traducen a lo que
 * espera la API, con el vacío como "no mandar el campo" y la altitud como número.
 *
 * Vive en `lib/` y no junto al formulario porque exportar funciones desde un archivo de
 * componentes rompe el fast refresh (`react-refresh/only-export-components`).
 */

export interface Meta {
  municipio: string
  estado: string
  region: string
  altitudM: string
}

export const emptyMeta: Meta = { municipio: '', estado: '', region: '', altitudM: '' }

/** Los campos que van en el POST: el texto vacío no se manda, y la altitud va como número. */
export function metaToPayload(m: Meta) {
  return {
    municipio: m.municipio || undefined,
    estado: m.estado || undefined,
    region: m.region || undefined,
    altitudM: m.altitudM ? parseFloat(m.altitudM) : undefined,
  }
}
