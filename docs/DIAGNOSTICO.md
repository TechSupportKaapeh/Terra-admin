# Pestaña Diagnóstico

Sólo para **TerraAdmin**. `App.tsx` la esconde a TerraSupport, pero ese gate es cosmético
[B-2]: lo que de verdad la protege es la política `TerraAdmin` de
`GET /api/admin/diagnostico` en Geocore (`DECISIONS #19`).

Tres solapas:

| Solapa | Qué contesta |
|---|---|
| **Servicios** | ¿Geocore, el tileserver y el worker están vivos y bien configurados? |
| **Tiles** | ¿La cadena de tiles funciona de punta a punta, desde el token hasta el PNG? |
| **Datos** | ¿Qué datos tiene cada tenant, y tienen sentido? |

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
sale de Geocore sin `rescale` ni `colormap_name`: los agrega el front. Al elegir la métrica,
el piloto carga la escala de ese índice desde `src/lib/indices.ts`:

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
mira ya sabe leer. Los controles de `rescale` y paleta siguen estando: la tabla es de dónde
arranca, no una jaula.

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

**El gráfico de una parcela** es la serie mensual de un índice: la mediana, con la banda
p10–p90 detrás.

### Por qué el gráfico está dibujado así

Es un **prototipo**: la pantalla del cliente es M.7.3. Existe para mirar con ojos los
números del pipeline antes de construirla, y para que la decisión de librería la tome M.7.3
sabiendo qué interacción hace falta. Por eso es SVG a mano, sin dependencias (decisión del
usuario, 2026-09-20).

Tres cosas que el dibujo distingue a propósito, porque son tres cosas distintas:

- **Mes sin dato** (`valor` null): el mes **se procesó**, pero la cobertura quedó bajo el
  mínimo de la receta. La línea se corta y queda una marca en el eje. No se interpola:
  una recta entre dos meses inventa un valor que nadie midió.
- **Mes ausente** (ninguna fila): nadie lo procesó. También corta la línea, y se ve en la
  tabla de números.
- **Mes de baja cobertura** (< 50 %): hay dato, pero de poca superficie. El punto va
  **hueco**, que es una segunda codificación además del color: se lee sin distinguir
  colores, y sobrevive a una impresión en blanco y negro.

**El eje vertical sale de los datos, no del rango del índice.** Un NDVI que se mueve entre
0,30 y 0,60 dibujado en \[-1, 1\] es una línea plana que no dice nada.

**Hay una tabla de números** debajo, plegada. No es un extra: la banda p10–p90 es un relleno
de bajo contraste, y la tabla es lo que la hace legible sin depender del color.

**Colores**: un solo tono azul, con la banda un paso más clara (`#b7d3f6` en claro,
`#184f95` en oscuro) y la línea en el paso fuerte (`#2a78d6` / `#3987e5`). Es una rampa
secuencial de un tono, que es lo que corresponde a una sola serie; los colores por índice
para el mapa los decide M.7.4.

### Lo que falta

- **No hay mapa acá**: el ráster por mes es M.7.4.
- **La métrica del rancho** (`GET /api/ranchos/{id}/metricas`) todavía no se muestra;
  entra con M.7.4, que la dibuja al lado del mapa con su `fraccionArea`.
- **Sin tests**: el panel no tiene ninguno todavía (M.7.6). El gráfico se verificó a ojo.
