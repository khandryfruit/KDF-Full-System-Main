import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Shield, Plus, Edit2, Trash2, CheckCircle, AlertCircle, Lock, Users,
  ChevronDown, ChevronUp, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

const authH  = () => ({ Authorization: `Bearer ${localStorage.getItem("kdf_admin_token") ?? ""}`, "Content-Type": "application/json" });
const apiFetch = (url: string, opts?: RequestInit) =>
  fetch(url, { ...opts, headers: { ...authH(), ...(opts?.headers ?? {}) } }).then(r => r.json());

type Permission = { key: string; name: string; module: string; description?: string };
type Role = { id: number; name: string; slug: string; description?: string; color: string; isSystem: boolean; permissions: string[]; userCount: number };

/* ─── Permission Matrix ──────────────────────────────────── */
function PermMatrix({ selected, permissions, onChange }: {
  selected: string[]; permissions: Permission[]; onChange: (keys: string[]) => void;
}) {
  const modules = [...new Set(permissions.map(p => p.module))];
  const [expanded, setExpanded] = useState<Set<string>>(new Set(modules));
  const toggle = (m: string) => setExpanded(prev => { const s = new Set(prev); s.has(m) ? s.delete(m) : s.add(m); return s; });
  const togglePerm = (key: string) => onChange(selected.includes(key) ? selected.filter(k => k !== key) : [...selected, key]);
  const toggleModule = (m: string) => {
    const mKeys = permissions.filter(p => p.module === m).map(p => p.key);
    const allSelected = mKeys.every(k => selected.includes(k));
    if (allSelected) onChange(selected.filter(k => !mKeys.includes(k)));
    else onChange([...new Set([...selected, ...mKeys])]);
  };

  return (
    <div className="border border-border rounded-xl overflow-hidden divide-y divide-border">
      {modules.map(m => {
        const mPerms  = permissions.filter(p => p.module === m);
        const selCount = mPerms.filter(p => selected.includes(p.key)).length;
        const allSel   = selCount === mPerms.length;
        const partial  = selCount > 0 && !allSel;
        return (
          <div key={m}>
            <div className="flex items-center gap-3 px-4 py-2.5 bg-muted/30 cursor-pointer" onClick={() => toggle(m)}>
              <input type="checkbox" checked={allSel} ref={el => { if (el) el.indeterminate = partial; }}
                onChange={() => toggleModule(m)} onClick={e => e.stopPropagation()}
                className="accent-primary w-4 h-4" />
              <span className="font-semibold text-sm flex-1">{m}</span>
              <Badge variant="secondary" className="text-[10px]">{selCount}/{mPerms.length}</Badge>
              {expanded.has(m) ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </div>
            {expanded.has(m) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 divide-y divide-border/50">
                {mPerms.map(p => (
                  <label key={p.key} className="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-muted/20 transition-colors">
                    <input type="checkbox" checked={selected.includes(p.key)} onChange={() => togglePerm(p.key)}
                      className="accent-primary w-3.5 h-3.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{p.name}</p>
                      <p className="text-[10px] font-mono text-muted-foreground">{p.key}</p>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Role Modal ─────────────────────────────────────────── */
function RoleModal({ role, permissions, onClose, onSave }: {
  role?: Role; permissions: Permission[]; onClose: () => void; onSave: (d: any) => void;
}) {
  const isEdit = !!role;
  const [name, setName]   = useState(role?.name ?? "");
  const [desc, setDesc]   = useState(role?.description ?? "");
  const [color, setColor] = useState(role?.color ?? "#6366f1");
  const [selectedPerms, setSelectedPerms] = useState<string[]>(role?.permissions ?? []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            {isEdit ? `Edit Role: ${role!.name}` : "Create Custom Role"}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl">×</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Role Name *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Content Writer" disabled={isEdit && role!.isSystem} />
            </div>
            <div className="space-y-1.5">
              <Label>Color</Label>
              <div className="flex gap-2">
                <input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-10 h-9 rounded border border-border cursor-pointer p-1" />
                <Input value={color} onChange={e => setColor(e.target.value)} className="flex-1 font-mono text-sm" />
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input value={desc} onChange={e => setDesc(e.target.value)} placeholder="What can this role do?" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Permissions ({selectedPerms.length}/{permissions.length})</Label>
              <div className="flex gap-2">
                <button onClick={() => setSelectedPerms(permissions.map(p => p.key))} className="text-xs text-primary hover:underline">Select All</button>
                <span className="text-muted-foreground">·</span>
                <button onClick={() => setSelectedPerms([])} className="text-xs text-destructive hover:underline">Clear All</button>
              </div>
            </div>
            <PermMatrix selected={selectedPerms} permissions={permissions} onChange={setSelectedPerms} />
          </div>
        </div>
        <div className="flex gap-3 p-5 border-t border-border">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button onClick={() => onSave({ name, description: desc, color, permissions: selectedPerms })} className="flex-1 gap-2">
            <CheckCircle className="w-4 h-4" /> {isEdit ? "Save Changes" : "Create Role"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────── */
export default function AdminRolesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [modal, setModal]       = useState<"create" | "edit" | null>(null);
  const [editRole, setEditRole] = useState<Role | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  const { data: rolesData, isLoading } = useQuery({
    queryKey: ["/api/admin/iam/roles"],
    queryFn: () => apiFetch("/api/admin/iam/roles"),
  });
  const { data: permsData } = useQuery({
    queryKey: ["/api/admin/iam/permissions"],
    queryFn: () => apiFetch("/api/admin/iam/permissions"),
  });

  const createMut = useMutation({
    mutationFn: (d: any) => apiFetch("/api/admin/iam/roles", { method: "POST", body: JSON.stringify(d) }),
    onSuccess: (d) => { if (!d.ok) { toast({ title: d.error, variant: "destructive" }); return; } qc.invalidateQueries({ queryKey: ["/api/admin/iam/roles"] }); setModal(null); toast({ title: "✅ Role created" }); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: any) => apiFetch(`/api/admin/iam/roles/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: (d) => { if (!d.ok) { toast({ title: d.error, variant: "destructive" }); return; } qc.invalidateQueries({ queryKey: ["/api/admin/iam/roles"] }); setModal(null); setEditRole(null); toast({ title: "✅ Role updated" }); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/admin/iam/roles/${id}`, { method: "DELETE" }),
    onSuccess: (d) => { if (!d.ok) { toast({ title: d.error, variant: "destructive" }); return; } qc.invalidateQueries({ queryKey: ["/api/admin/iam/roles"] }); toast({ title: "Role deleted" }); },
  });

  const seedMut = useMutation({
    mutationFn: () => apiFetch("/api/admin/iam/seed", { method: "POST" }),
    onSuccess: (d) => { if (!d.ok) { toast({ title: d.error, variant: "destructive" }); return; } qc.invalidateQueries({ queryKey: ["/api/admin/iam/roles"] }); toast({ title: "✅ Roles & permissions re-seeded" }); },
  });

  const roles: Role[]         = rolesData?.roles       ?? [];
  const permissions: Permission[] = permsData?.permissions ?? [];

  const handleSave = (form: any) => {
    if (modal === "create") createMut.mutate(form);
    else if (modal === "edit" && editRole) updateMut.mutate({ id: editRole.id, data: form });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary" /> Roles & Permissions
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Define roles and their granular permission sets</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => seedMut.mutate()} disabled={seedMut.isPending}>
            <RefreshCw className={`w-4 h-4 ${seedMut.isPending ? "animate-spin" : ""}`} /> Re-sync System Roles
          </Button>
          <Button className="gap-2" onClick={() => setModal("create")}>
            <Plus className="w-4 h-4" /> Create Role
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card className="py-3"><CardContent className="px-4 py-0 flex items-center gap-3"><Shield className="w-8 h-8 text-purple-500 opacity-80" /><div><p className="text-xs text-muted-foreground">Total Roles</p><p className="text-2xl font-bold">{roles.length}</p></div></CardContent></Card>
        <Card className="py-3"><CardContent className="px-4 py-0 flex items-center gap-3"><Lock className="w-8 h-8 text-blue-500 opacity-80" /><div><p className="text-xs text-muted-foreground">Permissions</p><p className="text-2xl font-bold">{permissions.length}</p></div></CardContent></Card>
        <Card className="py-3"><CardContent className="px-4 py-0 flex items-center gap-3"><Users className="w-8 h-8 text-green-500 opacity-80" /><div><p className="text-xs text-muted-foreground">Custom Roles</p><p className="text-2xl font-bold">{roles.filter(r => !r.isSystem).length}</p></div></CardContent></Card>
      </div>

      {/* Roles list */}
      {isLoading ? (
        <div className="py-16 text-center text-muted-foreground text-sm">Loading roles…</div>
      ) : (
        <div className="space-y-3">
          {roles.map(role => (
            <Card key={role.id} className="overflow-hidden">
              <div className="flex items-center gap-4 px-5 py-4">
                {/* Color dot */}
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: role.color + "20" }}>
                  {role.isSystem ? <Lock className="w-5 h-5" style={{ color: role.color }} /> : <Shield className="w-5 h-5" style={{ color: role.color }} />}
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm">{role.name}</span>
                    <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{role.slug}</span>
                    {role.isSystem && <Badge className="text-[10px] px-1.5 py-0 border bg-slate-100 text-slate-600 border-slate-200">System</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{role.description}</p>
                  <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Users className="w-3 h-3" />{role.userCount} user{role.userCount !== 1 ? "s" : ""}</span>
                    <span className="flex items-center gap-1"><Lock className="w-3 h-3" />{role.permissions.length} permission{role.permissions.length !== 1 ? "s" : ""}</span>
                  </div>
                </div>
                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => { setEditRole(role); setModal("edit"); }} title="Edit role">
                    <Edit2 className="w-3.5 h-3.5" />
                  </Button>
                  {!role.isSystem && (
                    <Button size="sm" variant="ghost" onClick={() => { if (confirm(`Delete role "${role.name}"?`)) deleteMut.mutate(role.id); }} title="Delete role">
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </Button>
                  )}
                  <button onClick={() => setExpanded(expanded === role.id ? null : role.id)}
                    className="p-1.5 text-muted-foreground hover:text-foreground">
                    {expanded === role.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              {/* Permission chips */}
              {expanded === role.id && (
                <div className="border-t border-border px-5 py-4 bg-muted/20">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Assigned Permissions</p>
                  {role.permissions.length === 0 ? (
                    <p className="text-sm text-muted-foreground flex items-center gap-2"><AlertCircle className="w-4 h-4" />No permissions assigned</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {role.permissions.map(k => (
                        <span key={k} className="text-[10px] font-mono px-2 py-1 rounded-md border" style={{ backgroundColor: role.color + "15", color: role.color, borderColor: role.color + "40" }}>{k}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {modal && (
        <RoleModal
          role={modal === "edit" ? editRole ?? undefined : undefined}
          permissions={permissions}
          onClose={() => { setModal(null); setEditRole(null); }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
