import { useEffect, useState } from 'react'
import {
  getTenants, getRanchos, getParcelas, getLayers, getMeasurements, describeError,
  type Tenant, type Rancho, type Parcela, type LayerSummary, type Measurement,
} from '@/lib/api'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import SerieMensual from './SerieMensual'

/**
 * Qué datos tiene cada tenant, y cómo se ven.
 *
 * **Prototipo del Diagnóstico** (TerraAdmin), no la pantalla del cliente: la serie mensual
 * de verdad es M.7.3 y el mapa por mes M.7.4. Esta existe para contestar de un vistazo
 * "¿este tenant está bien procesado?" y para mirar con ojos los números que produce el
 * pipeline.
 *
 * **Carga por tenant, no de todos.** El inventario de un tenant son 2 + N pedidos (ranchos,
 * capas, y las parcelas de cada rancho): hacerlo para todos los tenants al abrir la pestaña
 * sería una tormenta de pedidos para una pantalla que se mira de a uno.
 */

const INDICES = ['ndvi', 'evi', 'ndre', 'ndmi'] as const

interface Inventario {
  ranchos: Rancho[]
  parcelasPorRancho: Map<string, Parcela[]>
  capas: LayerSummary[]
}

function Tarjeta({ titulo, valor, detalle }: { titulo: string; valor: string | number; detalle?: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{titulo}</div>
      <div className="text-2xl font-semibold tabular-nums">{valor}</div>
      {detalle && <div className="text-xs text-muted-foreground">{detalle}</div>}
    </div>
  )
}

export default function DatosPorTenant() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [tenantId, setTenantId] = useState('')
  const [inventario, setInventario] = useState<Inventario | null>(null)
  const [parcelaId, setParcelaId] = useState('')
  const [indice, setIndice] = useState<string>('ndvi')
  const [serie, setSerie] = useState<Measurement[] | null>(null)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    getTenants().then(r => setTenants(r.items ?? [])).catch(e => {
      const m = describeError(e)
      if (m) setError(m)
    })
  }, [])

  // Limpiar al cambiar de tenant es cosa del handler, no de un efecto: un `setState`
  // síncrono adentro de un efecto encadena renders (`set-state-in-effect`, la misma regla
  // que cuida el diálogo de geometría).
  function elegirTenant(v: string | null) {
    setTenantId(v ?? '')
    setInventario(null)
    setParcelaId('')
    setSerie(null)
  }

  useEffect(() => {
    if (!tenantId) return
    let cancelado = false

    async function cargar() {
      setCargando(true)
      setError('')
      try {
        const [ranchos, capas] = await Promise.all([getRanchos(tenantId), getLayers(tenantId)])
        const parcelasPorRancho = new Map<string, Parcela[]>()
        for (const r of ranchos) {
          parcelasPorRancho.set(r.id, await getParcelas(r.id, tenantId))
        }
        if (!cancelado) setInventario({ ranchos, parcelasPorRancho, capas })
      } catch (e) {
        const m = describeError(e)
        if (m && !cancelado) setError(m)
      } finally {
        if (!cancelado) setCargando(false)
      }
    }

    cargar()
    return () => { cancelado = true }
  }, [tenantId])

  useEffect(() => {
    if (!parcelaId || !tenantId) return
    let cancelado = false

    getMeasurements(parcelaId, tenantId, indice)
      .then(r => { if (!cancelado) setSerie(r.data) })
      .catch(e => {
        const m = describeError(e)
        if (m && !cancelado) setError(m)
      })

    return () => { cancelado = true }
  }, [parcelaId, tenantId, indice])

  const parcelas = inventario
    ? [...inventario.parcelasPorRancho.values()].flat()
    : []

  // Las capas mensuales son las del pipeline; las demás son de la capa vieja.
  const mensuales = inventario?.capas.filter(c => c.source === 'mensual') ?? []
  const mesesConMapa = new Set(mensuales.map(c => c.acquiredTs.slice(0, 7)))
  const ultimaIngesta = mensuales
    .map(c => c.createdAt)
    .sort()
    .at(-1)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1 min-w-56">
          <Label>Tenant</Label>
          <Select value={tenantId} onValueChange={elegirTenant}>
            <SelectTrigger><SelectValue placeholder="Elegí un tenant" /></SelectTrigger>
            <SelectContent>
              {tenants.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {cargando && <span className="text-sm text-muted-foreground">Cargando…</span>}
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      {inventario && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Tarjeta titulo="Ranchos" valor={inventario.ranchos.length} />
            <Tarjeta titulo="Parcelas" valor={parcelas.length} />
            <Tarjeta
              titulo="Capas mensuales"
              valor={mensuales.length}
              detalle={inventario.capas.length > mensuales.length
                ? `${inventario.capas.length - mensuales.length} de la capa vieja`
                : undefined}
            />
            <Tarjeta titulo="Meses con mapa" valor={mesesConMapa.size} />
            <Tarjeta
              titulo="Última ingesta"
              valor={ultimaIngesta ? ultimaIngesta.slice(0, 10) : '—'}
              detalle={ultimaIngesta ? ultimaIngesta.slice(11, 16) + ' UTC' : 'sin capas'}
            />
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rancho</TableHead>
                  <TableHead>Parcelas</TableHead>
                  <TableHead>Capas mensuales</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inventario.ranchos.map(r => {
                  const suyas = inventario.parcelasPorRancho.get(r.id) ?? []
                  const sus = mensuales.filter(c => c.ranchoId === r.id && c.parcelaId === null)
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="tabular-nums">{suyas.length}</TableCell>
                      <TableCell className="tabular-nums">{sus.length}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {sus.length === 0
                          ? 'sin mapas: nunca se procesó, o ningún mes tuvo un píxel limpio'
                          : `${new Set(sus.map(c => c.product)).size} índice(s), ${new Set(sus.map(c => c.acquiredTs.slice(0, 7))).size} meses`}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1 min-w-56">
              <Label>Parcela</Label>
              <Select value={parcelaId} onValueChange={v => { setParcelaId(v ?? ''); setSerie(null) }}>
                <SelectTrigger>
                  <SelectValue placeholder={parcelas.length ? 'Elegí una parcela' : 'Este tenant no tiene parcelas'} />
                </SelectTrigger>
                <SelectContent>
                  {parcelas.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 min-w-32">
              <Label>Índice</Label>
              <Select value={indice} onValueChange={v => { setIndice(v ?? 'ndvi'); setSerie(null) }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INDICES.map(i => <SelectItem key={i} value={i}>{i.toUpperCase()}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {parcelaId && serie && <SerieMensual filas={serie} indice={indice} />}
          {parcelaId && serie === null && <p className="text-sm text-muted-foreground">Cargando la serie…</p>}
        </>
      )}
    </div>
  )
}
