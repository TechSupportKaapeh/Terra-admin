# Crear extensión y subgrupos

> Sprint K (Geocore `DECISIONS #66` a `#69`). **K.5, la vista previa: hecha el 2026-10-04.** Corregir
> y confirmar es K.6; hasta entonces esta pantalla **no crea nada**.

## Qué hace

En **Ranchos y Parcelas → Ranchos**, el botón **«Crear extensión y subgrupos»** abre un panel lateral.
Se sube un archivo —con el botón «Elegir archivo» o arrastrándolo a la zona de carga— —KML, GeoJSON (`.geojson` o `.json`) o WKT (`.wkt` o `.txt`)— y Geocore
(`POST /api/importacion/vista-previa`) lo lee, lo clasifica y devuelve lo que propone. El panel lo
muestra en dos columnas:

- **el árbol**: los ranchos con sus parcelas debajo; después los que se crearían cada uno con su propio
  rancho (el caso 4, d-K2); y al final lo desactivado, que no se crearía (geometrías inválidas,
  duplicados, y lo que contiene ranchos, d-K9). Cada fila tiene el área y, si hay, la cantidad de
  avisos. Tocarla muestra el motivo, de dónde salió en el archivo y los avisos;
- **el mapa**: todos los polígonos, por color según lo que se propone —azul rancho, verde parcela,
  naranja rancho + parcela— y lo desactivado en gris punteado. El elegido en el árbol se resalta y el
  mapa se encuadra en él; «Ver todo» vuelve al conjunto.

Arriba van el caso del archivo (1 a 4, o mixto) y una frase con lo que se crearía.

## Dónde vive

| Pieza | Qué |
|---|---|
| `src/components/importacion/ImportacionSheet.tsx` | El panel: subir, el árbol y el mapa |
| `src/components/importacion/ZonaDeCarga.tsx` | Elegir o arrastrar el archivo; lo arrastrado se valida antes de subirlo (`problemaDelArchivo`) |
| `src/lib/importacion.ts` | Lo puro: el árbol, las formas del mapa, los textos, qué archivo se puede subir. Con tests |
| `src/lib/api.ts` → `previsualizarImportacion` | La llamada. No pasa por `request`: el cuerpo es un multipart |
| `src/components/GeometryView.tsx` | El mapa de siempre, con tres opcionales nuevos en `Shape` (`dashed`, `weight`, `fillOpacity`) y `foco` |

## Lo que hay que saber

- **Los ranchos se dibujan primero**, para quedar abajo: si no, tapan a sus parcelas y no se las puede
  tocar en el mapa. Lo fija un test.
- **Nada se pierde de la pantalla**: una parcela cuyo rancho no está activo se muestra entre lo
  desactivado. Geocore no lo produce hoy, pero si cambia, se ve.
- **Una respuesta vieja se descarta**: si se elige otro archivo antes de que vuelva el primero, el mapa
  no puede quedar mostrando uno con el nombre del otro.
- Para probar, hay archivos armados con geometrías reales en `Downloads/archivos_sprint_K/` (no están
  en git).
