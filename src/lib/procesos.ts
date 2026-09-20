import type { EventoProceso, Proceso } from '@/lib/api'

/**
 * Vocabulario de los procesos del worker, en un solo lugar.
 *
 * Los `requestType` son contrato con Geocore, y salen de cuatro sitios:
 * `SeguimientoDeProceso.cs` (las altas), `CierreMensual.cs` (el cierre de mes),
 * `ParcelaService.cs` (los pedidos a demanda) y `ProcessingJobsController` (los de
 * polígono libre). Uno que no esté acá se muestra tal cual: no se pierde, sólo
 * queda sin traducir.
 *
 * **Están los once.** Faltaban los dos del cierre de mes, que corre en producción
 * desde el 2026-09-19 y hoy produce la mayoría de los jobs: la pestaña mostraba
 * `ParcelaMensual` crudo en casi todas las filas. Los cuatro a demanda tampoco
 * estaban; sus jobs viejos siguen en la tabla aunque M.6.2 decida retirar los
 * handlers, así que la etiqueta les sirve igual.
 */
export const TIPOS: Record<string, string> = {
  // Altas: los 24 meses de una entidad nueva (`SeguimientoDeProceso.cs`).
  ParcelaInicial: 'Histórico de parcela',
  RanchoInicial: 'Ráster de rancho',
  // Cierre de mes: un solo mes, el que viene en `periodo` (`CierreMensual.cs`).
  ParcelaMensual: 'Mes de parcela',
  RanchoMensual: 'Mes de rancho',
  // A demanda, sobre una parcela (`ParcelaService.cs`).
  heatmap: 'Mapa de calor',
  timeseries: 'Serie temporal',
  dates: 'Fechas disponibles',
  stats: 'Estadísticas de una fecha',
  export: 'Exportación',
  // A demanda, sobre un polígono suelto (`ProcessingJobsController`).
  HeatmapOnTheFly: 'Mapa de calor · polígono libre',
  TimeSeriesOnTheFly: 'Serie · polígono libre',
}
export const etiquetaTipo = (t: string) => TIPOS[t] ?? t

export const ESTADOS: Record<string, string> = {
  pending: 'en cola',
  running: 'procesando',
  completed: 'terminado',
  failed: 'falló',
}

export const esActivo = (status: string) => status === 'pending' || status === 'running'

/** Filtros de estado de la página: clave del Select → lo que va en `?status=`. */
export const FILTROS_ESTADO: Record<string, { etiqueta: string; status?: string }> = {
  todos: { etiqueta: 'Todos los estados' },
  activos: { etiqueta: 'En curso', status: 'pending,running' },
  failed: { etiqueta: 'Fallidos', status: 'failed' },
  completed: { etiqueta: 'Terminados', status: 'completed' },
}

/** Qué se procesa: la parcela (con su rancho), el rancho, o un polígono suelto. */
export function entidad(p: Proceso): string {
  if (p.parcelaId) {
    const parcela = p.parcelaNombre ?? `parcela ${p.parcelaId.slice(0, 8)}`
    return p.ranchoNombre ? `${parcela} · ${p.ranchoNombre}` : parcela
  }
  if (p.ranchoId) return p.ranchoNombre ?? `rancho ${p.ranchoId.slice(0, 8)}`
  return 'polígono libre'
}

// Umbrales de "conviene ir a mirar". No son límites del worker: una ventana de
// GEE lenta puede tardar varios minutos, pero veinte sin escribir nada ya no es
// normal, y un job que nadie tomó en diez tampoco.
const MIN_EN_COLA = 10
const MIN_SIN_NOVEDAD = 20

/**
 * Un aviso cuando el estado no alcanza para entender qué pasa. `ahora` es la hora
 * de la última carga (0 = todavía no cargó): leer el reloj durante el render
 * rompe la pureza que exige React.
 */
export function alerta(p: Proceso, ahora: number): string | null {
  if (!ahora) return null
  if (p.status === 'pending') {
    const min = minutosDesde(p.createdAt, ahora)
    if (min >= MIN_EN_COLA)
      return `En cola hace ${duracion(min * 60_000)} y el worker no lo tomó: revisar en Inngest que el evento haya llegado y que el worker esté registrado.`
  }
  if (p.status === 'running') {
    const ultimo = p.ultimoEvento?.createdAt ?? p.startedAt ?? p.createdAt
    const min = minutosDesde(ultimo, ahora)
    if (min >= MIN_SIN_NOVEDAD)
      return `Sin novedades hace ${duracion(min * 60_000)}: puede estar esperando un reintento o trabado en una llamada a GEE.`
  }
  return null
}

const minutosDesde = (iso: string, ahora: number) => (ahora - Date.parse(iso)) / 60_000

export function duracion(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  if (m < 60) return s % 60 ? `${m} min ${s % 60} s` : `${m} min`
  return `${Math.floor(m / 60)} h ${m % 60} min`
}

export function hace(iso: string, ahora: number): string {
  if (!ahora) return new Date(iso).toLocaleString('es-MX')
  const ms = ahora - Date.parse(iso)
  return ms < 45_000 ? 'recién' : `hace ${duracion(ms)}`
}

/** Cuánto lleva (si sigue) o cuánto tardó (si terminó). Null si el worker no lo arrancó. */
export function duracionDe(p: Proceso, ahora: number): string | null {
  if (!p.startedAt) return null
  const fin = p.finishedAt ? Date.parse(p.finishedAt) : ahora
  return fin ? duracion(fin - Date.parse(p.startedAt)) : null
}

export const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-MX', { hour12: false })

/** Los datos del `detail` de un evento que vale la pena ver como etiquetas, en orden. */
export function datosDeEvento(e: EventoProceso): string[] {
  const d = e.detail ?? {}
  const v = (k: string) =>
    typeof d[k] === 'string' || typeof d[k] === 'number' ? String(d[k]) : null
  const datos: string[] = []
  if (v('desde') && v('hasta')) datos.push(`${v('desde')} → ${v('hasta')}`)
  else if (v('fecha')) datos.push(`fecha ${v('fecha')}`)
  if (v('imagenes') !== null) datos.push(`${v('imagenes')} imágenes`)
  if (v('escritas') !== null) datos.push(`${v('escritas')} fechas escritas`)
  if (v('megas') !== null) datos.push(`${v('megas')} MB`)
  if (typeof d.ms === 'number') datos.push(duracion(d.ms))
  return datos
}

/**
 * El último proceso de cada rancho y de cada parcela, por id.
 *
 * La lista viene de más nuevo a más viejo, así que el primero que aparece de cada
 * entidad es el último: por eso se queda con el primero y no compara fechas. Un job de
 * parcela lleva también el `ranchoId` de su rancho, y contarlo como proceso del rancho
 * mostraría el de una parcela en la fila del rancho: por eso el `else`.
 */
export function ultimoPorEntidad(procesos: Proceso[] | null) {
  const porParcela = new Map<string, Proceso>()
  const porRancho = new Map<string, Proceso>()
  for (const j of procesos ?? []) {
    if (j.parcelaId) {
      if (!porParcela.has(j.parcelaId)) porParcela.set(j.parcelaId, j)
    } else if (j.ranchoId && !porRancho.has(j.ranchoId)) {
      porRancho.set(j.ranchoId, j)
    }
  }
  return { porParcela, porRancho }
}
