import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MapPin, Plus, Trash2, Loader2, CheckCircle2, XCircle,
  Edit, Save, X, RefreshCw, Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

const ADMIN_TOKEN = () => localStorage.getItem("kdf_admin_token") ?? "";
const authHeaders = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${ADMIN_TOKEN()}` });
async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { ...opts, headers: { ...authHeaders(), ...(opts?.headers ?? {}) } });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? `HTTP ${res.status}`); }
  return res.json();
}

interface City {
  id: number;
  cityName: string;
  province?: string;
  isActive: boolean;
  createdAt: string;
}

export default function CitiesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [newCity, setNewCity] = useState({ cityName: "", province: "" });
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ cityName: "", province: "" });
  const [search, setSearch] = useState("");

  const { data, isLoading, refetch } = useQuery<City[]>({
    queryKey: ["/api/admin/cities"],
    queryFn: () => apiFetch("/api/admin/cities"),
  });

  const cities: City[] = Array.isArray(data) ? data : [];
  const filtered = cities.filter(c =>
    !search || c.cityName.toLowerCase().includes(search.toLowerCase()) || (c.province ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const addMutation = useMutation({
    mutationFn: () => apiFetch("/api/admin/cities", { method: "POST", body: JSON.stringify(newCity) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/cities"] });
      setNewCity({ cityName: "", province: "" });
      toast({ title: "City added" });
    },
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiFetch(`/api/admin/cities/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/cities"] });
      setEditId(null);
      toast({ title: "City updated" });
    },
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/admin/cities/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/cities"] }); toast({ title: "City removed" }); },
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });

  const seedMutation = useMutation({
    mutationFn: () => apiFetch("/api/admin/cities/seed", { method: "POST" }),
    onSuccess: (d: any) => { qc.invalidateQueries({ queryKey: ["/api/admin/cities"] }); toast({ title: d.message }); },
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });

  const toggleActive = (city: City) =>
    updateMutation.mutate({ id: city.id, data: { isActive: !city.isActive } });

  const startEdit = (city: City) => {
    setEditId(city.id);
    setEditForm({ cityName: city.cityName, province: city.province ?? "" });
  };

  const saveEdit = () => {
    if (!editId) return;
    updateMutation.mutate({ id: editId, data: editForm });
  };

  const activeCount = cities.filter(c => c.isActive).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <MapPin className="w-6 h-6 text-[#5FA800]" />
            Cities
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage delivery cities shown in the checkout dropdown.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" />Refresh
          </Button>
          <Button
            variant="outline" size="sm"
            onClick={() => seedMutation.mutate()}
            disabled={seedMutation.isPending}
            className="gap-1.5"
          >
            {seedMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            Seed Pakistan Cities
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-[#5FA800]/5 border border-[#5FA800]/20 rounded-xl px-4 py-3">
          <p className="text-xs font-semibold text-[#5FA800] uppercase tracking-wider">Total Cities</p>
          <p className="text-2xl font-bold text-[#5FA800] mt-1">{cities.length}</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3">
          <p className="text-xs font-semibold text-green-600 uppercase tracking-wider">Active</p>
          <p className="text-2xl font-bold text-green-700 mt-1">{activeCount}</p>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Inactive</p>
          <p className="text-2xl font-bold text-gray-700 mt-1">{cities.length - activeCount}</p>
        </div>
      </div>

      {/* Add City */}
      <div className="bg-card border border-border rounded-xl p-5">
        <p className="text-sm font-semibold mb-3 flex items-center gap-2"><Plus className="w-4 h-4" />Add New City</p>
        <div className="flex gap-2">
          <Input
            value={newCity.cityName}
            onChange={e => setNewCity(f => ({ ...f, cityName: e.target.value }))}
            placeholder="City name (e.g. Karachi)"
            className="flex-1"
            onKeyDown={e => e.key === "Enter" && newCity.cityName.trim() && addMutation.mutate()}
          />
          <Input
            value={newCity.province}
            onChange={e => setNewCity(f => ({ ...f, province: e.target.value }))}
            placeholder="Province (optional)"
            className="flex-1"
          />
          <Button
            onClick={() => addMutation.mutate()}
            disabled={!newCity.cityName.trim() || addMutation.isPending}
            className="gap-1.5 bg-[#5FA800] hover:bg-[#4d8a00] text-white"
          >
            {addMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Add
          </Button>
        </div>
      </div>

      {/* Search + Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search cities…"
            className="max-w-xs"
          />
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>City</TableHead>
              <TableHead>Province</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Added</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>{Array.from({ length: 5 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
            ))}
            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground text-sm">
                  {search ? "No cities match your search" : "No cities yet — add one above or seed Pakistan cities"}
                </TableCell>
              </TableRow>
            )}
            {!isLoading && filtered.map(city => (
              <TableRow key={city.id}>
                <TableCell>
                  {editId === city.id ? (
                    <Input value={editForm.cityName} onChange={e => setEditForm(f => ({ ...f, cityName: e.target.value }))} className="h-7 text-sm w-36" />
                  ) : (
                    <span className="font-medium text-sm">{city.cityName}</span>
                  )}
                </TableCell>
                <TableCell>
                  {editId === city.id ? (
                    <Input value={editForm.province} onChange={e => setEditForm(f => ({ ...f, province: e.target.value }))} className="h-7 text-sm w-28" placeholder="Province" />
                  ) : (
                    <span className="text-sm text-muted-foreground">{city.province ?? "—"}</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={city.isActive}
                      onCheckedChange={() => toggleActive(city)}
                      disabled={updateMutation.isPending && editId !== city.id}
                    />
                    <Badge variant="outline" className={`text-[11px] ${city.isActive ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-50 text-gray-500 border-gray-200"}`}>
                      {city.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {city.createdAt ? new Date(city.createdAt).toLocaleDateString("en-PK", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    {editId === city.id ? (
                      <>
                        <Button size="sm" variant="ghost" onClick={saveEdit} disabled={updateMutation.isPending} className="h-7 px-2 text-green-600 hover:bg-green-50">
                          {updateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditId(null)} className="h-7 px-2"><X className="w-3.5 h-3.5" /></Button>
                      </>
                    ) : (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => startEdit(city)} className="h-7 px-2"><Edit className="w-3.5 h-3.5 text-muted-foreground" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => deleteMutation.mutate(city.id)} disabled={deleteMutation.isPending} className="h-7 px-2 text-red-400 hover:text-red-600 hover:bg-red-50">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    )}
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
