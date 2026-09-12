import { useEffect, useState } from 'react'
import { getTenants, createTenant, suspendTenant, deactivateTenant, getUsers, describeError, type Tenant, type PagedResult, type User } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import TenantMembersDialog from '@/components/TenantMembersDialog'

export default function TenantsPage() {
  const [data, setData] = useState<PagedResult<Tenant> | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', timezone: 'America/Mexico_City', defaultLanguage: 'es', maxUsers: 10, adminUserId: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [pageError, setPageError] = useState('')
  const [membersOf, setMembersOf] = useState<Tenant | null>(null)

  useEffect(() => { load() }, [page])
  useEffect(() => { getUsers(1, 200).then(r => setUsers(r.items)).catch(() => {}) }, [])

  async function load() {
    try {
      setData(await getTenants(page))
      setPageError('')
    } catch (err) {
      const msg = describeError(err)
      if (msg) setPageError(msg)
    }
  }

  async function runAction(action: Promise<void>) {
    try {
      await action
      load()
    } catch (err) {
      const msg = describeError(err)
      if (msg) setPageError(msg)
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await createTenant(form)
      setOpen(false)
      setForm({ name: '', timezone: 'America/Mexico_City', defaultLanguage: 'es', maxUsers: 10, adminUserId: '' })
      load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  const statusVariant = (s: string) => s === 'Active' ? 'default' : s === 'Suspended' ? 'destructive' : 'secondary'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Tenants</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          {/* Base UI: `render` fusiona los props del trigger sobre el Button (no `asChild`). */}
          <DialogTrigger render={<Button>Nuevo tenant</Button>} />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Crear tenant</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-3 mt-2">
              <div className="space-y-1">
                <Label>Nombre</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Timezone</Label>
                  <Input value={form.timezone} onChange={e => setForm(f => ({ ...f, timezone: e.target.value }))} required />
                </div>
                <div className="space-y-1">
                  <Label>Idioma</Label>
                  <Select value={form.defaultLanguage} onValueChange={v => setForm(f => ({ ...f, defaultLanguage: v ?? f.defaultLanguage }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="es">Español</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label>Máx. usuarios</Label>
                <Input type="number" min={1} value={form.maxUsers} onChange={e => setForm(f => ({ ...f, maxUsers: Number(e.target.value) }))} required />
              </div>
              <div className="space-y-1">
                <Label>Admin inicial</Label>
                <Select value={form.adminUserId} onValueChange={v => setForm(f => ({ ...f, adminUserId: v ?? f.adminUserId }))}>
                  <SelectTrigger><SelectValue placeholder="Selecciona un usuario" /></SelectTrigger>
                  <SelectContent>
                    {users.map(u => <SelectItem key={u.id} value={u.id}>{u.name} {u.lastName} — {u.email}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {error && <p className="text-destructive text-sm">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Creando...' : 'Crear tenant'}
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
            <TableHead>Slug</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Miembros</TableHead>
            <TableHead>Máx.</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data?.items.map(t => (
            <TableRow key={t.id}>
              <TableCell className="font-medium">{t.name}</TableCell>
              <TableCell className="text-muted-foreground">{t.slug}</TableCell>
              <TableCell><Badge variant={statusVariant(t.status)}>{t.status}</Badge></TableCell>
              <TableCell>{t.memberCount}</TableCell>
              <TableCell>{t.maxUsers}</TableCell>
              <TableCell className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => setMembersOf(t)}>Miembros</Button>
                {t.status === 'Active' && (
                  <Button variant="ghost" size="sm" onClick={() => runAction(suspendTenant(t.id))}>Suspender</Button>
                )}
                {t.status !== 'Inactive' && (
                  <Button variant="ghost" size="sm" onClick={() => runAction(deactivateTenant(t.id))}>Desactivar</Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {data && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{data.total} tenants</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Anterior</Button>
            <Button variant="outline" size="sm" disabled={data.items.length < data.pageSize} onClick={() => setPage(p => p + 1)}>Siguiente</Button>
          </div>
        </div>
      )}

      {membersOf && (
        <TenantMembersDialog
          tenantId={membersOf.id}
          tenantName={membersOf.name}
          users={users}
          open={!!membersOf}
          onOpenChange={open => { if (!open) setMembersOf(null) }}
          onChanged={load}
        />
      )}
    </div>
  )
}
