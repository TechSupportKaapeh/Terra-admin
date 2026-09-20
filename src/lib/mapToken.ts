/**
 * Las tres decisiones sobre el token de mapa que no necesitan React ni red.
 *
 * Viven acá y no dentro de `useMapToken` para que tengan tests (`DECISIONS #40`: los
 * tests del panel son de `src/lib`, entorno node y sin jsdom) y porque las tres son
 * reglas, no estado: cuál es el token que vale, cuándo hay que renovarlo solo y cuándo
 * se puede reusar el que ya hay.
 *
 * La primera es de seguridad. Desde M.8.1 el token lleva `tenant_id` y el tileserver
 * rechaza con 403 cualquier COG que no cuelgue de `tenants/{ese tenant}/`, así que un
 * token del tenant anterior usado contra los tiles del nuevo no es un detalle de
 * refresco: es un mapa entero en 403.
 */

/** El token que Geocore firmó, y el tenant para el que lo firmó. Los dos juntos o ninguno. */
export interface Emitido {
  tenantId: string
  token: string
  /** `exp` del JWT, en segundos epoch. null si el token no lo trae o no se pudo leer. */
  exp: number | null
}

/** Todavía no se pidió ninguno. */
export const NINGUNO: Emitido = { tenantId: '', token: '', exp: null }

/** Con menos de esto, el token se cambia por uno nuevo antes de pedir tiles. */
export const MARGEN_S = 300

/**
 * Del JWT sólo se lee `exp`, para la cuenta regresiva. La firma la valida el tileserver:
 * acá no hay con qué, y creerle al token sería el error clásico.
 *
 * Devuelve null ante cualquier cosa que no sea un JWT con `exp` numérico, porque el
 * llamador lo trata igual que a "todavía no sé cuánto le queda".
 */
export function vencimiento(token: string): number | null {
  try {
    const carga = token.split('.')[1]
    if (!carga) return null
    // base64url → base64: sin estos dos reemplazos, un token con `-` o `_` en la carga
    // (uno de cada pocos) no se decodifica y la cuenta regresiva queda muda.
    const p: unknown = JSON.parse(atob(carga.replace(/-/g, '+').replace(/_/g, '/')))
    const exp = (p as { exp?: unknown }).exp
    return typeof exp === 'number' ? exp : null
  } catch {
    return null
  }
}

/**
 * El token que vale para `tenantId`: el emitido, si fue para ese tenant, o vacío.
 *
 * Se deriva en vez de limpiarse en un efecto, para que **no exista el render** en el que
 * el token del tenant anterior sigue disponible después de cambiar de tenant. Es la misma
 * familia de descuido que el rancho elegido que sobrevivía al cambio de tenant (M.7.2).
 */
export function tokenPara(emitido: Emitido, tenantId: string): string {
  if (!tenantId) return ''
  return emitido.tenantId === tenantId ? emitido.token : ''
}

/**
 * Si hay que pedir uno nuevo por las suyas (el modo `auto`, el de quien pinta un mapa).
 *
 * `restante` null significa "el reloj todavía no hizo tic", no "vencido": con un token
 * recién llegado se espera al primer tic en vez de pedir otro en el acto.
 */
export function hayQueRenovar(token: string, restante: number | null): boolean {
  if (!token) return true
  return restante !== null && restante <= MARGEN_S
}

/**
 * Si el token que hay se puede usar para la acción que se está por hacer.
 *
 * **No es la negación de `hayQueRenovar`, y la diferencia es a propósito:** acá, con
 * `restante` null, se pide uno nuevo. La cuenta regresiva tiene hasta un segundo de
 * atraso y antes del primer tic no se sabe nada; pedir un token de más no cuesta nada, y
 * empezar a pintar con uno que vence en dos segundos deja el mapa lleno de 401.
 */
export function sePuedeReusar(token: string, restante: number | null): boolean {
  return Boolean(token) && restante !== null && restante > MARGEN_S
}
