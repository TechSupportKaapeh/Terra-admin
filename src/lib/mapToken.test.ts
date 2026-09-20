import { describe, expect, it } from 'vitest'
import {
  hayQueRenovar,
  MARGEN_S,
  NINGUNO,
  sePuedeReusar,
  tokenPara,
  vencimiento,
} from '@/lib/mapToken'

/**
 * El token de mapa (M.8.1).
 *
 * Lo que se fija acá es sobre todo una regla de seguridad: **el token de un tenant no se
 * usa para los tiles de otro**. Desde M.8.1 el tileserver contesta 403 a un COG que no
 * cuelgue de `tenants/{tenant del token}/`, así que reusar el token del tenant anterior
 * no se ve como un error de permisos sino como "el mapa no carga".
 */

const A = '11111111-1111-1111-1111-111111111111'
const B = '22222222-2222-2222-2222-222222222222'

/** Un JWT de mentira: sólo la carga importa, la firma la valida el tileserver. */
function jwt(carga: Record<string, unknown>): string {
  const b64 = (o: unknown) => btoa(JSON.stringify(o))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${b64({ alg: 'HS256' })}.${b64(carga)}.firma-de-mentira`
}

describe('tokenPara', () => {
  const deA = { tenantId: A, token: 'tok-a', exp: 1 }

  it('devuelve el token cuando fue emitido para ese tenant', () => {
    expect(tokenPara(deA, A)).toBe('tok-a')
  })

  it('NO devuelve el token de otro tenant: sería un mapa entero en 403', () => {
    expect(tokenPara(deA, B)).toBe('')
  })

  it('sin tenant elegido no hay token que valga', () => {
    expect(tokenPara(deA, '')).toBe('')
    expect(tokenPara(NINGUNO, '')).toBe('')
  })

  it('el estado inicial no tiene token para nadie', () => {
    expect(tokenPara(NINGUNO, A)).toBe('')
  })
})

describe('vencimiento', () => {
  it('lee exp de la carga del JWT', () => {
    expect(vencimiento(jwt({ exp: 1789000000, type: 'map-access' }))).toBe(1789000000)
  })

  it('lee una carga con caracteres de base64url', () => {
    // `>` y `?` en el texto fuerzan `+` y `/` en base64, que el JWT manda como `-` y `_`.
    const token = jwt({ exp: 1789000000, nota: 'a>b?c>d?e>f?' })
    expect(token).toMatch(/[-_]/)
    expect(vencimiento(token)).toBe(1789000000)
  })

  it('un token sin exp no tiene cuenta regresiva, y no es un error', () => {
    expect(vencimiento(jwt({ type: 'map-access' }))).toBeNull()
  })

  it('un exp que no es número se descarta', () => {
    expect(vencimiento(jwt({ exp: '1789000000' }))).toBeNull()
  })

  it.each(['', 'esto-no-es-un-jwt', 'a.b', 'a..b'])('no revienta con %o', entrada => {
    expect(vencimiento(entrada)).toBeNull()
  })
})

describe('hayQueRenovar', () => {
  it('sin token, siempre', () => {
    expect(hayQueRenovar('', null)).toBe(true)
    expect(hayQueRenovar('', 3600)).toBe(true)
  })

  it('con margen de sobra, no', () => {
    expect(hayQueRenovar('tok', MARGEN_S + 1)).toBe(false)
  })

  it('en el margen justo, sí: se renueva antes de vencer, no al vencer', () => {
    expect(hayQueRenovar('tok', MARGEN_S)).toBe(true)
    expect(hayQueRenovar('tok', 0)).toBe(true)
    expect(hayQueRenovar('tok', -10)).toBe(true)
  })

  it('antes del primer tic del reloj no se renueva: null no es "vencido"', () => {
    // Si acá dijera true, un token recién llegado pediría otro en el acto y otro
    // después, una vez por render.
    expect(hayQueRenovar('tok', null)).toBe(false)
  })
})

describe('sePuedeReusar', () => {
  it('con margen de sobra, sí', () => {
    expect(sePuedeReusar('tok', MARGEN_S + 1)).toBe(true)
  })

  it('sin token o sin margen, no', () => {
    expect(sePuedeReusar('', 3600)).toBe(false)
    expect(sePuedeReusar('tok', MARGEN_S)).toBe(false)
  })

  it('antes del primer tic se pide uno nuevo: NO es la negación de hayQueRenovar', () => {
    // La asimetría es la decisión: `restante` null significa "no sé", y un token de más
    // no cuesta nada, pero empezar a pintar con uno por vencer deja el mapa en 401.
    expect(sePuedeReusar('tok', null)).toBe(false)
    expect(hayQueRenovar('tok', null)).toBe(false)
  })
})
