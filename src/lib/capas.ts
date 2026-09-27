/**
 * El listado de capas, `GET /api/layers` (M.9.7c, Geocore `DECISIONS #54`).
 *
 * Vive fuera de `api.ts` por lo mismo que `querySerie`: `api.ts` lee `import.meta.env` al
 * cargarse, y los tests del panel corren en node, sin Vite.
 */

/** Los filtros del listado. Todos opcionales; sin ninguno, todas las capas del tenant. */
export interface FiltroCapas {
  /** Las capas **del rancho**, sin las de sus parcelas. Lo filtra Geocore, no el panel. */
  ranchoId?: string
  /** Primer día incluido, `AAAA-MM-DD` en UTC. En el mapa mensual la capa es el día 1 del mes. */
  desde?: string
  /** Último día incluido, `AAAA-MM-DD` en UTC. */
  hasta?: string
  limit?: number
}

/**
 * El techo por defecto. Geocore acepta hasta 5000 (`DECISIONS #28`). Un rancho son 96 capas
 * por alta con el mapa mensual, y serán varios cientos con el mapa por pasada (M.9.7e).
 */
export const LIMITE_CAPAS = 2000

/**
 * La query string del listado. TerraStaff lista sin `X-Tenant-ID`, así que el tenant va en la
 * query: Geocore sólo la respeta para staff.
 */
export function queryCapas(tenantId: string, filtro: FiltroCapas = {}): string {
  const q = new URLSearchParams({ tenantId, limit: String(filtro.limit ?? LIMITE_CAPAS) })
  if (filtro.ranchoId) q.set('ranchoId', filtro.ranchoId)
  if (filtro.desde) q.set('desde', filtro.desde)
  if (filtro.hasta) q.set('hasta', filtro.hasta)
  return q.toString()
}
