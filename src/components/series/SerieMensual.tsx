import { useId, useMemo, useState } from 'react'
import type { Measurement } from '@/lib/api'
import { escalaDe } from '@/lib/indices'

/**
 * La serie mensual de una parcela: la mediana, con la banda p10–p90 detrás.
 *
 * Nació como prototipo del Diagnóstico (2026-09-20) y desde M.7.3 es también el gráfico
 * de la pantalla de trabajo: lo abre [`SerieParcelaSheet`](SerieParcelaSheet.tsx) desde
 * la tabla de parcelas. Sólo dibuja lo que recibe; quién pide las filas y con qué índice
 * lo deciden los dos llamadores.
 *
 * Tres cosas que el dibujo tiene que distinguir, y que son el motivo de que exista:
 *
 * - **un mes sin dato** (`valor` null) es un mes **procesado** cuya cobertura quedó bajo el
 *   mínimo de la receta: se corta la línea y se marca en el eje, en vez de interpolar una
 *   recta que inventa un valor que nadie midió;
 * - **un mes ausente** —ninguna fila— es un mes que nadie procesó: también corta la línea,
 *   y la tabla lo deja ver;
 * - **un mes de baja cobertura** trae dato, pero de poca superficie: el punto va hueco. Es
 *   una segunda codificación además del color, que es lo que pide que se lea sin color.
 *
 * SVG a mano y sin librería: confirmado por el usuario al abrir M.7.3 (2026-09-20). El
 * dibujo es simple y una librería de gráficos pesa más que lo que ahorra.
 */

/** Debajo de esto, el dato existe pero describe poca superficie. */
const COBERTURA_BAJA = 0.5

const ALTO = 200
const ANCHO = 720
const MARGEN = { arriba: 12, derecha: 12, abajo: 28, izquierda: 40 }

interface Props {
  /** Las filas de **un solo índice**, en cualquier orden. */
  filas: Measurement[]
  indice: string
}

interface Punto {
  mes: string
  x: number
  valor: number | null
  y: number | null
  p10: number | null
  p90: number | null
  cobertura: number | null
}

const mesDe = (iso: string) => iso.slice(0, 7)

export default function SerieMensual({ filas, indice }: Props) {
  const clip = useId()
  const [activo, setActivo] = useState<number | null>(null)

  const { puntos, escalaY, dominio } = useMemo(() => {
    const ordenadas = [...filas].sort((a, b) => a.fecha.localeCompare(b.fecha))

    const valores = ordenadas.flatMap(f => [
      f.valor,
      f.estadisticas?.p10 ?? null,
      f.estadisticas?.p90 ?? null,
    ]).filter((v): v is number => v !== null)

    // El dominio sale de los datos y no de [-1, 1]: un NDVI que se mueve entre 0,3 y 0,6
    // dibujado en el rango completo del índice es una línea plana que no dice nada.
    const min = valores.length ? Math.min(...valores) : 0
    const max = valores.length ? Math.max(...valores) : 1
    const aire = (max - min) * 0.1 || 0.05
    const desde = min - aire
    const hasta = max + aire

    const alto = ALTO - MARGEN.arriba - MARGEN.abajo
    const ancho = ANCHO - MARGEN.izquierda - MARGEN.derecha
    const escalaY = (v: number) => MARGEN.arriba + alto - ((v - desde) / (hasta - desde)) * alto
    const paso = ordenadas.length > 1 ? ancho / (ordenadas.length - 1) : 0

    const puntos: Punto[] = ordenadas.map((f, i) => ({
      mes: mesDe(f.fecha),
      x: MARGEN.izquierda + paso * i + (ordenadas.length === 1 ? ancho / 2 : 0),
      valor: f.valor,
      y: f.valor === null ? null : escalaY(f.valor),
      p10: f.estadisticas?.p10 ?? null,
      p90: f.estadisticas?.p90 ?? null,
      cobertura: f.cobertura,
    }))

    return { puntos, escalaY, dominio: { desde, hasta } }
  }, [filas])

  if (puntos.length === 0) {
    return <p className="text-sm text-muted-foreground">Esta parcela todavía no tiene mediciones de {indice.toUpperCase()}.</p>
  }

  // Los tramos: la línea se corta en cada mes sin dato en vez de saltearlo.
  const tramos: Punto[][] = []
  let tramo: Punto[] = []
  for (const p of puntos) {
    if (p.y === null) { if (tramo.length) tramos.push(tramo); tramo = [] }
    else tramo.push(p)
  }
  if (tramo.length) tramos.push(tramo)

  const bandas: Punto[][] = []
  let banda: Punto[] = []
  for (const p of puntos) {
    if (p.p10 === null || p.p90 === null) { if (banda.length > 1) bandas.push(banda); banda = [] }
    else banda.push(p)
  }
  if (banda.length > 1) bandas.push(banda)

  const ticksY = [dominio.desde, (dominio.desde + dominio.hasta) / 2, dominio.hasta]
  const etiquetasX = puntos.filter((_, i) => i % Math.ceil(puntos.length / 8) === 0)
  const p = activo === null ? null : puntos[activo]

  return (
    <figure className="space-y-2">
      <figcaption className="text-sm">
        <span className="font-medium">{indice.toUpperCase()} mensual</span>{' '}
        <span className="text-muted-foreground">
          · {escalaDe(indice).que} · mediana con banda p10–p90 · {puntos.length} meses ·{' '}
          {puntos.filter(x => x.valor === null).length} sin dato
        </span>
      </figcaption>

      <div className="relative">
        <svg
          viewBox={`0 0 ${ANCHO} ${ALTO}`}
          className="w-full select-none"
          role="img"
          aria-label={`Serie mensual de ${indice.toUpperCase()}: mediana por mes con banda p10 a p90`}
          onPointerLeave={() => setActivo(null)}
          onPointerMove={e => {
            const caja = e.currentTarget.getBoundingClientRect()
            const x = ((e.clientX - caja.left) / caja.width) * ANCHO
            let cerca = 0
            for (let i = 1; i < puntos.length; i++) {
              if (Math.abs(puntos[i].x - x) < Math.abs(puntos[cerca].x - x)) cerca = i
            }
            setActivo(cerca)
          }}
        >
          <defs>
            <clipPath id={clip}>
              <rect
                x={MARGEN.izquierda} y={MARGEN.arriba}
                width={ANCHO - MARGEN.izquierda - MARGEN.derecha}
                height={ALTO - MARGEN.arriba - MARGEN.abajo}
              />
            </clipPath>
          </defs>

          {/* Grilla: 1px, sólida y recesiva. Nunca punteada. */}
          {ticksY.map(v => (
            <g key={v}>
              <line
                x1={MARGEN.izquierda} x2={ANCHO - MARGEN.derecha}
                y1={escalaY(v)} y2={escalaY(v)}
                className="stroke-border" strokeWidth={1}
              />
              <text
                x={MARGEN.izquierda - 6} y={escalaY(v)} dy="0.32em" textAnchor="end"
                className="fill-muted-foreground text-[10px] tabular-nums"
              >
                {v.toFixed(2)}
              </text>
            </g>
          ))}

          {/* La banda: el mismo tono que la línea, un paso más claro. */}
          <g clipPath={`url(#${clip})`}>
            {bandas.map((b, i) => (
              <path
                key={i}
                d={
                  b.map((q, j) => `${j === 0 ? 'M' : 'L'}${q.x},${escalaY(q.p90!)}`).join(' ') +
                  ' ' +
                  [...b].reverse().map(q => `L${q.x},${escalaY(q.p10!)}`).join(' ') +
                  ' Z'
                }
                className="fill-[#b7d3f6] dark:fill-[#184f95]"
              />
            ))}

            {tramos.map((tr, i) => (
              <path
                key={i}
                d={tr.map((q, j) => `${j === 0 ? 'M' : 'L'}${q.x},${q.y}`).join(' ')}
                fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
                className="stroke-[#2a78d6] dark:stroke-[#3987e5]"
              />
            ))}
          </g>

          {/* Un mes sin dato: una marca en el eje, para que el hueco se vea a propósito. */}
          {puntos.filter(q => q.valor === null).map(q => (
            <line
              key={q.mes}
              x1={q.x} x2={q.x} y1={ALTO - MARGEN.abajo} y2={ALTO - MARGEN.abajo - 5}
              className="stroke-muted-foreground" strokeWidth={2}
            />
          ))}

          {/* Los puntos: hueco = baja cobertura. Anillo del color de la superficie. */}
          {puntos.filter(q => q.y !== null).map(q => {
            const bajo = q.cobertura !== null && q.cobertura < COBERTURA_BAJA
            return (
              <circle
                key={q.mes} cx={q.x} cy={q.y!} r={4}
                strokeWidth={2}
                className={
                  bajo
                    ? 'fill-background stroke-[#2a78d6] dark:stroke-[#3987e5]'
                    : 'fill-[#2a78d6] dark:fill-[#3987e5] stroke-background'
                }
              />
            )
          })}

          {/* La cruz sigue al puntero y se pega al mes más cercano. */}
          {p && (
            <line
              x1={p.x} x2={p.x} y1={MARGEN.arriba} y2={ALTO - MARGEN.abajo}
              className="stroke-muted-foreground" strokeWidth={1}
            />
          )}

          {etiquetasX.map(q => (
            <text
              key={q.mes} x={q.x} y={ALTO - 8} textAnchor="middle"
              className="fill-muted-foreground text-[10px] tabular-nums"
            >
              {q.mes}
            </text>
          ))}
        </svg>

        {p && (
          <div
            className="pointer-events-none absolute top-0 rounded-md border bg-popover px-2 py-1 text-xs shadow-sm"
            style={{ left: `${Math.min(88, (p.x / ANCHO) * 100)}%` }}
          >
            <div className="font-medium tabular-nums">
              {p.valor === null ? 'sin dato' : p.valor.toFixed(3)}
            </div>
            <div className="text-muted-foreground tabular-nums">
              {p.mes}
              {p.cobertura !== null && ` · cobertura ${(p.cobertura * 100).toFixed(0)} %`}
            </div>
            {p.p10 !== null && p.p90 !== null && (
              <div className="text-muted-foreground tabular-nums">
                p10 {p.p10.toFixed(2)} · p90 {p.p90.toFixed(2)}
              </div>
            )}
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Punto hueco = cobertura menor al {COBERTURA_BAJA * 100} %. Marca en el eje = mes
        procesado sin dato. La línea se corta donde no hay valor.
      </p>

      {/* La tabla no es un extra: es lo que hace legible el gráfico sin depender del color. */}
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground">Ver los números</summary>
        <table className="mt-2 w-full">
          <thead className="text-muted-foreground">
            <tr><th className="text-left font-normal">Mes</th><th className="text-right font-normal">Mediana</th><th className="text-right font-normal">p10</th><th className="text-right font-normal">p90</th><th className="text-right font-normal">Cobertura</th></tr>
          </thead>
          <tbody className="tabular-nums">
            {puntos.map(q => (
              <tr key={q.mes} className="border-t">
                <td>{q.mes}</td>
                <td className="text-right">{q.valor === null ? '—' : q.valor.toFixed(3)}</td>
                <td className="text-right">{q.p10 === null ? '—' : q.p10.toFixed(3)}</td>
                <td className="text-right">{q.p90 === null ? '—' : q.p90.toFixed(3)}</td>
                <td className="text-right">{q.cobertura === null ? '—' : `${(q.cobertura * 100).toFixed(0)} %`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}
