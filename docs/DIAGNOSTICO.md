# Pestaña Diagnóstico

Sólo para **TerraAdmin**. `App.tsx` la esconde a TerraSupport, pero ese gate es cosmético
[B-2]: lo que de verdad la protege es la política `TerraAdmin` de
`GET /api/admin/diagnostico` en Geocore (`DECISIONS #19`).

Tres solapas:

| Solapa | Qué contesta |
|---|---|
| **Servicios** | ¿Geocore, el tileserver y el worker están vivos y bien configurados? |
| **Tiles** | ¿La cadena de tiles funciona de punta a punta, desde el token hasta el PNG? |
| **Datos** | ¿Qué tiene procesado cada tenant, y tiene sentido? |

## El límite con las pantallas de trabajo

Desde M.7 (2026-09-20) el panel **muestra lo que el pipeline produce** en las pantallas
donde se trabaja: la serie mensual de una parcela y el mapa por mes de un rancho salen de
su fila en Ranchos. Eso deja una pregunta que hay que contestar antes de agregar nada acá:

> **Diagnóstico contesta «¿por qué no se ve?». Ranchos contesta «¿qué dice el dato?».**

| Lo que se quiere saber | Dónde va |
|---|---|
| El dato de **una** entidad que alguien preguntó | **Ranchos** → «Serie» en una parcela, «Mapa» en un rancho |
| «¿Este tenant está bien procesado?», sin una entidad en mente | **Diagnóstico → Datos** |
| «Esta imagen no se ve, ¿por qué?» — el token, el 403, el COG, el píxel | **Diagnóstico → Tiles** |
| «¿Está vivo el worker?» | **Diagnóstico → Servicios** |

**Lo que no se hace: el mismo dibujo en los dos lados.** El gráfico de la serie estuvo acá
como prototipo hasta que M.7.3 lo puso en su pantalla; **se quitó de Diagnóstico el
2026-09-20**, el mismo día. Si un día hace falta otra vez, se comparte el componente —no se
copia—, como ya pasa con `SerieTemporal`, `useMapToken`, `DeslizadorDeMeses` y `PALETAS`.

**Por qué Tiles no es un duplicado del mapa del rancho**, aunque los dos pinten un COG:

- **cuando un tile falla, el mapa del rancho no dice nada** —un `<img>` que falla deja un
  hueco y nada más—. Tiles lo vuelve a pedir con `fetch` para leer el error y traducirlo;
- **muestra capas que el mapa del rancho no muestra**: las de **parcela** y las de la capa
  vieja. El mapa del rancho filtra a propósito las capas del rancho;
- **dice qué hay en el COG**: `/cog/info` y `/cog/statistics`, con avisos para lo que se ve
  mal sin estar roto —un ráster de un solo valor, casi sin píxeles con dato, o **entero
  fuera de la escala de su índice**—, el valor de un píxel con un clic, y la URL que se
  pide armada a la vista.

Hasta el 2026-09-25 había un cuarto motivo: **dejaba mover el rescale y la paleta a mano**.
Se podó (ver «Tiles, después de la poda», abajo).

## Tiles — el catálogo (2026-09-20)

La capa a probar se elige **en cascada**, no de una lista suelta:

```
tenant → rancho o parcela → métrica → fecha (deslizador)
```

Los tres primeros son desplegables y **cada uno se arma con lo que existe en el de
arriba**, así que no se puede pedir una combinación que no está: si un rancho sólo tiene
NDVI, el selector de métrica muestra NDVI y nada más.

**La fecha es un deslizador con flechas**, no un desplegable: los meses de una serie se
miran de corrido, y la gracia es ver cómo cambia el ráster al avanzar. Va de la fecha más
vieja a la más nueva —el tiempo hacia la derecha—, las flechas mueven de a un mes, y al
elegir una métrica salta sola a la más reciente.

**Arrastrar no dispara un pedido por mes.** El tile se pide **250 ms después** de soltar o
de dejar de moverse: sin esa pausa, ir de enero a diciembre lanzaría doce veces la cadena
entera —detalle de la capa, `/cog/info`, `/cog/statistics` y los tiles— y las respuestas
llegarían desordenadas. La etiqueta sí se actualiza en el acto: lo que se lee sigue al dedo.

Tres cosas que no son obvias:

- **Los nombres se cruzan en el panel.** Las capas viven en GeoData y los nombres de rancho
  y parcela en la base principal (`DECISIONS #15`): no hay join posible, así que el
  catálogo pide las dos cosas y las junta por id. Una entidad sin nombre —borrada, o de
  otro tenant— se muestra con su id recortado, en vez de desaparecer del catálogo.
- **Una capa puede ser de un rancho o de una parcela.** Los mapas mensuales son del rancho;
  los de parcela son on-demand, de la capa vieja, y **no llevan `ranchoId`**, así que
  aparecen como su propia entrada («parcela de …»).
- **El techo de `limit` subió a 2000.** Estaba en 50, que alcanzaba cuando un rancho tenía
  24 capas de NDVI; desde que el mapa es de los cuatro índices (worker `DECISIONS #58`) son
  96 por rancho y por alta, y con 50 el catálogo habría mostrado una parte sin decirlo.

### Cada índice con su escala

El COG guarda el índice **crudo en float32** —números, no colores—, y la plantilla de tiles
sale de Geocore sin `rescale` ni `colormap_name`: los agrega el front. El piloto pinta con la
escala de la métrica elegida, que sale de `src/lib/indices.ts` —la misma que usa el mapa del
rancho—:

| Índice | Qué mide | Rango | Paleta |
|---|---|---|---|
| NDVI | vegetación | 0 … 0,8 | RdYlGn |
| EVI | vegetación densa | 0 … 0,8 | RdYlGn |
| NDRE | clorofila | 0 … 0,5 | Greens |
| NDMI | humedad | −0,4 … 0,4 | RdBu, **centrada en 0** |

**Por qué no alcanza con una sola escala:** un NDMI de 0,2 es húmedo y un NDVI de 0,2 es
casi suelo desnudo. Pintados con el mismo rango dan dos mapas que parecen comparables y no
lo son.

**Por qué los rangos arrancan en 0** (salvo NDMI): lo negativo es agua o nube, y gastar
media rampa ahí aplana justo donde están los cultivos. **Y por qué NDRE llega sólo a 0,5**:
se mueve en un rango más chico que el NDVI; con 0 a 0,8 casi no se ve nada.

**NDMI es el único con un centro con significado** —bajo cero seco, sobre cero húmedo—, así
que su leyenda lleva una marca en el 0. Sin ella, una rampa divergente se lee como si fuera
de magnitud.

Las paletas son la convención agronómica (decisión del usuario, 2026-09-20): es lo que quien
mira ya sabe leer. Desde la poda del 2026-09-25 la tabla es **la** escala, también acá: no
hay controles para moverla.

## Datos (2026-09-20)

Se carga **de a un tenant**: su inventario son 2 + N pedidos —ranchos, capas, y las
parcelas de cada rancho—, y hacerlo para todos al abrir la pestaña sería una tormenta
para una pantalla que se mira de a uno.

**Las cinco tarjetas**: ranchos, parcelas, capas mensuales (con cuántas son de la capa
vieja, si las hay), meses con mapa y la última ingesta. Contestan de un vistazo "¿este
tenant está bien procesado?".

**La tabla por rancho** dice cuántas parcelas tiene, cuántas capas mensuales, y con cuántos
índices y meses. Un rancho en cero es *o* que nunca se procesó *o* que ningún mes tuvo un
píxel limpio (`DECISIONS #51` del worker): el panel no puede distinguirlos, y lo dice.

**El gráfico de la serie ya no está acá** (2026-09-20). Vivió en esta solapa como
prototipo, y desde M.7.3 se mira en **Ranchos → Parcelas → «Serie»**, que es donde está la
parcela por la que alguien pregunta. Lo dibuja `components/series/SerieTemporal.tsx`, y el
porqué de cada detalle —la línea cortada, el punto hueco, la tabla de números— está en
`docs/RANCHOS.md`.

Esta solapa quedó con lo que no tiene otro lugar: **el inventario**.

### Lo que falta

- **Cruzar los `.tif` del bucket con las filas de `layers`**: objetos sin fila y filas sin
  objeto. Hoy el inventario cuenta lo que dice la base, y confía en que el bucket coincida.
- ~~**Podar Tiles.**~~ Hecho el 2026-09-25: ver «Tiles, después de la poda», al final.

## Tiles, después de M.8.1 (2026-09-20)

**El token de mapa es de un tenant.** Lo pide con el tenant elegido en el primer
desplegable de la cascada (`X-Tenant-ID`), Geocore lo firma con `tenant_id` adentro y el
tileserver contesta **403** a cualquier COG que no cuelgue de `tenants/{ese tenant}/`.

Eso le da a esta pestaña un trabajo que antes no tenía: **es donde se verifica el
aislamiento entre tenants**. Elegir un tenant, pedir la capa de otro, y ver el 403.

Dos cosas que hay que saber para leer lo que muestra:

- **Un 403 acá no siempre es una falla.** `explicar()` distingue las dos causas: el token
  que no es de tipo `map-access` (configuración) y el COG de otro tenant (el aislamiento
  funcionando).
- **Las capas viejas ya no se pueden servir.** Las que se escribieron antes del pipeline
  mensual tienen la key sin tenant (`parcelas/{id}/…`, `ranchos/{id}/…`), así que ningún
  token las alcanza. Se borran junto con sus filas (👥): el detalle está en
  `geocore/docs/DECISIONS.md #43`.
- **Al cambiar de tenant, el token anterior deja de contar en el acto.** No se limpia con
  un efecto: `tokenPara()` lo deriva, así que no existe el render en el que el token de A
  se usaría contra los tiles de B.

## Tiles, después de la poda (2026-09-25)

**Se fueron el rescale a mano, sus tres atajos (`Fijo -1 … 1`, `Vegetación 0 … 0.9`,
`Contraste p2 … p98`) y el desplegable de paleta.** La escala es la de `src/lib/indices.ts`
para la métrica elegida, la misma que usa el mapa del rancho, y se deriva en cada render: no
hay un estado que pueda quedar con el rango del índice anterior.

**Por qué ya no hacían falta.** Existían cuando todos los índices se pintaban con la escala
del NDVI, y mover el rango era la única forma de ver un NDMI. Desde que cada índice tiene la
suya, lo único que dejaban hacer era pintar un COG **distinto de como lo ve quien trabaja**,
y eso no contesta «¿por qué no se ve?»: lo complica.

**Lo que sí servía de esos controles se volvió un aviso.** Mover el rango a mano era cómo se
descubría que un ráster caía **entero** fuera de la escala de su índice —TiTiler lo pinta
saturado al extremo y se ve de un solo color sin que el dato lo sea—. Ahora lo dice
`fueraDeEscala` (en `src/lib/indices.ts`, con tests), al lado de los dos avisos que ya había:
el ráster de un solo valor y el de casi ningún píxel con dato.

**Lo que se quedó**: la cascada, el deslizador de fechas, el token con su cuenta regresiva,
`/cog/info` y `/cog/statistics`, la sonda del tile que falla y `explicar()`, el valor del
píxel con un clic, la opacidad —comparar el ráster con la imagen de abajo es parte de
entender por qué no se ve— y la URL armada a la vista.

**Y un arreglo de paso**: el valor del píxel decía la categoría de vegetación («vegetación
densa») para **cualquier** métrica. Un NDMI de 0,5 es humedad, no vegetación: la categoría
ahora sale sólo para NDVI y EVI.

El archivo pasó de 602 a 575 líneas. Son pocas porque lo que se podó es **superficie** —
cinco controles y tres estados— y entró un aviso con su porqué; el número de la nota vieja
(672) era de antes de que M.8.1 sacara el token a `useMapToken`.
