import { describe, expect, it } from 'vitest'
import type { EstimacionReproceso } from '@/lib/api'
import {
  alcanceDe,
  espacioTotal,
  queSeEncola,
  rangoDeTamano,
  resumenDe,
  sePuedeConfirmar,
  tamano,
  tituloDe,
} from '@/lib/reproceso'

/**
 * La confirmación del reproceso (M.9.7g). Lo que importa fijar es que el número que se lee
 * antes de apretar sea el correcto: un "0 MB" para algo que pesa medio mega, o un GB escrito
 * como MB, hacen confirmar a ciegas.
 */

const base: EstimacionReproceso = {
  total: 3, excedido: false, maximo: 200, parcelas: 2, ranchos: 1, salteadas: 0,
  hectareasParcelas: 50, hectareasRanchos: 226, meses: 24,
  mbArchivosMinimo: 27.1, mbArchivosMaximo: 135.6, mbBaseMinimo: 0.5, mbBaseMaximo: 1.8,
  demasiadoGrandes: [],
}

describe('tamano', () => {
  it('escribe megas redondeados', () => {
    expect(tamano(135.6)).toBe('136 MB')
  })
  it('pasa a GB desde 1024 MB, con un decimal', () => {
    expect(tamano(1024)).toBe('1 GB')
    expect(tamano(3584)).toBe('3,5 GB')
  })
  it('no dice 0 MB de algo que pesa', () => {
    expect(tamano(0.4)).toBe('menos de 1 MB')
    expect(tamano(0)).toBe('0 MB')
  })
  it('separa los miles', () => {
    expect(tamano(1000)).toBe('1.000 MB')
  })
})

describe('rangoDeTamano', () => {
  it('da los dos extremos', () => {
    expect(rangoDeTamano(120, 600)).toBe('entre 120 MB y 600 MB')
  })
  it('cruza de MB a GB', () => {
    expect(rangoDeTamano(500, 2560)).toBe('entre 500 MB y 2,5 GB')
  })
  it('una sola cifra si los dos se escriben igual', () => {
    expect(rangoDeTamano(0.2, 0.8)).toBe('menos de 1 MB')
  })
})

describe('espacioTotal', () => {
  it('suma los archivos y la base en cada extremo', () => {
    expect(espacioTotal(base)).toBe('entre 28 MB y 137 MB')
  })
})

describe('queSeEncola', () => {
  it('nombra ranchos y parcelas con las hectáreas del rancho', () => {
    expect(queSeEncola(base)).toBe('1 rancho y 2 parcelas (226 ha)')
  })
  it('sin rancho usa las hectáreas de las parcelas', () => {
    expect(queSeEncola({ ...base, ranchos: 0, parcelas: 1, hectareasParcelas: 25.2 })).toBe('1 parcela (25 ha)')
  })
  it('sin nada lo dice', () => {
    expect(queSeEncola({ ...base, ranchos: 0, parcelas: 0 })).toBe('nada')
  })
})

describe('sePuedeConfirmar', () => {
  it('sí con algo que encolar', () => {
    expect(sePuedeConfirmar(base)).toBe(true)
  })
  it('no mientras no llegó la estimación', () => {
    expect(sePuedeConfirmar(null)).toBe(false)
  })
  it('no si pasa el máximo: Geocore lo rechazaría entero', () => {
    expect(sePuedeConfirmar({ ...base, excedido: true })).toBe(false)
  })
  it('no si todo ya tiene un alta en curso', () => {
    expect(sePuedeConfirmar({ ...base, ranchos: 0, parcelas: 0, salteadas: 3 })).toBe(false)
  })
})

describe('los textos', () => {
  it('el título nombra la entidad', () => {
    expect(tituloDe({ tipo: 'rancho', id: 'x', nombre: 'Yaqui' })).toBe('Reprocesar el rancho Yaqui')
  })
  it('el alcance del rancho incluye sus parcelas', () => {
    expect(alcanceDe({ tipo: 'rancho', id: 'x', nombre: 'Y' })).toContain('parcelas')
  })
  it('el resumen cuenta lo encolado y lo salteado', () => {
    expect(resumenDe({ total: 3, encolados: ['a', 'b'], salteados: ['c'], conError: [] }))
      .toBe('2 encoladas, 1 ya tenían un alta en curso. Se sigue en la pestaña Procesos.')
  })
})
