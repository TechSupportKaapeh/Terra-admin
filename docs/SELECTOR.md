# El `Selector` del panel

> M.7.1, 2026-09-20. Fuente: [`src/components/Selector.tsx`](../src/components/Selector.tsx).

Todos los desplegables del panel son `Selector`. Nadie importa el `Select` de Base UI
directamente, y el lint lo impide.

## Qué bug cierra

El 2026-09-12 cinco pantallas mostraban un UUID donde tenía que decir un nombre: el
desplegable decía "Campo Norte" y el botón, `3f2a…`. La causa es una prop que se olvida:

**Sin `items`, el `Select.Value` de Base UI muestra el value elegido, no la etiqueta de
la opción.** No falla, no avisa, y sólo se ve abriendo esa pantalla.

El arreglo de ese día (`6e07990`) puso `items` en los cinco lugares. Pero dejó dos
problemas vivos, y los dos volvieron a aparecer en las pantallas escritas después:

1. **la próxima pantalla se puede volver a olvidar de `items`** — el 2026-09-20, seis de
   los trece desplegables del panel no la tenían, y el de Índice mostraba `ndvi` en el
   botón y `NDVI` en la lista;
2. **`items` y las `<SelectItem>` son dos listas que hay que mantener iguales a mano.**
   En Tenants, los idiomas estaban escritos dos veces; en el catálogo de Tiles, las dos
   listas ya decían cosas distintas a propósito, y nada marcaba cuál ganaba.

`Selector` cierra los dos: `items` es **obligatoria** —olvidarla es un error de
compilación, no una pantalla fea— y **el componente dibuja las opciones desde esa misma
lista**, así que etiqueta y opción no pueden divergir.

## Cómo se usa

```tsx
<Selector
  items={ranchos.map(r => ({ value: r.id, label: r.name }))}
  value={ranchoId}                      // '' = nada elegido
  onValueChange={setRanchoId}           // recibe '' si se limpió, nunca null
  placeholder="Selecciona un rancho"
  vacio="Este tenant no tiene ranchos"  // qué decir con la lista vacía
  className="w-full"                    // las clases van al botón
/>
```

- **`value` es siempre un `string`.** `''` es el sentinel de "nada elegido" que usa todo
  el panel (`useState('')`), y es lo que esconde las pestañas dependientes. Base UI usa
  `null` para lo mismo; la traducción, en los dos sentidos, vive adentro del `Selector`
  y no repetida como un `value || null` y un `v ?? ''` en cada pantalla.
- **Ninguna opción puede valer `''`**: sería indistinguible de "nada elegido". Para un
  "todos", un value propio: Procesos usa `'todos'`.
- **`detalle` sale sólo en la lista.** Es para lo que ayuda a elegir y estorba después de
  elegido: en el catálogo de Tiles, la lista dice `Campo Norte (14)` y el botón, `Campo
  Norte`.

## La compuerta

`eslint.config.js` prohíbe importar `@/components/ui/select` fuera del propio
`Selector.tsx`:

```
error  '@/components/ui/select' import is restricted from being used by a pattern.
       Usá `Selector` (@/components/Selector): el Select crudo sin `items` muestra el id
       en vez del nombre.  no-restricted-imports
```

Se restringe el **import** y no la prop porque una regla de lint no puede exigir una
prop; el tipo sí. Las dos compuertas se verificaron rompiéndolas a propósito
(2026-09-20): el import prohibido sale `error` en `npm run lint`, y un `Selector` sin
`items` sale `TS2741` en `tsc`. Las dos corren en el CI (`npm run lint` y `npm run
build`, que incluye `tsc -b`).

`ui/select.tsx` se queda donde está: es un archivo que genera `shadcn`, y un
`shadcn add select` lo pisa. Por eso `Selector` vive en `components/`, no en
`components/ui/`.
