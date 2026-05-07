import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { api, type Branch } from "@/lib/api";
import {
  Building2, Plus, Pencil, Trash2, MapPin, Phone, Mail,
  User, Star, ChevronLeft, CheckCircle, XCircle, RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

function BranchForm({
  initial,
  onSave,
  onCancel,
  loading,
}: {
  initial?: Partial<Branch>;
  onSave: (data: Partial<Branch>) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [form, setForm] = useState<Partial<Branch>>(
    initial ?? { isActive: true, isHeadOffice: false }
  );
  const set = (k: keyof Branch, v: any) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label className="text-xs">Branch Name *</Label>
          <Input value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} placeholder="Khan Dry Fruits — Lahore" className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">City *</Label>
          <Input value={form.city ?? ""} onChange={(e) => set("city", e.target.value)} placeholder="Lahore" className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Slug (URL key)</Label>
          <Input value={form.slug ?? ""} onChange={(e) => set("slug", e.target.value)} placeholder="lahore-hq" className="mt-1" />
        </div>
        <div className="col-span-2">
          <Label className="text-xs">Address</Label>
          <Input value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} placeholder="Main Market, Lahore" className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Phone</Label>
          <Input value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} placeholder="+92 300 1234567" className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">WhatsApp</Label>
          <Input value={form.whatsappNumber ?? ""} onChange={(e) => set("whatsappNumber", e.target.value)} placeholder="+92 300 1234567" className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Manager Name</Label>
          <Input value={form.managerName ?? ""} onChange={(e) => set("managerName", e.target.value)} placeholder="Manager Name" className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Manager Phone</Label>
          <Input value={form.managerPhone ?? ""} onChange={(e) => set("managerPhone", e.target.value)} placeholder="+92 300 0000000" className="mt-1" />
        </div>
        <div className="col-span-2">
          <Label className="text-xs">Email</Label>
          <Input value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} placeholder="lahore@khanbabadryfruits.com" className="mt-1" />
        </div>
        <div className="col-span-2">
          <Label className="text-xs">Monthly Target (₨)</Label>
          <Input
            type="number"
            value={form.monthlyTarget ?? ""}
            onChange={(e) => set("monthlyTarget", e.target.value)}
            placeholder="500000"
            className="mt-1"
          />
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={!!form.isActive} onCheckedChange={(v) => set("isActive", v)} />
          <Label className="text-xs">Active Branch</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={!!form.isHeadOffice} onCheckedChange={(v) => set("isHeadOffice", v)} />
          <Label className="text-xs">Head Office</Label>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={loading}>Cancel</Button>
        <Button onClick={() => onSave(form)} disabled={loading || !form.name || !form.city}>
          {loading ? "Saving..." : "Save Branch"}
        </Button>
      </DialogFooter>
    </div>
  );
}

export default function BranchesManage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [deleting, setDeleting] = useState<Branch | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["branches"],
    queryFn: api.getBranches,
  });

  const createMut = useMutation({
    mutationFn: api.createBranch,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["branches"] }); setShowCreate(false); toast({ title: "Branch created!" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Branch> }) => api.updateBranch(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["branches"] }); setEditing(null); toast({ title: "Branch updated!" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: api.deleteBranch,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["branches"] }); setDeleting(null); toast({ title: "Branch deleted" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const seedMut = useMutation({
    mutationFn: api.seedBranches,
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["branches"] });
      toast({ title: d.message ?? "Branches seeded!" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const branches = data?.branches ?? [];

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="bg-sidebar border-b border-sidebar-border px-6 py-3 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-sidebar-primary rounded-lg flex items-center justify-center">
            <Star className="h-4 w-4 text-sidebar" />
          </div>
          <div>
            <p className="text-sm font-bold text-sidebar-foreground">KDF Central</p>
            <p className="text-[10px] text-sidebar-foreground/60">Enterprise Retail Platform</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Link href="/"><Button variant="ghost" size="sm" className="text-sidebar-foreground hover:bg-sidebar-accent text-xs h-8">Dashboard</Button></Link>
          <Link href="/branches"><Button variant="ghost" size="sm" className="text-sidebar-foreground hover:bg-sidebar-accent text-xs h-8">Branches</Button></Link>
        </div>
      </nav>

      <main className="p-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="sm" className="h-8">
                <ChevronLeft className="h-4 w-4 mr-1" />Back
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Branch Management</h1>
              <p className="text-sm text-muted-foreground">{branches.length} branches configured</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {branches.length === 0 && (
              <Button variant="outline" size="sm" onClick={() => seedMut.mutate()} disabled={seedMut.isPending}>
                <RefreshCw className={cn("h-4 w-4 mr-2", seedMut.isPending && "animate-spin")} />
                Seed Defaults
              </Button>
            )}
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-2" />New Branch
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}><CardContent className="p-5"><Skeleton className="h-32 w-full" /></CardContent></Card>
            ))}
          </div>
        ) : branches.length === 0 ? (
          <Card className="text-center py-16">
            <CardContent>
              <Building2 className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-40" />
              <h3 className="font-semibold text-lg text-foreground mb-2">No Branches Yet</h3>
              <p className="text-muted-foreground text-sm mb-4">Add your first branch or seed default KDF locations.</p>
              <div className="flex items-center justify-center gap-2">
                <Button variant="outline" onClick={() => seedMut.mutate()} disabled={seedMut.isPending}>
                  Seed Defaults (Lahore, Islamabad, Karachi, Peshawar)
                </Button>
                <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-1" />Add Branch</Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {branches.map((b) => (
              <Card key={b.id} className={cn("relative", !b.isActive && "opacity-60")}>
                {b.isHeadOffice && (
                  <div className="absolute top-3 right-3">
                    <Badge className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 border-amber-200">
                      <Star className="h-2.5 w-2.5 mr-1" />Head Office
                    </Badge>
                  </div>
                )}
                <CardHeader className="pb-2">
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
                      b.isActive ? "bg-emerald-100 dark:bg-emerald-950" : "bg-muted",
                    )}>
                      <Building2 className={cn("h-5 w-5", b.isActive ? "text-emerald-600" : "text-muted-foreground")} />
                    </div>
                    <div>
                      <CardTitle className="text-base leading-tight">{b.name}</CardTitle>
                      <div className="flex items-center gap-1 mt-1">
                        {b.isActive ? (
                          <Badge variant="secondary" className="text-[10px] h-4 px-1.5 bg-emerald-50 text-emerald-700">
                            <CheckCircle className="h-2.5 w-2.5 mr-1" />Active
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px] h-4 px-1.5 bg-rose-50 text-rose-700">
                            <XCircle className="h-2.5 w-2.5 mr-1" />Inactive
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 pb-3">
                  <div className="space-y-1.5 text-xs text-muted-foreground mb-4">
                    {b.city && (
                      <div className="flex items-center gap-2">
                        <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                        <span>{b.address ? `${b.address}, ${b.city}` : b.city}</span>
                      </div>
                    )}
                    {b.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-3.5 w-3.5 flex-shrink-0" />
                        <span>{b.phone}</span>
                      </div>
                    )}
                    {b.email && (
                      <div className="flex items-center gap-2">
                        <Mail className="h-3.5 w-3.5 flex-shrink-0" />
                        <span>{b.email}</span>
                      </div>
                    )}
                    {b.managerName && (
                      <div className="flex items-center gap-2">
                        <User className="h-3.5 w-3.5 flex-shrink-0" />
                        <span>{b.managerName}{b.managerPhone ? ` — ${b.managerPhone}` : ""}</span>
                      </div>
                    )}
                    {b.monthlyTarget && (
                      <div className="flex items-center gap-2">
                        <Star className="h-3.5 w-3.5 flex-shrink-0" />
                        <span>Target: ₨{Number(b.monthlyTarget).toLocaleString()}/mo</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Link href={`/branches/${b.id}`} className="flex-1">
                      <Button variant="secondary" size="sm" className="w-full text-xs h-8">
                        View Analytics
                      </Button>
                    </Link>
                    <Button variant="outline" size="sm" className="h-8 px-2" onClick={() => setEditing(b)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="outline" size="sm" className="h-8 px-2 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200"
                      onClick={() => setDeleting(b)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add New Branch</DialogTitle></DialogHeader>
          <BranchForm
            onSave={(d) => createMut.mutate(d)}
            onCancel={() => setShowCreate(false)}
            loading={createMut.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit Branch</DialogTitle></DialogHeader>
          {editing && (
            <BranchForm
              initial={editing}
              onSave={(d) => updateMut.mutate({ id: editing.id, data: d })}
              onCancel={() => setEditing(null)}
              loading={updateMut.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Branch?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <strong>{deleting?.name}</strong>. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => deleting && deleteMut.mutate(deleting.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
