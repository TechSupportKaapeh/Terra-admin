import { useEffect, useState } from 'react'
import { describeError, getProcesos, type FiltroProcesos, type Proceso } from '@/lib/api'
import { esActivo } from '@/lib/procesos'

/** Cada cuánto se vuelve a pedir la lista mientras haya algo en cola o procesando. */
const REFRESCO_MS = 5000

/**
 * La lista de procesos de un filtro, que se refresca sola mientras haya alguno en
 * curso y se detiene cuando todos terminaron. `null` como filtro = no cargar nada.
 *
 * El efecto depende de la *clave* (el filtro serializado) y no del objeto: quien
 * llama arma un objeto nuevo en cada render, y depender de él recargaría en bucle.
 *
 * `ahora` es la hora de la última respuesta. Los "hace 3 min" se calculan contra
 * ella en vez de leer el reloj durante el render, que React no permite.
 */
export function useProcesos(filtro: FiltroProcesos | null) {
  const [procesos, setProcesos] = useState<Proceso[] | null>(null)
  const [error, setError] = useState('')
  const [ahora, setAhora] = useState(0)
  const [vuelta, setVuelta] = useState(0)
  const clave = filtro ? JSON.stringify(filtro) : null

  useEffect(() => {
    if (clave === null) return
    const f = JSON.parse(clave) as FiltroProcesos
    let vivo = true
    let timer: ReturnType<typeof setTimeout> | undefined

    const cargar = async () => {
      try {
        const lista = await getProcesos(f)
        if (!vivo) return
        setProcesos(lista)
        setError('')
        setAhora(Date.now())
        if (lista.some(p => esActivo(p.status))) timer = setTimeout(cargar, REFRESCO_MS)
      } catch (err) {
        if (!vivo) return
        const msg = describeError(err)
        if (msg) setError(msg)
      }
    }

    cargar()
    return () => { vivo = false; clearTimeout(timer) }
  }, [clave, vuelta])

  return { procesos, error, ahora, recargar: () => setVuelta(v => v + 1) }
}
