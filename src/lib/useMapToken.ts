import { useEffect, useRef, useState } from 'react'
import { describeError, getMapToken } from '@/lib/api'
import {
  hayQueRenovar,
  NINGUNO,
  sePuedeReusar,
  tokenPara,
  vencimiento,
  type Emitido,
} from '@/lib/mapToken'

/**
 * El token de mapa de un tenant: uno solo por pantalla, renovado antes de que venza.
 *
 * TiTiler lo recibe como `?token=` en cada tile (no en una cabecera: un `<img>` no manda
 * cabeceras), Geocore lo firma por una hora, y quien pinta un mapa lo necesita **antes**
 * de armar la URL de los tiles.
 *
 * **Desde M.8.1 el token es de un tenant y sólo de ese tenant** (Geocore `DECISIONS #42`):
 * lleva `tenant_id` adentro y el tileserver rechaza con 403 cualquier COG que no cuelgue
 * de `tenants/{ese tenant}/`. De ahí lo que cambia acá: `tenantId` es obligatorio y viaja
 * como `X-Tenant-ID` al pedirlo, y al cambiar de tenant el token anterior deja de contar.
 *
 * Este archivo es sólo el estado y los efectos; las reglas —cuál token vale, cuándo se
 * renueva y cuándo se reusa— están en [`mapToken.ts`](./mapToken.ts), que sí tiene tests.
 *
 * Vive en `lib/` porque lo usan el catálogo del Diagnóstico y el mapa del rancho, y lo
 * que sabe tiene que valer igual en los dos: se renueva con margen —un token que vence en
 * medio de un paneo deja el mapa lleno de 401 sin ningún error visible—, la cuenta
 * regresiva se lee del reloj fuera del render, porque React no permite leer la hora
 * mientras dibuja, y sin tenant elegido no se pide nada.
 */

/**
 * @param tenantId El tenant cuyos COG se van a pedir. Vacío = todavía no se eligió uno.
 * @param auto Pedir el token solo, y renovarlo cuando le queda poco. Lo usa quien pinta un
 * mapa apenas se abre; quien lo pide como parte de otra acción usa `asegurarToken`.
 */
export function useMapToken(tenantId: string, auto = false) {
  const [emitido, setEmitido] = useState<Emitido>(NINGUNO)
  const [ahora, setAhora] = useState(0)
  const [error, setError] = useState('')
  const pidiendo = useRef(false)

  const token = tokenPara(emitido, tenantId)
  const exp = token ? emitido.exp : null

  useEffect(() => {
    if (!exp) return
    const id = setInterval(() => setAhora(Date.now()), 1000)
    return () => clearInterval(id)
  }, [exp])

  /** Segundos que le quedan, o null antes del primer tic del intervalo. */
  const restante = exp && ahora ? Math.round(exp - ahora / 1000) : null

  useEffect(() => {
    if (!auto || !tenantId || pidiendo.current) return
    if (!hayQueRenovar(token, restante)) return

    // El efecto se vuelve a correr con cada tic del reloj, así que sin el cerrojo un
    // token por vencer dispararía un pedido por segundo hasta que llegara el primero.
    pidiendo.current = true
    let vivo = true
    const pedidoPara = tenantId
    getMapToken(pedidoPara)
      .then(({ token: t }) => {
        if (!vivo) return
        // Se guarda con el tenant para el que se pidió, no con el elegido ahora: si el
        // usuario cambió de tenant mientras el pedido viajaba, lo que llega es el token
        // del anterior, `tokenPara` lo descarta solo y este efecto vuelve a correr.
        setEmitido({ tenantId: pedidoPara, token: t, exp: vencimiento(t) })
        setError('')
      })
      .catch(err => {
        const m = describeError(err)
        if (vivo && m) setError(m)
      })
      .finally(() => { pidiendo.current = false })

    return () => { vivo = false }
  }, [auto, tenantId, token, restante])

  async function tokenNuevo(): Promise<string> {
    if (!tenantId) throw new Error('Elegí un tenant antes de pedir el token de mapa.')
    const { token: t } = await getMapToken(tenantId)
    setEmitido({ tenantId, token: t, exp: vencimiento(t) })
    return t
  }

  /** El token a usar ahora: el que hay si le queda margen, o uno nuevo. */
  async function asegurarToken(): Promise<string> {
    return sePuedeReusar(token, restante) ? token : tokenNuevo()
  }

  return { token, restante, error, tokenNuevo, asegurarToken }
}
