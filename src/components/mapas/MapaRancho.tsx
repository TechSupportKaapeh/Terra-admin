import { useEffect } from 'react'
import { MapContainer, Polygon, TileLayer, Tooltip, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import type { LayerDetail, Parcela, Rancho } from '@/lib/api'
import { escalaDe, PALETAS } from '@/lib/indices'

/**
 * El mapa de un mes del rancho: el ráster del índice, con el rancho y sus parcelas encima.
 *
 * **El COG guarda el índice crudo en float32** —números, no colores—, y la plantilla de
 * tiles que arma Geocore sale sin `rescale` ni `colormap_name`: los agrega el front, con la
 * escala del índice (`lib/indices.ts`). El `token` va en la URL y no en una cabecera porque
 * quien pide cada tile es un `<img>` de Leaflet, que no manda cabeceras.
 *
 * Sólo pinta. Qué mes y qué índice se ven lo deciden los controles de arriba.
 */
export default function MapaRancho({ rancho, parcelas, capa, indice, token, alto = 420 }: {
  rancho: Rancho
  parcelas: Parcela[]
  /** El detalle de la capa del mes elegido, o null mientras no llegó. */
  capa: LayerDetail | null
  indice: string
  token: string
  alto?: number
}) {
  const escala = escalaDe(indice)
  const [min, max] = escala.rango

  // Sin capa o sin token no hay ráster que pedir: el mapa muestra igual los polígonos,
  // que es lo que deja ver *dónde* está el rancho mientras el resto carga.
  const urlTiles = capa && token
    ? `${capa.tiles[0]}&${new URLSearchParams({ rescale: `${min},${max}`, colormap_name: escala.paleta, token })}`
    : null

  const anillo = rancho.coordinates.map(c => [c.lat, c.lng] as [number, number])
  const centro: [number, number] = anillo[0] ?? [20.6597, -103.3496]

  return (
    <div className="space-y-2">
      {/* `isolate`: los z-index de Leaflet (400/1000) quedan encerrados acá y no tapan los
          desplegables ni el botón de cerrar del panel (z-50). */}
      <div className="relative isolate overflow-hidden rounded-md border" style={{ height: alto }}>
        <MapContainer center={centro} zoom={13} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            attribution="Imagen © Esri"
            maxZoom={20}
          />

          {capa && urlTiles && (
            <TileLayer
              // `key` con la URL entera: al cambiar de mes o de índice cambia la capa, y
              // sin esto Leaflet reusaría la instancia con los tiles del mes anterior.
              key={urlTiles}
              url={urlTiles}
              bounds={[[capa.bounds[1], capa.bounds[0]], [capa.bounds[3], capa.bounds[2]]]}
              // El zoom nativo del ráster: más fino que el dato, TiTiler agranda en el
              // servidor y sólo gasta CPU.
              maxNativeZoom={capa.maxzoom}
              maxZoom={20}
              opacity={0.85}
              noWrap
            />
          )}

          {/* El rancho, sin relleno: el relleno taparía el ráster, que es el dato. */}
          <Polygon positions={anillo} pathOptions={{ color: '#2563eb', weight: 2, fill: false }}>
            <Tooltip sticky>{rancho.name}</Tooltip>
          </Polygon>

          {parcelas.map(p => (
            <Polygon
              key={p.id}
              positions={p.coordinates.map(c => [c.lat, c.lng] as [number, number])}
              pathOptions={{ color: '#ffffff', weight: 1.5, fill: false }}
            >
              <Tooltip sticky>{p.name}</Tooltip>
            </Polygon>
          ))}

          <Encuadre anillo={anillo} />
        </MapContainer>
      </div>

      <Leyenda indice={indice} />
    </div>
  )
}

/**
 * Encuadra el rancho entero, una vez por rancho.
 *
 * En react-leaflet las props `center`/`zoom` no son reactivas después del montaje, así
 * que el encuadre se hace imperativo. Depende de la **huella** del anillo y no del array,
 * que es nuevo en cada render: si no, el mapa saltaría al encuadre inicial cada vez que
 * cambia el mes, y perdería el paneo y el zoom de quien está mirando.
 */
function Encuadre({ anillo }: { anillo: [number, number][] }) {
  const map = useMap()
  const huella = anillo.map(([lat, lng]) => `${lat},${lng}`).join(';')

  useEffect(() => {
    if (anillo.length > 0) map.fitBounds(anillo, { padding: [20, 20] })
    // Dep intencional: la huella (valor) en vez del array (identidad).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [huella, map])

  return null
}

/** La escala de color del índice, con su centro marcado cuando significa algo. */
function Leyenda({ indice }: { indice: string }) {
  const escala = escalaDe(indice)
  const [min, max] = escala.rango
  const centro = escala.centro

  return (
    <div className="w-56">
      <div className="relative h-3 rounded-sm border" style={{ background: `linear-gradient(90deg,${PALETAS[escala.paleta]})` }}>
        {/* En NDMI el 0 separa seco de húmedo. Sin la marca, una rampa divergente se lee
            como si fuera de magnitud. */}
        {centro !== undefined && centro > min && centro < max && (
          <span
            className="absolute top-0 h-3 w-px bg-foreground"
            style={{ left: `${((centro - min) / (max - min)) * 100}%` }}
            title={`${centro}`}
          />
        )}
      </div>
      <div className="mt-0.5 flex justify-between font-mono text-xs text-muted-foreground tabular-nums">
        <span>{min}</span>
        <span>{indice.toUpperCase()} · {escala.que}</span>
        <span>{max}</span>
      </div>
    </div>
  )
}
