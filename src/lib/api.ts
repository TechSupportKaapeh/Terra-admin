import { supabase } from './supabase'

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

export const getMapToken = () => request<{ token: string }>('/api/maps/token')

// TerraStaff lista sin X-Tenant-ID: el tenant va como filtro en la query.
export const getLayers = (tenantId: string) =>
  request<LayerSummary[]>(`/api/layers?tenantId=${encodeURIComponent(tenantId)}&limit=50`)

export const getLayer = (id: string) => request<LayerDetail>(`/api/layers/${encodeURIComponent(id)}`)

// Mediciones mensuales — la serie de una parcela (Geocore DECISIONS #28).
//
// `valor` null es un mes **procesado sin dato**: la cobertura quedó bajo el mínimo de la
// receta. No es lo mismo que un mes ausente, que es un mes que nadie procesó, y el gráfico
// los dibuja distinto.
export const getMeasurements = (parcelaId: string, tenantId: string, indice?: string) => {
  const q = new URLSearchParams({ parcelaId, limit: '2000' })
  if (indice) q.set('indice', indice)
  return request<MeasurementsResponse>(`/api/measurements?${q}`, {}, tenantId)
}

export interface Measurement {
  parcelaId: string
  indice: string
  /** Primer día del mes, 00:00 UTC. */
  fecha: string
  valor: number | null
  cobertura: number | null
  observaciones: number | null
  receta: string | null
  /** `{ mediana, media, min, max, p10, p90, desvio }`, como las dejó el worker. */
  estadisticas: Record<string, number | null> | null
}

/** `truncado` avisa que el techo de `limit` recortó la respuesta (DECISIONS #28). */
export interface MeasurementsResponse { data: Measurement[]; limit: number; truncado: boolean }

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
