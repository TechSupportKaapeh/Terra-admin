import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Elegir una fecha de una serie: flechas y un deslizador, no un desplegable.
 *
 * Los meses de una serie se miran de corrido, y la gracia es ver cómo cambia el mapa al
 * avanzar (Terra-admin#9, 2026-09-20). Va de la más vieja a la más nueva —el tiempo hacia
 * la derecha—, las flechas mueven de a un mes, y el deslizador acepta las flechas del
 * teclado porque es un `<input type="range">` de verdad.
 *
 * No sabe qué se está mirando: recibe etiquetas y una posición. Quien llama decide si el
 * cambio pide algo a la red en el acto o con una pausa.
 */
export default function DeslizadorDeMeses({ etiquetas, posicion, onPosicion, nombre = 'Fecha' }: {
  /** Una por fecha, de la más vieja a la más nueva. */
  etiquetas: string[]
  posicion: number
  onPosicion: (i: number) => void
  /** Qué se está eligiendo, para los lectores de pantalla. */
  nombre?: string
}) {
  const ultima = etiquetas.length - 1
  const ir = (i: number) => onPosicion(Math.max(0, Math.min(ultima, i)))

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Button
          type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0"
          aria-label="Mes anterior"
          disabled={posicion === 0}
          onClick={() => ir(posicion - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <div className="min-w-24 text-center font-mono text-sm tabular-nums">
          {etiquetas[posicion]}
        </div>

        <Button
          type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0"
          aria-label="Mes siguiente"
          disabled={posicion >= ultima}
          onClick={() => ir(posicion + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <input
        type="range"
        className="w-full accent-primary"
        min={0}
        max={Math.max(0, ultima)}
        step={1}
        value={posicion}
        disabled={etiquetas.length < 2}
        aria-label={nombre}
        aria-valuetext={etiquetas[posicion]}
        onChange={e => ir(Number(e.target.value))}
      />

      <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
        <span>{etiquetas[0]}</span>
        <span>{etiquetas.at(-1)}</span>
      </div>
    </div>
  )
}
