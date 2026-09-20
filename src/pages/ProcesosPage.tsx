import { useEffect, useState } from 'react'
import { getTenants, type Proceso, type Tenant } from '@/lib/api'
import { alerta, duracionDe, entidad, esActivo, etiquetaTipo, FILTROS_ESTADO, hace } from '@/lib/procesos'
import { useProcesos } from '@/lib/useProcesos'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import Selector from '@/components/Selector'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import EstadoJob, { Avance } from '@/components/procesos/EstadoJob'
import BitacoraSheet from '@/components/procesos/BitacoraJob'

/**
 * Qué está procesando el worker: altas de parcela y rancho, y pedidos a demanda.
 *
 * Cada fila dice en qué va (la última línea de la bitácora, con su ventana de
 * fechas); el detalle abre la bitácora entera, intento por intento. Para
 * TerraStaff: lo protege la política del mismo nombre en Geocore.
 */
export default function ProcesosPage() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [tenantId, setTenantId] = useState('todos')
  const [filtroEstado, setFiltroEstado] = useState('todos')
  const [abierto, setAbierto] = useState<string | null>(null)

  useEffect(() => { getTenants(1, 200).then(r => setTenants(r.items)).catch(() => {}) }, [])

  const { procesos, error, ahora, recargar } = useProcesos({
    tenantId: tenantId === 'todos' ? undefined : tenantId,
    status: FILTROS_ESTADO[filtroEstado]?.status,
    limit: 100,
  })

  const cuenta = (s: string) => procesos?.filter(p => p.status === s).length ?? 0
  const hayActivos = procesos?.some(p => esActivo(p.status)) ?? false
  const opcionesTenant = [
    { value: 'todos', label: 'Todos los tenants' },
    ...tenants.map(t => ({ value: t.id, label: t.name })),
  ]
  const opcionesEstado = Object.entries(FILTROS_ESTADO).map(([k, v]) => ({ value: k, label: v.etiqueta }))

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Procesos</h1>
        <p className="text-sm text-muted-foreground">
          Lo que está procesando el worker: en qué etapa y en qué rango de fechas va, y qué falló en cada intento.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-64 space-y-1">
          <Label>Tenant</Label>
          <Selector
            items={opcionesTenant}
            value={tenantId}
            onValueChange={v => setTenantId(v || 'todos')}
            className="w-full"
          />
        </div>
        <div className="w-48 space-y-1">
          <Label>Estado</Label>
          <Selector
            items={opcionesEstado}
            value={filtroEstado}
            onValueChange={v => setFiltroEstado(v || 'todos')}
            className="w-full"
          />
        </div>
        <Button variant="outline" onClick={recargar}>Actualizar</Button>
        <p className="pb-2 text-xs text-muted-foreground">
          {hayActivos ? 'Se actualiza cada 5 s mientras haya procesos en curso.' : ahora ? `Actualizado ${hace(new Date(ahora).toISOString(), ahora)}.` : ''}
        </p>
      </div>

      {procesos && procesos.length > 0 && (
        <p className="text-sm text-muted-foreground tabular-nums">
          {cuenta('running')} procesando · {cuenta('pending')} en cola · {cuenta('failed')} fallidos · {cuenta('completed')} terminados
          {procesos.length === 100 && ' (los 100 más recientes)'}
        </p>
      )}

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Proceso</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="w-40">Avance</TableHead>
            <TableHead>En qué va</TableHead>
            <TableHead className="text-right">Creado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {procesos === null && !error && (
            <TableRow><TableCell colSpan={5} className="text-muted-foreground">Cargando…</TableCell></TableRow>
          )}
          {procesos?.length === 0 && (
            <TableRow><TableCell colSpan={5} className="text-muted-foreground">No hay procesos con estos filtros.</TableCell></TableRow>
          )}
          {procesos?.map(p => <Fila key={p.id} p={p} ahora={ahora} onAbrir={() => setAbierto(p.id)} />)}
        </TableBody>
      </Table>

      <BitacoraSheet jobId={abierto} onClose={() => setAbierto(null)} />
    </div>
  )
}

function Fila({ p, ahora, onAbrir }: { p: Proceso; ahora: number; onAbrir: () => void }) {
  const aviso = alerta(p, ahora)
  const dura = duracionDe(p, ahora)
  const ultimo = p.ultimoEvento
  return (
    <TableRow className="cursor-pointer align-top hover:bg-muted/50" onClick={onAbrir}>
      <TableCell className="max-w-56">
        <p className="font-medium">{etiquetaTipo(p.requestType)}</p>
        <p className="truncate text-xs text-muted-foreground">{entidad(p)}</p>
        {p.tenantNombre && <p className="truncate text-xs text-muted-foreground">{p.tenantNombre}</p>}
      </TableCell>
      <TableCell>
        <div className="flex flex-col items-start gap-1">
          <EstadoJob status={p.status} />
          {p.intentos !== null && p.intentos > 1 && (
            <span className="font-mono text-[11px] text-amber-700 dark:text-amber-400">intento {p.intentos}</span>
          )}
        </div>
      </TableCell>
      <TableCell><Avance progress={p.progress} status={p.status} /></TableCell>
      <TableCell className="max-w-md whitespace-normal">
        {p.status === 'failed' && p.errorMessage ? (
          <p className="line-clamp-2 text-sm text-destructive">{p.errorMessage}</p>
        ) : ultimo ? (
          <p className={`line-clamp-2 text-sm ${ultimo.level === 'warning' ? 'text-amber-700 dark:text-amber-400' : ''}`}>{ultimo.message}</p>
        ) : (
          <p className="text-sm text-muted-foreground">{p.status === 'pending' ? 'Esperando al worker' : 'Sin bitácora'}</p>
        )}
        {aviso && <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{aviso}</p>}
      </TableCell>
      <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
        <p>{hace(p.createdAt, ahora)}</p>
        {dura && <p>{p.finishedAt ? 'tardó' : 'lleva'} {dura}</p>}
      </TableCell>
    </TableRow>
  )
}
