import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Mail, X, Trash2, Send, Edit3, CheckCircle, Clock, AlertCircle,
  BarChart2, Eye, MousePointer, Users, Image as ImageIcon, Tag, Link2,
  Sparkles, Calendar, ChevronDown, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

function api(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("kdf_admin_token") ?? "";
  return fetch(`/api${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts?.headers ?? {}) },
  });
}

const SEGMENTS = [
  { value: "all", label: "All Customers" },
  { value: "high_value", label: "High Value (PKR 5K+)" },
  { value: "repeat", label: "Repeat Buyers (2+ orders)" },
  { value: "new", label: "New Customers" },
  { value: "inactive", label: "Inactive (no order 90d)" },
];

const STATUS_CONFIG: Record<string, { color: string; icon: any; label: string }> = {
  draft: { color: "bg-gray-100 text-gray-700 border-gray-200", icon: Edit3, label: "Draft" },
  running: { color: "bg-blue-100 text-blue-700 border-blue-200", icon: Clock, label: "Sending" },
  completed: { color: "bg-green-100 text-green-700 border-green-200", icon: CheckCircle, label: "Completed" },
  failed: { color: "bg-red-100 text-red-700 border-red-200", icon: AlertCircle, label: "Failed" },
  scheduled: { color: "bg-purple-100 text-purple-700 border-purple-200", icon: Calendar, label: "Scheduled" },
};

const EMPTY_FORM = {
  name: "", subject: "", fromName: "",
  targetSegment: "all", minOrderCount: "", minTotalSpent: "",
  bannerImageUrl: "", headline: "", bodyText: "",
  discountCode: "", discountMessage: "",
  productTitle: "", productImageUrl: "", productUrl: "",
  ctaButtonText: "Shop Now", ctaButtonUrl: "",
  ctaButton2Text: "", ctaButton2Url: "",
  footerText: "© KDF NUTS · Pakistan's Premium Dry Fruits Store",
  scheduledAt: "",
};

function buildEmailPreview(form: typeof EMPTY_FORM): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:20px 0">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;max-width:600px;width:100%">
${form.bannerImageUrl ? `<tr><td><img src="${form.bannerImageUrl}" width="600" style="width:100%;display:block;max-height:240px;object-fit:cover" alt="Banner"></td></tr>` : ""}
<tr><td style="background:linear-gradient(135deg,#5FA800,#4d8a00);padding:24px 40px;text-align:center">
<h1 style="margin:0;color:#fff;font-size:26px;font-weight:900">KDF NUTS</h1>
<p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px">Pakistan's Premium Dry Fruits Store</p>
</td></tr>
<tr><td style="padding:32px 40px">
${form.headline ? `<h2 style="margin:0 0 16px;color:#1a1a1a;font-size:22px;font-weight:800">${form.headline}</h2>` : ""}
<div style="color:#555;font-size:15px;line-height:1.7;white-space:pre-wrap">${form.bodyText || "Your email content goes here..."}</div>
${form.productTitle || form.productImageUrl ? `
<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border:1px solid #eee;border-radius:10px;overflow:hidden">
<tr>
${form.productImageUrl ? `<td width="140" style="padding:0"><img src="${form.productImageUrl}" width="140" height="140" style="display:block;object-fit:cover" alt="Product"></td>` : ""}
<td style="padding:16px 20px;vertical-align:top">
${form.productTitle ? `<p style="margin:0 0 6px;font-weight:800;font-size:16px;color:#1a1a1a">${form.productTitle}</p>` : ""}
${form.productUrl ? `<a href="${form.productUrl}" style="color:#5FA800;font-size:13px;text-decoration:none">View Product →</a>` : ""}
</td></tr></table>` : ""}
${form.discountCode ? `
<div style="background:linear-gradient(135deg,#fff8f0,#fff3e0);border:2px dashed #F58300;border-radius:12px;padding:20px;text-align:center;margin:24px 0">
<p style="margin:0 0 8px;font-size:13px;color:#888;text-transform:uppercase;letter-spacing:1px">Special Offer</p>
${form.discountMessage ? `<p style="margin:0 0 12px;font-size:16px;color:#1a1a1a;font-weight:600">${form.discountMessage}</p>` : ""}
<p style="margin:0;font-size:28px;font-weight:900;color:#F58300;font-family:monospace;letter-spacing:3px">${form.discountCode}</p>
</div>` : ""}
${form.ctaButtonText && form.ctaButtonUrl ? `
<div style="text-align:center;margin:28px 0 16px">
<a href="${form.ctaButtonUrl}" style="display:inline-block;background:#5FA800;color:#fff;font-weight:700;font-size:16px;padding:14px 40px;border-radius:8px;text-decoration:none">${form.ctaButtonText}</a>
</div>` : ""}
${form.ctaButton2Text && form.ctaButton2Url ? `
<div style="text-align:center;margin:0 0 16px">
<a href="${form.ctaButton2Url}" style="display:inline-block;background:#F58300;color:#fff;font-weight:700;font-size:15px;padding:12px 32px;border-radius:8px;text-decoration:none">${form.ctaButton2Text}</a>
</div>` : ""}
</td></tr>
${form.footerText ? `<tr><td style="background:#f8f9fa;padding:16px 40px;text-align:center;border-top:1px solid #eee">
<p style="margin:0;color:#aaa;font-size:12px">${form.footerText}</p>
</td></tr>` : ""}
</table>
</td></tr></table>
</body></html>`;
}

export default function ShopifyEmailCampaignsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editCampaign, setEditCampaign] = useState<any>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [confirmSend, setConfirmSend] = useState<any>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<any>(null);

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["shopify-email-campaigns"],
    queryFn: () => api("/admin/shopify/email-campaigns").then(r => r.json()),
    refetchInterval: 8000,
  });

  const { data: logs = [] } = useQuery({
    queryKey: ["shopify-email-logs", selectedCampaign?.id],
    queryFn: () => api(`/admin/shopify/email-campaigns/${selectedCampaign.id}/logs`).then(r => r.json()),
    enabled: !!selectedCampaign,
    refetchInterval: 5000,
  });

  const f = (k: string, v: any) => setForm(prev => ({ ...prev, [k]: v }));

  const createMutation = useMutation({
    mutationFn: (data: any) => api("/admin/shopify/email-campaigns", { method: "POST", body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["shopify-email-campaigns"] }); setShowForm(false); setForm(EMPTY_FORM); setEditCampaign(null); toast({ title: "Email campaign created" }); },
    onError: () => toast({ title: "Failed to create", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: any) => api(`/admin/shopify/email-campaigns/${id}`, { method: "PUT", body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["shopify-email-campaigns"] }); setShowForm(false); setForm(EMPTY_FORM); setEditCampaign(null); toast({ title: "Campaign updated" }); },
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api(`/admin/shopify/email-campaigns/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["shopify-email-campaigns"] }); toast({ title: "Campaign deleted" }); },
  });

  const sendMutation = useMutation({
    mutationFn: (id: number) => api(`/admin/shopify/email-campaigns/${id}/send`, { method: "POST" }).then(r => r.json()),
    onSuccess: (data) => { qc.invalidateQueries({ queryKey: ["shopify-email-campaigns"] }); setConfirmSend(null); toast({ title: `Campaign launched — targeting ${data.targeting} recipients` }); },
    onError: (e: any) => toast({ title: e?.message ?? "Failed to launch", variant: "destructive" }),
  });

  const handleAiGenerate = async () => {
    if (!form.name && !form.headline && !form.bodyText) {
      toast({ title: "Add a campaign name or headline first", variant: "destructive" }); return;
    }
    setAiLoading(true);
    try {
      const r = await api("/admin/shopify/email-campaigns/ai-generate", {
        method: "POST",
        body: JSON.stringify({ name: form.name, headline: form.headline, bodyText: form.bodyText, discountCode: form.discountCode }),
      });
      const data = await r.json();
      if (data.subject) f("subject", data.subject);
      if (data.headline) f("headline", data.headline);
      if (data.bodyText) f("bodyText", data.bodyText);
      if (data.ctaButtonText) f("ctaButtonText", data.ctaButtonText);
      toast({ title: "AI content generated" });
    } catch { toast({ title: "AI generation failed", variant: "destructive" }); }
    setAiLoading(false);
  };

  const handleSubmit = () => {
    const payload = {
      ...form,
      minOrderCount: form.minOrderCount ? parseInt(form.minOrderCount) : null,
      minTotalSpent: form.minTotalSpent || null,
      scheduledAt: form.scheduledAt || null,
    };
    if (editCampaign) updateMutation.mutate({ id: editCampaign.id, data: payload });
    else createMutation.mutate(payload);
  };

  const openEdit = (c: any) => {
    setEditCampaign(c);
    setForm({
      name: c.name, subject: c.subject, fromName: c.fromName ?? "",
      targetSegment: c.targetSegment ?? "all",
      minOrderCount: c.minOrderCount ? String(c.minOrderCount) : "",
      minTotalSpent: c.minTotalSpent ? String(c.minTotalSpent) : "",
      bannerImageUrl: c.bannerImageUrl ?? "", headline: c.headline ?? "",
      bodyText: c.bodyText ?? "", discountCode: c.discountCode ?? "",
      discountMessage: c.discountMessage ?? "", productTitle: c.productTitle ?? "",
      productImageUrl: c.productImageUrl ?? "", productUrl: c.productUrl ?? "",
      ctaButtonText: c.ctaButtonText ?? "Shop Now", ctaButtonUrl: c.ctaButtonUrl ?? "",
      ctaButton2Text: c.ctaButton2Text ?? "", ctaButton2Url: c.ctaButton2Url ?? "",
      footerText: c.footerText ?? "© KDF NUTS · Pakistan's Premium Dry Fruits Store",
      scheduledAt: c.scheduledAt ? new Date(c.scheduledAt).toISOString().slice(0, 16) : "",
    });
    setShowForm(true);
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Email Campaigns</h1>
          <p className="text-muted-foreground text-sm">Create and send professional email campaigns to your Shopify customer database</p>
        </div>
        <Button onClick={() => { setEditCampaign(null); setForm(EMPTY_FORM); setShowForm(true); }} className="gap-2">
          <Plus className="w-4 h-4" /> New Campaign
        </Button>
      </div>

      {/* Overview stats */}
      {campaigns.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Total Campaigns", value: campaigns.length, icon: Mail, color: "text-blue-500" },
            { label: "Total Sent", value: campaigns.reduce((a: number, c: any) => a + (c.totalSent || 0), 0), icon: Send, color: "text-green-500" },
            { label: "Total Opened", value: campaigns.reduce((a: number, c: any) => a + (c.totalOpened || 0), 0), icon: Eye, color: "text-purple-500" },
            { label: "Total Clicked", value: campaigns.reduce((a: number, c: any) => a + (c.totalClicked || 0), 0), icon: MousePointer, color: "text-orange-500" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`w-4 h-4 ${color}`} />
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
              <p className="text-2xl font-bold">{value.toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}

      {/* Campaign List */}
      {isLoading ? (
        <div className="p-12 text-center text-muted-foreground">Loading campaigns...</div>
      ) : campaigns.length === 0 ? (
        <div className="p-16 text-center bg-card border border-border rounded-xl">
          <Mail className="w-14 h-14 text-muted-foreground mx-auto mb-4" />
          <p className="text-xl font-semibold">No email campaigns yet</p>
          <p className="text-muted-foreground text-sm mt-1 mb-4">Create your first email campaign to reach your customers</p>
          <Button onClick={() => { setEditCampaign(null); setForm(EMPTY_FORM); setShowForm(true); }} className="gap-2">
            <Plus className="w-4 h-4" /> Create Campaign
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c: any) => {
            const cfg = STATUS_CONFIG[c.status] ?? STATUS_CONFIG.draft;
            const Icon = cfg.icon;
            const openRate = c.totalSent > 0 ? ((c.totalOpened / c.totalSent) * 100).toFixed(1) : "0";
            const clickRate = c.totalSent > 0 ? ((c.totalClicked / c.totalSent) * 100).toFixed(1) : "0";
            return (
              <div key={c.id} className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="font-semibold truncate">{c.name}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full border flex items-center gap-1 ${cfg.color}`}>
                        <Icon className="w-3 h-3" />{cfg.label}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">Subject: {c.subject}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Audience: {SEGMENTS.find(s => s.value === c.targetSegment)?.label ?? c.targetSegment}</p>
                  </div>
                  {c.bannerImageUrl && (
                    <img src={c.bannerImageUrl} alt="" className="w-16 h-12 rounded-lg object-cover border border-border shrink-0" />
                  )}
                </div>

                {/* Analytics */}
                {c.status === "completed" && (
                  <div className="grid grid-cols-5 gap-2 mt-4 text-center text-xs">
                    <div className="bg-blue-50 rounded-lg p-2"><p className="font-bold text-blue-700 text-sm">{c.totalSent}</p><p className="text-blue-600">Sent</p></div>
                    <div className="bg-green-50 rounded-lg p-2"><p className="font-bold text-green-700 text-sm">{c.totalDelivered}</p><p className="text-green-600">Delivered</p></div>
                    <div className="bg-purple-50 rounded-lg p-2"><p className="font-bold text-purple-700 text-sm">{c.totalOpened}</p><p className="text-purple-600">Opened</p></div>
                    <div className="bg-orange-50 rounded-lg p-2"><p className="font-bold text-orange-700 text-sm">{c.totalClicked}</p><p className="text-orange-600">Clicked</p></div>
                    <div className="bg-red-50 rounded-lg p-2"><p className="font-bold text-red-700 text-sm">{c.totalFailed}</p><p className="text-red-600">Failed</p></div>
                  </div>
                )}
                {c.status === "completed" && c.totalSent > 0 && (
                  <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                    <span><Eye className="w-3 h-3 inline mr-0.5" />Open rate: <strong>{openRate}%</strong></span>
                    <span><MousePointer className="w-3 h-3 inline mr-0.5" />Click rate: <strong>{clickRate}%</strong></span>
                  </div>
                )}

                {/* Running progress */}
                {c.status === "running" && (
                  <div className="mt-3 flex items-center gap-2 text-sm text-blue-600">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Sending in progress... {c.totalSent} sent so far
                  </div>
                )}

                <div className="flex gap-2 mt-4 pt-3 border-t border-border flex-wrap">
                  {c.status === "draft" && (
                    <Button size="sm" className="gap-1.5 bg-green-600 hover:bg-green-700" onClick={() => setConfirmSend(c)}>
                      <Send className="w-3.5 h-3.5" /> Send Now
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => openEdit(c)} className="gap-1.5">
                    <Edit3 className="w-3.5 h-3.5" /> Edit
                  </Button>
                  {c.status === "completed" && (
                    <Button size="sm" variant="outline" onClick={() => setSelectedCampaign(selectedCampaign?.id === c.id ? null : c)} className="gap-1.5">
                      <BarChart2 className="w-3.5 h-3.5" /> {selectedCampaign?.id === c.id ? "Hide" : "View"} Logs
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => deleteMutation.mutate(c.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>

                {/* Logs */}
                {selectedCampaign?.id === c.id && (
                  <div className="mt-4 border-t border-border pt-4">
                    <p className="text-sm font-medium mb-2">Send Log ({logs.length} records)</p>
                    <div className="overflow-x-auto max-h-60 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead><tr className="border-b border-border">
                          {["Email", "Name", "Status", "Sent At"].map(h => <th key={h} className="text-left py-1.5 px-2 text-muted-foreground">{h}</th>)}
                        </tr></thead>
                        <tbody>
                          {logs.map((l: any) => (
                            <tr key={l.id} className="border-b border-border/50 last:border-0 hover:bg-muted/20">
                              <td className="py-1.5 px-2">{l.email}</td>
                              <td className="py-1.5 px-2 text-muted-foreground">{l.customerName || "—"}</td>
                              <td className="py-1.5 px-2">
                                <span className={`px-1.5 py-0.5 rounded text-xs ${l.status === "sent" ? "bg-green-100 text-green-700" : l.status === "failed" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"}`}>{l.status}</span>
                              </td>
                              <td className="py-1.5 px-2 text-muted-foreground">{l.sentAt ? new Date(l.sentAt).toLocaleTimeString() : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-2 overflow-y-auto">
          <div className="bg-card border border-border rounded-xl w-full max-w-4xl shadow-xl my-4">
            <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-card z-10 rounded-t-xl">
              <h2 className="font-bold text-lg">{editCampaign ? "Edit Email Campaign" : "New Email Campaign"}</h2>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setPreviewMode(p => !p)} className="gap-1.5">
                  <Eye className="w-3.5 h-3.5" /> {previewMode ? "Edit" : "Preview"}
                </Button>
                <button onClick={() => { setShowForm(false); setEditCampaign(null); setPreviewMode(false); }}><X className="w-5 h-5 text-muted-foreground" /></button>
              </div>
            </div>

            <div className={`${previewMode ? "hidden" : "block"} p-5 space-y-5 max-h-[75vh] overflow-y-auto`}>
              {/* Name + AI */}
              <div className="flex gap-2">
                <div className="flex-1">
                  <Label>Campaign Name *</Label>
                  <Input className="mt-1" placeholder="e.g. Eid Sale 2025" value={form.name} onChange={e => f("name", e.target.value)} />
                </div>
                <div className="pt-6">
                  <Button variant="outline" size="sm" onClick={handleAiGenerate} disabled={aiLoading} className="gap-1.5 h-10">
                    <Sparkles className={`w-4 h-4 ${aiLoading ? "animate-pulse text-purple-500" : "text-purple-400"}`} />
                    {aiLoading ? "Generating..." : "AI Write"}
                  </Button>
                </div>
              </div>

              {/* Subject + From Name */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Email Subject *</Label>
                  <Input className="mt-1" placeholder="🎉 Exclusive offer for you!" value={form.subject} onChange={e => f("subject", e.target.value)} />
                </div>
                <div>
                  <Label>From Name</Label>
                  <Input className="mt-1" placeholder="KDF NUTS" value={form.fromName} onChange={e => f("fromName", e.target.value)} />
                </div>
              </div>

              {/* Target + Filters */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Target Audience</Label>
                  <select value={form.targetSegment} onChange={e => f("targetSegment", e.target.value)} className="w-full mt-1 border border-border rounded-md px-3 py-2 text-sm bg-background">
                    {SEGMENTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Min Orders (optional)</Label>
                  <Input type="number" min="0" className="mt-1" value={form.minOrderCount} onChange={e => f("minOrderCount", e.target.value)} />
                </div>
                <div>
                  <Label>Min Spent PKR (optional)</Label>
                  <Input type="number" min="0" className="mt-1" value={form.minTotalSpent} onChange={e => f("minTotalSpent", e.target.value)} />
                </div>
              </div>

              {/* Banner */}
              <div>
                <Label className="flex items-center gap-1.5"><ImageIcon className="w-4 h-4" /> Banner Image URL</Label>
                <Input className="mt-1" placeholder="https://..." value={form.bannerImageUrl} onChange={e => f("bannerImageUrl", e.target.value)} />
              </div>

              {/* Headline + Body */}
              <div>
                <Label>Email Headline</Label>
                <Input className="mt-1" placeholder="Don't miss our exclusive Eid offers! 🎉" value={form.headline} onChange={e => f("headline", e.target.value)} />
              </div>
              <div>
                <Label>Email Body *</Label>
                <p className="text-xs text-muted-foreground mt-0.5 mb-1">Use {"{name}"} for customer first name</p>
                <textarea className="w-full border border-border rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary" rows={6}
                  placeholder="Hi {name},&#10;&#10;We have amazing offers just for you this season..." value={form.bodyText} onChange={e => f("bodyText", e.target.value)} />
              </div>

              {/* Product Section */}
              <div className="border border-border rounded-lg p-4 space-y-3">
                <Label className="flex items-center gap-2 text-sm font-semibold"><Tag className="w-4 h-4" /> Featured Product (optional)</Label>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <Label className="text-xs">Product Title</Label>
                    <Input className="mt-1" placeholder="Premium Mixed Nuts 500g" value={form.productTitle} onChange={e => f("productTitle", e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Product URL</Label>
                    <Input className="mt-1" placeholder="https://..." value={form.productUrl} onChange={e => f("productUrl", e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Product Image URL</Label>
                  <Input className="mt-1" placeholder="https://..." value={form.productImageUrl} onChange={e => f("productImageUrl", e.target.value)} />
                </div>
              </div>

              {/* Discount */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="flex items-center gap-1.5"><Tag className="w-4 h-4" /> Discount Code</Label>
                  <Input className="mt-1" placeholder="EID25" value={form.discountCode} onChange={e => f("discountCode", e.target.value)} />
                </div>
                <div>
                  <Label>Discount Message</Label>
                  <Input className="mt-1" placeholder="25% off your entire order!" value={form.discountMessage} onChange={e => f("discountMessage", e.target.value)} />
                </div>
              </div>

              {/* CTA Buttons */}
              <div className="border border-border rounded-lg p-4 space-y-3">
                <Label className="flex items-center gap-2 text-sm font-semibold"><Link2 className="w-4 h-4" /> Call-to-Action Buttons</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Button 1 Text</Label>
                    <Input className="mt-1" placeholder="Shop Now" value={form.ctaButtonText} onChange={e => f("ctaButtonText", e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Button 1 URL</Label>
                    <Input className="mt-1" placeholder="https://..." value={form.ctaButtonUrl} onChange={e => f("ctaButtonUrl", e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Button 2 Text (optional)</Label>
                    <Input className="mt-1" placeholder="View Deals" value={form.ctaButton2Text} onChange={e => f("ctaButton2Text", e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Button 2 URL (optional)</Label>
                    <Input className="mt-1" placeholder="https://..." value={form.ctaButton2Url} onChange={e => f("ctaButton2Url", e.target.value)} />
                  </div>
                </div>
              </div>

              {/* Footer + Schedule */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Footer Text</Label>
                  <Input className="mt-1" value={form.footerText} onChange={e => f("footerText", e.target.value)} />
                </div>
                <div>
                  <Label className="flex items-center gap-1.5"><Calendar className="w-4 h-4" /> Schedule (optional)</Label>
                  <Input type="datetime-local" className="mt-1" value={form.scheduledAt} onChange={e => f("scheduledAt", e.target.value)} />
                  <p className="text-xs text-muted-foreground mt-0.5">Leave blank to send immediately</p>
                </div>
              </div>
            </div>

            {/* Preview */}
            {previewMode && (
              <div className="p-5 max-h-[75vh] overflow-y-auto">
                <div className="bg-[#f4f4f4] rounded-xl p-4">
                  <div className="mb-3 text-sm">
                    <span className="text-muted-foreground">Subject: </span><strong>{form.subject || "(no subject)"}</strong>
                    <span className="ml-4 text-muted-foreground">From: </span><strong>{form.fromName || "KDF NUTS"}</strong>
                  </div>
                  <div className="border border-border rounded-xl overflow-hidden bg-white shadow">
                    <div className="overflow-auto" dangerouslySetInnerHTML={{ __html: buildEmailPreview(form) }} />
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-2 p-5 border-t border-border">
              <Button className="flex-1" onClick={handleSubmit} disabled={isSaving || !form.name || !form.subject || !form.bodyText}>
                {isSaving ? "Saving..." : editCampaign ? "Update Campaign" : "Create Campaign"}
              </Button>
              <Button variant="outline" onClick={() => { setShowForm(false); setEditCampaign(null); setPreviewMode(false); }}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Send */}
      {confirmSend && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-sm shadow-xl text-center">
            <Mail className="w-12 h-12 text-green-500 mx-auto mb-3" />
            <h3 className="font-bold text-lg">Send Email Campaign?</h3>
            <p className="text-sm text-muted-foreground mt-2"><strong>{confirmSend.name}</strong> will be sent to all matching customers with an email address.</p>
            <p className="text-xs text-muted-foreground mt-1">Requires SMTP configured in Email Settings.</p>
            <div className="flex gap-2 mt-5">
              <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={() => sendMutation.mutate(confirmSend.id)} disabled={sendMutation.isPending}>
                {sendMutation.isPending ? "Launching..." : "Send Now"}
              </Button>
              <Button variant="outline" onClick={() => setConfirmSend(null)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
