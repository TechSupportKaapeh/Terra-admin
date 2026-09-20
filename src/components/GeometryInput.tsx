import { useEffect, useMemo, useRef, useState } from 'react'
import { CircleMarker, MapContainer, Polyline, TileLayer, Polygon, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { cierra, mismasCoordenadas, verticesAfuera } from '@/lib/geometria'

export type Coord = { lat: number; lng: number }

interface Props {
  value: Coord[]
  onChange: (coords: Coord[], fuente: string) => void
  /**
   * El polígono dentro del cual esto tiene que entrar: el rancho, cuando se carga una
   * parcela. Se dibuja de fondo y los vértices que caigan afuera se avisan **antes** de
   * mandar el POST, que Geocore rechazaría con 422 (`DECISIONS #33`).
   */
  referencia?: { coordinates: Coord[]; nombre: string }
}

/**
 * El cuadrado de ejemplo con el que arranca el cuadro de texto. Existe para que se vea de
 * qué forma es lo que hay que escribir; al empezar a dibujar con clics se borra, porque
 * agregar puntos a un ejemplo no es lo que nadie quiere.
 */
const PLANTILLA = '20.6597,-103.3496\n20.6630,-103.3496\n20.6630,-103.3450\n20.6597,-103.3450\n20.6597,-103.3496'

/** Seis decimales son ~10 cm: más precisión que la del clic, y menos ruido que el float entero. */
const comoTexto = (c: Coord) => `${c.lat.toFixed(6)},${c.lng.toFixed(6)}`

/** Agrega un punto por cada clic en el mapa, mientras el modo dibujo esté prendido. */
function AlHacerClick({ onClick }: { onClick: (c: Coord) => void }) {
  useMapEvents({ click: e => onClick({ lat: e.latlng.lat, lng: e.latlng.lng }) })
  return null
}

/**
 * Encuadra lo que se está mirando. Sigue al **borrador**, no a lo aplicado: mientras se
 * escriben coordenadas, el punto nuevo tiene que entrar en pantalla solo, que es justamente
 * para lo que se mira el mapa mientras se escribe.
 *
 * La firma del encuadre es el texto de las coordenadas y no el array: un array nuevo en cada
 * tecleo con los mismos números volvería a encuadrar sin que nada haya cambiado.
 */
function FitBounds({ coords, referencia }: { coords: Coord[]; referencia?: Coord[] }) {
  const map = useMap()
  // Sin nada dibujado todavía, el encuadre es el del rancho: es donde hay que dibujar, y
  // arrancar mirándolo es la diferencia entre poder hacerlo y no.
  const aEncuadrar = coords.length > 0 ? coords : referencia ?? []
  const firma = aEncuadrar.map(c => `${c.lat},${c.lng}`).join(' ')

  useEffect(() => {
    if (aEncuadrar.length > 1) {
      map.fitBounds(aEncuadrar.map(c => [c.lat, c.lng] as [number, number]), { padding: [20, 20] })
    } else if (aEncuadrar.length === 1) {
      map.setView([aEncuadrar[0].lat, aEncuadrar[0].lng], 15)
    }
    // `firma` es la dependencia real; `coords` se lee adentro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma, map])
  return null
}


function parseManual(raw: string): Coord[] {
  return raw.trim().split('\n')
    .filter(l => l.trim())
    .map(line => {
      const [lat, lng] = line.split(',').map(Number)
      return { lat, lng }
    })
    .filter(c => !isNaN(c.lat) && !isNaN(c.lng))
}

function parseKML(text: string): Coord[] {
  const doc = new DOMParser().parseFromString(text, 'text/xml')
  const coordsEl = doc.getElementsByTagName('coordinates')[0]
  if (!coordsEl) return []
  return coordsEl.textContent!.trim().split(/\s+/)
    .filter(Boolean)
    .map(coord => {
      const [lng, lat] = coord.split(',').map(Number)
      return { lat, lng }
    })
    .filter(c => !isNaN(c.lat) && !isNaN(c.lng))
}

function parseGeoJSON(text: string): Coord[] {
  try {
    const geo = JSON.parse(text)
    let ring: number[][] | undefined
    if (geo.type === 'FeatureCollection') ring = geo.features?.[0]?.geometry?.coordinates?.[0]
    else if (geo.type === 'Feature') ring = geo.geometry?.coordinates?.[0]
    else if (geo.type === 'Polygon') ring = geo.coordinates?.[0]
    if (!ring) return []
    return ring.map(([lng, lat]) => ({ lat, lng }))
  } catch { return [] }
}

function parseWKT(text: string): Coord[] {
  const match = text.match(/POLYGON\s*\(\(([^)]+)\)/i)
  if (!match) return []
  return match[1].split(',').map(pair => {
    const [lng, lat] = pair.trim().split(/\s+/).map(Number)
    return { lat, lng }
  }).filter(c => !isNaN(c.lat) && !isNaN(c.lng))
}

export default function GeometryInput({ value, onChange, referencia }: Props) {
  const [manualText, setManualText] = useState(
    value.map(c => `${c.lat},${c.lng}`).join('\n') || PLANTILLA
  )
  const [parseError, setParseError] = useState('')
  const [dibujando, setDibujando] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // El borrador se deriva del texto en cada tecleo: es lo que se dibuja en vivo. Lo que se
  // manda en el POST sigue siendo `value`, que sólo cambia al aplicar.
  const borrador = useMemo(() => parseManual(manualText), [manualText])
  const sinAplicar = !mismasCoordenadas(borrador, value)
  const borradorCierra = cierra(borrador)

  // Qué vértices se salen del rancho. Se calcula sobre el borrador —en vivo, mientras se
  // dibuja o se escribe—, que es cuando corregirlo no cuesta nada.
  const afuera = referencia ? verticesAfuera(borrador, referencia.coordinates) : []

  function agregarPunto(c: Coord) {
    setParseError('')
    setManualText(t => (t.trim() ? `${t.trimEnd()}\n` : '') + comoTexto(c))
  }

  function deshacerPunto() {
    setManualText(t => t.trimEnd().split('\n').slice(0, -1).join('\n'))
  }

  /** Al prender el dibujo, el ejemplo se va: agregarle puntos no es lo que nadie quiere. */
  function alternarDibujo() {
    if (!dibujando && manualText.trim() === PLANTILLA) setManualText('')
    setDibujando(d => !d)
  }

  const defaultCenter: [number, number] = value.length > 0
    ? [value[0].lat, value[0].lng]
    : [20.6597, -103.3496]

  function applyManual() {
    if (borrador.length < 3) { setParseError('Mínimo 3 puntos'); return }
    if (!borradorCierra) {
      setParseError('El polígono no cierra: el último punto tiene que ser igual al primero.')
      return
    }
    setParseError('')
    onChange(borrador, 'manual')
  }

  /** Repite el primer punto al final. Explícito y no automático: es cambiar lo que se escribió. */
  function cerrarPoligono() {
    const primero = borrador[0]
    setManualText(`${manualText.trimEnd()}
${primero.lat},${primero.lng}`)
    setParseError('')
  }

  function handleFile(format: 'kml' | 'geojson' | 'wkt') {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (ev) => {
        const text = ev.target?.result as string
        let coords: Coord[] = []
        if (format === 'kml') coords = parseKML(text)
        else if (format === 'geojson') coords = parseGeoJSON(text)
        else if (format === 'wkt') coords = parseWKT(text)
        if (coords.length < 3) { setParseError('No se pudieron leer las coordenadas del archivo'); return }
        setParseError('')
        setManualText(coords.map(c => `${c.lat},${c.lng}`).join('\n'))
        onChange(coords, format)
      }
      reader.readAsText(file)
      e.target.value = ''
    }
  }

  return (
    <div className="space-y-3">
      {/* `isolate`: encierra los z-index de Leaflet (400/1000) en el contenedor. Hoy
          este mapa vive dentro de un DialogContent, que ya es su propio contexto, pero
          si se usara fuera de un diálogo taparía cualquier cosa con z-50. */}
      <div className={`isolate overflow-hidden rounded-md border ${dibujando ? 'h-80' : 'h-48'}`}>
        <MapContainer center={defaultCenter} zoom={13} style={{ height: '100%', width: '100%' }} zoomControl={false}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

          {/* El rancho de referencia, punteado y sin peso visual: es el marco, no el dato
              que se está cargando. */}
          {referencia && referencia.coordinates.length > 2 && (
            <Polygon
              positions={referencia.coordinates.map(c => [c.lat, c.lng] as [number, number])}
              pathOptions={{ color: '#64748b', weight: 2, dashArray: '6 4', fillOpacity: 0.05 }}
            >
              <Tooltip sticky>{referencia.nombre}</Tooltip>
            </Polygon>
          )}

          {/* Lo aplicado, en azul: es lo que se va a mandar. */}
          {value.length > 2 && (
            <Polygon positions={value.map(c => [c.lat, c.lng] as [number, number])} pathOptions={{ color: '#2563eb', fillOpacity: 0.15 }} />
          )}

          {/* El borrador, en ámbar y punteado, mientras difiera de lo aplicado: los puntos
              tal como se escriben y la línea que los une, aunque todavía no cierren. */}
          {sinAplicar && borrador.length > 1 && (
            <Polyline
              positions={[...borrador, ...(borradorCierra ? [] : [borrador[0]])].map(c => [c.lat, c.lng] as [number, number])}
              pathOptions={{ color: '#d97706', weight: 2, dashArray: borradorCierra ? undefined : '4 4' }}
            />
          )}
          {sinAplicar && borrador.map((c, i) => {
            // Rojo = fuera del rancho. Es la segunda codificación, además del aviso de
            // abajo: en el mapa se ve *cuál* es, que es lo que hace falta para arreglarlo.
            const fuera = afuera.includes(i)
            const color = fuera ? '#dc2626' : '#d97706'
            return (
              <CircleMarker
                key={`${c.lat},${c.lng},${i}`}
                center={[c.lat, c.lng]}
                radius={i === 0 ? 6 : 4}
                pathOptions={{ color, fillColor: fuera || i === 0 ? color : '#fff', fillOpacity: 1 }}
              >
                <Tooltip>
                  {i === 0 ? 'Punto 1 (inicio)' : `Punto ${i + 1}`}
                  {fuera && referencia ? ` — fuera de ${referencia.nombre}` : ''}
                </Tooltip>
              </CircleMarker>
            )
          })}

          {dibujando && <AlHacerClick onClick={agregarPunto} />}
          <FitBounds
            coords={sinAplicar && borrador.length > 0 ? borrador : value}
            referencia={referencia?.coordinates}
          />
        </MapContainer>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant={dibujando ? 'default' : 'outline'} onClick={alternarDibujo}>
          {dibujando ? 'Dibujando…' : 'Dibujar con clics'}
        </Button>
        {dibujando && borrador.length > 0 && (
          <Button type="button" size="sm" variant="outline" onClick={deshacerPunto}>
            Deshacer punto
          </Button>
        )}
        {dibujando && (
          <span className="text-xs text-muted-foreground">
            Cada clic en el mapa agrega un vértice, en orden. «Cerrar polígono» lo termina.
          </span>
        )}
      </div>

      <Tabs defaultValue="manual">
        <TabsList className="h-8">
          <TabsTrigger value="manual" className="text-xs">Manual</TabsTrigger>
          <TabsTrigger value="kml" className="text-xs">KML</TabsTrigger>
          <TabsTrigger value="geojson" className="text-xs">GeoJSON</TabsTrigger>
          <TabsTrigger value="wkt" className="text-xs">WKT</TabsTrigger>
        </TabsList>

        <TabsContent value="manual" className="space-y-2 mt-2">
          <Label className="text-xs text-muted-foreground">Una coordenada por línea: lat,lng — el polígono debe cerrar</Label>
          <textarea
            className="w-full border rounded-md px-3 py-2 text-xs font-mono h-28 bg-background resize-none"
            value={manualText}
            onChange={e => setManualText(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={sinAplicar ? 'default' : 'outline'}
              onClick={applyManual}
              disabled={!sinAplicar || borrador.length < 3 || !borradorCierra}
            >
              {sinAplicar ? 'Aplicar' : 'Aplicado'}
            </Button>

            {sinAplicar && borrador.length > 2 && !borradorCierra && (
              <Button type="button" size="sm" variant="outline" onClick={cerrarPoligono}>
                Cerrar polígono
              </Button>
            )}

            {/* Qué se está viendo. Mientras haya borrador, lo del mapa en ámbar todavía no
                es lo que se va a mandar: eso es lo que el usuario necesita saber. */}
            <span className="text-xs text-muted-foreground">
              {!sinAplicar
                ? `${value.length} puntos aplicados`
                : borrador.length < 3
                  ? `Borrador: ${borrador.length} punto(s) — hacen falta 3`
                  : !borradorCierra
                    ? `Borrador: ${borrador.length} puntos — no cierra`
                    : `Borrador: ${borrador.length} puntos — sin aplicar`}
            </span>
          </div>
        </TabsContent>

        <TabsContent value="kml" className="space-y-2 mt-2">
          <Label className="text-xs text-muted-foreground">Archivo .kml exportado desde Google Earth, drones o GPS</Label>
          <input ref={fileRef} type="file" accept=".kml" className="text-sm" onChange={handleFile('kml')} />
        </TabsContent>

        <TabsContent value="geojson" className="space-y-2 mt-2">
          <Label className="text-xs text-muted-foreground">Archivo .geojson — estándar web para datos geoespaciales</Label>
          <input type="file" accept=".geojson,.json" className="text-sm" onChange={handleFile('geojson')} />
        </TabsContent>

        <TabsContent value="wkt" className="space-y-2 mt-2">
          <Label className="text-xs text-muted-foreground">Texto WKT — usado en catastro, PostGIS y documentos legales</Label>
          <input type="file" accept=".txt,.wkt" className="text-sm" onChange={handleFile('wkt')} />
        </TabsContent>
      </Tabs>

      {/* El aviso no bloquea: la autoridad es Geocore, que valida con PostGIS. Acá se
          avisa para no mandar un POST que ya se sabe que vuelve con 422. */}
      {referencia && afuera.length > 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-500">
          {afuera.length === 1 ? 'El punto' : 'Los puntos'} {afuera.map(i => i + 1).join(', ')}{' '}
          {afuera.length === 1 ? 'cae' : 'caen'} fuera de {referencia.nombre} (en rojo en el mapa).
          Geocore lo va a rechazar.
        </p>
      )}

      {parseError && <p className="text-destructive text-xs">{parseError}</p>}
      {value.length > 0 && !sinAplicar && (
        <p className="text-xs text-muted-foreground">{value.length} puntos cargados</p>
      )}
      {sinAplicar && borrador.length > 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-500">
          Lo naranja es el borrador y todavía no se guarda. «Aplicar» lo confirma.
        </p>
      )}
    </div>
  )
}
