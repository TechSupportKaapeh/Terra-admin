import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Session } from '@supabase/supabase-js'
import LoginPage from '@/pages/LoginPage'
import UsersPage from '@/pages/UsersPage'
import TenantsPage from '@/pages/TenantsPage'
import RanchosPage from '@/pages/RanchosPage'
import { Button } from '@/components/ui/button'

type Tab = 'usuarios' | 'tenants' | 'ranchos'

// [B-2] Gate COSMÉTICO. Decodifica el payload del JWT SIN verificar la firma, solo
// para ocultar la UI de admin a no-staff. La autorización real la hace Geocore, que
// valida la firma ES256 del token en cada request. Un localStorage manipulado podría
// mostrar esta UI, pero el backend rechaza toda operación. El try/catch evita que un
// token malformado tumbe la app (JSON.parse/atob lanzarían).
function readGlobalRole(accessToken: string): string | undefined {
  try {
    return JSON.parse(atob(accessToken.split('.')[1])).global_role
  } catch {
    return undefined
  }
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [tab, setTab] = useState<Tab>('usuarios')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (loading) return null

  if (!session) return <LoginPage />

  const globalRole = readGlobalRole(session.access_token)

  if (globalRole !== 'TerraAdmin' && globalRole !== 'TerraSupport') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/40">
        <div className="text-center">
          <p className="text-lg font-medium">Acceso denegado</p>
          <p className="text-muted-foreground text-sm mt-1">Solo TerraAdmin o TerraSupport pueden acceder a este panel.</p>
          <Button className="mt-4" variant="outline" onClick={() => supabase.auth.signOut()}>Cerrar sesión</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-card border-b px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <span className="font-semibold text-lg">Terra Admin</span>
          <nav className="flex gap-1">
            {(['usuarios', 'tenants', 'ranchos'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 rounded-md text-sm capitalize transition-colors ${tab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
              >
                {t}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>{session.user.email}</span>
          <Button variant="outline" size="sm" onClick={() => supabase.auth.signOut()}>Salir</Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6">
        {tab === 'usuarios' && <UsersPage />}
        {tab === 'tenants' && <TenantsPage />}
        {tab === 'ranchos' && <RanchosPage />}
      </main>
    </div>
  )
}
