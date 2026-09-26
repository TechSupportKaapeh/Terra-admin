import { useId, useMemo, useState } from 'react'
import type { Cadencia, Measurement } from '@/lib/api'
import { escalaDe } from '@/lib/indices'
import { COBERTURA_BAJA, COBERTURA_MINIMA, HUECO_LARGO_MS, marcasDeTiempo, serieDe, tramosDe } from '@/lib/serie'

/**
 * La serie de una parcela: la mediana, con la banda p10–p90 detrás.
 *
 * Nació como prototipo del Diagnóstico (2026-09-20), desde M.7.3 es el gráfico de la
 * pantalla de trabajo —lo abre [`SerieParcelaSheet`](SerieParcelaSheet.tsx) desde la tabla
 * de parcelas— y **desde M.9.0d su eje es una fecha**. Se llamaba `SerieMensual` y dejó de
 * ser cierto: con `cadencia=pasada` un punto es una pasada del satélite, no un mes.
 *
 * Sólo dibuja lo que recibe. Quién pide las filas, con qué índice y con qué cadencia lo
 * decide quien lo llama; el reparto de los puntos sobre el eje y las marcas del calendario
 * los calcula [`lib/serie.ts`](../../lib/serie.ts), que tiene tests.
 *
 * **Qué cambió en M.9.0d, y por qué era necesario.** El eje era el *índice* de la fila:
 * los puntos iban repartidos parejo, a paso fijo. Con una fila por mes eso engañaba poco,
 * porque los meses vienen parejos; con una fila por pasada —tres en marzo, una en junio—
 * junio ocuparía el mismo ancho que marzo. El gráfico ya sabía dibujar huecos, así que el
 * cambio es del eje y no del dibujo: los tramos, la banda, el punto hueco y la marca en el
 * eje son los de antes.
 *
 * Tres cosas que el dibujo tiene que distinguir, y que son el motivo de que exista:
 *
 * - **una observación tapada** no llega: el pedido lleva el mínimo de cobertura de la receta
 *   (`COBERTURA_MINIMA`), porque desde `s2-pasada-v2` el worker guarda todas las pasadas y
 *   el umbral es de quien lee. Una foto sin la parcela a la vista no dice nada del cultivo;
 * - **un tramo sin observaciones útiles** se ve como el hueco que es —el eje es una fecha— y
 *   la línea lo cruza **punteada** si pasan más de 40 días (`HUECO_LARGO_MS`). Hasta el
 *   2026-09-26 la línea se cortaba en cada punto sin valor; con una fila por pasada eran
 *   decenas de cortes y la serie no se leía (pedido del usuario). Punteada sigue sin
 *   inventar: dice que ahí no se midió;
 * - **una observación de baja cobertura** trae dato, pero de poca superficie: el punto va
 *   hueco. Es una segunda codificación además del color, que es lo que pide que se lea sin
 *   color.
 *
 * Y una cuarta, que es de M.9.0d: **de cuántas observaciones salió cada punto**
 * (`agregadas`). Con `mensual` un mes puede ser la mediana de seis pasadas o de una, y
 * `DECISIONS #48` de Geocore lo dice así: dos meses con el mismo nombre no son igual de
 * confiables. Va en una tira de barras bajo el eje, y no en el tamaño del punto, porque el
 * punto ya codifica la cobertura: dos cosas en el mismo canal no se leen.
 *
 * SVG a mano y sin librería: confirmado por el usuario al abrir M.7.3 (2026-09-20). El
 * dibujo es simple y una librería de gráficos pesa más que lo que ahorra.
 */

const ALTO = 200
const ANCHO = 720
const MARGEN = { arriba: 12, derecha: 12, abajo: 28, izquierda: 40 }

/** Lo que mide la tira de `agregadas`, cuando se dibuja. */
const TIRA = 18

interface Props {
  /** Las filas de **un solo índice**, en cualquier orden. */
  filas: Measurement[]
  indice: string
  /**
   * La cadencia con la que salieron las filas. Es la que devolvió la API, no la que se
   * pidió: describe lo que hay en `filas`.
   */
  cadencia: Cadencia
}

export default function SerieTemporal({ filas, indice, cadencia }: Props) {
  const clip = useId()
  const [activo, setActivo] = useState<number | null>(null)

  // Todo el dibujo sale de las filas y la cadencia, así que se calcula una vez y no en cada
  // movimiento del puntero: pasar el mouse sólo cambia cuál está activo.
  const { serie, puntos, escalaX, escalaY, conTira, altoTrama, anchoTrama, yEje } = useMemo(() => {
    const serie = serieDe(filas, cadencia)

    // La tira ocupa lugar sólo si tiene algo que decir: con `pasada` cada punto es una
    // observación y `agregadas` es 1 en todas, así que serían barras todas iguales.
    const conTira = serie.maxAgregadas > 1
    const altoTrama = ALTO - MARGEN.arriba - MARGEN.abajo - (conTira ? TIRA : 0)
    const anchoTrama = ANCHO - MARGEN.izquierda - MARGEN.derecha

    const { desde, hasta } = serie.dominioY
    const escalaY = (v: number) => MARGEN.arriba + altoTrama - ((v - desde) / (hasta - desde)) * altoTrama
    const escalaX = (t: number) =>
      MARGEN.izquierda +
      ((t - serie.dominioT.desde) / (serie.dominioT.hasta - serie.dominioT.desde)) * anchoTrama

    return {
      serie,
      puntos: serie.puntos.map(p => ({ ...p, x: escalaX(p.t), y: p.valor === null ? null : escalaY(p.valor) })),
      escalaX,
      escalaY,
      conTira,
      altoTrama,
      anchoTrama,
      yEje: MARGEN.arriba + altoTrama,
    }
  }, [filas, cadencia])

  if (puntos.length === 0) {
    return <p className="text-sm text-muted-foreground">Esta parcela todavía no tiene mediciones de {indice.toUpperCase()}.</p>
  }

  // La línea une cada punto con valor con el siguiente (`tramosDe`); el tramo largo va punteado.
  const tramos = tramosDe(puntos)

  // La banda, en cambio, **sí se corta en un hueco largo**: rellenar dos meses sin foto con un
  // área p10–p90 es dibujar una dispersión que nadie midió. La línea punteada ya dice que ahí
  // no hay dato; la banda no tiene cómo decirlo.
  const bandas: (typeof puntos)[] = []
  let banda: typeof puntos = []
  for (const p of puntos) {
    const sinBanda = p.p10 === null || p.p90 === null
    const lejos = banda.length > 0 && p.t - banda[banda.length - 1].t > HUECO_LARGO_MS
    if (sinBanda || lejos) { if (banda.length > 1) bandas.push(banda); banda = [] }
    if (!sinBanda) banda.push(p)
  }
  if (banda.length > 1) bandas.push(banda)

  const { desde, hasta } = serie.dominioY
  const ticksY = [desde, (desde + hasta) / 2, hasta]
  // Las marcas del eje salen del calendario y no de los datos: así la distancia entre dos
  // etiquetas **es** el tiempo que pasó.
  const marcas = marcasDeTiempo(serie.dominioT)
  const p = activo === null ? null : puntos[activo]
  const sinDato = puntos.filter(q => q.valor === null).length
  const porPasada = cadencia === 'pasada'

  return (
    <figure className="space-y-2">
      <figcaption className="text-sm">
        <span className="font-medium">
          {indice.toUpperCase()} {porPasada ? 'por pasada' : 'mensual'}
        </span>{' '}
        <span className="text-muted-foreground">
          · {escalaDe(indice).que} · mediana con banda p10–p90 · {puntos.length}{' '}
          {porPasada ? 'pasadas' : 'meses'} con al menos el {COBERTURA_MINIMA * 100} % de la parcela a la vista
          {sinDato > 0 && ` · ${sinDato} sin valor`}
          {serie.ilegibles > 0 && ` · ${serie.ilegibles} con fecha ilegible, afuera`}
        </span>
      </figcaption>

      <div className="relative">
        <svg
          viewBox={`0 0 ${ANCHO} ${ALTO}`}
          className="w-full select-none"
          role="img"
          aria-label={
            `Serie de ${indice.toUpperCase()} de ${puntos[0].etiqueta} a ${puntos[puntos.length - 1].etiqueta}: ` +
            `un punto por ${porPasada ? 'pasada del satélite' : 'mes'}, la mediana con banda p10 a p90`
          }
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
              <rect x={MARGEN.izquierda} y={MARGEN.arriba} width={anchoTrama} height={altoTrama} />
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

            {tramos.map(tr => (
              <line
                key={tr.hasta.id}
                x1={tr.desde.x} y1={tr.desde.y!} x2={tr.hasta.x} y2={tr.hasta.y!}
                strokeWidth={tr.largo ? 1.5 : 2} strokeLinecap="round"
                strokeDasharray={tr.largo ? '3 4' : undefined}
                className="stroke-[#2a78d6] dark:stroke-[#3987e5]"
              />
            ))}
          </g>

          {/* Los puntos: hueco = baja cobertura. Anillo del color de la superficie. */}
          {puntos.filter(q => q.y !== null).map(q => {
            const bajo = q.cobertura !== null && q.cobertura < COBERTURA_BAJA
            return (
              <circle
                key={q.id} cx={q.x} cy={q.y!} r={4}
                strokeWidth={2}
                className={
                  bajo
                    ? 'fill-background stroke-[#2a78d6] dark:stroke-[#3987e5]'
                    : 'fill-[#2a78d6] dark:fill-[#3987e5] stroke-background'
                }
              />
            )
          })}

          {/* De cuántas observaciones salió cada punto. Una barra alta es un mes que salió
              de muchas pasadas; una de una sola raya, un mes que se apoya en una. */}
          {conTira && puntos.map(q => {
            const alto = Math.max(1, (q.agregadas / serie.maxAgregadas) * (TIRA - 4))
            return (
              <rect
                key={q.id}
                x={q.x - 1.5} y={yEje + 3 + (TIRA - 4 - alto)}
                width={3} height={alto}
                className="fill-muted-foreground/45"
              />
            )
          })}

          {/* La cruz sigue al puntero y se pega al punto más cercano. */}
          {p && (
            <line
              x1={p.x} x2={p.x} y1={MARGEN.arriba} y2={yEje}
              className="stroke-muted-foreground" strokeWidth={1}
            />
          )}

          {marcas.map(m => (
            <text
              key={m.t} x={escalaX(m.t)} y={ALTO - 8} textAnchor="middle"
              className="fill-muted-foreground text-[10px] tabular-nums"
            >
              {m.etiqueta}
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
              {p.etiqueta}
              {/* En mensual la cobertura es la mediana de la de sus pasadas, **no** la del
                  compuesto: la del compuesto —la unión— no se puede rehacer desde las filas
                  por pasada (`#66` del worker). Dicho así, no se confunde con el mapa. */}
              {p.cobertura !== null && (porPasada
                ? ` · cobertura ${(p.cobertura * 100).toFixed(0)} %`
                : ` · cobertura mediana de sus pasadas ${(p.cobertura * 100).toFixed(0)} %`)}
            </div>
            {p.p10 !== null && p.p90 !== null && (
              <div className="text-muted-foreground tabular-nums">
                p10 {p.p10.toFixed(2)} · p90 {p.p90.toFixed(2)}
              </div>
            )}
            {conTira && (
              <div className="text-muted-foreground tabular-nums">
                {p.agregadas} {p.agregadas === 1 ? 'pasada' : 'pasadas'}
              </div>
            )}
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Sólo entran las {porPasada ? 'pasadas' : 'pasadas del mes'} en que se ve al menos el{' '}
        {COBERTURA_MINIMA * 100} % de la parcela: las tapadas por nubes no dicen nada del cultivo.
        Punto hueco = cobertura menor al {COBERTURA_BAJA * 100} %. Línea punteada = más de 40
        días sin una observación útil entre dos puntos.
        {conTira && ' La barra bajo el eje dice de cuántas pasadas salió cada punto.'}
      </p>

      {/* La tabla no es un extra: es lo que hace legible el gráfico sin depender del color. */}
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground">Ver los números</summary>
        <table className="mt-2 w-full">
          <thead className="text-muted-foreground">
            <tr>
              <th className="text-left font-normal">{porPasada ? 'Pasada' : 'Mes'}</th>
              <th className="text-right font-normal">Mediana</th>
              <th className="text-right font-normal">p10</th>
              <th className="text-right font-normal">p90</th>
              <th className="text-right font-normal">Cobertura</th>
              <th className="text-right font-normal">Pasadas</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {puntos.map(q => (
              <tr key={q.id} className="border-t">
                <td>{q.etiqueta}</td>
                <td className="text-right">{q.valor === null ? '—' : q.valor.toFixed(3)}</td>
                <td className="text-right">{q.p10 === null ? '—' : q.p10.toFixed(3)}</td>
                <td className="text-right">{q.p90 === null ? '—' : q.p90.toFixed(3)}</td>
                <td className="text-right">{q.cobertura === null ? '—' : `${(q.cobertura * 100).toFixed(0)} %`}</td>
                <td className="text-right">{q.agregadas}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}
