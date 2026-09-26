import { Button } from '@/components/ui/button'
import type { Cadencia } from '@/lib/api'

/**
 * El interruptor mensual / por pasada (M.9.0d). Se traduce a `?cadencia=` de
 * `/api/measurements`.
 *
 * **No es un desplegable, y por eso no es un [`Selector`](../Selector.tsx)**: son dos
 * opciones que se comparan mirando el mismo gráfico, y lo que hace falta es poder ir y
 * volver con un clic. Un desplegable esconde la opción que no está elegida y agrega un
 * clic de más para algo que se usa alternando. La regla de `DECISIONS #37` sigue en pie
 * donde aplica: acá no hay ningún `Select` de Base UI de por medio.
 *
 * Dos botones con `aria-pressed`, no pestañas: una pestaña promete un panel propio, y esto
 * cambia **lo que dice** un mismo panel.
 */

interface Opcion {
  value: Cadencia
  label: string
  /** Lo que ese punto significa. Va en el `title` del botón. */
  ayuda: string
}

// No se exporta: un archivo de componente que exporta algo más pierde el fast refresh
// (`react-refresh/only-export-components`), y nadie de afuera necesita esta lista.
const CADENCIAS: readonly Opcion[] = [
  {
    value: 'mensual',
    label: 'Mensual',
    ayuda: 'Un punto por mes: la mediana de las pasadas de ese mes, que la agrega la API.',
  },
  {
    value: 'pasada',
    label: 'Por pasada',
    ayuda: 'Un punto por pasada del satélite, tal como lo guarda el worker desde s2-pasada-v2.',
  },
]

export default function InterruptorCadencia({ value, onValueChange }: {
  value: Cadencia
  onValueChange: (value: Cadencia) => void
}) {
  return (
    <div role="group" aria-label="Cadencia de la serie" className="flex w-fit gap-1 rounded-lg bg-muted p-[3px]">
      {CADENCIAS.map(o => {
        const elegida = o.value === value
        return (
          <Button
            key={o.value}
            type="button"
            size="sm"
            variant="ghost"
            aria-pressed={elegida}
            title={o.ayuda}
            // El mismo aspecto que la pestaña activa de `ui/tabs.tsx`: la elegida se
            // levanta sobre el fondo del grupo. Es el lenguaje que el panel ya usa para
            // "de estas dos, ésta".
            className={elegida
              ? 'bg-background text-foreground shadow-sm dark:bg-input/30'
              : 'text-muted-foreground'}
            onClick={() => onValueChange(o.value)}
          >
            {o.label}
          </Button>
        )
      })}
    </div>
  )
}
