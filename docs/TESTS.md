# Los tests del panel

> M.7.6, 2026-09-20. Antes de esta tarea el panel no tenía ninguno.

```bash
npm test          # vitest run, lo mismo que corre el CI
npx vitest        # en watch, mientras se trabaja
```

Corren en el CI, en un paso propio antes del build: tardan medio segundo y fallan mucho
más rápido que un bundle.

## Qué se prueba, y qué no

**`src/lib/`, y nada más por ahora.** Es lo que se puede probar sin un DOM —funciones
puras, sin red— y es donde un error no rompe la pantalla sino que la hace **mentir**, que
es peor: nadie mira dos veces un número que se ve bien.

| Archivo | Qué fija |
|---|---|
| `procesos.test.ts` | Que la traducción de los once `requestType` no pierda uno; que el último proceso de un rancho **no** sea el de una de sus parcelas; que un `0` se muestre (`0 imágenes` es justamente lo que hay que ver); que los avisos de "conviene ir a mirar" cuenten desde la última línea de bitácora y no desde que el job arrancó |
| `geometria.test.ts` | Que el orden del anillo importe y que `cierra` pida tres puntos de verdad. Las dos deciden si se manda un PATCH, y el de geometría **borra lo calculado y encola el reproceso** |
| `indices.test.ts` | Que cada índice tenga rango y paleta, que el centro caiga dentro del rango, y que **la paleta que pide exista**: si no, la leyenda queda transparente y el mapa dice una cosa y su escala otra, sin ningún error a la vista |
| `mapToken.test.ts` | Que el token de un tenant **no se use para otro** (M.8.1: el tileserver contesta 403 a un COG que no cuelgue de `tenants/{tenant del token}/`, y el síntoma sería "el mapa no carga"); que `exp` se lea también con caracteres de base64url; y que "renovar solo" y "reusar el que hay" **no sean la misma regla** |
| `meta.test.ts` | Que un campo vacío **no se mande** (mandarlo como `""` guardaría un municipio vacío en vez de dejarlo sin dato) y que una altitud de `0` no sea lo mismo que sin altitud |
| `serie.test.ts` | Que **el eje sea el tiempo y no el número de la fila** (M.9.0d): dos pasadas de la misma semana quedan juntas y el mes sin pasadas queda vacío; que un solo punto —o dos del mismo día, que con la fecha sin hora es lo mismo— no deje el dominio de ancho cero, porque ahí el pixel sale `NaN` y **no se dibuja nada**; que una fecha con hora y sin zona se lea en UTC y no en la hora de quien mira; que una fecha ilegible se cuente y se deje afuera en vez de dibujarse en 1970; y que las marcas del eje caigan en bordes de calendario sin encimarse |

**No hay tests de componentes.** Pedirían jsdom y una librería de render, y el valor
estaría en otro lado: lo que hoy se rompe en silencio son estas funciones. Si algún día
hacen falta, van en su propio proyecto de vitest con `environment: 'jsdom'`.

## El entorno es `node`, a propósito

`vite.config.ts` fija `environment: 'node'` e `include: ['src/**/*.test.ts']`. jsdom sería
una dependencia más para nada mientras los tests no toquen el DOM.

## Control negativo

Un test que nunca se vio fallar no prueba nada. El 2026-09-20 se rompieron tres
invariantes a propósito y cada uno puso en rojo **su** test y sólo ése:

| Qué se rompió | Qué salió en rojo |
|---|---|
| El `else` que separa el job de una parcela del de su rancho | `un job de parcela NO cuenta como job de su rancho` |
| `ndre` apuntando a una paleta que no existe | `cada índice pide una paleta que existe` |
| `municipio: m.municipio` sin el `|| undefined` | `el formulario en blanco no manda ningún campo` |

El 2026-09-20, con M.8.1, se rompió uno más:

| Qué se rompió | Qué salió en rojo |
|---|---|
| `tokenPara` devolviendo el token sin comparar el tenant | `NO devuelve el token de otro tenant: sería un mapa entero en 403` |

El 2026-09-25, con M.9.0d, tres más. Cada uno puso en rojo **su** test y ningún otro:

| Qué se rompió | Qué salió en rojo |
|---|---|
| `t` del punto reemplazado por la posición de la fila (el eje de antes) | `el eje es el tiempo: dos pasadas juntas quedan juntas y el mes sin pasadas queda vacío` |
| `dominioDe` sin la guarda de ancho cero | `un solo punto no deja el dominio de ancho cero…` y `dos pasadas del mismo día tampoco…` |
| `instanteDe` pasándole a `Date.parse` la fecha con `T` y sin zona, sin completarle la `Z` | `una fecha con hora y sin zona se lee en UTC, no en la hora del que mira` |

**El tercero dependía de la zona de la máquina, y se arregló.** En una máquina con UTC —el
CI de GitHub— la hora local coincide con la de la API, y el test pasaba con el código roto:
en el CI no protegía nada. Ahora fija la zona adentro (`vi.stubEnv('TZ', 'America/Bogota')`;
Node relee `TZ` cada vez que se asigna), y el control negativo se repitió con la máquina en
UTC (`TZ=UTC npx vitest run`): sale en rojo igual.
