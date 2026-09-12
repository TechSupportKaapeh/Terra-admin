# Pestaña Procesos

Qué está procesando el worker, en qué etapa y en qué rango de fechas va, y qué falló
en cada intento. Para **TerraStaff** (TerraAdmin y TerraSupport): lo protege la política
`TerraStaff` de `GET /api/admin/procesos` en Geocore. Ocultar la pestaña es cosmético,
igual que el resto de los gates del panel [B-2].

Agregada el 2026-09-12. El diseño completo, del lado de cada servicio:

- Geocore: `docs/SESSION_2026-09-12_bitacora_de_procesos.md` y `DECISIONS #20`.
- Worker: `docs/SESSION_2026-09-12_la_bitacora_del_worker.md` y `DECISIONS #29`.

## Dónde se ve

| Lugar | Qué muestra |
|---|---|
| Pestaña **Procesos** | Todos los jobs, filtrables por tenant y estado. Cada fila: tipo, entidad, estado, barra de avance, **en qué va** (la última línea de la bitácora) y hace cuánto se creó. |
| **Ranchos → columna Procesamiento** | El último job de cada rancho y de cada parcela del tenant. |
| Click en cualquiera de las dos | Panel lateral con la **bitácora entera**, intento por intento. |

Mientras haya algo en cola o procesando, la lista se vuelve a pedir cada 5 s y la
bitácora abierta cada 4 s. Cuando todo terminó, dejan de pedir.

## Cómo leerla

**Estados** (`processing_jobs.status`): `en cola` (Geocore lo creó, el worker todavía
no lo tomó) · `procesando` · `terminado` · `falló`. `falló` significa **no se va a
recuperar**: mientras Inngest reintenta, el estado sigue en `procesando` (E.4 del worker).

**Niveles de cada línea** (`processing_job_events.level`):

| Nivel | Se ve como | Significa |
|---|---|---|
| `info` | borde gris | Una etapa arrancó o terminó. |
| `warning` | borde ámbar, "reintento" | Falló, pero Inngest lo va a reintentar. Ver el intento siguiente. |
| `error` | borde rojo, "error" | Falló y no se recupera. |

Cuando cambia el intento, la bitácora lo separa con "Intento N". Las líneas
`inicio` y `fin` son del job, no de un intento, y no abren separador. El worker
escribe `fin` desde un request en el que Inngest vuelve a numerar desde 1: en la
primera corrida real (2026-09-12) aparecía un "Intento 1" después del intento 4. Las etiquetas grises
son los datos de la etapa: el rango de fechas (`2026-03-12 → 2026-04-11`), cuántas
imágenes encontró, cuántas fechas escribió, cuántos MB bajó, cuánto tardó.

**Tipos** (`requestType`, traducidos en `src/lib/procesos.ts`):

| Tipo | Lo dispara | Etapas |
|---|---|---|
| Histórico de parcela (`ParcelaInicial`) | Crear una parcela | plan → 8 trimestres de fechas Sentinel-2 (730 días) → mapa NDVI de la fecha más reciente → 12 meses de serie NDVI → (rescate si ningún mes tuvo valor) |
| Ráster de rancho (`RanchoInicial`) | Crear un rancho | compuesto NDVI de 30 días → descarga → COG → subida |
| Mapa de calor (`heatmap`) | Pedido a demanda de una parcela | cálculo en GEE (o reutiliza la capa si ya existe) → COG → registro |
| … · polígono libre | Pedidos on-the-fly | ídem, sin parcela detrás |

## Los avisos ámbar

La página marca dos situaciones que el estado solo no explica. Los umbrales están en
`src/lib/procesos.ts`:

- **En cola hace más de 10 min**: el worker nunca lo tomó. Mirar en Inngest si llegó el
  evento y si el worker está registrado. Si Geocore creó el job pero no pudo publicar el
  evento, queda así para siempre (no hay outbox: `DECISIONS #18` de Geocore).
- **Procesando sin novedades hace más de 20 min**: está esperando el backoff de un
  reintento o trabado en una llamada a GEE.

## Problemas conocidos

| Síntoma | Causa |
|---|---|
| Banner rojo "Falta aplicar la migración ProcessingJobEvents…" (503 `MIGRACION_PENDIENTE`) | Geocore se desplegó y la migración no se aplicó en la base de GeoData. Ver `geocore/docs/HANDOFF.md`. |
| "Todavía no hay líneas en la bitácora" en un job ya arrancado | Lo mismo, visto desde el worker: sin la tabla, pausa la bitácora 10 min y sólo escribe el avance. |
| "—" en la columna Procesamiento | La entidad se creó antes del 2026-09-12 (sus eventos salían sin `JobId`), o quedó fuera de los 200 jobs más recientes del tenant. |
| Un tipo sin traducir en la lista | Geocore agregó un `requestType` nuevo: sumarlo a `TIPOS` en `src/lib/procesos.ts`. |

## Código

- `src/pages/ProcesosPage.tsx`: la pestaña.
- `src/components/procesos/BitacoraJob.tsx`: el panel lateral (`BitacoraSheet`).
- `src/components/procesos/EstadoJob.tsx`: el chip de estado y la barra.
- `src/lib/useProcesos.ts`: la lista con refresco automático, compartida con Ranchos.
- `src/lib/procesos.ts`: tipos, estados, avisos y formato. Sin componentes.

La hora "hace 3 min" se calcula contra la hora de la última respuesta, no leyendo el
reloj en el render: el lint de React (`react-hooks/purity`) no lo permite.
