import { useEffect, useState } from 'react'
import { getTenants, getRanchos, createRancho, getParcelas, createParcela, deactivateRancho, activateRancho, deactivateParcela, activateParcela, updateRanchoName, updateRanchoGeometry, updateParcelaName, updateParcelaGeometry, describeError, type Tenant, type Rancho, type Parcela, type Proceso } from '@/lib/api'
import { useProcesos } from '@/lib/useProcesos'
import EstadoJob from '@/components/procesos/EstadoJob'
import BitacoraSheet from '@/components/procesos/BitacoraJob'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import Selector from '@/components/Selector'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import GeometryInput, { type Coord } from '@/components/GeometryInput'
import GeometryView, { type Shape } from '@/components/GeometryView'
import EditarEntidadDialog from '@/components/EditarEntidadDialog'

const emptyMeta = { municipio: '', estado: '', region: '', altitudM: '' }

function metaToPayload(m: typeof emptyMeta) {
  return {
    municipio: m.municipio || undefined,
    estado: m.estado || undefined,
    region: m.region || undefined,
    altitudM: m.altitudM ? parseFloat(m.altitudM) : undefined,
  }
}

function MetaFields({ values, onChange }: {
  values: typeof emptyMeta
  onChange: (v: typeof emptyMeta) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="space-y-1">
        <Label className="text-xs">Municipio</Label>
        <Input className="h-8 text-sm" value={values.municipio} onChange={e => onChange({ ...values, municipio: e.target.value })} placeholder="Opcional" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Estado</Label>
        <Input className="h-8 text-sm" value={values.estado} onChange={e => onChange({ ...values, estado: e.target.value })} placeholder="Opcional" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Región</Label>
        <Input className="h-8 text-sm" value={values.region} onChange={e => onChange({ ...values, region: e.target.value })} placeholder="Opcional" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Altitud (m)</Label>
        <Input className="h-8 text-sm" type="number" value={values.altitudM} onChange={e => onChange({ ...values, altitudM: e.target.value })} placeholder="Opcional" />
      </div>
    </div>
  )
}

export default function RanchosPage() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [tenantId, setTenantId] = useState('')
  const [ranchos, setRanchos] = useState<Rancho[]>([])
  const [parcelas, setParcelas] = useState<Parcela[]>([])
  const [selectedRancho, setSelectedRancho] = useState('')

  const [ranchoOpen, setRanchoOpen] = useState(false)
  const [parcelaOpen, setParcelaOpen] = useState(false)

  const [ranchoName, setRanchoName] = useState('')
  const [ranchoCoords, setRanchoCoords] = useState<Coord[]>([])
  const [ranchoFuente, setRanchoFuente] = useState('manual')
  const [ranchoMeta, setRanchoMeta] = useState(emptyMeta)

  const [parcelaName, setParcelaName] = useState('')
  const [parcelaCoords, setParcelaCoords] = useState<Coord[]>([])
  const [parcelaFuente, setParcelaFuente] = useState('manual')
  const [parcelaMeta, setParcelaMeta] = useState(emptyMeta)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [pageError, setPageError] = useState('')

  // El último procesamiento de cada rancho y parcela del tenant: una sola consulta
  // por tenant, que se refresca sola mientras haya alguno en curso. La lista viene
  // de más nuevo a más viejo, así que el primero que aparece de cada uno es el último.
  const [jobAbierto, setJobAbierto] = useState<string | null>(null)
  // Qué se está editando: null = el diálogo está cerrado (M.7, el editor completo, es otra cosa).
  const [ranchoEditando, setRanchoEditando] = useState<Rancho | null>(null)
  const [parcelaEditando, setParcelaEditando] = useState<Parcela | null>(null)
  const { procesos, recargar: recargarProcesos } = useProcesos(tenantId ? { tenantId, limit: 200 } : null)
  const ultimoPorParcela = new Map<string, Proceso>()
  const ultimoPorRancho = new Map<string, Proceso>()
  for (const j of procesos ?? []) {
    if (j.parcelaId) { if (!ultimoPorParcela.has(j.parcelaId)) ultimoPorParcela.set(j.parcelaId, j) }
    else if (j.ranchoId && !ultimoPorRancho.has(j.ranchoId)) ultimoPorRancho.set(j.ranchoId, j)
  }

  useEffect(() => { getTenants(1, 200).then(r => setTenants(r.items)).catch(() => {}) }, [])
  useEffect(() => { if (tenantId) loadRanchos() }, [tenantId])
  useEffect(() => { if (selectedRancho) loadParcelas() }, [selectedRancho])

  // Carga los ranchos del tenant activo. Todas las llamadas pasan el tenantId como
  // X-Tenant-ID (requerido por el aislamiento de tenant [C-1] del backend). En éxito
  // limpia el error; si falla, lo muestra en el banner en vez de dejar la tabla vacía.
  async function loadRanchos() {
    try {
      setRanchos(await getRanchos(tenantId))
      setPageError('')
    } catch (err) {
      const msg = describeError(err)
      if (msg) setPageError(msg)
    }
  }

  // Carga las parcelas del rancho seleccionado. Se dispara por efecto cuando cambia
  // `selectedRancho`; alimenta tanto la tabla como el mapa (mapShapes).
  async function loadParcelas() {
    try {
      setParcelas(await getParcelas(selectedRancho, tenantId))
      setPageError('')
    } catch (err) {
      const msg = describeError(err)
      if (msg) setPageError(msg)
    }
  }

  // Alterna activo/inactivo de un rancho (soft delete reversible). Usa los endpoints
  // activate/deactivate agregados al backend; recarga la lista para reflejar el estado.
  async function toggleRancho(r: Rancho) {
    try {
      if (r.isActive) await deactivateRancho(r.id, tenantId)
      else await activateRancho(r.id, tenantId)
      loadRanchos()
    } catch (err) {
      const msg = describeError(err)
      if (msg) setPageError(msg)
    }
  }

  // Ídem para parcelas. Mismo patrón reversible que toggleRancho.
  async function toggleParcela(p: Parcela) {
    try {
      if (p.isActive) await deactivateParcela(p.id, tenantId)
      else await activateParcela(p.id, tenantId)
      loadParcelas()
    } catch (err) {
      const msg = describeError(err)
      if (msg) setPageError(msg)
    }
  }

  async function handleCreateRancho(e: React.FormEvent) {
    e.preventDefault()
    if (ranchoCoords.length < 3) { setError('Mínimo 3 puntos en el polígono'); return }
    setLoading(true); setError('')
    try {
      await createRancho({
        name: ranchoName,
        fuenteGeom: ranchoFuente,
        coordinates: ranchoCoords,
        ...metaToPayload(ranchoMeta),
      }, tenantId)
      setRanchoOpen(false)
      setRanchoName(''); setRanchoCoords([]); setRanchoFuente('manual'); setRanchoMeta(emptyMeta)
      loadRanchos()
      recargarProcesos()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally { setLoading(false) }
  }

  async function handleCreateParcela(e: React.FormEvent) {
    e.preventDefault()
    if (parcelaCoords.length < 3) { setError('Mínimo 3 puntos en el polígono'); return }
    setLoading(true); setError('')
    try {
      await createParcela({
        ranchoId: selectedRancho,
        name: parcelaName,
        fuenteGeom: parcelaFuente,
        coordinates: parcelaCoords,
        ...metaToPayload(parcelaMeta),
      }, tenantId)
      setParcelaOpen(false)
      setParcelaName(''); setParcelaCoords([]); setParcelaFuente('manual'); setParcelaMeta(emptyMeta)
      loadParcelas()
      recargarProcesos()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally { setLoading(false) }
  }

  const selectedRanchoObj = ranchos.find(r => r.id === selectedRancho)
  const selectedRanchoName = selectedRanchoObj?.name

  const opcionesTenant = tenants.map(t => ({ value: t.id, label: t.name }))
  const opcionesRancho = ranchos.map(r => ({ value: r.id, label: r.name }))

  // Geometría a dibujar: el rancho seleccionado (azul) + sus parcelas (verde).
  const mapShapes: Shape[] = []
  if (selectedRanchoObj) mapShapes.push({ coordinates: selectedRanchoObj.coordinates, color: '#2563eb', label: selectedRanchoObj.name })
  for (const p of parcelas) mapShapes.push({ coordinates: p.coordinates, color: '#16a34a', label: p.name })

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Ranchos y Parcelas</h2>

      <div className="space-y-1 max-w-xs">
        <Label>Tenant</Label>
        {/* '' es el sentinel de "sin tenant" (useState('')), que oculta las pestañas
            dependientes; `Selector` lo traduce al null que espera Base UI. */}
        <Selector
          items={opcionesTenant}
          value={tenantId}
          onValueChange={setTenantId}
          placeholder="Selecciona un tenant"
          vacio="Este usuario no ve ningún tenant"
        />
      </div>

      {pageError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {pageError}
        </div>
      )}

      {tenantId && (
        <Tabs defaultValue="ranchos">
          <TabsList>
            <TabsTrigger value="ranchos">Ranchos</TabsTrigger>
            <TabsTrigger value="parcelas">Parcelas</TabsTrigger>
          </TabsList>

          <TabsContent value="ranchos" className="space-y-3">
            <div className="flex justify-end">
              <Dialog open={ranchoOpen} onOpenChange={open => { setRanchoOpen(open); if (!open) setError('') }}>
                <DialogTrigger render={<Button>Nuevo rancho</Button>} />
                <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader><DialogTitle>Crear rancho</DialogTitle></DialogHeader>
                  <form onSubmit={handleCreateRancho} className="space-y-3 mt-2">
                    <div className="space-y-1">
                      <Label>Nombre</Label>
                      <Input value={ranchoName} onChange={e => setRanchoName(e.target.value)} required />
                    </div>
                    <div className="space-y-1">
                      <Label>Geometría</Label>
                      <GeometryInput
                        value={ranchoCoords}
                        onChange={(coords, fuente) => { setRanchoCoords(coords); setRanchoFuente(fuente) }}
                      />
                    </div>
                    <MetaFields values={ranchoMeta} onChange={setRanchoMeta} />
                    {error && <p className="text-destructive text-sm">{error}</p>}
                    <Button type="submit" className="w-full" disabled={loading}>{loading ? 'Creando...' : 'Crear rancho'}</Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Fuente</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Procesamiento</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ranchos.map(r => (
                  <TableRow
                    key={r.id}
                    className={`cursor-pointer hover:bg-muted/50 ${r.id === selectedRancho ? 'bg-muted/50' : ''}`}
                    onClick={() => setSelectedRancho(r.id)}
                  >
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>{r.fuenteGeom}</TableCell>
                    <TableCell><Badge variant={r.isActive ? 'default' : 'secondary'}>{r.isActive ? 'Activo' : 'Inactivo'}</Badge></TableCell>
                    <TableCell><CeldaProceso proceso={ultimoPorRancho.get(r.id)} onAbrir={setJobAbierto} /></TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={e => { e.stopPropagation(); setRanchoEditando(r) }}
                      >
                        Editar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={e => { e.stopPropagation(); toggleRancho(r) }}
                      >
                        {r.isActive ? 'Desactivar' : 'Activar'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {selectedRanchoObj && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Geometría de {selectedRanchoObj.name} (azul) y sus parcelas (verde)
                </Label>
                <GeometryView shapes={mapShapes} height={280} />
              </div>
            )}
          </TabsContent>

          <TabsContent value="parcelas" className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="space-y-1 flex-1 max-w-xs">
                <Label>Rancho</Label>
                <Selector
                  items={opcionesRancho}
                  value={selectedRancho}
                  onValueChange={setSelectedRancho}
                  placeholder="Selecciona un rancho"
                  vacio="Este tenant no tiene ranchos"
                />
              </div>
              {selectedRancho && (
                <div className="mt-5">
                  <Dialog open={parcelaOpen} onOpenChange={open => { setParcelaOpen(open); if (!open) setError('') }}>
                    <DialogTrigger render={<Button>Nueva parcela en {selectedRanchoName}</Button>} />
                    <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader><DialogTitle>Crear parcela</DialogTitle></DialogHeader>
                      <form onSubmit={handleCreateParcela} className="space-y-3 mt-2">
                        <div className="space-y-1">
                          <Label>Nombre</Label>
                          <Input value={parcelaName} onChange={e => setParcelaName(e.target.value)} required />
                        </div>
                        <div className="space-y-1">
                          <Label>Geometría</Label>
                          <GeometryInput
                            value={parcelaCoords}
                            onChange={(coords, fuente) => { setParcelaCoords(coords); setParcelaFuente(fuente) }}
                          />
                        </div>
                        <MetaFields values={parcelaMeta} onChange={setParcelaMeta} />
                        {error && <p className="text-destructive text-sm">{error}</p>}
                        <Button type="submit" className="w-full" disabled={loading}>{loading ? 'Creando...' : 'Crear parcela'}</Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>
              )}
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Área (ha)</TableHead>
                  <TableHead>Municipio</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Procesamiento</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parcelas.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>{p.areaHa?.toFixed(2)}</TableCell>
                    {/* `municipio` ahora es un campo tipado de Parcela (antes se accedía
                        con `(p as any)` porque el tipo lo omitía aunque el backend lo enviaba). */}
                    <TableCell className="text-muted-foreground">{p.municipio ?? '—'}</TableCell>
                    <TableCell><Badge variant={p.isActive ? 'default' : 'secondary'}>{p.isActive ? 'Activa' : 'Inactiva'}</Badge></TableCell>
                    <TableCell><CeldaProceso proceso={ultimoPorParcela.get(p.id)} onAbrir={setJobAbierto} /></TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button variant="ghost" size="sm" onClick={() => setParcelaEditando(p)}>
                        Editar
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => toggleParcela(p)}>
                        {p.isActive ? 'Desactivar' : 'Activar'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {selectedRancho && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Parcelas de {selectedRanchoName} (verde) sobre el rancho (azul)
                </Label>
                <GeometryView shapes={mapShapes} height={280} />
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      {ranchoEditando && <EditarEntidadDialog
        key={ranchoEditando.id}
        entidad={ranchoEditando}
        que="rancho"
        onGuardarNombre={n => updateRanchoName(ranchoEditando!.id, n, tenantId)}
        onGuardarGeometria={(c, f) => updateRanchoGeometry(ranchoEditando!.id, c, f, tenantId)}
        onGuardado={() => { loadRanchos(); loadParcelas() }}
        onCerrar={() => setRanchoEditando(null)}
      />}

      {parcelaEditando && <EditarEntidadDialog
        key={parcelaEditando.id}
        entidad={parcelaEditando}
        que="parcela"
        onGuardarNombre={n => updateParcelaName(parcelaEditando!.id, n, tenantId)}
        onGuardarGeometria={(c, f) => updateParcelaGeometry(parcelaEditando!.id, c, f, tenantId)}
        onGuardado={loadParcelas}
        onCerrar={() => setParcelaEditando(null)}
      />}

      <BitacoraSheet jobId={jobAbierto} onClose={() => setJobAbierto(null)} />
    </div>
  )
}

/**
 * El estado del último procesamiento de un rancho o una parcela. Abre su bitácora;
 * `stopPropagation` para que en la tabla de ranchos no seleccione además la fila.
 * "—" = no hay job: la entidad se creó antes de que existiera el seguimiento, o
 * quedó fuera de los 200 procesos más recientes del tenant.
 */
function CeldaProceso({ proceso, onAbrir }: { proceso?: Proceso; onAbrir: (id: string) => void }) {
  if (!proceso) return <span className="text-xs text-muted-foreground">—</span>
  return (
    <button
      type="button"
      className="inline-flex items-center gap-2 rounded-md px-1 py-0.5 hover:bg-muted"
      title={proceso.ultimoEvento?.message ?? 'Ver bitácora'}
      onClick={e => { e.stopPropagation(); onAbrir(proceso.id) }}
    >
      <EstadoJob status={proceso.status} />
      {proceso.status !== 'completed' && (
        <span className="font-mono text-xs tabular-nums text-muted-foreground">{proceso.progress}%</span>
      )}
    </button>
  )
}
