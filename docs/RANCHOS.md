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
| `lib/useEntidades.ts` | Los pedidos: `useTenants`, `useRanchos`, `useParcelas`, `useSerie`, `useCapasDeRancho`, `useCapa`, `useMetricasRancho` |
| `lib/useMapToken.ts` | El token de mapa, con su renovación |
| `lib/meta.ts` | Los campos opcionales de ubicación |
| `components/ranchos/` | Las dos tablas, el diálogo de alta y la celda de proceso |
| `components/series/` | El gráfico de la serie, el interruptor de cadencia y su panel |
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

## La serie de una parcela (M.7.3, con el eje de fechas de M.9.0d)

"Serie" en la fila de una parcela abre un panel lateral con la serie de un índice. El
gráfico es el mismo que el Diagnóstico usó hasta el 2026-09-20 y es **SVG a mano, sin
librería de gráficos** (decisión del usuario, confirmada al abrir M.7.3).

Distingue tres cosas que no son lo mismo:

- **una observación tapada** —menos del 30 % de la parcela a la vista— **no llega**: el
  panel pide `coberturaMinima=0.3`, el mínimo de la receta (ver abajo, 2026-09-26);
- **un tramo sin observaciones útiles** se ve como el hueco que es, ancho en proporción al
  tiempo, y la línea lo cruza **punteada** si pasan más de 40 días;
- **una observación de baja cobertura** trae dato de poca superficie: el punto va hueco.

Hasta el 2026-09-26 la línea **se cortaba** en cada punto sin valor y dejaba una marca en el
eje (M.7.3). Con una fila por mes eran pocos cortes; con una por pasada fueron decenas —186
marcas en una parcela del Cauca— y la serie no se leía. Ahora une cada punto con el siguiente
(pedido del usuario), y lo que se conserva de la regla vieja es no inventar: el tramo largo
va punteado, y la banda p10–p90 sí se corta ahí.

El índice y la cadencia van en la clave del pedido: cambiar cualquiera de los dos es otro
pedido, y la respuesta del anterior que llegue tarde no se pinta como si fuera la nueva.

### El eje es una fecha, y el interruptor de cadencia (M.9.0d, 2026-09-25)

Desde `s2-pasada-v2` el worker guarda **una fila por pasada del satélite** —una mediana de
3 por mes, hasta 8— en vez de una por mes (`DECISIONS #70` del worker). El panel pasó a
poder mostrar las dos series:

| Cadencia | Qué pide | Qué es un punto |
|---|---|---|
| **Mensual** (arranca elegida) | `?cadencia=mensual` | el mes: la mediana de las pasadas, que **agrega la API** |
| **Por pasada** | `?cadencia=pasada` | una pasada, con su fecha de adquisición |

**El eje pasó a ser una fecha, y sin eso el interruptor no serviría de nada.** Antes cada
punto ocupaba una posición fija —el eje era el **número de la fila**—, y con filas mensuales
eso engañaba poco porque los meses vienen parejos. Las pasadas no: tres en marzo y una en
junio. Repartidas a paso fijo, junio ocuparía el mismo ancho que marzo, y la serie diría
algo que no pasó. El gráfico ya sabía dibujar huecos, así que **el cambio es del eje y no
del dibujo**.

Lo que se movió con eso: **las marcas del eje salen del calendario** —bordes de mes, de
trimestre o de año según el tramo, y de día en una serie de pocas semanas— y no de una de
cada N filas. Así la distancia entre dos etiquetas **es** el tiempo que pasó.

Las cuentas del eje viven en [`src/lib/serie.ts`](../src/lib/serie.ts) y tienen tests
(`DECISIONS #40`), porque **un eje mal armado no falla: miente**. Dibuja una serie
perfectamente creíble y nadie mira dos veces un gráfico que se ve bien.

**De cuántas observaciones salió cada punto, en el gráfico.** Cada fila trae `agregadas`, y
con `mensual` un mes puede ser la mediana de seis pasadas o de una: `DECISIONS #48` de
Geocore lo dice así —dos meses con el mismo nombre no son igual de confiables—. Va en una
tira de barras bajo el eje, **no** en el tamaño del punto, porque el punto ya codifica la
cobertura y dos cosas en el mismo canal no se leen. Con `pasada` la tira no se dibuja:
`agregadas` es 1 en todas y serían barras iguales.

**Dos avisos que el panel muestra en vez de esconder:**

- **la serie llegó recortada** (`truncado`). El techo de `limit` se lleva las mediciones más
  viejas, así que lo que se ve es la ventana reciente. Con una parcela y un índice no
  debería pasar —son unas 768 filas por parcela cada dos años contando los cuatro índices, y
  el panel pide 2000—, así que si aparece es que algo creció más de lo previsto;
- **hay filas de dos recetas** en la serie. Un mes reprocesado sale de la API con
  `receta: "s2-mensual-v1,s2-pasada-v2"`, y la API lo muestra **a propósito**: son dos
  mediciones distintas en el mismo punto, no el mismo dato dos veces.

**Lo que el panel no hace: agregar.** El número mensual es la mediana de las medianas por
pasada y **lo calcula la API** (`DECISIONS #48` de Geocore). El front elige la cadencia.

**Pide `?coberturaMinima=0.3`, y M.9.0d no lo pedía: fue un error** (corregido el
2026-09-26, `DECISIONS #51` de Geocore). Desde `s2-pasada-v2` el worker guarda **todas** las
pasadas —también las tapadas enteras— y el umbral pasó a aplicarse al leer. Sin el parámetro
la API no filtra, así que el umbral no se aplicaba en ningún lado. Medido sobre una parcela
del valle del Cauca, julio de 2025: **19 pasadas, 10 al 0 % y 5 por debajo del 15 %**, y la
cobertura de cada una coincide con la clasificación de escena (SCL) de la ESA, así que no era
un error de la máscara: eran nubes. Lo que se veía:

- la cobertura **mensual** en 0 %: es la mediana de las coberturas de las pasadas, y 10 de 19
  eran 0. Con el mínimo, es la mediana de las 4 útiles: 100 %;
- el valor del mes mezclaba fotos de un puñado de píxeles —una del 0,6 % traía un NDVI de
  0,62—: 0,538 contra 0,515 con el mínimo;
- `agregadas` decía 19 cuando las útiles eran 4;
- el gráfico por pasada con 186 marcas de "sin dato" y un eje de −1,2 a 1,2, estirado por la
  banda de esas pasadas casi vacías.

**La cobertura mensual es la mediana de la de sus pasadas, no la del compuesto.** El mapa del
mes es un collage que toma cada píxel de la pasada en que ese píxel se veía, así que con 4
pasadas parciales puede cubrir la parcela entera; esa unión no se puede rehacer desde las
filas por pasada (`#66` del worker). El tooltip lo dice con esas palabras.

**El eje vertical sale de los valores, no de la banda**: una pasada con pocos píxeles trae un
p10 o un p90 extremo, y metido en el dominio aplastaba la serie. La banda que se sale queda
recortada.

El 0,3 está escrito en `lib/serie.ts` (`COBERTURA_MINIMA`) porque la API no expone la receta.
Si una receta cambia su mínimo, cambia con ella.

### Por qué el gráfico está dibujado así

- **El eje vertical sale de los datos, no del rango del índice.** Un NDVI que se mueve entre
  0,30 y 0,60 dibujado en \[-1, 1\] es una línea plana que no dice nada. La contra: **dos
  gráficos no se comparan a ojo**, porque cada uno tiene su escala. El mapa sí usa escala
  fija por índice, justamente para lo contrario.
- **El eje horizontal es el tiempo** (M.9.0d), y de ahí sale lo demás: el hueco de un
  período sin procesar es ancho de verdad, y dos pasadas de la misma semana quedan juntas.
- **El punto hueco es una segunda codificación además del color**: se lee sin distinguir
  colores y sobrevive a una impresión en blanco y negro.
- **La tabla de números, plegada debajo, no es un extra**: la banda p10–p90 es un relleno de
  bajo contraste, y la tabla es lo que la hace legible sin depender del color.
- **Colores**: un solo tono azul, con la banda un paso más clara (`#b7d3f6` en claro,
  `#184f95` en oscuro) y la línea en el paso fuerte. Es una rampa secuencial de un tono, que
  es lo que corresponde a una sola serie.
- **SVG a mano, sin librería de gráficos** (decisión del usuario, confirmada al abrir M.7.3).

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
