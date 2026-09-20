import { useEffect, useState } from 'react'
import { describeError, getParcelas, getRanchos, getTenants, type Parcela, type Rancho, type Tenant } from '@/lib/api'

/**
 * Las listas que mira la pantalla de Ranchos: los tenants, los ranchos de un tenant y
 * las parcelas de un rancho.
 *
 * Los tres siguen el patrón de [`useProcesos`](useProcesos.ts): un `vivo` que se apaga al
 * limpiar el efecto, y un contador para `recargar()` después de crear o editar algo.
 *
 * **Lo que resuelve, y no es sólo orden: la respuesta que llega tarde.** Sin cancelar,
 * elegir el tenant A y enseguida el B deja una carrera: si la respuesta de A llega
 * después, la tabla termina mostrando los ranchos de A con B elegido. Es el tipo de
 * mezcla que en un panel multi-tenant no se puede permitir, y no se ve en el código de
 * la pantalla, que sólo dice `setRanchos(await getRanchos(tenantId))`.
 *
 * Por eso cada hook guarda **la clave junto con los datos** y sólo devuelve los que
 * corresponden a la clave de ahora. Mientras la nueva no llega devuelve `null` —
 * "cargando", no "vacío"—, así que la tabla nunca muestra una fila del tenant anterior.
 * Vaciar el estado en un efecto sería la otra forma, y es la que el lint del panel
 * prohíbe (`set-state-in-effect`, `DECISIONS #24` de Geocore).
 */

/** Los datos de una carga, con la clave con la que se pidieron. */
interface Cargado<T> {
  clave: string
  datos: T
}

/** Los tenants que ve este usuario. Se piden una vez: no dependen de nada de la pantalla. */
export function useTenants() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    let vivo = true
    getTenants(1, 200)
      .then(r => { if (vivo) setTenants(r.items) })
      .catch(err => {
        if (!vivo) return
        const msg = describeError(err)
        if (msg) setError(msg)
      })
    return () => { vivo = false }
  }, [])

  return { tenants, error }
}

/**
 * Los ranchos de un tenant. `tenantId` vacío = no pedir nada.
 *
 * `ranchos` es `null` mientras no haya una respuesta para **este** tenant.
 */
export function useRanchos(tenantId: string) {
  const [cargado, setCargado] = useState<Cargado<Rancho[]> | null>(null)
  const [error, setError] = useState('')
  const [vuelta, setVuelta] = useState(0)

  useEffect(() => {
    if (!tenantId) return
    let vivo = true

    getRanchos(tenantId)
      .then(lista => {
        if (!vivo) return
        setCargado({ clave: tenantId, datos: lista })
        setError('')
      })
      .catch(err => {
        if (!vivo) return
        const msg = describeError(err)
        if (msg) setError(msg)
      })

    return () => { vivo = false }
  }, [tenantId, vuelta])

  return {
    ranchos: cargado?.clave === tenantId ? cargado.datos : null,
    error,
    recargar: () => setVuelta(v => v + 1),
  }
}

/**
 * Las parcelas de un rancho. `ranchoId` vacío = no pedir nada.
 *
 * La clave lleva **los dos** ids: el tenant viaja como `X-Tenant-ID` y es parte del
 * pedido, así que una respuesta pedida con otro tenant no sirve aunque el rancho
 * coincida.
 */
export function useParcelas(ranchoId: string, tenantId: string) {
  const [cargado, setCargado] = useState<Cargado<Parcela[]> | null>(null)
  const [error, setError] = useState('')
  const [vuelta, setVuelta] = useState(0)
  const clave = `${tenantId}/${ranchoId}`

  useEffect(() => {
    if (!ranchoId || !tenantId) return
    let vivo = true

    getParcelas(ranchoId, tenantId)
      .then(lista => {
        if (!vivo) return
        setCargado({ clave, datos: lista })
        setError('')
      })
      .catch(err => {
        if (!vivo) return
        const msg = describeError(err)
        if (msg) setError(msg)
      })

    return () => { vivo = false }
  }, [clave, ranchoId, tenantId, vuelta])

  return {
    parcelas: cargado?.clave === clave ? cargado.datos : null,
    error,
    recargar: () => setVuelta(v => v + 1),
  }
}
