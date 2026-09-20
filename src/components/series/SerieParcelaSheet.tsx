import { useState } from 'react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Label } from '@/components/ui/label'
import Selector from '@/components/Selector'
import SerieMensual from '@/components/series/SerieMensual'
import { useSerieMensual } from '@/lib/useEntidades'
import { escalaDe } from '@/lib/indices'

/** Los cuatro índices de la receta `s2-mensual-v1`. El orden es el de la receta. */
const INDICES = ['ndvi', 'evi', 'ndre', 'ndmi']

const OPCIONES_INDICE = INDICES.map(i => ({
  value: i,
  label: i.toUpperCase(),
  detalle: `· ${escalaDe(i).que}`,
}))

/**
 * Panel lateral con la serie mensual de una parcela. `parcela` null = cerrado.
 *
 * Es el mismo patrón que la bitácora de un proceso
 * ([`BitacoraJob`](../procesos/BitacoraJob.tsx)): el contenido va en un componente aparte
 * con `key={parcela.id}`, así al abrir otra parcela el índice elegido arranca de cero en
 * vez de mostrar un instante la serie de la anterior con el índice de la otra.
 */
export default function SerieParcelaSheet({ parcela, tenantId, onClose }: {
  parcela: { id: string; name: string } | null
  tenantId: string
  onClose: () => void
}) {
  return (
    <Sheet open={parcela !== null} onOpenChange={abierto => { if (!abierto) onClose() }}>
      <SheetContent className="data-[side=right]:w-full data-[side=right]:sm:max-w-3xl">
        {parcela && (
          <Serie key={parcela.id} parcelaId={parcela.id} nombre={parcela.name} tenantId={tenantId} />
        )}
      </SheetContent>
    </Sheet>
  )
}

function Serie({ parcelaId, nombre, tenantId }: { parcelaId: string; nombre: string; tenantId: string }) {
  const [indice, setIndice] = useState('ndvi')
  const { filas, error } = useSerieMensual(parcelaId, tenantId, indice)

  return (
    <>
      <SheetHeader className="gap-2 border-b pr-12">
        <SheetTitle>{nombre}</SheetTitle>
        <SheetDescription>
          Un punto por mes, del pipeline mensual. Un mes sin dato es un mes procesado cuya
          cobertura quedó bajo el mínimo de la receta, y no lo mismo que un mes que nadie
          procesó.
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-6">
        <div className="max-w-48 space-y-1">
          <Label className="text-xs">Índice</Label>
          {/* El índice no se limpia: siempre hay uno elegido, y `|| indice` deja el de
              antes si Base UI emite el vacío. */}
          <Selector
            items={OPCIONES_INDICE}
            value={indice}
            onValueChange={v => setIndice(v || indice)}
            className="w-full"
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {/* `filas` null es "todavía no llegó": mostrar el gráfico vacío diría "esta
            parcela no tiene mediciones", que es otra cosa. */}
        {filas === null
          ? <p className="text-sm text-muted-foreground">Cargando la serie…</p>
          : <SerieMensual filas={filas} indice={indice} />}
      </div>
    </>
  )
}
