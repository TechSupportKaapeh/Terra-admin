# Cargar y corregir geometría

Dónde se dibuja el polígono de un rancho o de una parcela, y qué pasa al guardarlo.
Agregado el 2026-09-20, después de encontrar en producción un rancho con la geometría
mal cargada: una tira de 130 m por 1113 km que hacía fallar su cierre de mes.

Del lado de Geocore: `DECISIONS #21` (la parcela cae dentro de su rancho), `#32` (el
reproceso) y `#33` (achicar un rancho no deja parcelas afuera).

## Dónde

| Lugar | Qué hace |
|---|---|
| **Ranchos → Nuevo rancho** y **Parcelas → Nueva parcela** | Cargar la geometría al crear. |
| **Ranchos/Parcelas → botón Editar** de cada fila | Cambiar el nombre y la geometría de algo que ya existe. |

Las dos usan el mismo `GeometryInput`: mapa arriba y cuatro formas de cargar los puntos
—**Manual**, **KML**, **GeoJSON**, **WKT**—. Los tres formatos de archivo se aplican
solos al elegir el archivo; el manual tiene borrador (abajo).

## El borrador, en la carga manual

**Lo que se escribe se dibuja al instante**, sin tocar ningún botón:

- los puntos, en **ámbar**, numerados al pasar el mouse; el primero se ve más grande,
  porque es con el que tiene que cerrar el último;
- la línea que los une, **punteada mientras el polígono no cierre** y continua cuando
  cierra;
- el mapa se reencuadra solo para que el punto nuevo entre en pantalla.

**Nada de eso se guarda todavía.** Lo ámbar es el borrador; lo **azul** es lo aplicado,
que es lo único que viaja en el POST o en el PATCH. El botón dice en qué estado está:

| Estado | Botón | Qué falta |
|---|---|---|
| Menos de 3 puntos | `Aplicar` deshabilitado | Escribir más puntos. |
| 3 o más, pero no cierra | `Aplicar` deshabilitado, y aparece **Cerrar polígono** | Repetir el primer punto al final, que es lo que hace ese botón. |
| Cierra y difiere de lo aplicado | **`Aplicar`** | Confirmarlo. |
| Igual a lo aplicado | `Aplicado`, deshabilitado | Nada. |

**Por qué "Cerrar polígono" es un botón y no algo automático:** cerrar el anillo cambia
lo que la persona escribió. Que lo haga el sistema en silencio, sobre una geometría que
se está corrigiendo justamente porque estaba mal, es la clase de ayuda que después nadie
puede explicar. El dominio de Geocore exige el anillo cerrado (`GeoPolygon.Create`), así
que avisarlo acá evita mandar algo que ya se sabe que va a ser rechazado.

## Al guardar

**Se manda sólo lo que cambió.** El nombre y la geometría son dos rutas distintas en
Geocore (`PATCH .../name` y `PATCH .../geometry`), y la de geometría recalcula centroide
y área. El nombre va primero: si la geometría se rechaza, el renombre igual quedó.

**Dos rechazos posibles, y los dos se muestran tal cual llegan:**

- `422 PARCELA_FUERA_DEL_RANCHO` — más del 1 % de la parcela queda fuera de su rancho.
- `422 PARCELAS_FUERA_DEL_RANCHO` — el rancho se achicó y deja parcelas afuera. El
  mensaje **nombra cuáles** y cuánto queda afuera de cada una.

## Qué pasa con lo que ya se había calculado

**Se borra y se recalcula solo** (Geocore `DECISIONS #34`). Al guardar una geometría nueva:

- se **borran** los datos derivados de esa entidad —de una parcela, sus mediciones y sus
  mapas a demanda; de un rancho, sus mapas—, porque salieron del polígono viejo y
  describen otro pedazo de tierra;
- se **encola el reproceso**, que recalcula los 24 meses;
- el diálogo muestra el resumen —cuántas filas se borraron y que el reproceso quedó en
  cola— y se sigue en la pestaña **Procesos**.

Un hueco de unos minutos es honesto; un NDVI de otro lado no, porque nada lo distingue de
un dato bueno.

**Si el reproceso no se pudo encolar** —Inngest caído, por ejemplo—, el diálogo lo dice en
rojo: los datos quedaron borrados y hay que reprocesar a mano.

```bash
curl -X POST <geocore>/api/admin/procesos/reprocesar   -H "Authorization: Bearer <JWT de TerraAdmin>"   -H "Content-Type: application/json"   -d '{"ranchoId": "<id>"}'
```

Reprocesar un **rancho** arrastra además sus parcelas activas.

**El mapa nuevo se ve enseguida:** la URL de tiles lleva `&v=<fecha de ingesta>`, que
cambia al recalcular. Sin eso el navegador seguiría mostrando la imagen vieja hasta un
año, porque el tileserver la sirve como `immutable`.

## Lo que falta (M.7.5)

Dibujar el polígono **con clics sobre el mapa**, arrastrar vértices, y ver el rancho de
referencia debajo mientras se dibuja una parcela. Lo de acá es la carga por texto con
borrador en vivo, que es lo que hacía falta para corregir geometrías mal cargadas.
