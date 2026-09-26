import { useEffect, useState } from 'react'
import {
  describeError, getLayer, getLayers, getMeasurements, getMetricasRancho, getParcelas, getRanchos, getTenants,
  type Cadencia, type LayerDetail, type LayerSummary, type MeasurementsResponse, type MetricasRancho,
  type Parcela, type Rancho, type Tenant,
} from '@/lib/api'

/**
 * Las listas que mira la pantalla de Ranchos: los tenants, los ranchos de un tenant, las
 * parcelas de un rancho y la serie de una parcela, con la cadencia elegida.
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

/**
 * La serie devuelve **la respuesta entera** y no sólo `data`: `truncado` dice que el techo
 * de `limit` recortó la serie y `cadencia` dice con qué agrupamiento salió. Quedarse con
 * las filas solas tira las dos cosas, y las dos se leen en pantalla.
 */
const PEDIR_SERIE = (clave: string) => {
  const [tenantId, parcelaId, indice, cadencia] = clave.split('/')
  return getMeasurements(parcelaId, tenantId, indice, cadencia as Cadencia)
}

/**
 * Las capas del rancho, no las de sus parcelas.
 *
 * **El filtro por rancho es de acá porque `GET /api/layers` no lo tiene**: filtra por
 * tenant o por parcela, y nada más. Con el techo de 2000 capas alcanza para el tenant
 * entero —un rancho son 96 por alta, cuatro índices por 24 meses—, así que traerlas y
 * filtrarlas cuesta un pedido. Si algún tenant pasa ese techo, el filtro tiene que
 * mudarse al servidor.
 *
 * `parcelaId === null` no es de más: la capa de una parcela también lleva el `ranchoId`
 * de su rancho, y sin eso el mapa del rancho mezclaría los rásters de sus parcelas.
 */
const PEDIR_CAPAS_RANCHO = (clave: string) => {
  const [tenantId, ranchoId] = clave.split('/')
  return getLayers(tenantId).then(capas => capas.filter(c => c.ranchoId === ranchoId && c.parcelaId === null))
}

const PEDIR_CAPA = (layerId: string) => getLayer(layerId)

const PEDIR_METRICAS = (clave: string) => {
  const [tenantId, ranchoId, indice] = clave.split('/')
  return getMetricasRancho(ranchoId, tenantId, indice)
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
 * La serie de **un índice** de una parcela, con la cadencia elegida (M.9.0d).
 *
 * El índice y la cadencia van en la clave: cambiar cualquiera de los dos es otro pedido, y
 * la respuesta del anterior que llegue tarde no puede pintarse como si fuera la nueva. Con
 * la cadencia eso no es una precaución de manual — `mensual` y `pasada` devuelven **la
 * misma parcela con otra cantidad de puntos**, así que la respuesta vieja se dibujaría sin
 * un solo síntoma de estar equivocada.
 */
export function useSerie(parcelaId: string, tenantId: string, indice: string, cadencia: Cadencia) {
  const clave = parcelaId && tenantId && indice ? `${tenantId}/${parcelaId}/${indice}/${cadencia}` : null
  const { datos, error, recargar } = useCargado<MeasurementsResponse>(clave, PEDIR_SERIE)
  return { serie: datos, error, recargar }
}

/** Las capas mensuales de un rancho, de todos sus índices y meses. */
export function useCapasDeRancho(ranchoId: string, tenantId: string) {
  const clave = ranchoId && tenantId ? `${tenantId}/${ranchoId}` : null
  const { datos, error, recargar } = useCargado<LayerSummary[]>(clave, PEDIR_CAPAS_RANCHO)
  return { capas: datos, error, recargar }
}

/**
 * El detalle de una capa: la plantilla de tiles, el encuadre y el zoom nativo.
 *
 * Es el segundo pedido de la cadena del mapa: el listado dice qué capas hay, y esto,
 * cómo pintar una. Cambiar de mes es cambiar de capa, así que la clave es su id.
 */
export function useCapa(layerId: string) {
  const { datos, error, recargar } = useCargado<LayerDetail>(layerId || null, PEDIR_CAPA)
  return { capa: datos, error, recargar }
}

/**
 * La métrica mensual del rancho para un índice: el promedio ponderado por área de sus
 * parcelas, mes a mes, con la fracción del área que tuvo dato.
 */
export function useMetricasRancho(ranchoId: string, tenantId: string, indice: string) {
  const clave = ranchoId && tenantId && indice ? `${tenantId}/${ranchoId}/${indice}` : null
  const { datos, error, recargar } = useCargado<MetricasRancho>(clave, PEDIR_METRICAS)
  return { metricas: datos, error, recargar }
}
