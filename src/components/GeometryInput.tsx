import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, Polygon, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

export type Coord = { lat: number; lng: number }

interface Props {
  value: Coord[]
  onChange: (coords: Coord[], fuente: string) => void
}

function FitBounds({ coords }: { coords: Coord[] }) {
  const map = useMap()
  useEffect(() => {
    if (coords.length > 2) {
      map.fitBounds(coords.map(c => [c.lat, c.lng] as [number, number]), { padding: [20, 20] })
    }
  }, [coords, map])
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

export default function GeometryInput({ value, onChange }: Props) {
  const [manualText, setManualText] = useState(
    value.map(c => `${c.lat},${c.lng}`).join('\n') ||
    '20.6597,-103.3496\n20.6630,-103.3496\n20.6630,-103.3450\n20.6597,-103.3450\n20.6597,-103.3496'
  )
  const [parseError, setParseError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const defaultCenter: [number, number] = value.length > 0
    ? [value[0].lat, value[0].lng]
    : [20.6597, -103.3496]

  function applyManual() {
    const coords = parseManual(manualText)
    if (coords.length < 3) { setParseError('Mínimo 3 puntos'); return }
    setParseError('')
    onChange(coords, 'manual')
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
      <div className="rounded-md overflow-hidden border h-48">
        <MapContainer center={defaultCenter} zoom={13} style={{ height: '100%', width: '100%' }} zoomControl={false}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {value.length > 2 && (
            <Polygon positions={value.map(c => [c.lat, c.lng] as [number, number])} pathOptions={{ color: '#2563eb', fillOpacity: 0.15 }} />
          )}
          <FitBounds coords={value} />
        </MapContainer>
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
          <Button type="button" size="sm" variant="outline" onClick={applyManual}>Aplicar</Button>
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

      {parseError && <p className="text-destructive text-xs">{parseError}</p>}
      {value.length > 0 && (
        <p className="text-xs text-muted-foreground">{value.length} puntos cargados</p>
      )}
    </div>
  )
}
