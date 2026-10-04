import type { Opcion } from '@/components/Selector'
import type {
  EstimacionDeImportacion, ObservacionDelPlan, PlanDeImportacion, PoligonoPrevisto, RolPropuesto,
  VistaPreviaImportacion,
} from '@/lib/api'

/**
 * Corregir y confirmar la importación (K.6, Geocore `DECISIONS #70`). Lo puro: cómo las
 * correcciones del operador se aplican sobre la vista previa, qué plan sale de eso, y cuándo se
 * puede crear.
 *
 * **La vista previa no se toca.** Las correcciones viven aparte, por índice, y se aplican encima:
 * el árbol y el mapa de K.5 dibujan la vista corregida, y el plan se arma de esa misma vista. Así
 * lo que se manda es lo que se ve, y «volver a lo propuesto» es vaciar las correcciones.
 */

/** Lo que el operador puede cambiar de un polígono. La geometría no: sale siempre del archivo. */
export type Correccion = Partial<Pick<PoligonoPrevisto, 'rol' | 'rancho' | 'nombre' | 'activo'>>

export type Correcciones = Readonly<Record<number, Correccion>>

const esRancho = (rol: RolPropuesto) => rol === 'Rancho' || rol === 'RanchoConParcela'

/** La vista con las correcciones encima, y el resumen recontado como lo cuenta Geocore. */
export function aplicarCorrecciones(vista: VistaPreviaImportacion, correcciones: Correcciones): VistaPreviaImportacion {
  const poligonos = vista.poligonos.map(p => {
    const c = correcciones[p.indice]
    return c ? { ...p, ...c } : p
  })
  const activos = poligonos.filter(p => p.activo)
  return {
    ...vista,
    poligonos,
    resumen: {
      ranchos: activos.filter(p => esRancho(p.rol)).length,
      parcelas: activos.filter(p => p.rol === 'Parcela' || p.rol === 'RanchoConParcela').length,
      desactivados: poligonos.length - activos.length,
      conAvisos: vista.resumen.conAvisos,
    },
  }
}

/**
 * Suma un cambio a las correcciones de un polígono, contra lo que propuso Geocore.
 *
 * Un campo que vuelve a su valor propuesto deja de ser una corrección: así «editado» quiere decir
 * que algo es distinto de lo propuesto, no que alguien tocó el campo. Y un rancho no va adentro de
 * otro: pasar a rancho borra el rancho de la parcela, como lo exige Geocore.
 */
export function corregir(
  vista: VistaPreviaImportacion, correcciones: Correcciones, indice: number, cambio: Correccion,
): Correcciones {
  const original = vista.poligonos[indice]
  if (!original) return correcciones

  const junto: Correccion = { ...correcciones[indice], ...cambio }
  if (junto.rol !== undefined && esRancho(junto.rol)) junto.rancho = null
  // Volver a parcela sin elegir rancho: vuelve al que propuso Geocore, no a ninguno.
  else if (cambio.rol === 'Parcela' && cambio.rancho === undefined) delete junto.rancho

  const propio: Correccion = {}
  for (const k of ['rol', 'rancho', 'nombre', 'activo'] as const) {
    if (junto[k] !== undefined && junto[k] !== original[k]) (propio as Record<string, unknown>)[k] = junto[k]
  }

  const resto = { ...correcciones }
  delete resto[indice]
  return Object.keys(propio).length > 0 ? { ...resto, [indice]: propio } : resto
}

/** El plan que se manda: **todos** los polígonos, también los desactivados (Geocore lo exige). */
export function planDe(corregida: VistaPreviaImportacion): PlanDeImportacion {
  return {
    poligonos: corregida.poligonos.map(p => ({
      indice: p.indice,
      rol: p.rol,
      // Un rancho no lleva rancho, aunque la propuesta original lo tuviera.
      rancho: p.rol === 'Parcela' ? p.rancho : null,
      nombre: p.nombre.trim(),
      activo: p.activo,
    })),
  }
}

/**
 * La huella del plan, para saber si lo revisado es lo que está en pantalla. «Crear» manda el plan
 * de la pantalla: si cambió algo después de «Revisar», la estimación ya no habla de él.
 */
export const huellaDe = (plan: PlanDeImportacion) => JSON.stringify(plan.poligonos)

/** Los roles que el operador puede elegir. «No se puede importar» no se elige: se desactiva. */
export const ROLES_ELEGIBLES: readonly Opcion[] = [
  { value: 'Rancho', label: 'Rancho' },
  { value: 'Parcela', label: 'Parcela' },
  { value: 'RanchoConParcela', label: 'Rancho + parcela (caso 4)' },
]

/**
 * A qué rancho puede ir una parcela: los ranchos activos del archivo, menos ella misma. Un
 * «rancho + parcela» no: ya tiene su parcela, y Geocore lo rechaza.
 */
export function ranchosPosibles(corregida: VistaPreviaImportacion, indice: number): Opcion[] {
  return corregida.poligonos
    .filter(p => p.activo && p.rol === 'Rancho' && p.indice !== indice)
    .map(p => ({ value: String(p.indice), label: p.nombre }))
}

/** Los errores o avisos de un polígono, y los del plan entero aparte. */
export function porIndice(observaciones: readonly ObservacionDelPlan[]): {
  delPoligono: Map<number, ObservacionDelPlan[]>
  generales: ObservacionDelPlan[]
} {
  const delPoligono = new Map<number, ObservacionDelPlan[]>()
  const generales: ObservacionDelPlan[] = []
  for (const o of observaciones) {
    if (o.indice === null) { generales.push(o); continue }
    const lista = delPoligono.get(o.indice)
    if (lista) lista.push(o)
    else delPoligono.set(o.indice, [o])
  }
  return { delPoligono, generales }
}

/** Lo último que se revisó: la estimación y de qué plan es. */
export interface Revision {
  huella: string
  estimacion: EstimacionDeImportacion
}

/**
 * Si «Crear» se puede apretar, o por qué no. Sólo con una revisión **del plan que está en
 * pantalla** y sin errores: no se crea nada que no se haya visto estimado.
 */
export function porQueNoSePuedeCrear(revision: Revision | null, huellaActual: string): string | null {
  if (!revision) return 'Revisá el plan antes de crear: así ves lo que costaría y si hay errores.'
  if (revision.huella !== huellaActual) return 'Cambiaste algo después de revisar: revisá de nuevo.'
  if (!revision.estimacion.valido) {
    const n = revision.estimacion.errores.length
    return `Hay ${n} ${n === 1 ? 'error' : 'errores'}: corregilos o desactivá esos polígonos, y revisá de nuevo.`
  }
  if (revision.estimacion.altas === 0) return 'No hay nada activo para crear.'
  return null
}

const numero = (n: number, decimales = 0) => n.toLocaleString('es-AR', { maximumFractionDigits: decimales })

const plural = (k: number, uno: string, varios: string) => `${numero(k)} ${k === 1 ? uno : varios}`

/** Las altas y lo que cuestan, en una frase. El caso 4 cuenta dos: un rancho y una parcela. */
export function altasEnPalabras(e: EstimacionDeImportacion): string {
  return `${plural(e.altas, 'alta', 'altas')} (${plural(e.ranchos, 'rancho', 'ranchos')} y ` +
    `${plural(e.parcelas, 'parcela', 'parcelas')}), unas ${numero(e.ejecucionesAproximadas)} ejecuciones de Inngest.`
}

/** Lo que va a ocupar, como el reproceso (Geocore `#64`): un rango, porque depende de las nubes. */
export function ocupacionEnPalabras(e: EstimacionDeImportacion): string {
  const mb = (min: number, max: number) =>
    max >= 1024 ? `${numero(min / 1024, 1)} a ${numero(max / 1024, 1)} GB` : `${numero(min, 1)} a ${numero(max, 1)} MB`
  return `Los mapas de los ranchos, ${mb(e.mbArchivosMinimo, e.mbArchivosMaximo)}; las filas de las parcelas, ` +
    `${mb(e.mbBaseMinimo, e.mbBaseMaximo)}. Son ${e.meses} meses de historia.`
}

/** Un polígono vuelto a lo propuesto: se saca de las correcciones. */
export function sinCorreccion(correcciones: Correcciones, indice: number): Correcciones {
  const resto = { ...correcciones }
  delete resto[indice]
  return resto
}
