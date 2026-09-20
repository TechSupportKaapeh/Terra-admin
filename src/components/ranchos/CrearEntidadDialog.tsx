import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import GeometryInput, { type Coord } from '@/components/GeometryInput'
import MetaFields from '@/components/ranchos/MetaFields'
import { emptyMeta, metaToPayload } from '@/lib/meta'

/** Lo que el formulario junta. El `ranchoId` de una parcela lo pone quien llama. */
export interface DatosNuevaEntidad {
  name: string
  fuenteGeom: string
  coordinates: Coord[]
  municipio?: string
  estado?: string
  region?: string
  altitudM?: number
}

interface Props {
  /** "rancho" o "parcela": sólo para los textos. */
  que: string
  /** Lo que dice el botón que abre el diálogo ("Nueva parcela en El Sauce"). */
  etiquetaBoton: string
  /** Crea la entidad. Si lanza, el mensaje se muestra y el diálogo queda abierto. */
  onCrear: (datos: DatosNuevaEntidad) => Promise<void>
  /** El polígono que enmarca a éste: el rancho, cuando lo que se carga es una parcela. */
  referencia?: { coordinates: Coord[]; nombre: string }
}

/**
 * Crear un rancho o una parcela: nombre, polígono y los datos opcionales de ubicación.
 *
 * Es uno solo para los dos porque el formulario es el mismo —lo único distinto es a qué
 * endpoint va, y eso lo decide quien llama en `onCrear`—, igual que
 * [`EditarEntidadDialog`](../EditarEntidadDialog.tsx) es uno solo para editarlos.
 *
 * El estado del formulario vive acá y no en la pantalla: eran ocho `useState` en
 * `RanchosPage` que nadie más miraba. Se limpia al crear bien, no al cerrar, para no
 * tirar un polígono a medio escribir si el diálogo se cierra sin querer.
 */
export default function CrearEntidadDialog({ que, etiquetaBoton, onCrear, referencia }: Props) {
  const [abierto, setAbierto] = useState(false)
  const [nombre, setNombre] = useState('')
  const [coords, setCoords] = useState<Coord[]>([])
  const [fuente, setFuente] = useState('manual')
  const [meta, setMeta] = useState(emptyMeta)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    // Tres puntos es el mínimo de un polígono; avisarlo acá ahorra un POST que ya se
    // sabe que Geocore rechaza.
    if (coords.length < 3) { setError('Mínimo 3 puntos en el polígono'); return }
    setGuardando(true); setError('')
    try {
      await onCrear({ name: nombre, fuenteGeom: fuente, coordinates: coords, ...metaToPayload(meta) })
      setAbierto(false)
      setNombre(''); setCoords([]); setFuente('manual'); setMeta(emptyMeta)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={open => { setAbierto(open); if (!open) setError('') }}>
      <DialogTrigger render={<Button>{etiquetaBoton}</Button>} />
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Crear {que}</DialogTitle></DialogHeader>
        <form onSubmit={enviar} className="space-y-3 mt-2">
          <div className="space-y-1">
            <Label>Nombre</Label>
            <Input value={nombre} onChange={e => setNombre(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label>Geometría</Label>
            <GeometryInput
              value={coords}
              onChange={(c, f) => { setCoords(c); setFuente(f) }}
              referencia={referencia}
            />
          </div>
          <MetaFields values={meta} onChange={setMeta} />
          {error && <p className="text-destructive text-sm">{error}</p>}
          <Button type="submit" className="w-full" disabled={guardando}>
            {guardando ? 'Creando...' : `Crear ${que}`}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
