import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

/**
 * Una opción del `Selector`.
 *
 * `label` es lo que se ve en el desplegable **y** en el botón una vez elegida: una sola
 * fuente, así no pueden divergir. `detalle` se agrega sólo en la lista, para lo que
 * ayuda a elegir pero estorba en el botón (cuántas capas tiene un rancho, cuántas
 * fechas una métrica).
 */
export interface Opcion {
  /** El valor que viaja al estado. **Nunca `''`**: ése es el sentinel de "nada elegido". */
  value: string
  label: string
  detalle?: string
}

interface SelectorProps {
  /**
   * Las opciones. Obligatoria, y es el punto del componente: el `Select` de Base UI
   * necesita `items` para que el botón muestre la etiqueta y no el value crudo.
   */
  items: readonly Opcion[]
  /** El value elegido; `''` es "nada elegido" y muestra el `placeholder`. */
  value: string
  /** Recibe el value elegido, o `''` si se limpió. Nunca `null`. */
  onValueChange: (value: string) => void
  placeholder?: string
  /** Qué decir cuando no hay ninguna opción. */
  vacio?: string
  /** Clases del botón (el ancho suele ir acá). */
  className?: string
  size?: 'sm' | 'default'
}

/**
 * El desplegable del panel: un `Select` de Base UI que **exige** su lista de opciones
 * y las dibuja él mismo.
 *
 * Cierra la clase de bug del 2026-09-12 (commit `6e07990`), que apareció en cinco
 * pantallas a la vez. Son dos errores distintos, y los dos se cometían por omisión:
 *
 * 1. **Sin la prop `items`, el `Select.Value` de Base UI muestra el value elegido**, no
 *    la etiqueta de la opción: el desplegable decía "Campo Norte" y el botón, un UUID.
 *    Acá `items` es obligatoria, así que olvidarla no compila.
 * 2. **`items` y las `<SelectItem>` eran dos listas** que había que mantener iguales a
 *    mano (en Tenants, el idioma estaba escrito dos veces). Acá hay una sola: el
 *    componente recorre `items` para dibujar las opciones.
 *
 * Y traduce el sentinel: adentro del panel "nada elegido" es `''` —lo que esconde las
 * pestañas dependientes—, y para Base UI es `null`, que es lo que muestra el
 * placeholder. La traducción va en los dos sentidos y en un solo lugar, en vez de un
 * `value || null` y un `v ?? ''` repetidos en cada pantalla.
 *
 * Es de acá y no de `components/ui/`, que son los archivos que genera `shadcn`: un
 * `shadcn add select` pisa `ui/select.tsx` y no tiene por qué saber de éste.
 */
export default function Selector({
  items,
  value,
  onValueChange,
  placeholder,
  vacio = 'Sin opciones',
  className,
  size,
}: SelectorProps) {
  return (
    <Select
      items={items}
      value={value || null}
      onValueChange={v => onValueChange(v ?? '')}
    >
      <SelectTrigger className={className} size={size}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {items.length === 0
          ? <div className="px-2 py-1.5 text-sm text-muted-foreground">{vacio}</div>
          : items.map(o => (
              <SelectItem key={o.value} value={o.value}>
                {o.detalle ? `${o.label} ${o.detalle}` : o.label}
              </SelectItem>
            ))}
      </SelectContent>
    </Select>
  )
}
