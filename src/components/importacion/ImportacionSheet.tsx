import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import GeometryView from '@/components/GeometryView'
import Selector from '@/components/Selector'
import ZonaDeCarga from '@/components/importacion/ZonaDeCarga'
import {
  PlanInvalidoError, describeError, estimarImportacion, importarPlan, previsualizarImportacion,
  type ImportacionRealizada, type ObservacionDelPlan, type PoligonoPrevisto, type RolPropuesto,
  type VistaPreviaImportacion,
} from '@/lib/api'
import {
  COLOR_DESACTIVADO, COLOR_POR_ROL, TEXTO_CASO,
  arbolDe, colorDe, formasDe, hectareas, origenDe, resumenEnPalabras,
} from '@/lib/importacion'
import {
  ROLES_ELEGIBLES, altasEnPalabras, aplicarCorrecciones, corregir, huellaDe, ocupacionEnPalabras,
  planDe, porIndice, porQueNoSePuedeCrear, ranchosPosibles, sinCorreccion,
  type Correccion, type Correcciones, type Revision,
} from '@/lib/planDeImportacion'

/**
 * «Crear extensión y subgrupos» (sprint K): se sube un KML, GeoJSON o WKT, se ve lo que Geocore
 * propone en un árbol y en el mapa (K.5), se corrige —rol, rancho, nombre, activo— y se confirma
 * viendo la estimación (K.6, Geocore `DECISIONS #70`).
 *
 * **«Revisar» y no una estimación automática** (decisión del usuario, 2026-10-04): la estimación
 * tiene un límite de 20 por minuto, y corrigiendo rápido se llegaba. «Crear» sólo se habilita con
 * una revisión del plan que está en pantalla y sin errores: no se crea nada que no se haya visto.
 *
 * El contenido va con `key={tenantId}`: al cambiar de tenant arranca de cero, sin el archivo
 * anterior, que era de otro tenant.
 */
export default function ImportacionSheet({ abierto, tenantId, onCreado, onClose }: {
  abierto: boolean
  tenantId: string
  /** Se llama cuando se creó algo: el llamador recarga los ranchos y los procesos. */
  onCreado: () => void
  onClose: () => void
}) {
  return (
    <Sheet open={abierto} onOpenChange={a => { if (!a) onClose() }}>
      <SheetContent className="data-[side=right]:w-full data-[side=right]:sm:max-w-6xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Crear extensión y subgrupos</SheetTitle>
          <SheetDescription>
            Subí un KML, GeoJSON o WKT, corregí lo que se propone y creá los ranchos y parcelas.
          </SheetDescription>
        </SheetHeader>
        {abierto && <Importacion key={tenantId} tenantId={tenantId} onCreado={onCreado} onListo={onClose} />}
      </SheetContent>
    </Sheet>
  )
}

const SIN_OBSERVACIONES = { delPoligono: new Map<number, ObservacionDelPlan[]>(), generales: [] as ObservacionDelPlan[] }

function Importacion({ tenantId, onCreado, onListo }: { tenantId: string; onCreado: () => void; onListo: () => void }) {
  const [archivo, setArchivo] = useState<File | null>(null)
  const [vista, setVista] = useState<VistaPreviaImportacion | null>(null)
  const [correcciones, setCorrecciones] = useState<Correcciones>({})
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [elegido, setElegido] = useState<number | null>(null)
  const [revision, setRevision] = useState<Revision | null>(null)
  const [revisando, setRevisando] = useState(false)
  const [creando, setCreando] = useState(false)
  const [resultado, setResultado] = useState<ImportacionRealizada | null>(null)
  // Si se elige otro archivo antes de que vuelva el primero, la respuesta vieja se descarta:
  // si no, el mapa podría quedar mostrando un archivo con el nombre de otro. Lo mismo con una
  // revisión que vuelve después de elegir otro archivo.
  const pedido = useRef(0)

  async function subir(f: File) {
    const este = ++pedido.current
    setArchivo(f)
    setVista(null)
    setCorrecciones({})
    setRevision(null)
    setElegido(null)
    setError('')
    setCargando(true)
    try {
      const v = await previsualizarImportacion(f, tenantId)
      if (este === pedido.current) setVista(v)
    } catch (e) {
      if (este === pedido.current) setError(describeError(e) ?? '')
    } finally {
      if (este === pedido.current) setCargando(false)
    }
  }

  const corregida = useMemo(() => (vista ? aplicarCorrecciones(vista, correcciones) : null), [vista, correcciones])
  const plan = useMemo(() => (corregida ? planDe(corregida) : null), [corregida])
  const huella = plan ? huellaDe(plan) : ''

  const errores = revision ? porIndice(revision.estimacion.errores) : SIN_OBSERVACIONES
  const avisos = revision ? porIndice(revision.estimacion.avisos) : SIN_OBSERVACIONES
  const motivoParaNoCrear = porQueNoSePuedeCrear(revision, huella)

  function cambiar(indice: number, cambio: Correccion) {
    if (!vista) return
    setCorrecciones(c => corregir(vista, c, indice, cambio))
  }

  async function revisar() {
    if (!archivo || !plan) return
    const este = pedido.current
    const revisado = huella
    setRevisando(true)
    setError('')
    try {
      const estimacion = await estimarImportacion(archivo, plan, tenantId)
      if (este === pedido.current) setRevision({ huella: revisado, estimacion })
    } catch (e) {
      if (este === pedido.current) setError(describeError(e) ?? '')
    } finally {
      if (este === pedido.current) setRevisando(false)
    }
  }

  async function crear() {
    if (!archivo || !plan || motivoParaNoCrear) return
    const este = pedido.current
    setCreando(true)
    setError('')
    try {
      setResultado(await importarPlan(archivo, plan, tenantId))
      onCreado()
    } catch (e) {
      // Algo cambió entre «Revisar» y «Crear» (otro creó un rancho en el mismo lugar, por ejemplo):
      // no se creó nada, y los errores nuevos se marcan en el árbol como los de una revisión.
      if (este !== pedido.current) return
      if (e instanceof PlanInvalidoError && revision) {
        setRevision({
          huella,
          estimacion: { ...revision.estimacion, valido: false, errores: e.errores, avisos: e.avisos },
        })
      }
      setError(describeError(e) ?? '')
    } finally {
      setCreando(false)
    }
  }

  if (resultado) return <Resultado resultado={resultado} onListo={onListo} />

  const foco = corregida && elegido !== null ? corregida.poligonos[elegido]?.coordenadas ?? null : null
  const hayCorrecciones = Object.keys(correcciones).length > 0

  return (
    <div className="space-y-4 px-4 pb-6">
      <ZonaDeCarga
        archivo={archivo && { nombre: archivo.name, bytes: archivo.size }}
        cargando={cargando}
        onElegir={f => void subir(f)}
      />

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
      )}

      {vista && corregida && (
        <>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{TEXTO_CASO[vista.caso]}</span>
              <Badge variant="outline">{vista.formato}</Badge>
              {vista.resumen.conAvisos > 0 && (
                <Badge variant="destructive">{vista.resumen.conAvisos} con avisos</Badge>
              )}
              {hayCorrecciones && <Badge variant="secondary">{Object.keys(correcciones).length} corregidos</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">{resumenEnPalabras(corregida)}</p>
            <Leyenda />
          </div>

          <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <Arbol
              vista={corregida}
              elegido={elegido}
              correcciones={correcciones}
              errores={errores.delPoligono}
              avisos={avisos.delPoligono}
              onElegir={i => setElegido(i === elegido ? null : i)}
              onCambiar={cambiar}
              onDeshacer={i => setCorrecciones(c => sinCorreccion(c, i))}
            />
            <div className="space-y-2">
              <GeometryView shapes={formasDe(corregida, elegido)} height={560} foco={foco} />
              {elegido !== null && (
                <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setElegido(null)}>
                  Ver todo
                </button>
              )}
            </div>
          </div>

          <Confirmacion
            revision={revision}
            vigente={revision?.huella === huella}
            errores={errores.generales}
            avisos={avisos.generales}
            motivoParaNoCrear={motivoParaNoCrear}
            revisando={revisando}
            creando={creando}
            hayCorrecciones={hayCorrecciones}
            onRevisar={() => void revisar()}
            onCrear={() => void crear()}
            onDeshacerTodo={() => setCorrecciones({})}
            onElegir={setElegido}
          />
        </>
      )}
    </div>
  )
}

function Leyenda() {
  const items: [string, string, boolean][] = [
    [COLOR_POR_ROL.Rancho, 'Rancho', false],
    [COLOR_POR_ROL.Parcela, 'Parcela', false],
    [COLOR_POR_ROL.RanchoConParcela, 'Rancho + parcela (caso 4)', false],
    [COLOR_DESACTIVADO, 'Desactivado', true],
  ]
  return (
    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
      {items.map(([color, texto, punteado]) => (
        <span key={texto} className="inline-flex items-center gap-1">
          <span className="inline-block size-3 rounded-sm border-2" style={{ borderColor: color, borderStyle: punteado ? 'dashed' : 'solid' }} />
          {texto}
        </span>
      ))}
    </div>
  )
}

interface PropsDeFila {
  vista: VistaPreviaImportacion
  elegido: number | null
  correcciones: Correcciones
  errores: Map<number, ObservacionDelPlan[]>
  avisos: Map<number, ObservacionDelPlan[]>
  onElegir: (indice: number) => void
  onCambiar: (indice: number, cambio: Correccion) => void
  onDeshacer: (indice: number) => void
}

function Arbol(props: PropsDeFila) {
  const arbol = arbolDe(props.vista)
  const fila = (p: PoligonoPrevisto, sangria = false) => <Fila key={p.indice} p={p} sangria={sangria} {...props} />

  return (
    <div className="max-h-[560px] space-y-4 overflow-y-auto rounded-md border p-2">
      {arbol.ranchos.length > 0 && (
        <Grupo titulo={`Ranchos (${arbol.ranchos.length})`}>
          {arbol.ranchos.map(r => (
            <div key={r.rancho.indice}>
              {fila(r.rancho)}
              {r.parcelas.map(p => fila(p, true))}
            </div>
          ))}
        </Grupo>
      )}
      {arbol.caso4.length > 0 && (
        <Grupo titulo={`Cada uno con su propio rancho (${arbol.caso4.length})`}>{arbol.caso4.map(p => fila(p))}</Grupo>
      )}
      {arbol.sinRancho.length > 0 && (
        <Grupo titulo={`Parcelas sin rancho: elegí uno o desactivalas (${arbol.sinRancho.length})`} marcado>
          {arbol.sinRancho.map(p => fila(p))}
        </Grupo>
      )}
      {arbol.desactivados.length > 0 && (
        <Grupo titulo={`Desactivados: no se crean (${arbol.desactivados.length})`}>{arbol.desactivados.map(p => fila(p))}</Grupo>
      )}
    </div>
  )
}

function Grupo({ titulo, marcado = false, children }: { titulo: string; marcado?: boolean; children: ReactNode }) {
  return (
    <section className={`space-y-1 ${marcado ? 'rounded-md border border-destructive/40 bg-destructive/5 p-1' : ''}`}>
      <h3 className={`px-1 text-xs font-semibold uppercase tracking-wide ${marcado ? 'text-destructive' : 'text-muted-foreground'}`}>
        {titulo}
      </h3>
      {children}
    </section>
  )
}

function Fila({ p, sangria, elegido, correcciones, errores, avisos, onElegir, onCambiar, onDeshacer, vista }: PropsDeFila & {
  p: PoligonoPrevisto
  sangria: boolean
}) {
  const esElegido = p.indice === elegido
  const susErrores = errores.get(p.indice) ?? []
  const corregido = correcciones[p.indice] !== undefined

  return (
    <div className={sangria ? 'ml-5 border-l pl-2' : ''}>
      <div className={`flex items-center gap-1 rounded hover:bg-muted ${esElegido ? 'bg-muted' : ''}`}>
        <input
          type="checkbox"
          className="ml-1 size-4 shrink-0 accent-primary"
          checked={p.activo}
          // Una geometría que no se puede importar no se activa: Geocore la rechazaría igual.
          disabled={p.rol === 'NoImportable'}
          onChange={e => onCambiar(p.indice, { activo: e.target.checked })}
          aria-label={`${p.activo ? 'Desactivar' : 'Activar'} «${p.nombre}»`}
        />
        <button
          type="button"
          onClick={() => onElegir(p.indice)}
          aria-pressed={esElegido}
          className="flex min-w-0 flex-1 items-center gap-2 px-1 py-1 text-left text-sm"
        >
          <span
            className="inline-block size-3 shrink-0 rounded-sm border-2"
            style={{ borderColor: colorDe(p), borderStyle: p.activo ? 'solid' : 'dashed' }}
          />
          <span className={`min-w-0 flex-1 truncate ${p.activo ? '' : 'text-muted-foreground line-through'}`}>{p.nombre}</span>
          {corregido && <Badge variant="secondary">corregido</Badge>}
          <span className="shrink-0 text-xs text-muted-foreground">{hectareas(p.areaHa)}</span>
          {susErrores.length > 0 && <Badge variant="destructive">{susErrores.length} error{susErrores.length === 1 ? '' : 'es'}</Badge>}
          {susErrores.length === 0 && p.avisos.length > 0 && <Badge variant="outline">{p.avisos.length}</Badge>}
        </button>
      </div>
      {esElegido && (
        <Editor
          p={p}
          vista={vista}
          corregido={corregido}
          errores={susErrores}
          avisos={avisos.get(p.indice) ?? []}
          onCambiar={c => onCambiar(p.indice, c)}
          onDeshacer={() => onDeshacer(p.indice)}
        />
      )}
    </div>
  )
}

function Editor({ p, vista, corregido, errores, avisos, onCambiar, onDeshacer }: {
  p: PoligonoPrevisto
  vista: VistaPreviaImportacion
  corregido: boolean
  errores: ObservacionDelPlan[]
  avisos: ObservacionDelPlan[]
  onCambiar: (c: Correccion) => void
  onDeshacer: () => void
}) {
  const ranchos = ranchosPosibles(vista, p.indice)

  return (
    <div className="mb-2 ml-7 space-y-2 rounded-md border bg-background p-2 text-xs">
      {p.rol === 'NoImportable' ? (
        <p className="text-destructive">Este polígono no se puede importar: queda desactivado. {p.motivo}</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-muted-foreground">Qué es</span>
            <Selector
              items={ROLES_ELEGIBLES}
              value={p.rol}
              onValueChange={v => { if (v) onCambiar({ rol: v as RolPropuesto }) }}
              size="sm"
              className="w-full"
            />
          </label>
          {p.rol === 'Parcela' && (
            <label className="space-y-1">
              <span className="text-muted-foreground">En qué rancho</span>
              <Selector
                items={ranchos}
                value={p.rancho === null ? '' : String(p.rancho)}
                onValueChange={v => { if (v) onCambiar({ rancho: Number(v) }) }}
                placeholder="Elegí un rancho"
                vacio="No hay ranchos activos en el archivo"
                size="sm"
                className="w-full"
              />
            </label>
          )}
          <label className="space-y-1 sm:col-span-2">
            <span className="text-muted-foreground">Nombre</span>
            <Input
              value={p.nombre}
              maxLength={100}
              onChange={e => onCambiar({ nombre: e.target.value })}
              aria-invalid={p.nombre.trim() === '' || undefined}
            />
          </label>
        </div>
      )}

      <p className="text-muted-foreground">
        <span className="font-medium text-foreground">Lo propuesto:</span> {p.motivo} · {origenDe(p)} · {p.vertices} vértices
      </p>
      {p.avisos.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">{p.avisos.map((a, i) => <li key={i}>{a.texto}</li>)}</ul>
      )}
      {errores.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-4 text-destructive">{errores.map((e, i) => <li key={i}>{e.texto}</li>)}</ul>
      )}
      {avisos.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-4 text-amber-700 dark:text-amber-400">{avisos.map((a, i) => <li key={i}>{a.texto}</li>)}</ul>
      )}
      {corregido && (
        <button type="button" className="text-muted-foreground underline" onClick={onDeshacer}>
          Volver a lo propuesto para este polígono
        </button>
      )}
    </div>
  )
}

function Confirmacion({
  revision, vigente, errores, avisos, motivoParaNoCrear, revisando, creando, hayCorrecciones,
  onRevisar, onCrear, onDeshacerTodo, onElegir,
}: {
  revision: Revision | null
  vigente: boolean
  errores: ObservacionDelPlan[]
  avisos: ObservacionDelPlan[]
  motivoParaNoCrear: string | null
  revisando: boolean
  creando: boolean
  hayCorrecciones: boolean
  onRevisar: () => void
  onCrear: () => void
  onDeshacerTodo: () => void
  onElegir: (indice: number) => void
}) {
  const e = revision?.estimacion

  return (
    <section className="space-y-3 rounded-md border p-3">
      {e && (
        <div className={`space-y-2 text-sm ${vigente ? '' : 'opacity-60'}`}>
          <p><span className="font-medium">Crearía {altasEnPalabras(e)}</span></p>
          <p className="text-muted-foreground">{ocupacionEnPalabras(e)}</p>
          {e.demasiadoGrandes.length > 0 && (
            <p className="text-amber-700 dark:text-amber-400">
              {e.demasiadoGrandes.length === 1 ? 'Un rancho es demasiado grande' : `${e.demasiadoGrandes.length} ranchos son demasiado grandes`} para
              el worker y su mapa va a fallar: {e.demasiadoGrandes.map(d => d.nombre).join(', ')}. Se crean igual.
            </p>
          )}
          {[...errores, ...avisos].length > 0 && (
            <ul className="list-disc space-y-0.5 pl-4">
              {errores.map((o, i) => <li key={`e${i}`} className="text-destructive">{o.texto}</li>)}
              {avisos.map((o, i) => <li key={`a${i}`} className="text-amber-700 dark:text-amber-400">{o.texto}</li>)}
            </ul>
          )}
          {e.errores.some(o => o.indice !== null) && (
            <div className="flex flex-wrap gap-1">
              <span className="text-xs text-muted-foreground">Con errores:</span>
              {[...new Set(e.errores.flatMap(o => (o.indice === null ? [] : [o.indice])))].map(i => (
                <button key={i} type="button" className="text-xs text-destructive underline" onClick={() => onElegir(i)}>
                  polígono {i}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={onRevisar} disabled={revisando || creando}>
          {revisando ? 'Revisando…' : 'Revisar'}
        </Button>
        <Button onClick={onCrear} disabled={motivoParaNoCrear !== null || revisando || creando}>
          {creando ? 'Creando…' : e && vigente ? `Crear ${e.ranchos} ranchos y ${e.parcelas} parcelas` : 'Crear'}
        </Button>
        {hayCorrecciones && (
          <Button variant="ghost" onClick={onDeshacerTodo} disabled={creando}>Volver a todo lo propuesto</Button>
        )}
      </div>
      {motivoParaNoCrear && <p className="text-xs text-muted-foreground">{motivoParaNoCrear}</p>}
    </section>
  )
}

function Resultado({ resultado, onListo }: { resultado: ImportacionRealizada; onListo: () => void }) {
  const { ranchos, parcelas, sinEncolar, avisos } = resultado
  return (
    <div className="space-y-4 px-4 pb-6">
      <div className="rounded-md border border-emerald-600/40 bg-emerald-600/10 px-3 py-2 text-sm">
        Se crearon {ranchos.length} {ranchos.length === 1 ? 'rancho' : 'ranchos'} y {parcelas.length}{' '}
        {parcelas.length === 1 ? 'parcela' : 'parcelas'}. Su procesamiento satelital ya está en camino: se sigue en Procesos.
      </div>
      {sinEncolar.length > 0 && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {sinEncolar.length} {sinEncolar.length === 1 ? 'quedó creado' : 'quedaron creados'} pero sin procesar: su alta no
          se pudo encolar. Aparecen como fallidos en Procesos, y se reprocesan desde ahí.
        </div>
      )}
      {avisos.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-4 text-sm text-amber-700 dark:text-amber-400">
          {avisos.map((a, i) => <li key={i}>{a.texto}</li>)}
        </ul>
      )}
      <ul className="max-h-80 space-y-0.5 overflow-y-auto text-sm">
        {ranchos.map(r => (
          <li key={r.id}>
            <span className="font-medium">{r.nombre}</span>
            {parcelas.filter(p => p.ranchoId === r.id).map(p => (
              <span key={p.id} className="ml-2 text-muted-foreground">· {p.nombre}</span>
            ))}
          </li>
        ))}
      </ul>
      <Button onClick={onListo}>Listo</Button>
    </div>
  )
}
