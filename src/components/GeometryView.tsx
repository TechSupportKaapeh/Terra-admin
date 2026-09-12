import { useEffect } from 'react'
import { MapContainer, TileLayer, Polygon, Tooltip, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import type { Coordinate } from '@/lib/api'

/**
 * Una geometría a dibujar. Es una abstracción de dominio-agnóstica a propósito:
 * el componente no sabe de "ranchos" ni "parcelas", solo de polígonos con un color
 * y una etiqueta. Eso permite superponer varias entidades (rancho + sus parcelas)
 * en el mismo mapa sin acoplar el visor al modelo de negocio.
 */
export interface Shape {
  /** Vértices del polígono en orden (lat, lng) — tal como llegan del backend. */
  coordinates: Coordinate[]
  /** Color del trazo/relleno. Por defecto azul. */
  color?: string
  /** Texto del tooltip al pasar el mouse sobre el polígono. */
  label?: string
}

interface Props {
  shapes: Shape[]
  /** Alto del mapa en px. El ancho siempre ocupa el contenedor. */
  height?: number
}

/**
 * Ajusta el encuadre del mapa para que entren todas las geometrías.
 *
 * Por qué existe: en react-leaflet las props `center`/`zoom` de `MapContainer` NO son
 * reactivas tras el montaje, así que el encuadre debe ajustarse de forma imperativa
 * con `useMap().fitBounds`. Este componente no renderiza nada (`return null`); solo
 * existe para colgar ese efecto dentro del contexto del mapa.
 *
 * Por qué depende de `signature` y no de `shapes`: `shapes` es un array nuevo en cada
 * render (se construye en el cuerpo del padre), de modo que usarlo como dependencia
 * dispararía `fitBounds` en CADA render y el mapa "saltaría" ante cualquier cambio de
 * estado no relacionado. `signature` es un string derivado de las coordenadas: solo
 * cambia cuando cambia la geometría, por lo que el encuadre se recalcula únicamente
 * cuando de verdad hace falta.
 */
function FitBounds({ shapes, signature }: { shapes: Shape[]; signature: string }) {
  const map = useMap()
  useEffect(() => {
    const all = shapes.flatMap(s => s.coordinates).map(c => [c.lat, c.lng] as [number, number])
    if (all.length > 0) map.fitBounds(all, { padding: [20, 20] })
    // Dep intencional: `signature` (valor) en vez de `shapes` (identidad). Ver doc arriba.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, map])
  return null
}

/**
 * Mapa de SOLO LECTURA para geometrías ya guardadas.
 *
 * Contraparte de `GeometryInput` (que edita): aquí no hay estado, ni parseo, ni
 * callbacks. Recibe las `coordinates` que `RanchoDto`/`ParcelaDto` ya devuelven y las
 * dibuja. La idea es no volver a pedir al backend algo que ya viaja en la respuesta.
 */
export default function GeometryView({ shapes, height = 256 }: Props) {
  // Descarta polígonos degenerados (<3 vértices no forman un área). El backend valida
  // un mínimo de 3, pero esto protege ante datos parciales o entidades sin geometría.
  const withGeom = shapes.filter(s => s.coordinates.length > 2)

  // Huella primitiva de toda la geometría visible: alimenta a FitBounds para que el
  // encuadre dependa del VALOR de las coordenadas, no de la identidad del array.
  const signature = withGeom.map(s => s.coordinates.map(c => `${c.lat},${c.lng}`).join(';')).join('|')

  // Centro inicial. Es solo el valor de arranque del MapContainer (no reactivo);
  // FitBounds toma el control del encuadre real apenas monta. Fallback: Guadalajara.
  const center: [number, number] = withGeom[0]
    ? [withGeom[0].coordinates[0].lat, withGeom[0].coordinates[0].lng]
    : [20.6597, -103.3496]

  // Sin nada que dibujar, mostramos un placeholder en vez de un mapa vacío del mundo.
  if (withGeom.length === 0) {
    return (
      <div className="rounded-md border bg-muted/30 flex items-center justify-center text-sm text-muted-foreground" style={{ height }}>
        Sin geometría para mostrar
      </div>
    )
  }

  return (
    // `isolate` (isolation: isolate) encierra los z-index de Leaflet —panes en 400,
    // controles en 1000— en este contenedor. Sin eso compiten en el contexto raíz
    // con los diálogos (z-50) y el mapa se pinta ENCIMA del formulario "Crear
    // parcela" que se abre con un rancho seleccionado.
    <div className="isolate rounded-md overflow-hidden border" style={{ height }}>
      {/* Sin `key` en MapContainer a propósito: React reutiliza la instancia y solo
          difenecia los Polygon, evitando el error "Map container is already initialized". */}
      <MapContainer center={center} zoom={13} style={{ height: '100%', width: '100%' }} zoomControl={false}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {withGeom.map((s, i) => (
          <Polygon
            key={i}
            // Leaflet espera [lat, lng]; el backend ya entrega ese orden (GeoConverter
            // invierte el (X=lng, Y=lat) de NTS). No re-invertir aquí.
            positions={s.coordinates.map(c => [c.lat, c.lng] as [number, number])}
            pathOptions={{ color: s.color ?? '#2563eb', fillOpacity: 0.15 }}
          >
            {s.label && <Tooltip sticky>{s.label}</Tooltip>}
          </Polygon>
        ))}
        <FitBounds shapes={withGeom} signature={signature} />
      </MapContainer>
    </div>
  )
}
