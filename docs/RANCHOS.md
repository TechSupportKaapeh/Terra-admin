# Pantalla de Ranchos

> Sprint M.7, 2026-09-20 (M.7.2, M.7.3 y M.7.4). La ven TerraAdmin y TerraSupport; lo que
> protege el dato son las políticas de Geocore, no este panel.

Es la pantalla donde se trabaja un tenant: sus ranchos, sus parcelas, y lo que el pipeline
mensual produjo para cada uno.

```
Tenant ▾
├── Ranchos    tabla · [Mapa] [Editar] [Activar/Desactivar] · mapa de geometría abajo
└── Parcelas   tabla · [Serie] [Editar] [Activar/Desactivar]
```

## Cómo está partida

`RanchosPage` eran 438 líneas con catorce `useState`, dos formularios completos y dos
tablas. Ahora tiene 217 y sólo decide **qué está elegido, qué panel está abierto y qué pasa
al confirmar**:

| Dónde | Qué |
|---|---|
| `lib/useEntidades.ts` | Los pedidos: `useTenants`, `useRanchos`, `useParcelas`, `useSerieMensual`, `useCapasDeRancho`, `useCapa`, `useMetricasRancho` |
| `lib/useMapToken.ts` | El token de mapa, con su renovación |
| `lib/meta.ts` | Los campos opcionales de ubicación |
| `components/ranchos/` | Las dos tablas, el diálogo de alta y la celda de proceso |
| `components/series/` | La serie mensual y su panel |
| `components/mapas/` | El mapa del rancho, el deslizador de meses y su panel |

## Los pedidos se cancelan, y eso no es sólo orden

Sin cancelar, elegir el tenant A y enseguida el B deja una carrera: **si la respuesta de A
llega después, la tabla muestra los ranchos de A con B elegido**. En un panel multi-tenant
eso no se puede permitir, y no se veía en el código de la pantalla, que sólo decía
`setRanchos(await getRanchos(tenantId))`.

`useCargado` guarda **la clave junto con los datos** y sólo devuelve los que corresponden a
la clave de ahora. Mientras la nueva no llega devuelve `null` —"cargando", no "vacío"—, así
que la tabla nunca muestra una fila del tenant anterior.

Por la misma razón, **cambiar de tenant limpia el rancho elegido y cierra los paneles
abiertos**. Va en el handler, no en un efecto (`set-state-in-effect`).

## La serie de una parcela (M.7.3)

"Serie" en la fila de una parcela abre un panel lateral con la serie mensual de un índice.
El gráfico es el mismo que el Diagnóstico usa desde el 2026-09-20 y es **SVG a mano, sin
librería de gráficos** (decisión del usuario, confirmada al abrir M.7.3).

Distingue tres cosas que no son lo mismo:

- **un mes sin dato** (`valor` null) es un mes **procesado** cuya cobertura quedó bajo el
  mínimo de la receta: la línea se corta y queda una marca en el eje;
- **un mes ausente** —ninguna fila— es un mes que nadie procesó: también corta la línea;
- **un mes de baja cobertura** trae dato de poca superficie: el punto va hueco.

El índice va en la clave del pedido: cambiarlo es otro pedido, y la respuesta del anterior
que llegue tarde no se pinta como si fuera la nueva.

## El mapa del rancho (M.7.4)

"Mapa" en la fila de un rancho abre un panel lateral con **un mapa por mes y por índice**.
Desde `DECISIONS #58` del worker hay un COG por índice, así que hay dos controles: el índice
y el mes.

- **El mes es un deslizador con flechas**, no un desplegable: los meses se miran de corrido
  y la gracia es ver cómo cambia el ráster al avanzar. El deslizador se mueve al instante y
  el mapa lo alcanza 250 ms después; sin esa pausa, arrastrarlo de punta a punta pediría una
  capa por mes.
- **Sólo están los meses con ráster.** Un mes sin un solo píxel limpio no tiene COG
  (`DECISIONS #51` del worker), así que la lista tiene huecos a propósito.
- **El color lo decide el panel** (`src/lib/indices.ts`): el COG guarda el índice crudo en
  float32 y la plantilla de Geocore sale sin `rescale` ni `colormap_name`. Cada índice tiene
  su escala, porque NDVI y NDMI pintados con el mismo rango dan dos mapas que parecen
  comparables y no lo son. La leyenda sale del **mismo** degradado que el tile.
- **El rancho y sus parcelas van encima, sin relleno**: el relleno taparía el ráster, que es
  el dato.
- **El token de mapa va en la URL**, no en una cabecera: quien pide cada tile es un `<img>`
  de Leaflet. Se renueva con 5 minutos de margen, porque un token que vence en medio de un
  paneo deja el mapa lleno de 401 sin ningún error visible.

### El número del rancho, contra su mapa

La métrica del rancho va **arriba del mapa, y la fracción del área con dato va al lado del
número** (decisión de M.7.4).

No es decoración: el promedio de Geocore **divide por el área con dato, no por la total**
(`DECISIONS #29`). Un NDVI de 0,62 del 20 % del rancho no dice lo mismo que el mismo 0,62
del 95 %, y el número solo se lee mal. Debajo van las parcelas con dato y las hectáreas.

Puede haber un mes **con ráster y sin métrica**: el rancho tuvo píxeles limpios, pero
ninguna parcela llegó a la cobertura mínima de la receta. Se dice con esas palabras en vez
de mostrar un guión.

### Lo que falta

`GET /api/layers` **no filtra por rancho** —sólo por tenant o por parcela—, así que el
filtro es del panel: se piden las capas del tenant (techo 2000) y se quedan las del rancho.
Un rancho son 96 capas por alta, así que alcanza de sobra; si algún tenant pasa ese techo, el
filtro tiene que mudarse al servidor.
