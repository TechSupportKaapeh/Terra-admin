import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import CeldaProceso from '@/components/ranchos/CeldaProceso'
import type { Proceso, Rancho } from '@/lib/api'

/**
 * Los ranchos del tenant. La fila entera selecciona el rancho —es lo que después llena
 * el mapa y la pestaña de parcelas—, así que los botones de la última columna cortan la
 * propagación para no seleccionar de paso.
 *
 * Sólo dibuja: qué hace cada acción lo decide la pantalla.
 */
export default function TablaRanchos({ ranchos, seleccionado, ultimoProceso, onSeleccionar, onVerMapa, onEditar, onAlternarActivo, onAbrirBitacora }: {
  ranchos: Rancho[]
  seleccionado: string
  /** El último proceso de cada rancho, por id. */
  ultimoProceso: Map<string, Proceso>
  onSeleccionar: (id: string) => void
  onVerMapa: (r: Rancho) => void
  onEditar: (r: Rancho) => void
  onAlternarActivo: (r: Rancho) => void
  onAbrirBitacora: (jobId: string) => void
}) {
  return (
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
            className={`cursor-pointer hover:bg-muted/50 ${r.id === seleccionado ? 'bg-muted/50' : ''}`}
            onClick={() => onSeleccionar(r.id)}
          >
            <TableCell className="font-medium">{r.name}</TableCell>
            <TableCell>{r.fuenteGeom}</TableCell>
            <TableCell><Badge variant={r.isActive ? 'default' : 'secondary'}>{r.isActive ? 'Activo' : 'Inactivo'}</Badge></TableCell>
            <TableCell><CeldaProceso proceso={ultimoProceso.get(r.id)} onAbrir={onAbrirBitacora} /></TableCell>
            <TableCell className="text-right whitespace-nowrap">
              <Button
                variant="ghost"
                size="sm"
                onClick={e => { e.stopPropagation(); onVerMapa(r) }}
              >
                Mapa
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={e => { e.stopPropagation(); onEditar(r) }}
              >
                Editar
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={e => { e.stopPropagation(); onAlternarActivo(r) }}
              >
                {r.isActive ? 'Desactivar' : 'Activar'}
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
