import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import ServiciosPanel from '@/components/diagnostico/ServiciosPanel'
import PilotoTiles from '@/components/diagnostico/PilotoTiles'
import DatosPorTenant from '@/components/diagnostico/DatosPorTenant'

/**
 * Diagnóstico de la plataforma. Sólo para TerraAdmin.
 *
 * App.tsx no muestra esta pestaña a TerraSupport, pero ese gate es cosmético
 * [B-2]. Lo que de verdad protege el diagnóstico de servicios es la política
 * `TerraAdmin` de `GET /api/admin/diagnostico` en Geocore. La prueba de tiles
 * usa endpoints que cualquier usuario autenticado ya tiene (su token de mapa y
 * sus tiles), así que no abre nada nuevo.
 */
export default function DiagnosticoPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Diagnóstico</h1>
        <p className="text-sm text-muted-foreground">
          Estado de Geocore, el tileserver y el worker, una prueba de la cadena de tiles de
          punta a punta, y qué datos tiene cada tenant.
        </p>
      </div>
      <Tabs defaultValue="servicios">
        <TabsList>
          <TabsTrigger value="servicios">Servicios</TabsTrigger>
          <TabsTrigger value="tiles">Tiles</TabsTrigger>
          <TabsTrigger value="datos">Datos</TabsTrigger>
        </TabsList>
        <TabsContent value="servicios" className="pt-2"><ServiciosPanel /></TabsContent>
        <TabsContent value="tiles" className="pt-2"><PilotoTiles /></TabsContent>
        <TabsContent value="datos" className="pt-2"><DatosPorTenant /></TabsContent>
      </Tabs>
    </div>
  )
}
