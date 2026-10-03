import { describe, expect, it } from 'vitest'
import { nombreDeArchivo, parametrosCsv } from '@/lib/exportarCsv'

/** Exportar la serie a CSV: que se pida el alcance correcto y que el archivo tenga un nombre usable. */

const parcela = { tipo: 'parcela', id: 'p-1', nombre: 'Lote Norte' } as const
const rancho = { tipo: 'rancho', id: 'r-1', nombre: 'El Rombito' } as const
const hoy = new Date('2026-10-02T15:00:00Z')

describe('parametrosCsv', () => {
  it('desde una parcela pide esa parcela', () => {
    const q = new URLSearchParams(parametrosCsv(parcela, 'mensual', 'excel'))
    expect(q.get('parcelaId')).toBe('p-1')
    expect(q.has('ranchoId')).toBe(false)
  })

  it('desde un rancho pide el rancho, y no una parcela', () => {
    const q = new URLSearchParams(parametrosCsv(rancho, 'pasada', 'estandar'))
    expect(q.get('ranchoId')).toBe('r-1')
    expect(q.has('parcelaId')).toBe(false)
    expect(q.get('cadencia')).toBe('pasada')
    expect(q.get('formato')).toBe('estandar')
  })

  it('manda el mismo mínimo de cobertura que la serie, y por defecto todos los índices', () => {
    const q = new URLSearchParams(parametrosCsv(parcela, 'mensual', 'excel'))
    expect(q.get('coberturaMinima')).toBe('0.3')
    expect(q.has('indice')).toBe(false)
  })

  it('con un índice solo, lo pide', () => {
    const q = new URLSearchParams(parametrosCsv(parcela, 'mensual', 'excel', 'ndre'))
    expect(q.get('indice')).toBe('ndre')
  })
})

describe('nombreDeArchivo', () => {
  it('lleva el nombre, las métricas, la cadencia y el día', () => {
    expect(nombreDeArchivo(parcela, 'mensual', hoy)).toBe('serie_lote-norte_todos_mensual_2026-10-02.csv')
  })

  it('con un índice solo, el archivo lo dice', () => {
    expect(nombreDeArchivo(parcela, 'pasada', hoy, 'ndvi')).toBe('serie_lote-norte_ndvi_pasada_2026-10-02.csv')
  })

  it('saca acentos y lo que un sistema de archivos rechazaría', () => {
    expect(nombreDeArchivo({ ...rancho, nombre: 'Zapotlán / El "Grande"' }, 'pasada', hoy))
      .toBe('serie_zapotlan-el-grande_todos_pasada_2026-10-02.csv')
  })

  it('nunca queda vacío', () => {
    expect(nombreDeArchivo({ ...rancho, nombre: '***' }, 'mensual', hoy)).toBe('serie_rancho_todos_mensual_2026-10-02.csv')
  })
})
