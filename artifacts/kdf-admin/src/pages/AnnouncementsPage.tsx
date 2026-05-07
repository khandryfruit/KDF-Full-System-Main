import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Edit, Trash2, Loader2, ToggleLeft, ToggleRight, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

interface Announcement {
  id: number; text: string; isActive: boolean; sortOrder: number;
  speed: number; bgColor: string; textColor: string;
  createdAt: string; updatedAt: string;
}

const adminHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("kdf_admin_token") ?? ""}`,
});

const emptyForm = { text: "", isActive: true, sortOrder: 0, speed: 40, bgColor: "#c0392b", textColor: "white" };

export default function AnnouncementsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const { data: announcements = [], isLoading } = useQuery<Announcement[]>({
    queryKey: ["admin-announcements"],
    queryFn: async () => {
      const res = await fetch("/api/announcements?all=true", { headers: adminHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin-announcements"] });

  const createMutation = useMutation({
    mutationFn: async (data: typeof emptyForm) => {
      const res = await fetch("/api/announcements", { method: "POST", headers: adminHeaders(), body: JSON.stringify(data) });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      return res.json();
    },
    onSuccess: () => { invalidate(); setIsOpen(false); toast({ title: "Announcement created" }); },
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof emptyForm }) => {
      const res = await fetch(`/api/announcements/${id}`, { method: "PUT", headers: adminHeaders(), body: JSON.stringify(data) });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      return res.json();
    },
    onSuccess: () => { invalidate(); setIsOpen(false); toast({ title: "Announcement updated" }); },
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });

  const toggleMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/announcements/${id}/toggle`, { method: "PATCH", headers: adminHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => invalidate(),
    onError: () => toast({ variant: "destructive", title: "Failed to toggle" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/announcements/${id}`, { method: "DELETE", headers: adminHeaders() });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => { invalidate(); toast({ title: "Deleted" }); },
    onError: () => toast({ variant: "destructive", title: "Failed to delete" }),
  });

  const openAdd = () => { setForm({ ...emptyForm }); setEditingId(null); setIsOpen(true); };
  const openEdit = (a: Announcement) => {
    setForm({ text: a.text, isActive: a.isActive, sortOrder: a.sortOrder, speed: a.speed ?? 40, bgColor: a.bgColor ?? "#c0392b", textColor: a.textColor ?? "white" });
    setEditingId(a.id); setIsOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.text.trim()) { toast({ variant: "destructive", title: "Text is required" }); return; }
    if (editingId) updateMutation.mutate({ id: editingId, data: form });
    else createMutation.mutate(form);
  };

  const isBusy = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Announcements</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage scrolling announcement bar text shown on both storefronts</p>
        </div>
        <Button onClick={openAdd}><Plus className="w-4 h-4 mr-2" /> Add Announcement</Button>
      </div>

      {/* Live preview */}
      {announcements.filter(a => a.isActive).length > 0 && (
        <div className="rounded-xl overflow-hidden border shadow-sm">
          <p className="text-xs font-medium text-muted-foreground px-3 py-1.5 bg-muted/30 border-b">Live Preview</p>
          <div className="overflow-hidden py-2 text-white text-sm font-semibold" style={{ backgroundColor: announcements.find(a => a.isActive)?.bgColor ?? "#c0392b" }}>
            <div className="flex gap-0 animate-[marquee_30s_linear_infinite] whitespace-nowrap w-max">
              {[...announcements.filter(a => a.isActive), ...announcements.filter(a => a.isActive)].map((a, i) => (
                <span key={i} className="mr-16">{a.text}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-primary" />
              {editingId ? "Edit Announcement" : "Add Announcement"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div>
              <Label>Announcement Text *</Label>
              <Input value={form.text} onChange={e => setForm(f => ({ ...f, text: e.target.value }))}
                placeholder="🚚 Free Delivery on Orders Above Rs. 1,500 — Shop Now!" className="mt-1" />
              <p className="text-xs text-muted-foreground mt-1">Use emoji at the start to make it eye-catching</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Sort Order</Label>
                <Input type="number" value={form.sortOrder} onChange={e => setForm(f => ({ ...f, sortOrder: parseInt(e.target.value) || 0 }))} className="mt-1" />
              </div>
              <div>
                <Label>Scroll Speed (px/s)</Label>
                <Input type="number" min={10} max={200} value={form.speed} onChange={e => setForm(f => ({ ...f, speed: parseInt(e.target.value) || 40 }))} className="mt-1" />
              </div>
              <div>
                <Label>Background Color</Label>
                <div className="flex gap-2 mt-1">
                  <Input type="color" value={form.bgColor} onChange={e => setForm(f => ({ ...f, bgColor: e.target.value }))} className="w-10 h-9 p-1 cursor-pointer" />
                  <Input value={form.bgColor} onChange={e => setForm(f => ({ ...f, bgColor: e.target.value }))} placeholder="#c0392b" className="flex-1" />
                </div>
              </div>
              <div>
                <Label>Text Color</Label>
                <div className="flex gap-2 mt-1">
                  <Input type="color" value={form.textColor === "white" ? "#ffffff" : form.textColor} onChange={e => setForm(f => ({ ...f, textColor: e.target.value }))} className="w-10 h-9 p-1 cursor-pointer" />
                  <Input value={form.textColor} onChange={e => setForm(f => ({ ...f, textColor: e.target.value }))} placeholder="white" className="flex-1" />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border">
              <Switch checked={form.isActive} onCheckedChange={v => setForm(f => ({ ...f, isActive: v }))} />
              <div>
                <p className="text-sm font-medium">Active</p>
                <p className="text-xs text-muted-foreground">Show this announcement on the storefront</p>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)} className="flex-1">Cancel</Button>
              <Button type="submit" disabled={isBusy} className="flex-1">
                {isBusy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingId ? "Save Changes" : "Create"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Table */}
      <div className="border rounded-xl bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="w-10">#</TableHead>
              <TableHead>Announcement Text</TableHead>
              <TableHead className="w-28">Colors</TableHead>
              <TableHead className="w-20">Speed</TableHead>
              <TableHead className="w-24">Status</TableHead>
              <TableHead className="text-right w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>{Array.from({ length: 5 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                ))
              : announcements.length === 0
              ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <Megaphone className="w-8 h-8 opacity-20" />
                      No announcements yet. Click "Add Announcement" to create one.
                    </div>
                  </TableCell>
                </TableRow>
              )
              : announcements.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">{a.sortOrder}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: a.bgColor ?? "#c0392b" }} />
                      <span className="text-sm font-medium line-clamp-1">{a.text}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 items-center">
                      <div className="w-5 h-5 rounded border shadow-sm" style={{ backgroundColor: a.bgColor ?? "#c0392b" }} title="Background" />
                      <div className="w-5 h-5 rounded border shadow-sm" style={{ backgroundColor: a.textColor ?? "white" }} title="Text" />
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{a.speed ?? 40}px/s</TableCell>
                  <TableCell>
                    <button onClick={() => toggleMutation.mutate(a.id)} disabled={toggleMutation.isPending}
                      className="flex items-center gap-1.5 text-xs font-medium transition-colors">
                      {a.isActive
                        ? <><ToggleRight className="w-4 h-4 text-green-500" /><Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Active</Badge></>
                        : <><ToggleLeft className="w-4 h-4 text-gray-400" /><Badge variant="outline" className="bg-gray-50 text-gray-500 border-gray-200">Inactive</Badge></>}
                    </button>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(a)}><Edit className="w-4 h-4 text-muted-foreground" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => { if (confirm("Delete this announcement?")) deleteMutation.mutate(a.id); }}
                        disabled={deleteMutation.isPending}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
