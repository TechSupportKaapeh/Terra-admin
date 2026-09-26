/**
 * La serie de una parcela como datos de dibujo: el eje es **una fecha** (M.9.0d).
 *
 * Hasta acá el gráfico ponía un punto por fila, repartidos parejo: el eje era el
 * **índice** de la fila y no su fecha. Con `s2-mensual-v1` eso engañaba poco —una fila por
 * mes, y los meses vienen parejos— pero desde `s2-pasada-v2` (`DECISIONS #70` del worker)
 * una fila es **una pasada del satélite**, y las pasadas no están parejas: tres en marzo y
 * una en junio. Repartidas a paso fijo, junio ocuparía el mismo ancho que marzo y la serie
 * diría algo que no pasó.
 *
 * Por eso esto vive en `src/lib` y tiene tests (`DECISIONS #40`: entorno node, sin jsdom):
 * **la escala del eje es de la clase de código que no falla, miente**. Un eje mal armado
 * dibuja una serie perfectamente creíble.
 *
 * Lo que queda afuera a propósito: los píxeles. Acá se calcula el **dominio** —de qué
 * instante a qué instante, de qué valor a qué valor— y quién dibuja lo mapea a su
 * `viewBox`. Así el mismo cálculo sirve para cualquier tamaño y se prueba sin un SVG.
 *
 * Y una cosa que no se calcula acá: el número mensual. Lo agrega la API
 * (`DECISIONS #48` de Geocore): el front **elige** la cadencia, no la computa.
 */

import type { Cadencia, Measurement } from '@/lib/api'

const MS_POR_DIA = 86_400_000

/** Con esta cobertura o menos, el dato existe pero describe poca superficie. */
export const COBERTURA_BAJA = 0.5

/**
 * El umbral de cobertura que el panel pide al leer: **el `cobertura_minima` de la receta**, que
 * vale 0,3 en `s2-mensual-v1` y en `s2-pasada-v2`.
 *
 * Por qué se pide, y por qué M.9.0d no lo pedía (decisión corregida el 2026-09-26, `DECISIONS
 * #51` de Geocore): con `s2-pasada-v2` el worker guarda **todas** las pasadas, también las
 * tapadas enteras, y el umbral pasó a aplicarse al leer (`#63` del worker). Si nadie lo aplica,
 * no se aplica en ningún lado. Medido sobre una parcela del valle del Cauca en julio de 2025:
 * 19 pasadas, 10 al 0 % y 5 por debajo del 15 %. Sin el umbral, la cobertura mensual daba la
 * mediana de las 19 —0 %— y el valor del mes mezclaba fotos de un puñado de píxeles.
 *
 * Está escrito acá y no se lee de la receta porque la API no la expone. Si una receta nueva
 * cambia su mínimo, este número tiene que cambiar con ella.
 */
export const COBERTURA_MINIMA = 0.3

/**
 * Más que esto sin una observación útil entre dos puntos, y la línea que los une va punteada.
 *
 * La línea une todos los puntos (pedido del usuario, 2026-09-26): cortada en cada hueco, la
 * serie por pasada no se leía. Pero una línea sólida entre dos fotos separadas por dos meses
 * dice que se sabe qué pasó en el medio, y no se sabe. 40 días es "más de un mes": entre dos
 * meses consecutivos hay 28 a 31, así que en la serie mensual sólo se puntea un mes que falta.
 */
export const HUECO_LARGO_MS = 40 * 86_400_000

/** Un punto de la serie, ya listo para dibujar salvo la cuenta de píxeles. */
export interface PuntoSerie {
  /**
   * Clave estable para React. **No es la fecha**: con `cadencia=pasada` dos pasadas del
   * mismo día llegan con la misma fecha —Geocore formatea `yyyy-MM-dd` y se come la hora—,
   * y dos claves iguales le hacen perder a React de vista a uno de los dos puntos.
   */
  id: string
  /** El instante, en milisegundos epoch UTC. Es la coordenada del eje. */
  t: number
  /** Cómo se nombra este punto: `AAAA-MM` por mes, `AAAA-MM-DD` por pasada. */
  etiqueta: string
  valor: number | null
  p10: number | null
  p90: number | null
  cobertura: number | null
  /**
   * Cuántas observaciones entraron en este punto (`agregadas` de la API). Con
   * `cadencia=pasada` es 1; con `mensual` dice si el mes salió de seis pasadas o de una, y
   * es lo que hace comparables dos meses (`DECISIONS #48` de Geocore).
   */
  agregadas: number
  /** Las recetas que produjeron este punto. Más de una = dos semánticas en el mismo punto. */
  recetas: string[]
}

export interface Dominio {
  desde: number
  hasta: number
}

export interface Serie {
  /** De más viejo a más nuevo. */
  puntos: PuntoSerie[]
  /** El eje del tiempo, en milisegundos epoch. Nunca de ancho cero. */
  dominioT: Dominio
  /** El eje vertical, con aire arriba y abajo. */
  dominioY: Dominio
  /** El mayor `agregadas` de la serie. En 1, no hay nada que mostrar sobre el agrupamiento. */
  maxAgregadas: number
  /**
   * Las recetas presentes, ordenadas y sin repetir. **Más de una es el caso que la API
   * muestra a propósito** (`DECISIONS #48` de Geocore): un mes reprocesado sale con
   * `"s2-mensual-v1,s2-pasada-v2"`, y son filas de dos semánticas mezcladas.
   */
  recetas: string[]
  /** Cuántas filas se dejaron afuera por traer una fecha que no se entiende. */
  ilegibles: number
}

/**
 * El instante de una fecha de la API, en milisegundos epoch UTC. `NaN` si no se entiende.
 *
 * Acepta las dos formas **a propósito**, y no es futurología:
 *
 * - `2026-08-19` es lo que manda Geocore hoy: el controller formatea
 *   `yyyy-MM-dd` para las dos cadencias, así que con `cadencia=pasada` la hora de
 *   adquisición **se pierde en el JSON** aunque la columna la tenga;
 * - `2026-08-19T15:42:00Z` es lo que dice la documentación de la API que llega con
 *   `cadencia=pasada`. El día que el formato se corrija, esto ya lo dibuja en su hora.
 *
 * Un `T` sin zona se lee como UTC, que es la zona de toda la API. `new Date(texto)` solo
 * no serviría: la forma con `T` y sin zona la interpreta en la **hora local**, así que la
 * misma respuesta daría un punto distinto según dónde esté abierto el panel.
 */
export function instanteDe(fecha: string): number {
  const solaFecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha)
  if (solaFecha) {
    const [, a, m, d] = solaFecha
    return Date.UTC(Number(a), Number(m) - 1, Number(d))
  }
  if (!/^\d{4}-\d{2}-\d{2}T/.test(fecha)) return NaN
  // Sin `Z` ni `+hh:mm`, se completa con `Z`: la API habla en UTC.
  const conZona = /(Z|[+-]\d{2}:?\d{2})$/.test(fecha) ? fecha : `${fecha}Z`
  return Date.parse(conZona)
}

/** El año y el mes de un instante, en UTC: `AAAA-MM`. */
export function mesDe(t: number): string {
  return new Date(t).toISOString().slice(0, 7)
}

/**
 * Cómo se nombra un punto según la cadencia.
 *
 * Con `mensual` el punto **es** el mes, y decir el día 1 sería inventar una precisión que
 * el número no tiene: es la mediana de todo el mes. Con `pasada` el día importa, y si
 * alguna vez llega la hora, también.
 */
export function etiquetaDe(t: number, cadencia: Cadencia): string {
  if (cadencia === 'mensual') return mesDe(t)
  const iso = new Date(t).toISOString()
  return t % MS_POR_DIA === 0 ? iso.slice(0, 10) : `${iso.slice(0, 10)} ${iso.slice(11, 16)}`
}

/** Las recetas de una fila: la API junta las del grupo con comas (`string_agg DISTINCT`). */
export function recetasDe(receta: string | null): string[] {
  if (!receta) return []
  return receta.split(',').map(r => r.trim()).filter(Boolean)
}

/**
 * De las filas de la API a los datos del gráfico.
 *
 * Ordena por fecha, descarta las fechas ilegibles —contándolas, en vez de dibujarlas en
 * el año 1970— y arma los dos dominios.
 *
 * **El dominio vertical sale de los datos y no del rango del índice** (M.7.3): un NDVI que
 * se mueve entre 0,30 y 0,60 dibujado en el rango completo es una línea plana que no dice
 * nada. La contra, asumida, es que dos gráficos no se comparan a ojo; el mapa sí usa la
 * escala fija de cada índice, justamente para lo contrario.
 */
export function serieDe(filas: readonly Measurement[], cadencia: Cadencia): Serie {
  const conInstante = filas
    .map(f => ({ fila: f, t: instanteDe(f.fecha) }))
    .filter(x => Number.isFinite(x.t))
  const ilegibles = filas.length - conInstante.length
  conInstante.sort((a, b) => a.t - b.t || a.fila.indice.localeCompare(b.fila.indice))

  const puntos: PuntoSerie[] = conInstante.map(({ fila, t }, i) => ({
    // El índice de orden entra en la clave: es lo único que distingue dos pasadas que
    // llegaron con la misma fecha.
    id: `${fila.fecha}#${i}`,
    t,
    etiqueta: etiquetaDe(t, cadencia),
    valor: fila.valor,
    p10: fila.estadisticas?.p10 ?? null,
    p90: fila.estadisticas?.p90 ?? null,
    cobertura: fila.cobertura,
    // `agregadas` es de M.9.0c. Una respuesta anterior no lo trae, y ahí 1 es la verdad:
    // cada fila era una observación.
    agregadas: fila.agregadas ?? 1,
    recetas: recetasDe(fila.receta),
  }))

  // El dominio sale **de los valores**, no de la banda. Una pasada con pocos píxeles limpios
  // trae un p10 o un p90 extremo —el borde de una nube—, y con la banda adentro del dominio
  // un solo punto así aplastaba la serie entera contra el medio del gráfico (se vio un eje de
  // −1,2 a 1,2 para un NDVI que vive entre 0,4 y 0,8). La banda que se sale queda recortada.
  const valores = puntos.map(p => p.valor).filter((v): v is number => v !== null)
  const min = valores.length ? Math.min(...valores) : 0
  const max = valores.length ? Math.max(...valores) : 1
  const aire = (max - min) * 0.1 || 0.05

  return {
    puntos,
    dominioT: dominioDe(puntos.map(p => p.t)),
    dominioY: { desde: min - aire, hasta: max + aire },
    maxAgregadas: puntos.reduce((m, p) => Math.max(m, p.agregadas), 1),
    recetas: [...new Set(puntos.flatMap(p => p.recetas))].sort(),
    ilegibles,
  }
}

/**
 * El dominio del tiempo. **Nunca de ancho cero**, y por eso existe.
 *
 * Un punto solo —o dos del mismo día, que con la fecha sin hora es lo mismo— daría
 * `hasta - desde === 0`, y con eso la cuenta del pixel es una división por cero: el punto
 * sale en `NaN` y el SVG no dibuja nada. Con un día de aire a cada lado, cae en el centro.
 */
function dominioDe(instantes: readonly number[]): Dominio {
  if (instantes.length === 0) return { desde: 0, hasta: MS_POR_DIA }
  const desde = Math.min(...instantes)
  const hasta = Math.max(...instantes)
  if (desde === hasta) return { desde: desde - MS_POR_DIA / 2, hasta: hasta + MS_POR_DIA / 2 }
  return { desde, hasta }
}

/** Una marca del eje del tiempo. */
export interface MarcaDeTiempo {
  t: number
  etiqueta: string
}

/**
 * Las marcas del eje: en los bordes de mes, de trimestre o de año, **no en los datos**.
 *
 * Es la otra mitad de "el eje es una fecha". Antes las etiquetas salían de una de cada N
 * filas, así que con pasadas desparejas quedaban a distancias distintas y podían repetir
 * el mes. Ancladas al calendario, la distancia entre dos etiquetas **es** el tiempo que
 * pasó, que es lo que un eje de fechas tiene que poder leerse.
 *
 * El paso se elige por cuántos meses abarca la serie, y con menos de dos bordes de mes
 * —una serie de pocas semanas, que es lo que se ve pidiendo por pasada un período corto—
 * se cae a marcas de día: un eje con una sola etiqueta no ubica nada.
 */
export function marcasDeTiempo(dominio: Dominio, maximo = 8): MarcaDeTiempo[] {
  const { desde, hasta } = dominio
  if (!(hasta > desde) || maximo < 1) return []

  const bordes = bordesDeMes(desde, hasta)
  if (bordes.length < 2) return marcasDeDia(dominio, maximo)

  const paso = Math.ceil(bordes.length / maximo)
  // Con paso de un año o más, sólo los eneros y con el año como etiqueta: repetir
  // "2026-01" cada doce meses no agrega nada que "2026" no diga.
  if (paso >= 12) {
    const eneros = bordes.filter(t => new Date(t).getUTCMonth() === 0)
    const pasoDeAnios = Math.max(1, Math.ceil(eneros.length / maximo))
    return eneros
      .filter((_, i) => i % pasoDeAnios === 0)
      .map(t => ({ t, etiqueta: String(new Date(t).getUTCFullYear()) }))
  }
  return bordes.filter((_, i) => i % paso === 0).map(t => ({ t, etiqueta: mesDe(t) }))
}

/** Los primeros instantes de mes dentro del dominio, incluidos sus bordes. */
function bordesDeMes(desde: number, hasta: number): number[] {
  const primero = new Date(desde)
  let anio = primero.getUTCFullYear()
  let mes = primero.getUTCMonth()
  if (Date.UTC(anio, mes) < desde) {
    mes += 1
    if (mes === 12) { mes = 0; anio += 1 }
  }

  const bordes: number[] = []
  for (let t = Date.UTC(anio, mes); t <= hasta; t = Date.UTC(anio, mes)) {
    bordes.push(t)
    mes += 1
    if (mes === 12) { mes = 0; anio += 1 }
  }
  return bordes
}

/** Marcas cada N días enteros, para una serie más corta que dos meses. */
function marcasDeDia(dominio: Dominio, maximo: number): MarcaDeTiempo[] {
  const dias = Math.max(1, Math.ceil((dominio.hasta - dominio.desde) / MS_POR_DIA))
  const paso = Math.max(1, Math.ceil(dias / maximo)) * MS_POR_DIA
  const primero = Math.ceil(dominio.desde / MS_POR_DIA) * MS_POR_DIA

  const marcas: MarcaDeTiempo[] = []
  for (let t = primero; t <= dominio.hasta; t += paso) {
    marcas.push({ t, etiqueta: new Date(t).toISOString().slice(5, 10) })
  }
  return marcas
}

/** Un tramo de la línea: dos puntos con valor, uno después del otro. */
export interface Tramo<P> {
  desde: P
  hasta: P
  /** Pasaron más de {@link HUECO_LARGO_MS} entre los dos: se dibuja punteado. */
  largo: boolean
}

/**
 * Los tramos de la línea: **cada punto con valor se une con el siguiente con valor**, sin
 * importar qué hay en el medio. Un punto sin valor no corta la línea: no se dibuja.
 *
 * Hasta el 2026-09-26 la línea se cortaba en cada punto sin valor (M.7.3). Con una fila por
 * mes eran pocos cortes; con una por pasada eran decenas, y la serie no se podía leer. Lo que
 * se conserva de aquella regla es no mentir: un tramo largo va marcado como tal.
 */
export function tramosDe<P extends { t: number; valor: number | null }>(puntos: readonly P[]): Tramo<P>[] {
  const conValor = puntos.filter(p => p.valor !== null)
  return conValor.slice(1).map((hasta, i) => {
    const desde = conValor[i]
    return { desde, hasta, largo: hasta.t - desde.t > HUECO_LARGO_MS }
  })
}

/**
 * La query de `/api/measurements` para la serie de una parcela.
 *
 * Vive acá y no en `api.ts` para tener test: `api.ts` carga el cliente de Supabase, y los tests
 * del panel corren en node, sin él (`DECISIONS #40`). Y lo que hay que fijar es justamente lo
 * que se rompió el 2026-09-26: **que el pedido lleve `coberturaMinima`**. Sin él, las pasadas
 * tapadas entran a la serie y a la mediana del mes, y nada falla a la vista.
 */
export function querySerie(
  parcelaId: string, indice?: string, cadencia?: Cadencia, coberturaMinima?: number,
): string {
  const q = new URLSearchParams({ parcelaId, limit: '2000' })
  if (indice) q.set('indice', indice)
  if (cadencia) q.set('cadencia', cadencia)
  if (coberturaMinima !== undefined) q.set('coberturaMinima', String(coberturaMinima))
  return q.toString()
}
