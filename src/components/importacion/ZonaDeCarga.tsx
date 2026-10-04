import { useRef, useState } from 'react'
import { FileText, LoaderCircle, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EXTENSIONES_IMPORTABLES, problemaDelArchivo, tamanoDeArchivo } from '@/lib/importacion'

/**
 * Dónde se elige el archivo de una importación: un botón con el estilo del panel, o arrastrarlo y
 * soltarlo. Reemplaza al `<input type="file">` del navegador, que se ve distinto en cada uno y
 * habla en el idioma del sistema.
 *
 * El input sigue estando —oculto— porque es lo que abre el diálogo del sistema y lo que lee un
 * lector de pantalla a través del botón. Lo que se suelta se valida con `problemaDelArchivo`: el
 * `accept` del input no filtra lo que llega arrastrado.
 */
export default function ZonaDeCarga({ archivo, cargando, onElegir }: {
  /** El elegido, para mostrarlo; null si todavía no hay. */
  archivo: { nombre: string; bytes: number } | null
  cargando: boolean
  onElegir: (archivo: File) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [encima, setEncima] = useState(false)
  const [problema, setProblema] = useState<string | null>(null)

  function recibir(f: File | undefined) {
    if (!f) return
    const p = problemaDelArchivo(f.name, f.size)
    setProblema(p)
    if (!p) onElegir(f)
  }

  const abrir = () => input.current?.click()

  return (
    <div className="space-y-2">
      <div
        onDragOver={e => { e.preventDefault(); setEncima(true) }}
        onDragLeave={() => setEncima(false)}
        onDrop={e => { e.preventDefault(); setEncima(false); if (!cargando) recibir(e.dataTransfer.files[0]) }}
        className={`flex flex-wrap items-center gap-4 rounded-lg border-2 border-dashed px-4 py-4 transition-colors ${
          encima ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 bg-muted/20'
        }`}
      >
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-background">
          {cargando
            ? <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
            : archivo ? <FileText className="size-5 text-primary" /> : <Upload className="size-5 text-muted-foreground" />}
        </div>

        <div className="min-w-0 flex-1 text-sm">
          {archivo ? (
            <>
              <p className="truncate font-medium">{archivo.nombre}</p>
              <p className="text-muted-foreground">
                {cargando ? 'Leyendo y clasificando…' : tamanoDeArchivo(archivo.bytes)}
              </p>
            </>
          ) : (
            <>
              <p className="font-medium">Arrastrá el archivo acá, o elegilo</p>
              <p className="text-muted-foreground">KML, GeoJSON o WKT · hasta 10 MB</p>
            </>
          )}
        </div>

        <Button type="button" variant={archivo ? 'outline' : 'default'} onClick={abrir} disabled={cargando}>
          {archivo ? 'Elegir otro' : 'Elegir archivo'}
        </Button>

        <input
          ref={input}
          type="file"
          accept={EXTENSIONES_IMPORTABLES}
          className="hidden"
          onChange={e => { recibir(e.target.files?.[0]); e.target.value = '' }}
        />
      </div>

      {problema && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{problema}</div>
      )}
    </div>
  )
}
