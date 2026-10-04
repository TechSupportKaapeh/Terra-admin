import type { Shape } from '@/components/GeometryView'

/**
 * Las opciones de trazo de Leaflet para una forma, **sin claves en `undefined`**.
 *
 * Leaflet copia las opciones tal cual sobre sus defaults (`L.setOptions`), así que un
 * `weight: undefined` pisa el grosor por defecto con `undefined`. Su tolerancia de clic
 * pasa a ser `NaN`, el recuadro del polígono queda en `NaN`, y Leaflet lo descarta como
 * «fuera de la vista»: **el polígono no se dibuja y no hay ningún error**. Pasó el
 * 2026-10-04 con el mapa de Ranchos, que no pasa grosor (K.5 lo había agregado).
 */
export function opcionesDeTrazo(s: Shape): Record<string, string | number> {
  const opciones: Record<string, string | number> = {
    color: s.color ?? '#2563eb',
    fillOpacity: s.fillOpacity ?? 0.15,
  }
  if (s.weight !== undefined) opciones.weight = s.weight
  if (s.dashed) opciones.dashArray = '6 6'
  return opciones
}
