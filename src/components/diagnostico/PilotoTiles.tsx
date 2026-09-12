import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import type { TileErrorEvent } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  getTenants, getLayers, getLayer, getMapToken, describeError,
  type Tenant, type LayerSummary, type LayerDetail,
} from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import Estado from './Estado'

/*
 * Prueba de la cadena de tiles de punta a punta, desde el panel.
 *
 * Es el piloto que vivía en /piloto del tileserver, portado acá para que quede
 * detrás del login y sólo para TerraAdmin. Hace lo mismo que va a hacer el front
 * de clientes, en el mismo orden:
 *
 *   1. GET /api/layers/{id}   Geocore da la plantilla: servidor + ?url=s3://…
 *   2. GET /api/maps/token    Geocore firma un token de mapa de una hora
 *   3. /cog/info, /statistics TiTiler dice qué hay en el COG
 *   4. /cog/tiles/…           la plantilla + rescale + colormap_name + token
 *
 * Lo que la plantilla de Geocore NO trae y agrega el front: rescale y
 * colormap_name (el COG guarda NDVI crudo en float32, números y no colores) y
 * el token. Ver tileserver-titiler/docs/viaje-de-un-tile.html.
 */

interface CogInfo { dtype: string; count: number; bounds: [number, number, number, number]; minzoom: number; maxzoom: number; width: number; height: number }
interface BandStats { min: number; max: number; percentile_2: number; percentile_98: number; valid_percent?: number }
interface Respuesta { status: number; cuerpo: unknown; bytes?: number }

// Las paradas de ColorBrewer que usa matplotlib, de donde rio-tiler saca sus
// colormaps: la leyenda sale del mismo degradado que el tile.
const PALETAS: Record<string, string> = {
  rdylgn: '#a50026,#d73027,#f46d43,#fdae61,#fee08b,#ffffbf,#d9ef8b,#a6d96a,#66bd63,#1a9850,#006837',
  ylgn: '#ffffe5,#f7fcb9,#d9f0a3,#addd8e,#78c679,#41ab5d,#238443,#006837,#004529',
  greens: '#f7fcf5,#e5f5e0,#c7e9c0,#a1d99b,#74c476,#41ab5d,#238b45,#006d2c,#00441b',
  viridis: '#440154,#482878,#3e4989,#31688e,#26828e,#1f9e89,#35b779,#6ece58,#b5de2b,#fde725',
  spectral: '#9e0142,#d53e4f,#f46d43,#fdae61,#fee08b,#ffffbf,#e6f598,#abdda4,#66c2a5,#3288bd,#5e4fa2',
  rdbu: '#67001f,#b2182b,#d6604d,#f4a582,#fddbc7,#f7f7f7,#d1e5f0,#92c5de,#4393c3,#2166ac,#053061',
}

/** Del JWT sólo se lee `exp` para la cuenta regresiva. La firma la valida TiTiler. */
function vencimiento(token: string): number | null {
  try {
    const p = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return typeof p.exp === 'number' ? p.exp : null
  } catch {
    return null
  }
}

/** La plantilla de Geocore trae `{z}/{x}/{y}`, que `new URL` codificaría: se reemplaza antes. */
function partirPlantilla(plantilla: string) {
  const u = new URL(plantilla.replace('{z}/{x}/{y}', '0/0/0'))
  return { base: u.origin, cog: u.searchParams.get('url') }
}

/** fetch que nunca levanta. status 0 = el navegador no recibió respuesta (red, URL o CORS). */
async function pedir(url: string): Promise<Respuesta> {
  try {
    const r = await fetch(url)
    const tipo = r.headers.get('content-type') ?? ''
    if (tipo.includes('json')) return { status: r.status, cuerpo: await r.json().catch(() => null) }
    if (tipo.includes('image')) return { status: r.status, cuerpo: null, bytes: (await r.blob()).size }
    return { status: r.status, cuerpo: await r.text() }
  } catch (e) {
    return { status: 0, cuerpo: String(e) }
  }
}

function detalleDe(cuerpo: unknown): string {
  if (cuerpo && typeof cuerpo === 'object' && 'detail' in cuerpo) {
    const d = (cuerpo as { detail: unknown }).detail
    return typeof d === 'string' ? d : JSON.stringify(d)
  }
  return typeof cuerpo === 'string' ? cuerpo.slice(0, 200) : ''
}

/** Las respuestas reales del tileserver (security.py y main.py), no las de TiTiler en general. */
function explicar(status: number, detalle: string): string {
  const d = detalle.toLowerCase()
  switch (status) {
    case 0: return 'El navegador no recibió respuesta: URL del tileserver mal, servicio caído o CORS.'
    case 400: return 'La ruta no está permitida: tiene que estar bajo s3://terra-assets/ y no tener "..".'
    case 401:
      if (d.includes('expir')) return 'El token venció. Renovalo y se vuelve a pintar solo.'
      if (d.includes('falta')) return 'La URL no lleva token.'
      return 'El token no valida: MAP_TOKEN_SECRET del tileserver no coincide con GeoData__MapTokenSecret de Geocore.'
    case 403: return 'El token está firmado pero no es de tipo map-access.'
    case 503: return 'Al tileserver le falta MAP_TOKEN_SECRET.'
    case 500: return 'Error del lado del servidor, sin motivo en la respuesta a propósito. Lo más común: el archivo no existe en esa ruta (en TiTiler 0.18 eso es 500, no 404).'
    default: return 'Mirá el log del tileserver: el reporte de arranque dice si MinIO conecta.'
  }
}

function categoria(v: number): string {
  if (v < 0) return 'agua o suelo desnudo'
  if (v < 0.2) return 'suelo o vegetación muy escasa'
  if (v < 0.4) return 'vegetación escasa'
  if (v < 0.6) return 'vegetación moderada'
  return 'vegetación densa'
}

function tileDelCentro([w, s, e, n]: CogInfo['bounds'], z: number) {
  const lon = (w + e) / 2, lat = (s + n) / 2, k = 2 ** z, r = lat * Math.PI / 180
  return {
    z,
    x: Math.floor((lon + 180) / 360 * k),
    y: Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * k),
  }
}

/** Encuadra el mapa en el raster. Recibe primitivos para que el efecto dependa del valor. */
function Encuadre({ w, s, e, n }: { w: number; s: number; e: number; n: number }) {
  const map = useMap()
  useEffect(() => { map.fitBounds([[s, w], [n, e]], { padding: [24, 24] }) }, [map, w, s, e, n])
  return null
}

function AlHacerClick({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: ev => onClick(ev.latlng.lat, ev.latlng.lng) })
  return null
}

export default function PilotoTiles() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [tenantId, setTenantId] = useState('')
  const [capas, setCapas] = useState<LayerSummary[]>([])
  const [capa, setCapa] = useState<LayerDetail | null>(null)
  const [token, setToken] = useState('')
  const [exp, setExp] = useState<number | null>(null)
  const [ahora, setAhora] = useState(0)
  const [info, setInfo] = useState<CogInfo | null>(null)
  const [stats, setStats] = useState<BandStats | null>(null)
  const [rmin, setRmin] = useState('-1')
  const [rmax, setRmax] = useState('1')
  const [cmap, setCmap] = useState('rdylgn')
  const [opacidad, setOpacidad] = useState(0.85)
  const [aviso, setAviso] = useState<string | null>(null)
  const [sondeo, setSondeo] = useState<{ estado: string; texto: string } | null>(null)
  const [valor, setValor] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  // La primera vez que un tile falla se lo pide con fetch para saber POR QUÉ: un
  // <img> que falla no dice nada y el mapa sólo muestra huecos.
  const yaSondeado = useRef(false)

  useEffect(() => {
    getTenants(1, 200).then(r => setTenants(r.items)).catch(e => setAviso(describeError(e)))
  }, [])

  useEffect(() => {
    if (!exp) return
    const id = setInterval(() => setAhora(Date.now()), 1000)
    return () => clearInterval(id)
  }, [exp])

  const plantilla = capa?.tiles[0] ?? null
  const partes = plantilla ? partirPlantilla(plantilla) : null
  const min = parseFloat(rmin)
  const max = parseFloat(rmax)
  const rangoValido = Number.isFinite(min) && Number.isFinite(max) && min < max
  const urlTiles = plantilla && token && rangoValido
    ? `${plantilla}&${new URLSearchParams({ rescale: `${min},${max}`, colormap_name: cmap, token })}`
    : null
  const restante = exp && ahora ? Math.round(exp - ahora / 1000) : null

  async function tokenNuevo(): Promise<string> {
    const { token: t } = await getMapToken()
    setToken(t)
    // La cuenta regresiva arranca con el primer tic del intervalo, un segundo
    // después. El reloj se lee sólo ahí, fuera del render.
    setExp(vencimiento(t))
    return t
  }

  async function asegurarToken(): Promise<string> {
    // Se renueva con 5 minutos de margen, no al vencer: un token que vence en
    // medio de un paneo deja el mapa lleno de 401 sin ningún error visible.
    // `restante` tiene a lo sumo un segundo de atraso; antes del primer tic es
    // null y se pide uno nuevo, que no cuesta nada.
    if (token && restante !== null && restante > 300) return token
    return tokenNuevo()
  }

  async function elegirTenant(id: string) {
    setTenantId(id)
    setCapas([])
    setCapa(null)
    setInfo(null)
    setAviso(null)
    try {
      setCapas(await getLayers(id))
    } catch (e) {
      setAviso(describeError(e))
    }
  }

  async function elegirCapa(id: string) {
    setTrabajando(true)
    setAviso(null)
    setSondeo(null)
    setValor(null)
    setInfo(null)
    setStats(null)
    yaSondeado.current = false
    try {
      const detalle = await getLayer(id)
      setCapa(detalle)
      const t = await asegurarToken()
      const { base, cog } = partirPlantilla(detalle.tiles[0])
      if (!cog) throw new Error('La plantilla de Geocore no trae ?url=.')
      const q = new URLSearchParams({ url: cog, token: t })
      const [ri, rs] = await Promise.all([pedir(`${base}/cog/info?${q}`), pedir(`${base}/cog/statistics?${q}`)])
      if (ri.status !== 200) {
        setAviso(`/cog/info respondió ${ri.status || 'sin respuesta'}: ${detalleDe(ri.cuerpo)}. ${explicar(ri.status, detalleDe(ri.cuerpo))}`)
        return
      }
      setInfo(ri.cuerpo as CogInfo)
      const bandas = rs.status === 200 && rs.cuerpo && typeof rs.cuerpo === 'object'
        ? Object.values(rs.cuerpo as Record<string, BandStats>) : []
      setStats(bandas[0] ?? null)
    } catch (e) {
      setAviso(describeError(e))
    } finally {
      setTrabajando(false)
    }
  }

  async function probar(coords?: { z: number; x: number; y: number }) {
    if (!urlTiles || !info) return
    const t = coords ?? tileDelCentro(info.bounds, Math.max(info.minzoom, Math.min(info.maxzoom - 1, 18)))
    const r = await pedir(urlTiles.replace('{z}', String(t.z)).replace('{x}', String(t.x)).replace('{y}', String(t.y)))
    const nombre = `tile ${t.z}/${t.x}/${t.y}`
    if (r.status === 200 && r.bytes !== undefined) {
      setSondeo(r.bytes < 200
        ? { estado: 'degradado', texto: `${nombre}: PNG de ${r.bytes} bytes, casi seguro el transparente de fuera del raster. No es un error.` }
        : { estado: 'ok', texto: `${nombre}: PNG de ${r.bytes} bytes. Se sirve bien.` })
    } else {
      setSondeo({ estado: 'error', texto: `${nombre}: ${r.status || 'sin respuesta'}. ${explicar(r.status, detalleDe(r.cuerpo))}` })
    }
  }

  function alFallarUnTile(ev: TileErrorEvent) {
    if (yaSondeado.current) return
    yaSondeado.current = true
    void probar({ z: ev.coords.z, x: ev.coords.x, y: ev.coords.y })
  }

  async function consultarPunto(lat: number, lng: number) {
    if (!info || !partes?.cog || !token) return
    const [w, s, e, n] = info.bounds
    // Fuera del raster no se pregunta: sería un 404 que no dice nada nuevo.
    if (lng < w || lng > e || lat < s || lat > n) {
      setValor('Fuera del raster: ese punto no tiene dato.')
      return
    }
    setValor('consultando…')
    const q = new URLSearchParams({ url: partes.cog, token })
    const r = await pedir(`${partes.base}/cog/point/${lng.toFixed(6)},${lat.toFixed(6)}?${q}`)
    if (r.status !== 200) {
      setValor(`Error ${r.status || 'sin respuesta'}: ${detalleDe(r.cuerpo)}`)
      return
    }
    const v = (r.cuerpo as { values?: (number | null)[] } | null)?.values?.[0]
    setValor(v == null || Number.isNaN(v) ? 'Sin dato en ese píxel (máscara).' : `${v.toFixed(3)} · ${categoria(v)}`)
  }

  const avisosCog: string[] = []
  if (info && !info.dtype.startsWith('float')) {
    avisosCog.push(`Es ${info.dtype}, no float: no parece un índice crudo, y rescale -1 … 1 probablemente no le corresponda.`)
  }
  if (stats && stats.min === stats.max) {
    avisosCog.push(`Todos los píxeles valen ${stats.min}: se va a ver un cuadrado de un solo color.`)
  } else if (stats?.valid_percent != null && stats.valid_percent < 1) {
    avisosCog.push(`Sólo el ${stats.valid_percent.toFixed(2)} % de los píxeles tiene dato: en el mapa van a ser unos pocos píxeles.`)
  }
  const contrasteValido = !!stats && stats.percentile_2 < stats.percentile_98

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      {/* ------------------------------------------------ controles */}
      <div className="space-y-4">
        <div className="space-y-1">
          <Label className="text-xs">Tenant</Label>
          <Select value={tenantId} onValueChange={v => { if (v) void elegirTenant(v) }}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Elegí un tenant" /></SelectTrigger>
            <SelectContent>
              {tenants.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {tenantId && (
          <div className="space-y-1">
            <Label className="text-xs">Capas ({capas.length})</Label>
            <div className="max-h-48 space-y-1 overflow-y-auto">
              {capas.length === 0 && <p className="text-sm text-muted-foreground">Sin capas. ¿El worker ya registró alguna para este tenant?</p>}
              {capas.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => void elegirCapa(c.id)}
                  className={`w-full rounded-md border px-2 py-1.5 text-left font-mono text-xs transition-colors hover:border-primary ${capa?.layerId === c.id ? 'border-primary bg-primary/5' : ''}`}
                >
                  {c.acquiredTs.slice(0, 10)} · {c.product} · <span className="break-all">{c.storageKey}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Token de mapa</span>
          {!token
            ? <Estado estado="sin_configurar" />
            : restante !== null && restante <= 0
              ? <Estado estado="error" />
              : <Estado estado={restante !== null && restante < 300 ? 'degradado' : 'ok'} />}
          <span className="tabular-nums text-muted-foreground">
            {restante === null ? '' : restante > 0 ? `${Math.floor(restante / 60)}:${String(restante % 60).padStart(2, '0')}` : 'vencido'}
          </span>
          {capa && <Button variant="outline" size="sm" onClick={() => void tokenNuevo()}>Renovar</Button>}
        </div>

        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">rescale mín</Label>
              <Input className="h-8 font-mono text-sm" type="number" step="0.01" value={rmin} onChange={e => setRmin(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">rescale máx</Label>
              <Input className="h-8 font-mono text-sm" type="number" step="0.01" value={rmax} onChange={e => setRmax(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button variant="outline" size="sm" onClick={() => { setRmin('-1'); setRmax('1') }}>Fijo -1 … 1</Button>
            <Button variant="outline" size="sm" onClick={() => { setRmin('0'); setRmax('0.9') }}>Vegetación 0 … 0.9</Button>
            <Button
              variant="outline" size="sm" disabled={!contrasteValido}
              onClick={() => { if (stats) { setRmin(stats.percentile_2.toFixed(3)); setRmax(stats.percentile_98.toFixed(3)) } }}
            >
              Contraste p2 … p98
            </Button>
          </div>
          {!rangoValido && <p className="text-xs text-destructive">El mínimo tiene que ser menor que el máximo. No se pinta.</p>}
          <p className="text-xs text-muted-foreground">
            Rango fijo: el mismo verde es el mismo NDVI en todas las parcelas. Contraste: más detalle
            dentro de una, pero los colores dejan de ser comparables entre parcelas.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Paleta</Label>
            <Select value={cmap} onValueChange={v => { if (v) setCmap(v) }}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.keys(PALETAS).map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Opacidad</Label>
            <input className="w-full accent-primary" type="range" min={0.2} max={1} step={0.05} value={opacidad} onChange={e => setOpacidad(Number(e.target.value))} />
          </div>
        </div>

        {info && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 rounded-md border p-3 font-mono text-xs">
            <dt className="text-muted-foreground">dtype</dt><dd>{info.dtype}</dd>
            <dt className="text-muted-foreground">tamaño</dt><dd>{info.width} × {info.height} px</dd>
            <dt className="text-muted-foreground">zoom</dt><dd>{info.minzoom} … {info.maxzoom} (nativo)</dd>
            {stats && <><dt className="text-muted-foreground">mín / máx</dt><dd>{stats.min.toFixed(3)} / {stats.max.toFixed(3)}</dd></>}
            {stats?.valid_percent != null && <><dt className="text-muted-foreground">con dato</dt><dd>{stats.valid_percent.toFixed(2)} %</dd></>}
          </dl>
        )}
        {avisosCog.map(a => <p key={a} className="rounded-md bg-amber-100 p-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">{a}</p>)}
        {aviso && <p className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">{aviso}</p>}
      </div>

      {/* ------------------------------------------------ mapa */}
      <div className="space-y-3">
        {/* `isolate`: los z-index de Leaflet (400/1000) quedan encerrados acá y no
            tapan los menús desplegables ni los diálogos del panel (z-50). */}
        <div className="relative isolate overflow-hidden rounded-md border" style={{ height: 460 }}>
          <MapContainer center={[24.8, -107.4]} zoom={8} style={{ height: '100%', width: '100%' }}>
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              attribution="Imagen © Esri"
              maxZoom={20}
            />
            {info && urlTiles && capa && (
              <TileLayer
                key={capa.layerId}
                url={urlTiles}
                bounds={[[info.bounds[1], info.bounds[0]], [info.bounds[3], info.bounds[2]]]}
                // El zoom nativo del raster, no el 18 fijo que manda Geocore: más fino
                // que el dato, TiTiler agranda en el servidor y sólo gasta CPU.
                maxNativeZoom={info.maxzoom}
                maxZoom={20}
                opacity={opacidad}
                noWrap
                eventHandlers={{ tileerror: alFallarUnTile }}
              />
            )}
            {info && <Encuadre w={info.bounds[0]} s={info.bounds[1]} e={info.bounds[2]} n={info.bounds[3]} />}
            <AlHacerClick onClick={(lat, lng) => void consultarPunto(lat, lng)} />
          </MapContainer>
          {trabajando && <div className="absolute inset-0 z-[500] grid place-items-center bg-background/60 text-sm">Cargando…</div>}
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="w-56">
            <div className="h-3 rounded-sm border" style={{ background: `linear-gradient(90deg,${PALETAS[cmap]})` }} />
            <div className="mt-0.5 flex justify-between font-mono text-xs text-muted-foreground tabular-nums">
              <span>{rangoValido ? min : '—'}</span><span>NDVI · {cmap}</span><span>{rangoValido ? max : '—'}</span>
            </div>
          </div>
          <p className="text-sm"><span className="text-muted-foreground">Click en el mapa: </span>{valor ?? 'el valor del píxel sale de /cog/point.'}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" disabled={!urlTiles || !info} onClick={() => void probar()}>Probar el tile del centro</Button>
          {sondeo && <><Estado estado={sondeo.estado} /><span className="text-sm">{sondeo.texto}</span></>}
        </div>

        {plantilla && (
          <div className="space-y-1 rounded-md border bg-muted/30 p-3 font-mono text-xs break-all">
            <p><span className="text-muted-foreground">Geocore da: </span>{plantilla}</p>
            <p>
              <span className="text-muted-foreground">El mapa pide: </span>{plantilla}
              <span className="text-violet-700 dark:text-violet-300">&amp;rescale={rangoValido ? `${min},${max}` : '…'}&amp;colormap_name={cmap}</span>
              {/* El token recortado: esta pantalla termina en capturas. */}
              <span className="text-amber-700 dark:text-amber-300">&amp;token={token ? `${token.slice(0, 12)}…(${token.length})` : '…'}</span>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
