import { useState } from 'react'
import { describeError, type Coordinate } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import GeometryInput, { type Coord } from '@/components/GeometryInput'

/** Lo que este diálogo necesita de un rancho o de una parcela: son lo mismo para editar. */
export interface EntidadEditable {
  id: string
  name: string
  coordinates: Coordinate[]
  fuenteGeom: string
}

interface Props {
  /**
   * La entidad a editar. Nunca null: el llamador lo monta sólo cuando hay algo que editar, y
   * **con `key={entidad.id}`**, que es lo que hace que el formulario arranque con los valores de
   * ESTA entidad. Copiar props a estado dentro de un efecto sería la otra forma, y es la que el
   * lint del panel prohíbe (`set-state-in-effect`, DECISIONS #24).
   */
  entidad: EntidadEditable
  /** "rancho" o "parcela": sólo para los textos. */
  que: string
  onGuardarNombre: (nombre: string) => Promise<void>
  onGuardarGeometria: (coords: Coord[], fuenteGeom: string) => Promise<void>
  /** Se llama al terminar bien: el llamador recarga su lista. */
  onGuardado: () => void
  onCerrar: () => void
}

const mismaGeometria = (a: Coordinate[], b: Coord[]) =>
  a.length === b.length && a.every((c, i) => c.lat === b[i].lat && c.lng === b[i].lng)

/**
 * Editar el nombre y la geometría de un rancho o una parcela.
 *
 * Manda **sólo lo que cambió**, porque Geocore expone el nombre y la geometría en dos rutas
 * distintas (`PATCH .../name` y `PATCH .../geometry`) y la de geometría recalcula centroide y
 * área: mandarla sin cambios sería trabajo y riesgo de más.
 *
 * El backend puede rechazar la geometría con 422 —una parcela fuera de su rancho, o un rancho
 * que deja parcelas afuera— y ese mensaje nombra cuáles: se muestra tal cual.
 */
export default function EditarEntidadDialog({
  entidad, que, onGuardarNombre, onGuardarGeometria, onGuardado, onCerrar,
}: Props) {
  const [nombre, setNombre] = useState(entidad.name)
  const [coords, setCoords] = useState<Coord[]>(() => entidad.coordinates.map(c => ({ lat: c.lat, lng: c.lng })))
  const [fuente, setFuente] = useState(entidad.fuenteGeom)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  const cambioNombre = nombre.trim() !== entidad.name
  const cambioGeometria = !mismaGeometria(entidad.coordinates, coords)
  const hayCambios = cambioNombre || cambioGeometria

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (!hayCambios) return onCerrar()

    setGuardando(true)
    setError('')
    try {
      // El nombre primero: es el que no puede fallar por geometría, así que si la
      // geometría se rechaza, al menos el renombre quedó.
      if (cambioNombre) await onGuardarNombre(nombre.trim())
      if (cambioGeometria) await onGuardarGeometria(coords, fuente)
      onGuardado()
      onCerrar()
    } catch (err) {
      const msg = describeError(err)
      if (msg) setError(msg)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open onOpenChange={open => { if (!open) onCerrar() }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Editar {que}</DialogTitle></DialogHeader>
        <form onSubmit={guardar} className="space-y-3 mt-2">
          <div className="space-y-1">
            <Label>Nombre</Label>
            <Input value={nombre} onChange={e => setNombre(e.target.value)} required />
          </div>

          <div className="space-y-1">
            <Label>Geometría</Label>
            <GeometryInput
              value={coords}
              onChange={(c, f) => { setCoords(c); setFuente(f) }}
            />
          </div>

          {cambioGeometria && (
            <p className="text-xs text-muted-foreground">
              Cambiar la geometría no recalcula lo ya procesado: las mediciones y los mapas
              existentes salieron del polígono viejo. Para rehacerlos hay que reprocesar {que === 'rancho' ? 'el rancho' : 'la parcela'}.
            </p>
          )}

          {error && <p className="text-destructive text-sm">{error}</p>}

          <div className="flex gap-2">
            <Button type="submit" className="flex-1" disabled={guardando || !hayCambios}>
              {guardando ? 'Guardando...' : hayCambios ? 'Guardar cambios' : 'Sin cambios'}
            </Button>
            <Button type="button" variant="outline" onClick={onCerrar} disabled={guardando}>
              Cancelar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
