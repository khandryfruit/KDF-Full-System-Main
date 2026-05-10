import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users, Plus, Edit2, Trash2, Shield, ShieldCheck, ToggleLeft, ToggleRight,
  Key, LogIn, Search, RefreshCw, Copy, CheckCircle, AlertCircle, Crown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAdminAuth } from "@/context/AdminAuthContext";

const authH  = () => ({ Authorization: `Bearer ${localStorage.getItem("kdf_admin_token") ?? ""}`, "Content-Type": "application/json" });
const apiFetch = (url: string, opts?: RequestInit) =>
  fetch(url, { ...opts, headers: { ...authH(), ...(opts?.headers ?? {}) } }).then(r => r.json());

/* ─── Form Modal ─────────────────────────────────────────── */
interface UserForm { name: string; email: string; phone: string; password: string; isSuper: boolean; roleIds: number[] }
const EMPTY_FORM: UserForm = { name: "", email: "", phone: "", password: "", isSuper: false, roleIds: [] };

function UserModal({ user, roles, onClose, onSave }: {
  user?: any; roles: any[]; onClose: () => void; onSave: (d: any) => void;
}) {
  const isEdit = !!user;
  const [form, setForm] = useState<UserForm>(isEdit
    ? { name: user.name, email: user.email, phone: user.phone ?? "", password: "", isSuper: user.isSuper, roleIds: user.roles?.map((r: any) => r.id) ?? [] }
    : EMPTY_FORM);
  const set = (k: keyof UserForm, v: any) => setForm(p => ({ ...p, [k]: v }));
  const toggleRole = (id: number) => set("roleIds", form.roleIds.includes(id) ? form.roleIds.filter(x => x !== id) : [...form.roleIds, id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            {isEdit ? "Edit Admin User" : "Create Admin User"}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl">×</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Full Name *</Label>
              <Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Ali Khan" />
            </div>
            <div className="space-y-1.5">
              <Label>Email *</Label>
              <Input type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="ali@kdfnuts.com" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="03XX-XXXXXXX" />
            </div>
            <div className="space-y-1.5">
              <Label>{isEdit ? "New Password (leave blank to keep)" : "Password *"}</Label>
              <Input type="password" value={form.password} onChange={e => set("password", e.target.value)} placeholder="••••••••" autoComplete="new-password" />
            </div>
          </div>

          {/* Super Admin toggle */}
          <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <Crown className="w-4 h-4 text-amber-600 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800">Super Admin</p>
              <p className="text-xs text-amber-600">Bypasses all permission checks — full access</p>
            </div>
            <button onClick={() => set("isSuper", !form.isSuper)}
              className={`w-10 h-6 rounded-full transition-colors ${form.isSuper ? "bg-amber-500" : "bg-muted"}`}>
              <div className={`w-4 h-4 rounded-full bg-white shadow mx-1 transition-transform ${form.isSuper ? "translate-x-4" : ""}`} />
            </button>
          </div>

          {/* Role assignment */}
          {!form.isSuper && (
            <div className="space-y-2">
              <Label>Assign Roles</Label>
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto border border-border rounded-lg p-3">
                {roles.map(role => (
                  <label key={role.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded p-1.5">
                    <input type="checkbox" checked={form.roleIds.includes(role.id)} onChange={() => toggleRole(role.id)}
                      className="accent-primary" />
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: role.color }} />
                      <span className="text-sm font-medium">{role.name}</span>
                    </div>
                  </label>
                ))}
              </div>
              {form.roleIds.length === 0 && !form.isSuper && (
                <p className="text-xs text-amber-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" />No roles assigned — user will have no access</p>
              )}
            </div>
          )}
        </div>
        <div className="flex gap-3 p-5 border-t border-border">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button onClick={() => onSave(form)} className="flex-1 gap-2">
            <CheckCircle className="w-4 h-4" /> {isEdit ? "Save Changes" : "Create User"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── Reset Password Modal ───────────────────────────────── */
function ResetPasswordModal({ user, onClose, onSave }: { user: any; onClose: () => void; onSave: (pw: string) => void }) {
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-base font-bold flex items-center gap-2"><Key className="w-4 h-4 text-primary" />Reset Password</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-muted-foreground">Set a new password for <span className="font-semibold text-foreground">{user.name}</span></p>
          <div className="space-y-1.5">
            <Label>New Password (min 8 chars)</Label>
            <div className="relative">
              <Input
                type={show ? "text" : "password"}
                value={pw} onChange={e => setPw(e.target.value)}
                placeholder="••••••••" autoComplete="new-password"
                className="pr-10"
              />
              <button type="button" onClick={() => setShow(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs">
                {show ? "Hide" : "Show"}
              </button>
            </div>
          </div>
        </div>
        <div className="flex gap-3 p-5 border-t border-border">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button onClick={() => pw.length >= 8 && onSave(pw)} disabled={pw.length < 8} className="flex-1 gap-2">
            <Key className="w-4 h-4" /> Reset Password
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────── */
export default function AdminUsersPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { user: me, hasPermission } = useAdminAuth();
  const [search, setSearch]     = useState("");
  const [modal, setModal]       = useState<"create" | "edit" | null>(null);
  const [editTarget, setTarget] = useState<any>(null);
  const [resetTarget, setResetTarget] = useState<any>(null);

  const { data: usersData, isLoading: loadingUsers } = useQuery({
    queryKey: ["/api/admin/iam/users"],
    queryFn: () => apiFetch("/api/admin/iam/users"),
  });
  const { data: rolesData } = useQuery({
    queryKey: ["/api/admin/iam/roles"],
    queryFn: () => apiFetch("/api/admin/iam/roles"),
  });

  const createMut = useMutation({
    mutationFn: (d: any) => apiFetch("/api/admin/iam/users", { method: "POST", body: JSON.stringify(d) }),
    onSuccess: (d) => { if (!d.ok) { toast({ title: d.error, variant: "destructive" }); return; } qc.invalidateQueries({ queryKey: ["/api/admin/iam/users"] }); setModal(null); toast({ title: "✅ User created" }); },
    onError: () => toast({ title: "Failed to create user", variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: any) => apiFetch(`/api/admin/iam/users/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: (d) => { if (!d.ok) { toast({ title: d.error, variant: "destructive" }); return; } qc.invalidateQueries({ queryKey: ["/api/admin/iam/users"] }); setModal(null); setTarget(null); toast({ title: "✅ User updated" }); },
    onError: () => toast({ title: "Failed to update user", variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/admin/iam/users/${id}`, { method: "DELETE" }),
    onSuccess: (d) => { if (!d.ok) { toast({ title: d.error, variant: "destructive" }); return; } qc.invalidateQueries({ queryKey: ["/api/admin/iam/users"] }); toast({ title: "User deleted" }); },
    onError: () => toast({ title: "Failed to delete user", variant: "destructive" }),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, isActive }: any) => apiFetch(`/api/admin/iam/users/${id}`, { method: "PATCH", body: JSON.stringify({ isActive }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/iam/users"] }); toast({ title: "Status updated" }); },
  });

  const loginAsMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/admin/iam/users/${id}/login-as`, { method: "POST" }),
    onSuccess: (d) => {
      if (!d.ok) { toast({ title: d.error, variant: "destructive" }); return; }
      localStorage.setItem("kdf_admin_token", d.token);
      localStorage.setItem("kdf_admin_user", JSON.stringify(d.user));
      toast({ title: `✅ Now logged in as ${d.user.name}` });
      window.location.reload();
    },
    onError: () => toast({ title: "Login As failed", variant: "destructive" }),
  });

  const users = (usersData?.users ?? []).filter((u: any) =>
    !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())
  );
  const roles = rolesData?.roles ?? [];

  const handleSave = (form: UserForm) => {
    const body: any = { name: form.name, email: form.email, phone: form.phone || null, isSuper: form.isSuper, roleIds: form.roleIds };
    if (form.password) body.password = form.password;
    if (modal === "create") createMut.mutate(body);
    else if (modal === "edit" && editTarget) updateMut.mutate({ id: editTarget.id, data: body });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6 text-primary" /> Admin Users
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Manage admin accounts, roles, and access control</p>
        </div>
        <Button className="gap-2" onClick={() => setModal("create")}>
          <Plus className="w-4 h-4" /> Add Admin User
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Users", value: usersData?.users?.length ?? 0, icon: Users, color: "text-blue-600" },
          { label: "Super Admins", value: (usersData?.users ?? []).filter((u: any) => u.isSuper).length, icon: Crown, color: "text-amber-600" },
          { label: "Active", value: (usersData?.users ?? []).filter((u: any) => u.isActive).length, icon: CheckCircle, color: "text-green-600" },
          { label: "Roles Available", value: roles.length, icon: Shield, color: "text-purple-600" },
        ].map(s => (
          <Card key={s.label} className="py-3">
            <CardContent className="px-4 py-0 flex items-center gap-3">
              <s.icon className={`w-8 h-8 ${s.color} opacity-80`} />
              <div>
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-2xl font-bold">{s.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search users..." className="pl-9" />
      </div>

      {/* Users table */}
      <Card>
        <CardHeader className="pb-0 border-b">
          <CardTitle className="text-base">Admin Accounts ({users.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loadingUsers ? (
            <div className="py-16 text-center text-muted-foreground text-sm">Loading…</div>
          ) : users.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground text-sm">No users found</div>
          ) : (
            <div className="divide-y divide-border">
              {users.map((user: any) => (
                <div key={user.id} className={`flex items-center gap-4 px-4 py-3 hover:bg-muted/30 transition-colors ${!user.isActive ? "opacity-60" : ""}`}>
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 font-bold text-primary">
                    {user.isSuper ? <Crown className="w-5 h-5 text-amber-500" /> : user.name.charAt(0).toUpperCase()}
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{user.name}</span>
                      {user.isSuper && <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px] px-1.5 py-0 border">Super Admin</Badge>}
                      {!user.isActive && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Inactive</Badge>}
                      {me?.id === user.id && <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-[10px] px-1.5 py-0 border">You</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{user.email}</p>
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {(user.roles ?? []).map((r: any) => (
                        <span key={r.id} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: r.color + "20", color: r.color }}>
                          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: r.color }} />
                          {r.name}
                        </span>
                      ))}
                    </div>
                  </div>
                  {/* Last login */}
                  <div className="hidden sm:block text-right text-xs text-muted-foreground shrink-0">
                    {user.lastLoginAt ? (
                      <><p>Last login</p><p className="font-medium">{new Date(user.lastLoginAt).toLocaleDateString()}</p></>
                    ) : <p>Never logged in</p>}
                  </div>
                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="sm" variant="ghost" title="Edit user" onClick={() => { setTarget(user); setModal("edit"); }}>
                      <Edit2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" title={user.isActive ? "Deactivate" : "Activate"}
                      onClick={() => toggleMut.mutate({ id: user.id, isActive: !user.isActive })}>
                      {user.isActive ? <ToggleRight className="w-4 h-4 text-green-600" /> : <ToggleLeft className="w-4 h-4 text-muted-foreground" />}
                    </Button>
                    {me?.isSuper && me.id !== user.id && (
                      <Button size="sm" variant="ghost" title="Login As this user"
                        onClick={() => { if (confirm(`Login as ${user.name}?`)) loginAsMut.mutate(user.id); }}>
                        <LogIn className="w-3.5 h-3.5 text-purple-600" />
                      </Button>
                    )}
                    {me?.id !== user.id && (
                      <Button size="sm" variant="ghost" title="Delete user"
                        onClick={() => { if (confirm(`Delete ${user.name}?`)) deleteMut.mutate(user.id); }}>
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal */}
      {modal && (
        <UserModal
          user={modal === "edit" ? editTarget : undefined}
          roles={roles}
          onClose={() => { setModal(null); setTarget(null); }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
