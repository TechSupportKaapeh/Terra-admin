import { useEffect, useState } from 'react'
import { getTenantMembers, addMember, removeMember, changeMemberRole, suspendMember, describeError, type Member, type User } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import Selector from '@/components/Selector'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const MEMBER_ROLES = [{ value: 'Admin', label: 'Admin' }, { value: 'Member', label: 'Member' }]

interface Props {
  tenantId: string
  tenantName: string
  users: User[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onChanged: () => void
}

/**
 * Diálogo de gestión de miembros de un tenant. Vive como componente aparte (y no
 * inline en TenantsPage) porque concentra varias operaciones cruzadas (listar, agregar,
 * cambiar rol, suspender, quitar) que de otro modo inflarían la página.
 *
 * Recibe `users` (la lista global ya cargada en TenantsPage) para ofrecer candidatos a
 * agregar sin un fetch adicional, y notifica con `onChanged` para que el padre refresque
 * el `memberCount` de la tabla.
 */
export default function TenantMembersDialog({ tenantId, tenantName, users, open, onOpenChange, onChanged }: Props) {
  const [members, setMembers] = useState<Member[]>([])
  const [error, setError] = useState('')
  const [addUserId, setAddUserId] = useState('')
  const [addRole, setAddRole] = useState('Member')

  // Carga perezosa: solo trae miembros cuando el diálogo se abre (no al montar la fila),
  // y re-carga si cambia el tenant objetivo.
  useEffect(() => { if (open) load() }, [open, tenantId])

  /** Trae la lista de miembros del tenant. Limpia el error en éxito; lo muestra si falla. */
  async function load() {
    try {
      setMembers(await getTenantMembers(tenantId))
      setError('')
    } catch (err) {
      const msg = describeError(err)
      if (msg) setError(msg)
    }
  }

  /**
   * Envoltorio para toda mutación de miembros (add/role/suspend/remove). Centraliza el
   * patrón "ejecutar → recargar lista → avisar al padre → capturar error", evitando
   * repetir try/catch en cada handler. `describeError` devuelve null en sesión expirada
   * (ya hay redirección en curso), así que no pisamos la pantalla con un error inútil.
   */
  async function run(action: Promise<void>) {
    try {
      await action
      await load()
      onChanged()
    } catch (err) {
      const msg = describeError(err)
      if (msg) setError(msg)
    }
  }

  /** Agrega el usuario seleccionado con el rol elegido y resetea el formulario de alta. */
  async function handleAdd() {
    if (!addUserId) return
    await run(addMember(tenantId, addUserId, addRole))
    setAddUserId('')
    setAddRole('Member')
  }

  // Candidatos a agregar = usuarios que aún no son miembros (evita duplicados, que el
  // dominio rechazaría con error). El Set hace la exclusión O(1).
  const memberIds = new Set(members.map(m => m.userId))
  const candidates = users.filter(u => !memberIds.has(u.id))

  // Color del badge según estado de membresía: activo (neutro), suspendido (rojo), salió (gris).
  const statusVariant = (s: string) => s === 'Active' ? 'default' : s === 'Suspended' ? 'destructive' : 'secondary'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Miembros — {tenantName}</DialogTitle>
        </DialogHeader>

        <div className="flex items-end gap-2">
          <div className="space-y-1 flex-1">
            <Label className="text-xs">Agregar usuario</Label>
            <Selector
              items={candidates.map(u => ({ value: u.id, label: `${u.name} ${u.lastName} — ${u.email}` }))}
              value={addUserId}
              onValueChange={setAddUserId}
              placeholder="Selecciona un usuario"
              vacio="No hay usuarios disponibles"
              className="h-9"
            />
          </div>
          <div className="space-y-1 w-32">
            <Label className="text-xs">Rol</Label>
            <Selector
              items={MEMBER_ROLES}
              value={addRole}
              onValueChange={v => setAddRole(v || 'Member')}
              className="h-9"
            />
          </div>
          <Button className="h-9" onClick={handleAdd} disabled={!addUserId}>Agregar</Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuario</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map(m => (
              <TableRow key={m.userId}>
                <TableCell>
                  <div className="font-medium">{m.name} {m.lastName}</div>
                  <div className="text-xs text-muted-foreground">{m.email}</div>
                </TableCell>
                <TableCell>
                  {/* Evita un PATCH si el rol no cambió: el dominio rechaza ChangeRole
                      al mismo rol con DomainException. */}
                  <Selector
                    items={MEMBER_ROLES}
                    value={m.role}
                    onValueChange={v => { if (v && v !== m.role) run(changeMemberRole(tenantId, m.userId, v)) }}
                    className="h-8 w-[120px]"
                  />
                </TableCell>
                <TableCell><Badge variant={statusVariant(m.status)}>{m.status}</Badge></TableCell>
                <TableCell className="flex justify-end gap-1">
                  {m.status === 'Active' && (
                    <Button variant="ghost" size="sm" onClick={() => run(suspendMember(tenantId, m.userId))}>Suspender</Button>
                  )}
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => run(removeMember(tenantId, m.userId))}>Quitar</Button>
                </TableCell>
              </TableRow>
            ))}
            {members.length === 0 && (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground text-sm">Sin miembros</TableCell></TableRow>
            )}
          </TableBody>
        </Table>

        {error && <p className="text-destructive text-sm">{error}</p>}
      </DialogContent>
    </Dialog>
  )
}
