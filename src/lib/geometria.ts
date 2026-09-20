import type { Coord } from '@/components/GeometryInput'

/**
 * Reglas del anillo de un polígono, compartidas entre el editor y quien lo dibuje.
 *
 * Viven en `lib/` y no en el componente porque exportar funciones desde un archivo de
 * componentes rompe el fast refresh (`react-refresh/only-export-components`, la misma regla
 * que `DECISIONS #24` dejó activa fuera de `components/ui/`). Y son puras, así que son lo
 * primero que conviene cubrir cuando lleguen los tests de `src/lib/` (M.7.6).
 */

/** Si dos listas de coordenadas son la misma, punto por punto y en el mismo orden. */
export function mismasCoordenadas(a: Coord[], b: Coord[]): boolean {
  return a.length === b.length && a.every((c, i) => c.lat === b[i].lat && c.lng === b[i].lng)
}

/**
 * Si el anillo cierra: el primer punto y el último son el mismo. Es lo que exige el dominio de
 * Geocore (`GeoPolygon.Create`), y comprobarlo acá evita mandar un POST que ya se sabe que
 * va a fallar.
 */
export function cierra(coords: Coord[]): boolean {
  if (coords.length < 3) return false
  const primero = coords[0]
  const ultimo = coords[coords.length - 1]
  return primero.lat === ultimo.lat && primero.lng === ultimo.lng
}
