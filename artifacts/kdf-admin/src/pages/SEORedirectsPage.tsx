import { useState, useEffect } from "react";
import { Link2, Plus, Trash2, Edit2, ToggleLeft, ToggleRight, ArrowRight, Search, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const ADMIN_TOKEN = () => localStorage.getItem("kdf_admin_token") ?? "";
const H = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${ADMIN_TOKEN()}` });

async function apiFetch(url: string, opts?: RequestInit) {
  const r = await fetch(url, { ...opts, headers: { ...H(), ...(opts?.headers ?? {}) } });
  if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error ?? `HTTP ${r.status}`); }
  return r.json();
}

interface Redirect {
  id: number;
  source_path: string;
  target_url: string;
  redirect_type: number;
  hits: number;
  is_active: boolean;
  note: string | null;
  created_at: string;
}

interface Stats {
  total: number;
  active: number;
  total_hits: number;
  permanent: number;
  temporary: number;
}

const EMPTY: Redirect = {
  id: 0, source_path: "", target_url: "", redirect_type: 301,
  hits: 0, is_active: true, note: null, created_at: "",
};

export default function SEORedirectsPage() {
  const { toast } = useToast();
  const [redirects, setRedirects] = useState<Redirect[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Redirect>(EMPTY);
  const [editing, setEditing] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [tab, setTab] = useState<"list" | "bulk">("list");

  async function load() {
    try {
      const [r, s] = await Promise.all([
        apiFetch("/api/admin/seo/redirects"),
        apiFetch("/api/admin/seo/redirects/stats"),
      ]);
      setRedirects(r);
      setStats(s);
    } catch { }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  function startEdit(r: Redirect) {
    setForm({ ...r });
    setEditing(r.id);
    setShowForm(true);
  }

  function cancelForm() {
    setForm(EMPTY);
    setEditing(null);
    setShowForm(false);
  }

  async function handleSave() {
    if (!form.source_path || !form.target_url) {
      toast({ title: "Source path and target URL are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await apiFetch(`/api/admin/seo/redirects/${editing}`, {
          method: "PUT",
          body: JSON.stringify({
            sourcePath: form.source_path,
            targetUrl: form.target_url,
            redirectType: form.redirect_type,
            isActive: form.is_active,
            note: form.note,
          }),
        });
        toast({ title: "Redirect updated" });
      } else {
        await apiFetch("/api/admin/seo/redirects", {
          method: "POST",
          body: JSON.stringify({
            sourcePath: form.source_path,
            targetUrl: form.target_url,
            redirectType: form.redirect_type,
            note: form.note,
          }),
        });
        toast({ title: "Redirect created" });
      }
      cancelForm();
      load();
    } catch (err: any) {
      toast({ title: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this redirect?")) return;
    try {
      await apiFetch(`/api/admin/seo/redirects/${id}`, { method: "DELETE" });
      toast({ title: "Redirect deleted" });
      load();
    } catch (err: any) {
      toast({ title: err.message, variant: "destructive" });
    }
  }

  async function handleToggle(r: Redirect) {
    try {
      await apiFetch(`/api/admin/seo/redirects/${r.id}`, {
        method: "PUT",
        body: JSON.stringify({ isActive: !r.is_active }),
      });
      load();
    } catch { }
  }

  async function handleBulkImport() {
    const lines = bulkText.trim().split("\n").filter(Boolean);
    let success = 0;
    let fail = 0;
    for (const line of lines) {
      const [src, tgt, type] = line.split(/[\t,]/).map(s => s.trim());
      if (!src || !tgt) { fail++; continue; }
      try {
        await apiFetch("/api/admin/seo/redirects", {
          method: "POST",
          body: JSON.stringify({ sourcePath: src, targetUrl: tgt, redirectType: type ? Number(type) : 301 }),
        });
        success++;
      } catch { fail++; }
    }
    toast({ title: `Imported ${success} redirects${fail > 0 ? `, ${fail} failed` : ""}` });
    setBulkText("");
    load();
  }

  const filtered = redirects.filter(r =>
    r.source_path.toLowerCase().includes(search.toLowerCase()) ||
    r.target_url.toLowerCase().includes(search.toLowerCase())
  );

  const inp = "w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors";

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Link2 className="h-6 w-6 text-purple-600" />
            Redirect Manager
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage 301/302 redirects to preserve SEO equity and fix broken URLs
          </p>
        </div>
        <button onClick={() => { setForm(EMPTY); setEditing(null); setShowForm(true); }}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
          <Plus className="h-4 w-4" /> Add Redirect
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Total", value: stats.total },
            { label: "Active", value: stats.active },
            { label: "Total Hits", value: Number(stats.total_hits || 0).toLocaleString() },
            { label: "301 Permanent", value: stats.permanent },
            { label: "302 Temporary", value: stats.temporary },
          ].map(s => (
            <div key={s.label} className="bg-white border rounded-xl p-3 text-center">
              <div className="text-xl font-bold">{s.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-muted p-1 rounded-lg w-fit">
        {(["list", "bulk"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 text-sm rounded-md font-medium transition-colors ${tab === t ? "bg-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            {t === "list" ? "Redirect List" : "Bulk Import"}
          </button>
        ))}
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
          <h3 className="font-semibold mb-4 text-sm">{editing ? "Edit Redirect" : "New Redirect"}</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium mb-1 block">Source Path *</label>
              <input className={inp} value={form.source_path} onChange={e => setForm(f => ({ ...f, source_path: e.target.value }))}
                placeholder="/old-url or /product/old-slug" />
              <p className="text-xs text-muted-foreground mt-1">The URL that will be redirected (your old URL)</p>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Target URL *</label>
              <input className={inp} value={form.target_url} onChange={e => setForm(f => ({ ...f, target_url: e.target.value }))}
                placeholder="/new-url or https://example.com/page" />
              <p className="text-xs text-muted-foreground mt-1">Where visitors will be redirected to</p>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Redirect Type</label>
              <select className={inp} value={form.redirect_type} onChange={e => setForm(f => ({ ...f, redirect_type: Number(e.target.value) }))}>
                <option value={301}>301 — Permanent (best for SEO)</option>
                <option value={302}>302 — Temporary</option>
                <option value={307}>307 — Temporary (keeps method)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Note (optional)</label>
              <input className={inp} value={form.note ?? ""} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                placeholder="Why this redirect was added" />
            </div>
          </div>
          <div className="flex items-center gap-3 mt-4">
            <button onClick={handleSave} disabled={saving}
              className="bg-primary text-primary-foreground px-5 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {saving ? "Saving…" : editing ? "Update" : "Create Redirect"}
            </button>
            <button onClick={cancelForm}
              className="px-4 py-2 rounded-lg text-sm border hover:bg-muted transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Bulk Import */}
      {tab === "bulk" && (
        <div className="bg-white border rounded-xl p-5">
          <h3 className="font-semibold mb-2">Bulk Import Redirects</h3>
          <p className="text-sm text-muted-foreground mb-4">
            One redirect per line. Format: <code className="bg-muted px-1 rounded text-xs">/old-path	/new-path	301</code> (tab or comma separated)
          </p>
          <textarea
            value={bulkText}
            onChange={e => setBulkText(e.target.value)}
            rows={10}
            className={inp + " font-mono text-xs"}
            placeholder={"/old-product-url\t/products/new-slug\t301\n/category/old\t/categories/new\t301"}
          />
          <button onClick={handleBulkImport} disabled={!bulkText.trim()}
            className="mt-3 bg-primary text-primary-foreground px-5 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
            Import Redirects
          </button>
        </div>
      )}

      {/* Redirect List */}
      {tab === "list" && (
        <div className="bg-white border rounded-xl overflow-hidden">
          <div className="p-4 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 pr-4 py-2 border rounded-lg text-sm w-full outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="Search by source or target URL…"
              />
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Link2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">{search ? "No redirects match your search" : "No redirects yet. Add your first redirect above."}</p>
            </div>
          ) : (
            <div className="divide-y">
              {filtered.map(r => (
                <div key={r.id} className={`flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors ${!r.is_active ? "opacity-50" : ""}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-sm">
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono truncate max-w-xs">{r.source_path}</code>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      <code className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-mono truncate max-w-xs">{r.target_url}</code>
                    </div>
                    {r.note && <div className="text-xs text-muted-foreground mt-0.5">{r.note}</div>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      r.redirect_type === 301 ? "bg-green-50 text-green-700" :
                      r.redirect_type === 302 ? "bg-amber-50 text-amber-700" :
                      "bg-blue-50 text-blue-700"}`}>
                      {r.redirect_type}
                    </span>
                    <span className="text-xs text-muted-foreground">{r.hits} hits</span>
                    <button onClick={() => handleToggle(r)} className="text-muted-foreground hover:text-foreground transition-colors" title={r.is_active ? "Deactivate" : "Activate"}>
                      {r.is_active ? <ToggleRight className="h-5 w-5 text-green-500" /> : <ToggleLeft className="h-5 w-5" />}
                    </button>
                    <button onClick={() => startEdit(r)} className="text-muted-foreground hover:text-foreground transition-colors">
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button onClick={() => handleDelete(r.id)} className="text-muted-foreground hover:text-red-500 transition-colors">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SEO Tips */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-amber-900 mb-2 flex items-center gap-1.5">
          <AlertTriangle className="h-4 w-4" /> SEO Best Practices
        </h3>
        <ul className="text-xs text-amber-800 space-y-1">
          <li>• Use <strong>301 Permanent</strong> redirects when a page has permanently moved — this passes 90-99% of link equity</li>
          <li>• Use <strong>302 Temporary</strong> only for seasonal promotions or A/B testing</li>
          <li>• Avoid redirect chains — each hop loses PageRank. Test: /old → /new ✅ not /old → /mid → /new</li>
          <li>• Add redirects immediately when you delete or rename products to prevent 404 errors</li>
        </ul>
      </div>
    </div>
  );
}
