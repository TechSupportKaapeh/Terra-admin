import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Meta } from '@/lib/meta'

/** Los cuatro campos opcionales de ubicación, iguales para un rancho y para una parcela. */
export default function MetaFields({ values, onChange }: {
  values: Meta
  onChange: (v: Meta) => void
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
