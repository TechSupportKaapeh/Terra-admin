import type { Cadencia } from '@/lib/api'
import { INDICES } from '@/lib/indices'
import { COBERTURA_MINIMA } from '@/lib/serie'

/**
 * Exportar la serie a CSV: qué se pide y cómo se llama el archivo. Puro, con tests; el botón
 * (`components/series/ExportarCsv.tsx`) sólo dibuja y dispara la descarga.
 *
 * **El alcance sale de lo que se está mirando** (decisión del usuario, 2026-10-02): desde la
 * serie de una parcela, esa parcela; desde un rancho, todas sus parcelas.
 *
 * **Todas las métricas por defecto, y si es una sola, se dice** (regla del usuario, 2026-10-02):
 * sin índice el CSV trae los cuatro; con uno, el nombre del archivo lo lleva.
 */

export interface AlcanceCsv {
  tipo: 'parcela' | 'rancho'
  id: string
  /** Para el nombre del archivo. */
  nombre: string
}

/** `excel`: `;` y coma decimal, abre con doble clic en Excel en español. `estandar`: `,` y punto. */
export type FormatoCsv = 'excel' | 'estandar'

/** "Todos" es el default: `TODOS` no se manda, y sin `indice` la API trae los cuatro. */
export const TODOS = 'todos'

export const OPCIONES_INDICE_CSV = [
  { value: TODOS, label: 'Todos los índices' },
  ...INDICES.map(i => ({ value: i, label: `Sólo ${i.toUpperCase()}` })),
]

export const OPCIONES_FORMATO = [
  { value: 'excel', label: 'Excel', detalle: '· abre con doble clic' },
  { value: 'estandar', label: 'Estándar', detalle: '· para Python, R o BI' },
] as const

/**
 * La query string del CSV, con la cadencia elegida y el mismo mínimo de cobertura que la serie
 * (`DECISIONS #51` de Geocore). Con `indice` en `TODOS` no lo manda: trae los cuatro, en una
 * columna `indice`.
 */
export function parametrosCsv(
  alcance: AlcanceCsv, cadencia: Cadencia, formato: FormatoCsv, indice: string = TODOS,
): string {
  const q = new URLSearchParams({
    [alcance.tipo === 'parcela' ? 'parcelaId' : 'ranchoId']: alcance.id,
    cadencia,
    coberturaMinima: String(COBERTURA_MINIMA),
    formato,
  })
  if (indice !== TODOS) q.set('indice', indice)
  return q.toString()
}

/**
 * `serie_lote-norte_todos_mensual_2026-10-02.csv`, o `…_ndvi_…` con un índice solo: **el archivo
 * dice qué métrica trae**. Sin acentos ni espacios ni nada que un sistema de archivos pueda
 * rechazar, y nunca vacío.
 */
export function nombreDeArchivo(
  alcance: AlcanceCsv, cadencia: Cadencia, hoy: Date, indice: string = TODOS,
): string {
  const limpio = alcance.nombre
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || alcance.tipo
  return `serie_${limpio}_${indice}_${cadencia}_${hoy.toISOString().slice(0, 10)}.csv`
}
