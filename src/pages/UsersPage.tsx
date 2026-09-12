import { useEffect, useState } from 'react'
import { getUsers, createUserFull, deactivateUser, activateUser, changeRole, describeError, type User, type PagedResult } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const ROLES = ['Client', 'TerraAdmin', 'TerraSupport']
const PRIVILEGED_ROLES = ['TerraAdmin', 'TerraSupport']

export default function UsersPage() {
  const [data, setData] = useState<PagedResult<User> | null>(null)
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ email: '', password: '', name: '', lastName: '', globalRole: 'Client' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [pageError, setPageError] = useState('')

  useEffect(() => { load() }, [page])

  // Carga una página de usuarios. En éxito limpia el banner de error; si falla (500,
  // red, ngrok caído) lo muestra en vez de dejar la tabla vacía sin explicación [B-1].
  async function load() {
    try {
      setData(await getUsers(page))
      setPageError('')
    } catch (err) {
      const msg = describeError(err)
      if (msg) setPageError(msg)
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    // [I-1] Crear una cuenta con privilegios elevados exige confirmación explícita.
    if (PRIVILEGED_ROLES.includes(form.globalRole) &&
        !window.confirm(`Vas a crear una cuenta con rol ${form.globalRole}, con acceso administrativo al panel. ¿Continuar?`)) {
      return
    }
    setLoading(true)
    setError('')
    try {
      await createUserFull(form)
      setOpen(false)
      setForm({ email: '', password: '', name: '', lastName: '', globalRole: 'Client' })
      load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  // Activa/desactiva un usuario a nivel global. El backend impide desactivar al último
  // TerraAdmin activo [N-3]; ese 409 llega aquí y se muestra en el banner.
  async function toggleActive(user: User) {
    try {
      user.isActive ? await deactivateUser(user.id) : await activateUser(user.id)
      load()
    } catch (err) {
      const msg = describeError(err)
      if (msg) setPageError(msg)
    }
  }

  // Cambia el rol global de un usuario desde el Select de la tabla. No hace nada si el
  // rol no cambió. Para roles privilegiados exige confirmación explícita [I-1]. El
  // backend valida la regla de "último admin" [N-3] y la autorización real.
  // `newRole` es `string | null` porque Base UI emite null al limpiar la selección;
  // aquí null se ignora (no hay caso de "sin rol").
  async function handleChangeRole(user: User, newRole: string | null) {
    if (!newRole || newRole === user.globalRole) return
    // [I-1] Elevar a un rol privilegiado exige confirmación explícita.
    if (PRIVILEGED_ROLES.includes(newRole) &&
        !window.confirm(`Vas a asignar el rol ${newRole} a ${user.email}, con acceso administrativo al panel. ¿Continuar?`)) {
      return
    }
    try {
      await changeRole(user.id, newRole)
      load()
    } catch (err) {
      const msg = describeError(err)
      if (msg) setPageError(msg)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Usuarios</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          {/* Base UI usa `render` (no `asChild` de Radix): fusiona los props del
              trigger sobre el Button en vez de clonar un hijo. */}
          <DialogTrigger render={<Button>Nuevo usuario</Button>} />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Crear usuario</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-3 mt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Nombre</Label>
                  <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
                </div>
                <div className="space-y-1">
                  <Label>Apellido</Label>
                  <Input value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} required />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
              </div>
              <div className="space-y-1">
                <Label>Contraseña</Label>
                <Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required />
              </div>
              <div className="space-y-1">
                <Label>Rol</Label>
                <Select value={form.globalRole} onValueChange={v => setForm(f => ({ ...f, globalRole: v ?? f.globalRole }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {error && <p className="text-destructive text-sm">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Creando...' : 'Crear usuario'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {pageError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {pageError}
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Rol</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data?.items.map(u => (
            <TableRow key={u.id}>
              <TableCell>{u.name} {u.lastName}</TableCell>
              <TableCell>{u.email}</TableCell>
              <TableCell>
                <Select value={u.globalRole} onValueChange={v => handleChangeRole(u, v)}>
                  <SelectTrigger className="h-8 w-[150px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                <Badge variant={u.isActive ? 'default' : 'secondary'}>
                  {u.isActive ? 'Activo' : 'Inactivo'}
                </Badge>
              </TableCell>
              <TableCell>
                <Button variant="ghost" size="sm" onClick={() => toggleActive(u)}>
                  {u.isActive ? 'Desactivar' : 'Activar'}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {data && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{data.total} usuarios</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Anterior</Button>
            <Button variant="outline" size="sm" disabled={data.items.length < data.pageSize} onClick={() => setPage(p => p + 1)}>Siguiente</Button>
          </div>
        </div>
      )}
    </div>
  )
}
