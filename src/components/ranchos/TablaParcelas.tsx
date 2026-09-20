import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import CeldaProceso from '@/components/ranchos/CeldaProceso'
import type { Parcela, Proceso } from '@/lib/api'

/**
 * Las parcelas del rancho elegido. A diferencia de la tabla de ranchos, la fila no
 * selecciona nada: no hay un nivel más abajo al que bajar.
 */
export default function TablaParcelas({ parcelas, ultimoProceso, onVerSerie, onEditar, onAlternarActivo, onAbrirBitacora }: {
  parcelas: Parcela[]
  /** El último proceso de cada parcela, por id. */
  ultimoProceso: Map<string, Proceso>
  onVerSerie: (p: Parcela) => void
  onEditar: (p: Parcela) => void
  onAlternarActivo: (p: Parcela) => void
  onAbrirBitacora: (jobId: string) => void
}) {
  return (
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
            <TableCell className="text-muted-foreground">{p.municipio ?? '—'}</TableCell>
            <TableCell><Badge variant={p.isActive ? 'default' : 'secondary'}>{p.isActive ? 'Activa' : 'Inactiva'}</Badge></TableCell>
            <TableCell><CeldaProceso proceso={ultimoProceso.get(p.id)} onAbrir={onAbrirBitacora} /></TableCell>
            <TableCell className="text-right whitespace-nowrap">
              <Button variant="ghost" size="sm" onClick={() => onVerSerie(p)}>
                Serie
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onEditar(p)}>
                Editar
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onAlternarActivo(p)}>
                {p.isActive ? 'Desactivar' : 'Activar'}
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
