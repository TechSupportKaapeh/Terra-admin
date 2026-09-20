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

/**
 * Si un punto cae adentro del anillo, por el método del rayo: se cuenta cuántos lados
 * cruza una semirrecta horizontal que sale del punto. Impar = adentro.
 *
 * **Es una cuenta plana sobre lat/lng**, no geodésica. A la escala de un rancho —decenas
 * de kilómetros— la diferencia no alcanza a cambiar de lado salvo pegado al borde, y para
 * lo que sirve —avisar antes de mandar el POST— alcanza. **La autoridad es Geocore**, que
 * valida con PostGIS y contesta 422 nombrando las parcelas que quedan afuera
 * (`DECISIONS #33`).
 */
export function puntoEnAnillo(p: Coord, anillo: Coord[]): boolean {
  if (anillo.length < 3) return false

  let adentro = false
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const a = anillo[i]
    const b = anillo[j]
    // El lado cruza la horizontal del punto, y el cruce cae a la derecha del punto.
    const cruza = (a.lat > p.lat) !== (b.lat > p.lat)
    if (!cruza) continue
    const lngDelCruce = a.lng + ((p.lat - a.lat) / (b.lat - a.lat)) * (b.lng - a.lng)
    if (p.lng < lngDelCruce) adentro = !adentro
  }
  return adentro
}

/**
 * Qué vértices de `coords` caen fuera de `anillo`, por posición (desde 0).
 *
 * Sin anillo de referencia no hay nada afuera: no es que estén todos mal, es que no hay
 * contra qué comparar.
 */
export function verticesAfuera(coords: Coord[], anillo: Coord[]): number[] {
  if (anillo.length < 3) return []
  const afuera: number[] = []
  coords.forEach((c, i) => { if (!puntoEnAnillo(c, anillo)) afuera.push(i) })
  return afuera
}
