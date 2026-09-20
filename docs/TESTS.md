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
