import { useRef, useState, type ReactNode } from 'react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import GeometryView from '@/components/GeometryView'
import ZonaDeCarga from '@/components/importacion/ZonaDeCarga'
import {
  describeError, previsualizarImportacion,
  type PoligonoPrevisto, type VistaPreviaImportacion,
} from '@/lib/api'
import {
  COLOR_DESACTIVADO, COLOR_POR_ROL, TEXTO_CASO, TEXTO_ROL,
  arbolDe, colorDe, formasDe, hectareas, origenDe, resumenEnPalabras,
} from '@/lib/importacion'

/**
 * «Crear extensión y subgrupos», la vista previa (K.5, Geocore `DECISIONS #69`): se sube un
 * KML, GeoJSON o WKT y se ve, **antes de crear nada**, qué ranchos y parcelas saldrían, en un
 * árbol y en el mapa al lado. Sólo mirar: corregir y confirmar es K.6.
 *
 * El contenido va con `key={tenantId}`: al cambiar de tenant arranca de cero, sin la vista del
 * archivo anterior, que era de otro tenant.
 */
export default function ImportacionSheet({ abierto, tenantId, onClose }: {
  abierto: boolean
  tenantId: string
  onClose: () => void
}) {
  return (
    <Sheet open={abierto} onOpenChange={a => { if (!a) onClose() }}>
      <SheetContent className="data-[side=right]:w-full data-[side=right]:sm:max-w-6xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Crear extensión y subgrupos</SheetTitle>
          <SheetDescription>
            Subí un KML, GeoJSON o WKT y mirá qué ranchos y parcelas saldrían. Todavía no se crea nada.
          </SheetDescription>
        </SheetHeader>
        {abierto && <VistaPrevia key={tenantId} tenantId={tenantId} />}
      </SheetContent>
    </Sheet>
  )
}

function VistaPrevia({ tenantId }: { tenantId: string }) {
  const [vista, setVista] = useState<VistaPreviaImportacion | null>(null)
  const [archivo, setArchivo] = useState<{ nombre: string; bytes: number } | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [elegido, setElegido] = useState<number | null>(null)
  // Si se elige otro archivo antes de que vuelva el primero, la respuesta vieja se descarta:
  // si no, el mapa podría quedar mostrando un archivo con el nombre de otro.
  const pedido = useRef(0)

  async function subir(f: File) {
    const este = ++pedido.current
    setArchivo({ nombre: f.name, bytes: f.size })
    setVista(null)
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

  const foco = vista && elegido !== null ? vista.poligonos[elegido]?.coordenadas ?? null : null

  return (
    <div className="space-y-4 px-4 pb-6">
      <ZonaDeCarga archivo={archivo} cargando={cargando} onElegir={f => void subir(f)} />

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
      )}

      {vista && (
        <>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{TEXTO_CASO[vista.caso]}</span>
              <Badge variant="outline">{vista.formato}</Badge>
              {vista.resumen.conAvisos > 0 && (
                <Badge variant="destructive">{vista.resumen.conAvisos} con avisos</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{resumenEnPalabras(vista)}</p>
            <Leyenda />
          </div>

          <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <Arbol vista={vista} elegido={elegido} onElegir={i => setElegido(i === elegido ? null : i)} />
            <div className="space-y-2">
              <GeometryView shapes={formasDe(vista, elegido)} height={560} foco={foco} />
              {elegido !== null && (
                <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setElegido(null)}>
                  Ver todo
                </button>
              )}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Es sólo la vista previa: nada se creó. Corregir lo propuesto y confirmar llega en el paso siguiente.
          </p>
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

function Arbol({ vista, elegido, onElegir }: {
  vista: VistaPreviaImportacion
  elegido: number | null
  onElegir: (indice: number) => void
}) {
  const arbol = arbolDe(vista)
  const fila = (p: PoligonoPrevisto, sangria = false) => (
    <Fila key={p.indice} p={p} sangria={sangria} elegido={p.indice === elegido} onElegir={onElegir} />
  )

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
      {arbol.desactivados.length > 0 && (
        <Grupo titulo={`Desactivados: no se crearían (${arbol.desactivados.length})`}>{arbol.desactivados.map(p => fila(p))}</Grupo>
      )}
    </div>
  )
}

function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-1">
      <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</h3>
      {children}
    </section>
  )
}

function Fila({ p, sangria, elegido, onElegir }: {
  p: PoligonoPrevisto
  sangria: boolean
  elegido: boolean
  onElegir: (indice: number) => void
}) {
  return (
    <div className={sangria ? 'ml-5 border-l pl-2' : ''}>
      <button
        type="button"
        onClick={() => onElegir(p.indice)}
        aria-pressed={elegido}
        className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-muted ${elegido ? 'bg-muted' : ''}`}
      >
        <span
          className="inline-block size-3 shrink-0 rounded-sm border-2"
          style={{ borderColor: colorDe(p), borderStyle: p.activo ? 'solid' : 'dashed' }}
        />
        <span className="min-w-0 flex-1 truncate">{p.nombre}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{hectareas(p.areaHa)}</span>
        {p.avisos.length > 0 && <Badge variant="destructive">{p.avisos.length}</Badge>}
      </button>
      {elegido && (
        <div className="mb-2 ml-7 space-y-1 text-xs">
          <p><span className="font-medium">{TEXTO_ROL[p.rol]}.</span> {p.motivo}</p>
          <p className="text-muted-foreground">{origenDe(p)} · {p.vertices} vértices</p>
          {p.avisos.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-4 text-destructive">
              {p.avisos.map((a, i) => <li key={i}>{a.texto}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
