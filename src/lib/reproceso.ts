import type { AlcanceReproceso, EstimacionReproceso, ResultadoReproceso } from '@/lib/api'

/**
 * Las cuentas de la confirmación del reproceso (M.9.7g). Puras, para probarlas sin navegador
 * (`DECISIONS #40` de Geocore): el diálogo sólo dibuja lo que esto devuelve.
 */

/** Megas a texto: "850 MB", "1,2 GB". Debajo de 1 MB, "menos de 1 MB" y no "0 MB". */
export function tamano(mb: number): string {
  if (mb <= 0) return '0 MB'
  if (mb < 1) return 'menos de 1 MB'
  if (mb < 1024) return `${Math.round(mb).toLocaleString('es-AR')} MB`
  return `${(mb / 1024).toLocaleString('es-AR', { maximumFractionDigits: 1 })} GB`
}

/**
 * Un rango de megas. Si los dos extremos se escriben igual, una sola cifra: "entre 1 MB y 1 MB"
 * no dice nada.
 */
export function rangoDeTamano(minimo: number, maximo: number): string {
  const [a, b] = [tamano(minimo), tamano(maximo)]
  return a === b ? a : `entre ${a} y ${b}`
}

/** El espacio total: los archivos del bucket más las filas de la base. */
export function espacioTotal(e: EstimacionReproceso): string {
  return rangoDeTamano(e.mbArchivosMinimo + e.mbBaseMinimo, e.mbArchivosMaximo + e.mbBaseMaximo)
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/** Qué se va a encolar, en una línea: "1 rancho y 3 parcelas (2.450 ha)". */
export function queSeEncola(e: EstimacionReproceso): string {
  const partes: string[] = []
  if (e.ranchos) partes.push(plural(e.ranchos, 'rancho', 'ranchos'))
  if (e.parcelas) partes.push(plural(e.parcelas, 'parcela', 'parcelas'))
  if (!partes.length) return 'nada'
  // Las hectáreas del rancho ya cubren las de sus parcelas: se muestran las del rancho si hay,
  // y si no las de las parcelas, para no sumar dos veces la misma tierra.
  const ha = e.ranchos ? e.hectareasRanchos : e.hectareasParcelas
  return `${partes.join(' y ')} (${Math.round(ha).toLocaleString('es-AR')} ha)`
}

/** El título del diálogo. */
export function tituloDe(a: AlcanceReproceso): string {
  const que = { parcela: 'la parcela', rancho: 'el rancho', tenant: 'el tenant' }[a.tipo]
  return `Reprocesar ${que} ${a.nombre}`
}

/** Qué incluye cada alcance, dicho antes de los números. */
export function alcanceDe(a: AlcanceReproceso): string {
  switch (a.tipo) {
    case 'parcela': return 'Sus números de todos los meses del histórico.'
    case 'rancho': return 'Sus mapas y los números de todas sus parcelas activas.'
    case 'tenant': return 'Todos sus ranchos y parcelas activos.'
  }
}

/** Si el botón de confirmar se puede apretar. */
export function sePuedeConfirmar(e: EstimacionReproceso | null): boolean {
  return e !== null && !e.excedido && e.ranchos + e.parcelas > 0
}

/** Lo que pasó, en una línea, para después de confirmar. */
export function resumenDe(r: ResultadoReproceso): string {
  const partes = [plural(r.encolados.length, 'encolada', 'encoladas')]
  if (r.salteados.length) partes.push(`${r.salteados.length} ya tenían un alta en curso`)
  if (r.conError.length) partes.push(`${r.conError.length} no se pudieron publicar (quedan en Procesos como fallidas)`)
  return `${partes.join(', ')}. Se sigue en la pestaña Procesos.`
}
