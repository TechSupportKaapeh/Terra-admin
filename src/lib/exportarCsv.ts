import type { Cadencia } from '@/lib/api'
import { COBERTURA_MINIMA } from '@/lib/serie'

/**
 * Exportar la serie a CSV: qué se pide y cómo se llama el archivo. Puro, con tests; el botón
 * (`components/series/ExportarCsv.tsx`) sólo dibuja y dispara la descarga.
 *
 * **El alcance sale de lo que se está mirando** (decisión del usuario, 2026-10-02): desde la
 * serie de una parcela, esa parcela; desde un rancho, todas sus parcelas.
 */

export interface AlcanceCsv {
  tipo: 'parcela' | 'rancho'
  id: string
  /** Para el nombre del archivo. */
  nombre: string
}

/** `excel`: `;` y coma decimal, abre con doble clic en Excel en español. `estandar`: `,` y punto. */
export type FormatoCsv = 'excel' | 'estandar'

export const OPCIONES_FORMATO = [
  { value: 'excel', label: 'Excel', detalle: '· abre con doble clic' },
  { value: 'estandar', label: 'Estándar', detalle: '· para Python, R o BI' },
] as const

/**
 * La query string del CSV. Pide **todos los índices** —una columna `indice`—, con la cadencia
 * elegida y el mismo mínimo de cobertura que la serie (`DECISIONS #51` de Geocore): lo que se
 * baja es lo que se ve, más los otros índices.
 */
export function parametrosCsv(alcance: AlcanceCsv, cadencia: Cadencia, formato: FormatoCsv): string {
  return new URLSearchParams({
    [alcance.tipo === 'parcela' ? 'parcelaId' : 'ranchoId']: alcance.id,
    cadencia,
    coberturaMinima: String(COBERTURA_MINIMA),
    formato,
  }).toString()
}

/**
 * `serie_lote-norte_mensual_2026-10-02.csv`. Sin acentos ni espacios ni nada que un sistema de
 * archivos pueda rechazar, y nunca vacío.
 */
export function nombreDeArchivo(alcance: AlcanceCsv, cadencia: Cadencia, hoy: Date): string {
  const limpio = alcance.nombre
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || alcance.tipo
  return `serie_${limpio}_${cadencia}_${hoy.toISOString().slice(0, 10)}.csv`
}
