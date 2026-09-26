import { supabase } from './supabase'
import { querySerie } from './serie'

const GEOCORE_URL = import.meta.env.VITE_GEOCORE_URL as string

// [B-1] Sesión expirada / sin token. Cerrar sesión dispara onAuthStateChange en
// App.tsx → redirección al login, en vez de mandar "Authorization: Bearer undefined"
// y tragarse el 401 en silencio.
export class SessionExpiredError extends Error {
  constructor() {
    super('Tu sesión expiró. Inicia sesión de nuevo.')
    this.name = 'SessionExpiredError'
  }
}

async function endExpiredSession(): Promise<never> {
  await supabase.auth.signOut()
  throw new SessionExpiredError()
}

// [B-1] Mensaje legible para mostrar en la UI. Devuelve null para SessionExpiredError:
// en ese caso ya hay una redirección al login en curso, no tiene sentido mostrar un
// error en una página que está por desmontarse. Para el resto (500, 403, red, ngrok
// caído) devuelve el mensaje en vez de dejar la tabla vacía sin feedback.
export function describeError(err: unknown): string | null {
  if (err instanceof SessionExpiredError) return null
  return err instanceof Error ? err.message : 'Error desconocido'
}

async function getHeaders(tenantId?: string): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) await endExpiredSession()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }
  if (tenantId) headers['X-Tenant-ID'] = tenantId
  if (import.meta.env.DEV) headers['ngrok-skip-browser-warning'] = 'true'
  return headers
}

async function request<T>(path: string, options: RequestInit = {}, tenantId?: string): Promise<T> {
  const headers = await getHeaders(tenantId)
  const res = await fetch(`${GEOCORE_URL}${path}`, { ...options, headers })
  if (res.status === 401) await endExpiredSession()
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(err.message ?? res.statusText)
  }

  // Varias rutas de Geocore contestan **204 sin cuerpo**: activar y desactivar, y los PATCH de
  // nombre y geometría. `res.json()` sobre un cuerpo vacío tira "Unexpected end of JSON input",
  // así que la llamada fallaba en el panel **después** de que el backend la hubiera aplicado:
  // el peor de los errores, porque dice que no se guardó algo que sí se guardó.
  // Se leyó como texto para cubrir también un 200 con cuerpo vacío.
  if (res.status === 204) return undefined as T
  const texto = await res.text()
  return (texto ? JSON.parse(texto) : undefined) as T
}

// Users
export const getUsers = (page = 1, pageSize = 50) =>
  request<PagedResult<User>>(`/api/users?page=${page}&pageSize=${pageSize}`)

export const getUserTenants = (userId: string) =>
  request<Tenant[]>(`/api/users/${userId}/tenants`)

export const createUser = (data: CreateUserPayload) =>
  request<User>('/api/users', { method: 'POST', body: JSON.stringify(data) })

export const deactivateUser = (id: string) =>
  request<void>(`/api/users/${id}/deactivate`, { method: 'POST' })

export const activateUser = (id: string) =>
  request<void>(`/api/users/${id}/activate`, { method: 'POST' })

export const changeRole = (id: string, globalRole: string) =>
  request<void>(`/api/users/${id}/role`, { method: 'PATCH', body: JSON.stringify({ newRole: globalRole }) })

// Tenants
export const getTenants = (page = 1, pageSize = 50) =>
  request<PagedResult<Tenant>>(`/api/tenants?page=${page}&pageSize=${pageSize}`)

export const createTenant = (data: CreateTenantPayload) =>
  request<Tenant>('/api/tenants', { method: 'POST', body: JSON.stringify(data) })

export const suspendTenant = (id: string) =>
  request<void>(`/api/tenants/${id}/suspend`, { method: 'POST' })

export const deactivateTenant = (id: string) =>
  request<void>(`/api/tenants/${id}/deactivate`, { method: 'POST' })

export const addMember = (tenantId: string, userId: string, role: string) =>
  request<void>(`/api/tenants/${tenantId}/members`, { method: 'POST', body: JSON.stringify({ userId, role }) })

export const suspendMember = (tenantId: string, userId: string) =>
  request<void>(`/api/tenants/${tenantId}/members/${userId}/suspend`, { method: 'POST' })

export const leaveMember = (tenantId: string, userId: string) =>
  request<void>(`/api/tenants/${tenantId}/members/${userId}/leave`, { method: 'POST' })

export const getTenantMembers = (tenantId: string) =>
  request<Member[]>(`/api/tenants/${tenantId}/members`)

export const removeMember = (tenantId: string, userId: string) =>
  request<void>(`/api/tenants/${tenantId}/members/${userId}`, { method: 'DELETE' })

export const changeMemberRole = (tenantId: string, userId: string, newRole: string) =>
  request<void>(`/api/tenants/${tenantId}/members/${userId}/role`, { method: 'PATCH', body: JSON.stringify({ newRole }) })

// Ranchos
export const getRanchos = (tenantId: string) =>
  request<Rancho[]>('/api/ranchos', {}, tenantId)

export const createRancho = (data: CreateRanchoPayload, tenantId: string) =>
  request<Rancho>('/api/ranchos', { method: 'POST', body: JSON.stringify(data) }, tenantId)

// Editar: el nombre y la geometría van por separado, como los expone Geocore.
//
// El PATCH de geometría **borra lo que se calculó con el polígono viejo y encola el reproceso**
// (Geocore DECISIONS #34), y devuelve ese resumen. Antes era 204.
export const updateRanchoName = (id: string, name: string, tenantId: string) =>
  request<void>(`/api/ranchos/${id}/name`, { method: 'PATCH', body: JSON.stringify({ name }) }, tenantId)

// Puede fallar con 422 PARCELAS_FUERA_DEL_RANCHO: achicar un rancho no puede dejar afuera a
// sus parcelas activas. El mensaje nombra cuáles.
export const updateRanchoGeometry = (id: string, coordinates: Coordinate[], fuenteGeom: string, tenantId: string) =>
  request<DatosRehechos>(`/api/ranchos/${id}/geometry`, { method: 'PATCH', body: JSON.stringify({ coordinates, fuenteGeom }) }, tenantId)

export const deactivateRancho = (id: string, tenantId: string) =>
  request<void>(`/api/ranchos/${id}/deactivate`, { method: 'POST' }, tenantId)

export const activateRancho = (id: string, tenantId: string) =>
  request<void>(`/api/ranchos/${id}/activate`, { method: 'POST' }, tenantId)

// La métrica mensual del rancho (Geocore M.3.3, `DECISIONS #29`).
//
// No hay una medición de rancho guardada: Geocore la calcula al consultar, promediando las
// medianas de sus parcelas **ponderadas por área**. El promedio **divide por el área con
// dato, no por la total**, así que `valor` y `fraccionArea` se leen juntos: un NDVI de 0,62
// del 20 % del rancho no dice lo mismo que el mismo 0,62 del 95 %.
//
// Por defecto son los últimos 24 meses; el tope de Geocore es 60.
export const getMetricasRancho = (id: string, tenantId: string, indice: string) =>
  request<MetricasRancho>(`/api/ranchos/${id}/metricas?indice=${encodeURIComponent(indice)}`, {}, tenantId)

export interface MetricaMensual {
  /** `AAAA-MM`. */
  periodo: string
  /** El promedio ponderado, o null si ese mes no tuvo ninguna parcela con dato. */
  valor: number | null
  areaConDatoHa: number
  /** Del área total del rancho, qué fracción (0–1) tuvo dato ese mes. */
  fraccionArea: number
  parcelasConDato: number
}

export interface MetricasRancho {
  ranchoId: string
  indice: string
  desde: string
  hasta: string
  parcelas: number
  areaTotalHa: number
  data: MetricaMensual[]
}

// Parcelas
export const getParcelas = (ranchoId: string, tenantId: string) =>
  request<Parcela[]>(`/api/parcelas?ranchoId=${ranchoId}`, {}, tenantId)

export const createParcela = (data: CreateParcelaPayload, tenantId: string) =>
  request<Parcela>('/api/parcelas', { method: 'POST', body: JSON.stringify(data) }, tenantId)

export const updateParcelaName = (id: string, name: string, tenantId: string) =>
  request<void>(`/api/parcelas/${id}/name`, { method: 'PATCH', body: JSON.stringify({ name }) }, tenantId)

// Puede fallar con 422 PARCELA_FUERA_DEL_RANCHO: la parcela tiene que caer dentro de su rancho.
export const updateParcelaGeometry = (id: string, coordinates: Coordinate[], fuenteGeom: string, tenantId: string) =>
  request<DatosRehechos>(`/api/parcelas/${id}/geometry`, { method: 'PATCH', body: JSON.stringify({ coordinates, fuenteGeom }) }, tenantId)

export const deactivateParcela = (id: string, tenantId: string) =>
  request<void>(`/api/parcelas/${id}/deactivate`, { method: 'POST' }, tenantId)

export const activateParcela = (id: string, tenantId: string) =>
  request<void>(`/api/parcelas/${id}/activate`, { method: 'POST' }, tenantId)

// Edge Function
export const createUserFull = async (data: CreateUserFullPayload) => {
  const { data: session } = await supabase.auth.getSession()
  const token = session.session?.access_token
  if (!token) await endExpiredSession()
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
  const res = await fetch(`${supabaseUrl}/functions/v1/create-user`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  })
  if (res.status === 401) await endExpiredSession()
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(err.error?.message ?? err.message ?? res.statusText)
  }
  return res.json()
}

// Types
export interface PagedResult<T> { items: T[]; total: number; page: number; pageSize: number }
export interface Coordinate { lat: number; lng: number }

/**
 * Qué pasó con los datos calculados con la geometría vieja (Geocore DECISIONS #34).
 * `jobDeReproceso` null + `aviso` = se borraron pero nadie los va a recalcular solo.
 */
export interface DatosRehechos {
  medicionesBorradas: number
  capasBorradas: number
  jobDeReproceso: string | null
  aviso: string | null
}
export interface User { id: string; authId: string; email: string; name: string; lastName: string; globalRole: string; isActive: boolean; createdAt: string }
export interface Tenant { id: string; name: string; slug: string; status: string; timezone: string; defaultLanguage: string; maxUsers: number; memberCount: number; country?: string | null; address?: string | null; phoneNumber?: string | null; email?: string | null; createdAt: string; updatedAt?: string | null }
export interface Member { userId: string; name: string; lastName: string; email: string; role: string; status: string; createdAt: string; updatedAt?: string | null }
export interface Rancho { id: string; tenantId: string; cooperativaId?: string | null; name: string; coordinates: Coordinate[]; fuenteGeom: string; municipio?: string | null; estado?: string | null; region?: string | null; altitudM?: number | null; isActive: boolean; createdAt: string; updatedAt?: string | null }
export interface Parcela { id: string; ranchoId: string; tenantId: string; name: string; coordinates: Coordinate[]; centroideLat: number; centroideLng: number; areaHa: number; fuenteGeom: string; municipio?: string | null; estado?: string | null; region?: string | null; altitudM?: number | null; isActive: boolean; createdAt: string; updatedAt?: string | null }
export interface CreateUserFullPayload { email: string; password: string; name: string; lastName: string; globalRole: string }
export interface CreateUserPayload { authId: string; email: string; name: string; lastName: string; globalRole: string }
export interface CreateTenantPayload { name: string; timezone: string; defaultLanguage: string; maxUsers: number; adminUserId: string }
export interface GeoMeta { municipio?: string; estado?: string; region?: string; altitudM?: number }
export interface CreateRanchoPayload { name: string; fuenteGeom: string; coordinates: { lat: number; lng: number }[]; cooperativaId?: string; municipio?: string; estado?: string; region?: string; altitudM?: number }
export interface CreateParcelaPayload { ranchoId: string; name: string; fuenteGeom: string; coordinates: { lat: number; lng: number }[]; municipio?: string; estado?: string; region?: string; altitudM?: number }

// Diagnóstico — sólo TerraAdmin
//
// `/api/admin/diagnostico` lo protege la política TerraAdmin de Geocore. Los otros
// tres ya los tenía TerraStaff: el token de mapa y las capas.
export const getDiagnostico = () => request<Diagnostico>('/api/admin/diagnostico')

// El token de mapa es de UN tenant desde M.8.1 (Geocore `DECISIONS #42`): lleva `tenant_id`
// adentro y el tileserver rechaza con 403 cualquier COG que no cuelgue de `tenants/{ese}/`.
// Por eso `X-Tenant-ID` es obligatorio acá, como en el resto de la API: sin la cabecera,
// Geocore no sabe para qué tenant firmar y contesta 400.
export const getMapToken = (tenantId: string) =>
  request<{ token: string }>('/api/maps/token', {}, tenantId)

// TerraStaff lista sin X-Tenant-ID: el tenant va como filtro en la query.
// El techo de Geocore es 5000 (DECISIONS #28). 50 alcanzaba cuando un rancho tenía 24 capas
// de NDVI; desde que el mapa es de los cuatro índices (worker DECISIONS #58) son 96 por
// rancho y por alta, y con 50 el catálogo mostraría una parte sin decirlo.
export const getLayers = (tenantId: string, limit = 2000) =>
  request<LayerSummary[]>(`/api/layers?tenantId=${encodeURIComponent(tenantId)}&limit=${limit}`)

export const getLayer = (id: string) => request<LayerDetail>(`/api/layers/${encodeURIComponent(id)}`)

/**
 * Cada cuánto es un punto de la serie (Geocore `DECISIONS #48`, M.9.0c).
 *
 * `mensual` es el default **de la API**, y eso es lo que hizo que el panel siguiera
 * andando el día que `s2-pasada-v2` pasó a ser la receta vigente: pedía lo mismo y recibía
 * puntos mensuales. Quien agrega es la API, no el front (`DECISIONS #48`): acá se **elige**
 * la cadencia, no se calcula.
 */
export type Cadencia = 'mensual' | 'pasada'

// Mediciones — la serie de una parcela (Geocore DECISIONS #28 y #48).
//
// `valor` null es una observación **procesada sin dato**: la cobertura quedó bajo el mínimo
// de la receta que la escribió. No es lo mismo que un período ausente —que es uno que nadie
// procesó— y el gráfico los dibuja distinto.
//
// **El techo y la cadencia van juntos.** Con `cadencia=pasada` una parcela tiene unas 768
// filas cada dos años contando sus cuatro índices (`DECISIONS #70` del worker), así que
// 2000 alcanza de sobra para **una** parcela y un índice, que es lo que pide el panel. Si
// alguna vez pidiera varias parcelas en la misma llamada, el techo se toca y lo que lo dice
// es `truncado` de la respuesta — hay que mirarlo, no suponerlo.
//
// `coberturaMinima` **hay que mandarlo** desde `s2-pasada-v2`: sin el parámetro la API no
// filtra nada, y el worker ya no filtra al escribir, así que el umbral no se aplicaría en
// ningún lado. Las pasadas tapadas entraban a la mediana del mes y lo dejaban en 0 % de
// cobertura (`COBERTURA_MINIMA` en `serie.ts`, y `DECISIONS #51` de Geocore). M.9.0d decidió
// no mandarlo, y fue un error.
export const getMeasurements = (
  parcelaId: string, tenantId: string, indice?: string, cadencia?: Cadencia, coberturaMinima?: number,
) => request<MeasurementsResponse>(
  `/api/measurements?${querySerie(parcelaId, indice, cadencia, coberturaMinima)}`, {}, tenantId,
)

export interface Measurement {
  parcelaId: string
  indice: string
  /**
   * El primer instante de la ventana de observación, en UTC.
   *
   * Qué es depende de la cadencia, y **no es siempre el día 1 del mes**: con
   * `cadencia=mensual` sí —y también en las filas viejas de `s2-mensual-v1`—, pero con
   * `cadencia=pasada` es la **fecha de adquisición** de esa pasada del satélite
   * (`DECISIONS #70` del worker).
   *
   * Llega como `AAAA-MM-DD`: Geocore lo formatea así para las dos cadencias, así que la
   * hora de la adquisición **no viaja en el JSON** aunque la columna la tenga. Por eso dos
   * pasadas del mismo día llegan con la misma fecha, y por eso `serie.ts` no la usa de
   * clave. Está reportado; `instanteDe` ya lee las dos formas.
   */
  fecha: string
  valor: number | null
  cobertura: number | null
  observaciones: number | null
  /**
   * La receta que produjo la fila. Con `cadencia=mensual` puede traer **varias separadas
   * por coma** —`"s2-mensual-v1,s2-pasada-v2"` en un mes reprocesado—, y la API lo muestra
   * así a propósito: son filas de dos semánticas en el mismo punto (`DECISIONS #48`).
   */
  receta: string | null
  /** `{ mediana, media, min, max, p10, p90, desvio }`, como las dejó el worker. */
  estadisticas: Record<string, number | null> | null
  /**
   * Cuántas observaciones entraron en este punto. Con `pasada` es 1; con `mensual` dice si
   * el mes salió de seis pasadas o de una, que es lo que hace comparables dos meses.
   *
   * Opcional porque es de M.9.0c: una respuesta de antes no lo trae, y ahí 1 es la verdad.
   */
  agregadas?: number
}

/**
 * `truncado` avisa que el techo de `limit` recortó la respuesta (DECISIONS #28). Es la
 * comparación barata —hay exactamente `limit` filas—, así que puede dar un falso positivo.
 *
 * `cadencia` es la que la API **aplicó**, y no necesariamente la que se pidió: quien dibuja
 * mira ésta, porque es la que describe lo que está en `data`.
 */
export interface MeasurementsResponse { data: Measurement[]; limit: number; truncado: boolean; cadencia: Cadencia }

/** Una base, un servicio o el sondeo de uno. `cuerpo` es lo que el servicio dijo de sí mismo. */
export interface EstadoServicio { nombre: string; estado: string; http: number | null; ms: number; detalle: string; cuerpo: unknown }
export interface Diagnostico {
  generadoEn: string
  geocore: {
    entorno: string
    bases: EstadoServicio[]
    configuracion: { clave: string; estado: string; paraQue: string }[]
    corsOrigins: string[]
  }
  servicios: EstadoServicio[]
}
export interface LayerSummary { id: string; tenantId: string; parcelaId: string | null; ranchoId: string | null; product: string; storageKey: string; acquiredTs: string; source: string; createdAt: string }
/** `tiles[0]` es la plantilla de TiTiler SIN rescale, colormap_name ni token: los agrega el front. */
export interface LayerDetail { layerId: string; indice: string; fecha: string; tiles: string[]; bounds: number[]; minzoom: number; maxzoom: number }

// Procesos del worker — TerraStaff
//
// `/api/admin/procesos` lo protege la política TerraStaff de Geocore
// (AdminProcesosController). Lista los `processing_jobs` con su última línea de
// bitácora, y el detalle trae la bitácora entera (`processing_job_events`), que
// escribe el worker desde adentro de cada step.

/** Una línea de la bitácora. `level`: info · warning (falló, se reintenta) · error (no se recupera). */
export interface EventoProceso {
  id: number
  createdAt: string
  /** Desde 1. Con reintentos, la misma etapa aparece una vez por intento. */
  attempt: number
  /** Id del step de Inngest (`compute-time-series-7`), o `inicio` / `fin` / `reintento`. */
  stage: string
  level: string
  message: string
  /** Datos crudos de la etapa: `desde`, `hasta`, `imagenes`, `escritas`, `megas`, `ms`, `error`… */
  detail: Record<string, unknown> | null
}
export interface Proceso {
  id: string
  tenantId: string
  tenantNombre: string | null
  ranchoId: string | null
  ranchoNombre: string | null
  parcelaId: string | null
  parcelaNombre: string | null
  /** Contrato con Geocore: ver `TIPOS` en `lib/procesos.ts`. */
  requestType: string
  status: string
  progress: number
  errorMessage: string | null
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
  /** El intento más alto que dejó rastro; null si el worker todavía no escribió nada. */
  intentos: number | null
  ultimoEvento: EventoProceso | null
}
export interface DetalleProceso { job: Proceso; eventos: EventoProceso[] }
export interface FiltroProcesos { tenantId?: string; ranchoId?: string; parcelaId?: string; status?: string; limit?: number }

export const getProcesos = (filtro: FiltroProcesos = {}) => {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(filtro)) if (v !== undefined && v !== '') q.set(k, String(v))
  const s = q.toString()
  return request<Proceso[]>(`/api/admin/procesos${s ? `?${s}` : ''}`)
}

export const getProceso = (id: string) => request<DetalleProceso>(`/api/admin/procesos/${encodeURIComponent(id)}`)
