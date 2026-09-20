import { useState } from 'react'
import {
  createRancho, createParcela, deactivateRancho, activateRancho, deactivateParcela, activateParcela,
  updateRanchoName, updateRanchoGeometry, updateParcelaName, updateParcelaGeometry, describeError,
  type Rancho, type Parcela,
} from '@/lib/api'
import { useProcesos } from '@/lib/useProcesos'
import { useParcelas, useRanchos, useTenants } from '@/lib/useEntidades'
import { ultimoPorEntidad } from '@/lib/procesos'
import BitacoraSheet from '@/components/procesos/BitacoraJob'
import { Label } from '@/components/ui/label'
import Selector from '@/components/Selector'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import GeometryView, { type Shape } from '@/components/GeometryView'
import EditarEntidadDialog from '@/components/EditarEntidadDialog'
import CrearEntidadDialog, { type DatosNuevaEntidad } from '@/components/ranchos/CrearEntidadDialog'
import TablaRanchos from '@/components/ranchos/TablaRanchos'
import TablaParcelas from '@/components/ranchos/TablaParcelas'

/**
 * Ranchos y parcelas de un tenant: las dos tablas, el mapa y las altas.
 *
 * Acá quedó lo que es de la pantalla —qué está elegido, qué diálogo está abierto y qué
 * pasa al confirmar—; los pedidos están en [`useEntidades`](../lib/useEntidades.ts) y lo
 * que se dibuja, en `components/ranchos/`. Antes eran 438 líneas con catorce `useState`,
 * dos formularios completos y dos tablas en el mismo archivo.
 *
 * **Todo pasa el `tenantId`** como `X-Tenant-ID`: es lo que exige el aislamiento de
 * tenant del backend [C-1].
 */
export default function RanchosPage() {
  const [tenantId, setTenantId] = useState('')
  const [ranchoElegido, setRanchoElegido] = useState('')
  const [jobAbierto, setJobAbierto] = useState<string | null>(null)
  // Qué se está editando; null = el diálogo está cerrado.
  const [ranchoEditando, setRanchoEditando] = useState<Rancho | null>(null)
  const [parcelaEditando, setParcelaEditando] = useState<Parcela | null>(null)
  const [errorAccion, setErrorAccion] = useState('')

  const { tenants, error: errorTenants } = useTenants()
  const { ranchos, error: errorRanchos, recargar: recargarRanchos } = useRanchos(tenantId)
  const { parcelas, error: errorParcelas, recargar: recargarParcelas } = useParcelas(ranchoElegido, tenantId)

  // El último procesamiento de cada rancho y parcela del tenant: una sola consulta por
  // tenant, que se refresca sola mientras haya alguno en curso.
  const { procesos, recargar: recargarProcesos } = useProcesos(tenantId ? { tenantId, limit: 200 } : null)
  const { porParcela, porRancho } = ultimoPorEntidad(procesos)

  // Cambiar de tenant limpia el rancho elegido: el de antes es de otro tenant, y
  // dejarlo pedía sus parcelas y dejaba un id suelto en el desplegable. Va en el
  // handler y no en un efecto (`set-state-in-effect`, `DECISIONS #24` de Geocore).
  function elegirTenant(id: string) {
    setTenantId(id)
    setRanchoElegido('')
    setErrorAccion('')
  }

  /** Corre una acción de la tabla y recarga; el error va al banner, no a la consola. */
  async function accion(hacer: () => Promise<unknown>, recargar: () => void) {
    try {
      await hacer()
      setErrorAccion('')
      recargar()
    } catch (err) {
      const msg = describeError(err)
      if (msg) setErrorAccion(msg)
    }
  }

  async function crearRancho(datos: DatosNuevaEntidad) {
    await createRancho(datos, tenantId)
    recargarRanchos()
    recargarProcesos()
  }

  async function crearParcela(datos: DatosNuevaEntidad) {
    await createParcela({ ...datos, ranchoId: ranchoElegido }, tenantId)
    recargarParcelas()
    recargarProcesos()
  }

  const ranchoElegidoObj = ranchos?.find(r => r.id === ranchoElegido)
  const nombreRanchoElegido = ranchoElegidoObj?.name

  // Geometría a dibujar: el rancho elegido (azul) + sus parcelas (verde).
  const formas: Shape[] = []
  if (ranchoElegidoObj) formas.push({ coordinates: ranchoElegidoObj.coordinates, color: '#2563eb', label: ranchoElegidoObj.name })
  for (const p of parcelas ?? []) formas.push({ coordinates: p.coordinates, color: '#16a34a', label: p.name })

  const error = errorAccion || errorRanchos || errorParcelas || errorTenants

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Ranchos y Parcelas</h2>

      <div className="space-y-1 max-w-xs">
        <Label>Tenant</Label>
        {/* '' es el sentinel de "sin tenant", que oculta las pestañas dependientes;
            `Selector` lo traduce al null que espera Base UI. */}
        <Selector
          items={tenants.map(t => ({ value: t.id, label: t.name }))}
          value={tenantId}
          onValueChange={elegirTenant}
          placeholder="Selecciona un tenant"
          vacio="Este usuario no ve ningún tenant"
        />
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
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
              <CrearEntidadDialog que="rancho" etiquetaBoton="Nuevo rancho" onCrear={crearRancho} />
            </div>
            <TablaRanchos
              ranchos={ranchos ?? []}
              seleccionado={ranchoElegido}
              ultimoProceso={porRancho}
              onSeleccionar={setRanchoElegido}
              onEditar={setRanchoEditando}
              onAlternarActivo={r => accion(
                () => r.isActive ? deactivateRancho(r.id, tenantId) : activateRancho(r.id, tenantId),
                recargarRanchos,
              )}
              onAbrirBitacora={setJobAbierto}
            />

            {ranchoElegidoObj && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Geometría de {ranchoElegidoObj.name} (azul) y sus parcelas (verde)
                </Label>
                <GeometryView shapes={formas} height={280} />
              </div>
            )}
          </TabsContent>

          <TabsContent value="parcelas" className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="space-y-1 flex-1 max-w-xs">
                <Label>Rancho</Label>
                <Selector
                  items={(ranchos ?? []).map(r => ({ value: r.id, label: r.name }))}
                  value={ranchoElegido}
                  onValueChange={setRanchoElegido}
                  placeholder="Selecciona un rancho"
                  vacio="Este tenant no tiene ranchos"
                />
              </div>
              {ranchoElegido && (
                <div className="mt-5">
                  <CrearEntidadDialog
                    que="parcela"
                    etiquetaBoton={`Nueva parcela en ${nombreRanchoElegido}`}
                    onCrear={crearParcela}
                  />
                </div>
              )}
            </div>
            <TablaParcelas
              parcelas={parcelas ?? []}
              ultimoProceso={porParcela}
              onEditar={setParcelaEditando}
              onAlternarActivo={p => accion(
                () => p.isActive ? deactivateParcela(p.id, tenantId) : activateParcela(p.id, tenantId),
                recargarParcelas,
              )}
              onAbrirBitacora={setJobAbierto}
            />

            {ranchoElegido && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Parcelas de {nombreRanchoElegido} (verde) sobre el rancho (azul)
                </Label>
                <GeometryView shapes={formas} height={280} />
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      {ranchoEditando && <EditarEntidadDialog
        key={ranchoEditando.id}
        entidad={ranchoEditando}
        que="rancho"
        onGuardarNombre={n => updateRanchoName(ranchoEditando.id, n, tenantId)}
        onGuardarGeometria={(c, f) => updateRanchoGeometry(ranchoEditando.id, c, f, tenantId)}
        onGuardado={() => { recargarRanchos(); recargarParcelas() }}
        onCerrar={() => setRanchoEditando(null)}
      />}

      {parcelaEditando && <EditarEntidadDialog
        key={parcelaEditando.id}
        entidad={parcelaEditando}
        que="parcela"
        onGuardarNombre={n => updateParcelaName(parcelaEditando.id, n, tenantId)}
        onGuardarGeometria={(c, f) => updateParcelaGeometry(parcelaEditando.id, c, f, tenantId)}
        onGuardado={recargarParcelas}
        onCerrar={() => setParcelaEditando(null)}
      />}

      <BitacoraSheet jobId={jobAbierto} onClose={() => setJobAbierto(null)} />
    </div>
  )
}
