import { useEffect, useRef, useState } from 'react'
import { describeError, getMapToken } from '@/lib/api'

/**
 * El token de mapa: uno solo por pantalla, renovado antes de que venza.
 *
 * TiTiler lo recibe como `?token=` en cada tile (no en una cabecera: un `<img>` no manda
 * cabeceras), Geocore lo firma por una hora, y quien pinta un mapa lo necesita **antes**
 * de armar la URL de los tiles.
 *
 * Vive en `lib/` porque lo usan el catálogo del Diagnóstico y el mapa del rancho, y las
 * dos cosas que sabe tienen que valer igual en los dos:
 *
 * - **se renueva con 5 minutos de margen, no al vencer.** Un token que vence en medio de
 *   un paneo deja el mapa lleno de 401 sin ningún error visible;
 * - **la cuenta regresiva se lee del reloj fuera del render** (un intervalo de un
 *   segundo), porque React no permite leer la hora mientras dibuja.
 */

/** Del JWT sólo se lee `exp` para la cuenta regresiva. La firma la valida TiTiler. */
function vencimiento(token: string): number | null {
  try {
    const p = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return typeof p.exp === 'number' ? p.exp : null
  } catch {
    return null
  }
}

/** Con menos de esto, el token se cambia por uno nuevo antes de pedir tiles. */
const MARGEN_S = 300

/**
 * @param auto Pedir el token solo, y renovarlo cuando le queda poco. Lo usa quien pinta un
 * mapa apenas se abre; quien lo pide como parte de otra acción usa `asegurarToken`.
 */
export function useMapToken(auto = false) {
  const [token, setToken] = useState('')
  const [exp, setExp] = useState<number | null>(null)
  const [ahora, setAhora] = useState(0)
  const [error, setError] = useState('')
  const pidiendo = useRef(false)

  useEffect(() => {
    if (!exp) return
    const id = setInterval(() => setAhora(Date.now()), 1000)
    return () => clearInterval(id)
  }, [exp])

  /** Segundos que le quedan, o null antes del primer tic del intervalo. */
  const restante = exp && ahora ? Math.round(exp - ahora / 1000) : null

  useEffect(() => {
    if (!auto || pidiendo.current) return
    if (token && (restante === null || restante > MARGEN_S)) return

    // El efecto se vuelve a correr con cada tic del reloj, así que sin el cerrojo un
    // token por vencer dispararía un pedido por segundo hasta que llegara el primero.
    pidiendo.current = true
    let vivo = true
    getMapToken()
      .then(({ token: t }) => {
        if (!vivo) return
        setToken(t)
        setExp(vencimiento(t))
        setError('')
      })
      .catch(err => {
        const m = describeError(err)
        if (vivo && m) setError(m)
      })
      .finally(() => { pidiendo.current = false })

    return () => { vivo = false }
  }, [auto, token, restante])

  async function tokenNuevo(): Promise<string> {
    const { token: t } = await getMapToken()
    setToken(t)
    setExp(vencimiento(t))
    return t
  }

  /**
   * El token a usar ahora: el que hay si le queda margen, o uno nuevo.
   *
   * `restante` tiene a lo sumo un segundo de atraso; antes del primer tic es null y se
   * pide uno nuevo, que no cuesta nada.
   */
  async function asegurarToken(): Promise<string> {
    if (token && restante !== null && restante > MARGEN_S) return token
    return tokenNuevo()
  }

  return { token, restante, error, tokenNuevo, asegurarToken }
}
