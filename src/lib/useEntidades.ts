import { useEffect, useState } from 'react'
import {
  describeError, getMeasurements, getParcelas, getRanchos, getTenants,
  type Measurement, type Parcela, type Rancho, type Tenant,
} from '@/lib/api'

/**
 * Las listas que mira la pantalla de Ranchos: los tenants, los ranchos de un tenant, las
 * parcelas de un rancho y la serie mensual de una parcela.
 *
 * Todas siguen el patrón de [`useProcesos`](useProcesos.ts): un `vivo` que se apaga al
 * limpiar el efecto, y un contador para `recargar()` después de crear o editar algo.
 *
 * **Lo que resuelve, y no es sólo orden: la respuesta que llega tarde.** Sin cancelar,
 * elegir el tenant A y enseguida el B deja una carrera: si la respuesta de A llega
 * después, la tabla termina mostrando los ranchos de A con B elegido. Es el tipo de
 * mezcla que en un panel multi-tenant no se puede permitir, y no se ve en el código de
 * la pantalla, que sólo dice `setRanchos(await getRanchos(tenantId))`.
 *
 * Por eso `useCargado` guarda **la clave junto con los datos** y sólo devuelve los que
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

/**
 * Una lista que se pide por una clave y se cancela al cambiarla. `clave` null = no pedir.
 *
 * `pedir` sale de la clave y **se define fuera del componente**, para que su identidad no
 * cambie en cada render: así el efecto depende de la clave, que es lo que de verdad decide
 * qué se pide, sin quedar con una dependencia que el lint marca. Es lo mismo que hace
 * `useProcesos` serializando su filtro.
 */
function useCargado<T>(clave: string | null, pedir: (clave: string) => Promise<T>) {
  const [cargado, setCargado] = useState<Cargado<T> | null>(null)
  const [error, setError] = useState('')
  const [vuelta, setVuelta] = useState(0)

  useEffect(() => {
    if (clave === null) return
    let vivo = true

    pedir(clave)
      .then(datos => {
        if (!vivo) return
        setCargado({ clave, datos })
        setError('')
      })
      .catch(err => {
        if (!vivo) return
        const msg = describeError(err)
        if (msg) setError(msg)
      })

    return () => { vivo = false }
  }, [clave, pedir, vuelta])

  return {
    datos: cargado?.clave === clave ? cargado.datos : null,
    error,
    recargar: () => setVuelta(v => v + 1),
  }
}

/**
 * Las claves compuestas se arman con `/` y se parten acá.
 *
 * Es seguro: un id es un UUID y un índice es una palabra; ninguno lleva una barra. Si
 * alguna vez la lleva, la clave sigue distinguiendo bien una carga de otra —que es para
 * lo que existe— pero este `split` deja de partir donde corresponde.
 */
const PEDIR_RANCHOS = (tenantId: string) => getRanchos(tenantId)

const PEDIR_PARCELAS = (clave: string) => {
  const [tenantId, ranchoId] = clave.split('/')
  return getParcelas(ranchoId, tenantId)
}

const PEDIR_SERIE = (clave: string) => {
  const [tenantId, parcelaId, indice] = clave.split('/')
  return getMeasurements(parcelaId, tenantId, indice).then(r => r.data)
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

/** Los ranchos de un tenant. `tenantId` vacío = no pedir nada; `null` = todavía no llegaron. */
export function useRanchos(tenantId: string) {
  const { datos, error, recargar } = useCargado<Rancho[]>(tenantId || null, PEDIR_RANCHOS)
  return { ranchos: datos, error, recargar }
}

/**
 * Las parcelas de un rancho. La clave lleva **los dos** ids: el tenant viaja como
 * `X-Tenant-ID` y es parte del pedido, así que una respuesta pedida con otro tenant no
 * sirve aunque el rancho coincida.
 */
export function useParcelas(ranchoId: string, tenantId: string) {
  const clave = ranchoId && tenantId ? `${tenantId}/${ranchoId}` : null
  const { datos, error, recargar } = useCargado<Parcela[]>(clave, PEDIR_PARCELAS)
  return { parcelas: datos, error, recargar }
}

/**
 * La serie mensual de **un índice** de una parcela, de más vieja a más nueva según la
 * arme quien la dibuje.
 *
 * El índice va en la clave: cambiarlo es otro pedido, y la respuesta del índice anterior
 * que llegue tarde no puede pintarse como si fuera la nueva.
 */
export function useSerieMensual(parcelaId: string, tenantId: string, indice: string) {
  const clave = parcelaId && tenantId && indice ? `${tenantId}/${parcelaId}/${indice}` : null
  const { datos, error, recargar } = useCargado<Measurement[]>(clave, PEDIR_SERIE)
  return { filas: datos, error, recargar }
}
