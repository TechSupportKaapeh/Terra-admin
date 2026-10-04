# Crear extensión y subgrupos

> Sprint K (Geocore `DECISIONS #66` a `#70`). **La vista previa (K.5) y corregir y confirmar (K.6):
> hechas el 2026-10-04.** Esta pantalla crea ranchos y parcelas de verdad.

## Qué hace

En **Ranchos y Parcelas → Ranchos**, el botón **«Crear extensión y subgrupos»** abre un panel lateral.
Se sube un archivo —KML, GeoJSON (`.geojson` o `.json`) o WKT (`.wkt` o `.txt`)—, con el botón
«Elegir archivo» o arrastrándolo a la zona de carga, y Geocore (`POST /api/importacion/vista-previa`)
lo lee, lo clasifica y devuelve lo que propone. El panel lo muestra en dos columnas:

- **el árbol**: los ranchos con sus parcelas debajo; después los que se crearían cada uno con su propio
  rancho (el caso 4, d-K2); las **parcelas sin rancho**, marcadas en rojo; y al final lo desactivado,
  que no se crea. Cada fila tiene la casilla de activo, el área, «corregido» si cambió algo, y la cuenta
  de errores de la última revisión;
- **el mapa**: todos los polígonos, por color según lo que se crearía —azul rancho, verde parcela,
  naranja rancho + parcela— y lo desactivado en gris punteado. El elegido se resalta y el mapa se
  encuadra en él; «Ver todo» vuelve al conjunto.

## Corregir

Tocar una fila abre su editor: **qué es** (rancho, parcela, rancho + parcela), **en qué rancho** (si es
parcela: los ranchos activos del archivo), y **el nombre**. La casilla activa o desactiva. Un polígono
que no se puede importar (geometría inválida) queda desactivado y no se puede activar.

- **Desactivar un rancho, o pasarlo a parcela, no toca sus parcelas** (decisión del usuario,
  2026-10-04): quedan en «Parcelas sin rancho» hasta que se las reasigne o se las desactive. Nada
  cambia sin que se vea.
- «Volver a lo propuesto» deshace un polígono o todo. Elegir otro archivo descarta las correcciones.

## Revisar y crear

- **«Revisar»** manda el plan a `POST /api/importacion/estimacion`: vuelve la estimación —las altas,
  las ejecuciones de Inngest, lo que van a ocupar los mapas y las filas— con **los errores marcados en
  el árbol** y los avisos (un rancho que ya existe en ese lugar, uno demasiado grande para el worker).
  Es un botón y no automático (decisión del usuario): la estimación tiene un límite de 20 por minuto.
- **«Crear»** se habilita sólo con una revisión **del plan que está en pantalla** y sin errores:
  cualquier cambio después de revisar obliga a revisar de nuevo. Crea con `POST /api/importacion`,
  todo o nada. Si entre revisar y crear algo cambió en Geocore, vuelve 422 con los errores, se marcan en
  el árbol y no se crea nada.
- **Al crear**, el panel muestra lo creado y lo que quedó sin encolar (su alta falló al publicarse: se
  reprocesa desde Procesos), con «Listo». La lista de ranchos y los procesos se recargan.

## Dónde vive

| Pieza | Qué |
|---|---|
| `src/components/importacion/ImportacionSheet.tsx` | El panel: subir, el árbol con el editor, el mapa, revisar y crear |
| `src/components/importacion/ZonaDeCarga.tsx` | Elegir o arrastrar el archivo; lo arrastrado se valida antes de subirlo (`problemaDelArchivo`) |
| `src/lib/importacion.ts` | El árbol, las formas del mapa, los textos, qué archivo se puede subir |
| `src/lib/planDeImportacion.ts` | Las correcciones, el plan que se manda, cuándo se puede crear y los textos de la estimación |
| `src/lib/api.ts` → `previsualizarImportacion`, `estimarImportacion`, `importarPlan` | Las llamadas. No pasan por `request`: el cuerpo es un multipart |
| `src/components/GeometryView.tsx` | El mapa de siempre, con tres opcionales en `Shape` (`dashed`, `weight`, `fillOpacity`) y `foco` |

## Lo que hay que saber

- **La vista previa no se toca: las correcciones viven aparte, por índice**, y se aplican encima
  (`aplicarCorrecciones`). El árbol y el mapa dibujan la vista corregida, y **el plan sale de esa misma
  vista** (`planDe`): lo que se manda es lo que se ve. Un campo que vuelve a su valor propuesto deja de
  contar como corrección.
- **El plan lleva todos los polígonos, también los desactivados** (`activo: false`): Geocore lo usa para
  comprobar que el plan es de este archivo.
- **Los ranchos se dibujan primero**, para quedar abajo: si no, tapan a sus parcelas. Lo fija un test.
- **Una respuesta vieja se descarta**: si se elige otro archivo antes de que vuelva la vista previa, la
  revisión o un rechazo de «Crear», no se aplica sobre el archivo nuevo.
- Para probar, hay archivos armados con geometrías reales en `Downloads/archivos_sprint_K/` (no están
  en git). **El del caso 1 no se puede crear tal como se propone**, a propósito: «Lote del borde» se
  pisa el 50 % con Rancho Buga y dos lotes se pisan el 36 %. Desactivando esos, entra.
