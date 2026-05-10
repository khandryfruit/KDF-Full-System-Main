import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Shield, Plus, Edit2, Trash2, CheckCircle, AlertCircle, Lock, Users,
  ChevronDown, ChevronUp, RefreshCw, Search, X, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

const authH  = () => ({ Authorization: `Bearer ${localStorage.getItem("kdf_admin_token") ?? ""}`, "Content-Type": "application/json" });
const apiFetch = (url: string, opts?: RequestInit) =>
  fetch(url, { ...opts, headers: { ...authH(), ...(opts?.headers ?? {}) } }).then(r => r.json());

type Permission = { key: string; name: string; module: string; description?: string };
type Role = { id: number; name: string; slug: string; description?: string; color: string; isSystem: boolean; permissions: string[]; userCount: number };

/* ─── Toggle Switch ──────────────────────────────────────── */
function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onChange}
      disabled={disabled}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-all duration-200 shrink-0 ${
        checked ? "bg-primary" : "bg-muted-foreground/30"
      } ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-all duration-200 ${checked ? "translate-x-[18px]" : "translate-x-[2px]"}`} />
    </button>
  );
}

/* ─── Permission Matrix ──────────────────────────────────── */
function PermMatrix({ selected, permissions, onChange, isSystem }: {
  selected: string[]; permissions: Permission[]; onChange: (keys: string[]) => void; isSystem?: boolean;
}) {
  const [search, setSearch] = useState("");
  const modules = [...new Set(permissions.map(p => p.module))];
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    if (!search.trim()) return permissions;
    const q = search.toLowerCase();
    return permissions.filter(p => p.name.toLowerCase().includes(q) || p.key.toLowerCase().includes(q) || p.module.toLowerCase().includes(q));
  }, [permissions, search]);

  const filteredModules = search.trim()
    ? [...new Set(filtered.map(p => p.module))]
    : modules;

  const toggleModule = (m: string) => {
    const mKeys = permissions.filter(p => p.module === m).map(p => p.key);
    const allSelected = mKeys.every(k => selected.includes(k));
    if (allSelected) onChange(selected.filter(k => !mKeys.includes(k)));
    else onChange([...new Set([...selected, ...mKeys])]);
  };

  const togglePerm = (key: string) =>
    onChange(selected.includes(key) ? selected.filter(k => k !== key) : [...selected, key]);

  const toggleCollapse = (m: string) =>
    setCollapsed(prev => { const s = new Set(prev); s.has(m) ? s.delete(m) : s.add(m); return s; });

  const selectedCount = selected.length;
  const totalCount = permissions.length;

  return (
    <div className="space-y-3">
      {/* Search + select all bar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search permissions…"
            className="pl-8 h-8 text-sm"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button size="sm" variant="outline" className="h-8 text-xs px-2.5 gap-1"
            onClick={() => onChange(permissions.map(p => p.key))} disabled={isSystem}>
            <Check className="w-3 h-3" /> All
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-xs px-2.5 text-destructive hover:text-destructive"
            onClick={() => onChange([])} disabled={isSystem}>
            <X className="w-3 h-3" /> None
          </Button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${(selectedCount / totalCount) * 100}%` }} />
        </div>
        <span className="shrink-0 tabular-nums">{selectedCount} / {totalCount}</span>
      </div>

      {/* Module groups */}
      <div className="border border-border rounded-xl overflow-hidden divide-y divide-border">
        {filteredModules.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground text-sm">No permissions match "{search}"</div>
        ) : filteredModules.map(m => {
          const mPerms    = (search.trim() ? filtered : permissions).filter(p => p.module === m);
          const selCount  = mPerms.filter(p => selected.includes(p.key)).length;
          const allSel    = selCount === mPerms.length && mPerms.length > 0;
          const partial   = selCount > 0 && !allSel;
          const isOpen    = !collapsed.has(m);

          return (
            <div key={m}>
              {/* Module header */}
              <div
                className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer select-none transition-colors ${isOpen ? "bg-muted/40" : "bg-muted/20 hover:bg-muted/30"}`}
                onClick={() => toggleCollapse(m)}
              >
                <div className="relative shrink-0" onClick={e => { e.stopPropagation(); if (!isSystem) toggleModule(m); }}>
                  <Toggle
                    checked={allSel}
                    onChange={() => toggleModule(m)}
                    disabled={isSystem}
                  />
                  {partial && !allSel && (
                    <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary/60" />
                    </span>
                  )}
                </div>
                <span className="font-semibold text-[13px] flex-1">{m}</span>
                <Badge variant="secondary" className="text-[10px] h-5 px-1.5">{selCount}/{mPerms.length}</Badge>
                {isOpen ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
              </div>

              {/* Permission rows */}
              {isOpen && (
                <div className="divide-y divide-border/40">
                  {mPerms.map(p => {
                    const isOn = selected.includes(p.key);
                    return (
                      <div
                        key={p.key}
                        className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${!isSystem ? "cursor-pointer hover:bg-muted/20" : ""} ${isOn ? "bg-primary/[0.04]" : ""}`}
                        onClick={() => !isSystem && togglePerm(p.key)}
                      >
                        <Toggle checked={isOn} onChange={() => togglePerm(p.key)} disabled={isSystem} />
                        <div className="flex-1 min-w-0">
                          <p className={`text-[13px] font-medium leading-none ${isOn ? "text-foreground" : "text-muted-foreground"}`}>{p.name}</p>
                          <p className="text-[10px] font-mono text-muted-foreground/60 mt-0.5 leading-none">{p.key}</p>
                        </div>
                        {isOn && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Role Modal ─────────────────────────────────────────── */
function RoleModal({ role, permissions, onClose, onSave }: {
  role?: Role; permissions: Permission[]; onClose: () => void; onSave: (d: any) => void;
}) {
  const isEdit     = !!role;
  const [name, setName]   = useState(role?.name ?? "");
  const [desc, setDesc]   = useState(role?.description ?? "");
  const [color, setColor] = useState(role?.color ?? "#6366f1");
  const [selectedPerms, setSelectedPerms] = useState<string[]>(role?.permissions ?? []);

  const PRESET_COLORS = ["#dc2626","#7c3aed","#0891b2","#059669","#d97706","#ec4899","#f59e0b","#6366f1","#64748b","#0ea5e9","#a855f7","#16a34a"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h2 className="text-base font-bold flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            {isEdit ? `Edit: ${role!.name}` : "Create Custom Role"}
          </h2>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Role Name *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Content Writer" disabled={isEdit && role!.isSystem} />
            </div>
            <div className="space-y-1.5">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_COLORS.map(c => (
                  <button key={c} type="button"
                    className={`w-6 h-6 rounded-full border-2 transition-all ${color === c ? "border-foreground scale-110" : "border-transparent hover:scale-105"}`}
                    style={{ backgroundColor: c }}
                    onClick={() => setColor(c)}
                  />
                ))}
                <input type="color" value={color} onChange={e => setColor(e.target.value)}
                  className="w-6 h-6 rounded-full border-2 border-transparent cursor-pointer p-0 overflow-hidden" title="Custom color" />
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input value={desc} onChange={e => setDesc(e.target.value)} placeholder="What can this role do?" />
          </div>

          {role?.isSystem && (
            <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <Lock className="w-3.5 h-3.5 shrink-0" />
              System roles are read-only. Use "Re-sync System Roles" to reset them.
            </div>
          )}

          <div className="space-y-2">
            <Label>Permissions</Label>
            <PermMatrix
              selected={selectedPerms}
              permissions={permissions}
              onChange={setSelectedPerms}
              isSystem={role?.isSystem}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-5 py-4 border-t border-border shrink-0">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          {!role?.isSystem && (
            <Button onClick={() => onSave({ name, description: desc, color, permissions: selectedPerms })} className="flex-1 gap-2">
              <CheckCircle className="w-4 h-4" /> {isEdit ? "Save Changes" : "Create Role"}
            </Button>
          )}
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
  const [search, setSearch]     = useState("");

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
    onSuccess: (d) => { if (!d.ok) { toast({ title: d.error, variant: "destructive" }); return; } qc.invalidateQueries({ queryKey: ["/api/admin/iam/roles"] }); setModal(null); toast({ title: "Role created" }); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }: any) => apiFetch(`/api/admin/iam/roles/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: (d) => { if (!d.ok) { toast({ title: d.error, variant: "destructive" }); return; } qc.invalidateQueries({ queryKey: ["/api/admin/iam/roles"] }); setModal(null); setEditRole(null); toast({ title: "Role updated" }); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/admin/iam/roles/${id}`, { method: "DELETE" }),
    onSuccess: (d) => { if (!d.ok) { toast({ title: d.error, variant: "destructive" }); return; } qc.invalidateQueries({ queryKey: ["/api/admin/iam/roles"] }); toast({ title: "Role deleted" }); },
  });
  const seedMut = useMutation({
    mutationFn: () => apiFetch("/api/admin/iam/seed", { method: "POST" }),
    onSuccess: (d) => { if (!d.ok) { toast({ title: d.error, variant: "destructive" }); return; } qc.invalidateQueries({ queryKey: ["/api/admin/iam/roles"] }); toast({ title: "System roles re-synced" }); },
  });

  const roles: Role[]             = rolesData?.roles       ?? [];
  const permissions: Permission[] = permsData?.permissions ?? [];

  const filteredRoles = useMemo(() => {
    if (!search.trim()) return roles;
    const q = search.toLowerCase();
    return roles.filter(r => r.name.toLowerCase().includes(q) || r.slug.toLowerCase().includes(q) || r.description?.toLowerCase().includes(q));
  }, [roles, search]);

  const systemRoles = filteredRoles.filter(r => r.isSystem);
  const customRoles = filteredRoles.filter(r => !r.isSystem);

  const handleSave = (form: any) => {
    if (modal === "create") createMut.mutate(form);
    else if (modal === "edit" && editRole) updateMut.mutate({ id: editRole.id, data: form });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" /> Roles & Permissions
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Define roles and their granular permission sets</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => seedMut.mutate()} disabled={seedMut.isPending}>
            <RefreshCw className={`w-3.5 h-3.5 ${seedMut.isPending ? "animate-spin" : ""}`} /> Re-sync System Roles
          </Button>
          <Button size="sm" className="gap-1.5 text-xs" onClick={() => setModal("create")}>
            <Plus className="w-3.5 h-3.5" /> Create Role
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Roles",  value: roles.length,                         icon: Shield,  color: "text-purple-500" },
          { label: "Permissions",  value: permissions.length,                   icon: Lock,    color: "text-blue-500"   },
          { label: "Custom Roles", value: roles.filter(r => !r.isSystem).length, icon: Users,   color: "text-green-500"  },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="py-3">
            <CardContent className="px-4 py-0 flex items-center gap-3">
              <Icon className={`w-8 h-8 ${color} opacity-80`} />
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-2xl font-bold">{value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search roles…" className="pl-9" />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-muted-foreground text-sm">Loading roles…</div>
      ) : (
        <div className="space-y-6">
          {/* System roles */}
          {systemRoles.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60 px-1">System Roles</p>
              <div className="space-y-2">
                {systemRoles.map(role => <RoleCard key={role.id} role={role} expanded={expanded} setExpanded={setExpanded}
                  onEdit={() => { setEditRole(role); setModal("edit"); }}
                  onDelete={() => deleteMut.mutate(role.id)} />)}
              </div>
            </div>
          )}

          {/* Custom roles */}
          {customRoles.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60 px-1">Custom Roles</p>
              <div className="space-y-2">
                {customRoles.map(role => <RoleCard key={role.id} role={role} expanded={expanded} setExpanded={setExpanded}
                  onEdit={() => { setEditRole(role); setModal("edit"); }}
                  onDelete={() => { if (confirm(`Delete role "${role.name}"?`)) deleteMut.mutate(role.id); }} />)}
              </div>
            </div>
          )}

          {filteredRoles.length === 0 && (
            <div className="py-12 text-center text-muted-foreground text-sm">
              {search ? `No roles match "${search}"` : "No roles yet"}
            </div>
          )}
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

/* ─── Role Card ──────────────────────────────────────────── */
function RoleCard({ role, expanded, setExpanded, onEdit, onDelete }: {
  role: Role; expanded: number | null; setExpanded: (id: number | null) => void;
  onEdit: () => void; onDelete: () => void;
}) {
  const isExpanded = expanded === role.id;
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Color avatar */}
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: role.color + "20" }}>
          {role.isSystem
            ? <Lock className="w-4 h-4" style={{ color: role.color }} />
            : <Shield className="w-4 h-4" style={{ color: role.color }} />}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-[13px]">{role.name}</span>
            <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{role.slug}</span>
            {role.isSystem && (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-slate-100 text-slate-500 border border-slate-200">System</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 leading-none">{role.description}</p>
          <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1"><Users className="w-3 h-3" />{role.userCount} user{role.userCount !== 1 ? "s" : ""}</span>
            <span className="flex items-center gap-1"><Lock className="w-3 h-3" />{role.permissions.length} permission{role.permissions.length !== 1 ? "s" : ""}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onEdit} title="Edit role">
            <Edit2 className="w-3.5 h-3.5" />
          </Button>
          {!role.isSystem && (
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onDelete} title="Delete role">
              <Trash2 className="w-3.5 h-3.5 text-red-500" />
            </Button>
          )}
          <button onClick={() => setExpanded(isExpanded ? null : role.id)}
            className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-accent text-muted-foreground transition-colors">
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded: permission chips grouped by module */}
      {isExpanded && (
        <div className="border-t border-border px-4 py-3 bg-muted/20">
          {role.permissions.length === 0 ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2"><AlertCircle className="w-4 h-4" />No permissions assigned</p>
          ) : (() => {
            const byModule: Record<string, string[]> = {};
            for (const k of role.permissions) {
              const mod = k.split(".")[0];
              (byModule[mod] ??= []).push(k);
            }
            return (
              <div className="space-y-2">
                {Object.entries(byModule).map(([mod, keys]) => (
                  <div key={mod}>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 mb-1">{mod}</p>
                    <div className="flex flex-wrap gap-1">
                      {keys.map(k => (
                        <span key={k} className="text-[10px] font-mono px-1.5 py-0.5 rounded border" style={{ backgroundColor: role.color + "12", color: role.color, borderColor: role.color + "30" }}>
                          {k.split(".").slice(1).join(".")}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}
    </Card>
  );
}
