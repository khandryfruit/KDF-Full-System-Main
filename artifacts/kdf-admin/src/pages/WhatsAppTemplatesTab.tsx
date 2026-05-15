import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Loader2, Plus, Trash2, RefreshCw, Send, CheckCircle2,
  XCircle, Clock, FileText, AlertTriangle, ChevronDown, ChevronUp,
  Edit2, UploadCloud, RotateCcw, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const ADMIN_TOKEN = () => localStorage.getItem("kdf_admin_token") ?? "";
const authHeaders = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${ADMIN_TOKEN()}` });
async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { ...opts, headers: { ...authHeaders(), ...(opts?.headers ?? {}) } });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? `HTTP ${res.status}`); }
  return res.json();
}

const CATEGORIES = ["UTILITY", "MARKETING", "AUTHENTICATION"] as const;
const LANGUAGES = [
  { code: "en_US", label: "English (US)" },
  { code: "en", label: "English" },
  { code: "ur", label: "Urdu" },
];
const TRIGGER_EVENTS = [
  { value: "order_confirmation", label: "Order Confirmation" },
  { value: "paid_order_message", label: "Payment Received" },
  { value: "order_processing", label: "Order Processing" },
  { value: "order_shipped", label: "Shipment Update" },
  { value: "order_out_for_delivery", label: "Out for Delivery" },
  { value: "order_delivered", label: "Delivered" },
  { value: "cancel_order", label: "Cancel Order" },
  { value: "order_cancelled", label: "Order Cancelled (legacy)" },
  { value: "shipment_return_update", label: "Return / Refund Update" },
  { value: "abandoned_cart_recovery", label: "Abandoned Cart" },
  { value: "rider_assigned", label: "Rider Assigned" },
  { value: "order_failed_delivery", label: "Failed Delivery" },
];

const DEFAULT_TEMPLATES = [
  {
    name: "order_confirmation",
    category: "UTILITY",
    language: "en_US",
    triggerEvent: "order_confirmation",
    messageBody: "Your order {{1}} has been confirmed! ✅\n\nTotal: Rs. {{2}}\n\nThank you for shopping with KDF NUTS 🥜 We will notify you when your order ships.",
    footerText: "KDF NUTS - Premium Dry Fruits",
    paramCount: 2,
  },
  {
    name: "order_processing",
    category: "UTILITY",
    language: "en_US",
    triggerEvent: "order_processing",
    messageBody: "Your order {{1}} is being packed 📦 and will be ready for dispatch soon. We will keep you updated!",
    paramCount: 1,
  },
  {
    name: "order_shipped",
    category: "UTILITY",
    language: "en_US",
    triggerEvent: "order_shipped",
    messageBody: "Great news! Your order {{1}} has been shipped 🚚\n\nTracking ID: {{2}}\n\nExpected delivery: 2-3 working days.",
    paramCount: 2,
  },
  {
    name: "order_out_for_delivery",
    category: "UTILITY",
    language: "en_US",
    triggerEvent: "order_out_for_delivery",
    messageBody: "Your order {{1}} is out for delivery today 🛵 Please be available to receive it!",
    paramCount: 1,
  },
  {
    name: "order_delivered",
    category: "UTILITY",
    language: "en_US",
    triggerEvent: "order_delivered",
    messageBody: "Your order {{1}} has been delivered! ✅\n\nEnjoy your KDF NUTS products 🥜 Thank you for shopping with us!",
    paramCount: 1,
  },
  {
    name: "order_cancelled",
    category: "UTILITY",
    language: "en_US",
    triggerEvent: "order_cancelled",
    messageBody: "Your order {{1}} has been cancelled ❌\n\nIf you have any questions, please contact us. We are here to help!",
    paramCount: 1,
  },
  {
    name: "abandoned_cart_recovery",
    category: "MARKETING",
    language: "en_US",
    triggerEvent: "abandoned_cart_recovery",
    messageBody: "You left items in your cart! 🛒\n\nComplete your order now and enjoy premium dry fruits from KDF NUTS 🥜",
    paramCount: 0,
  },
];

type ApprovalStatus = "draft" | "pending" | "approved" | "rejected" | "paused";

interface Template {
  id: number;
  name: string;
  category: string;
  language: string;
  messageBody: string;
  headerText?: string | null;
  footerText?: string | null;
  paramCount: number;
  triggerEvent?: string | null;
  approvalStatus: ApprovalStatus;
  rejectionReason?: string | null;
  submittedToMeta: boolean;
  metaTemplateId?: string | null;
  metaSubmittedAt?: string | null;
  isActive: boolean;
}

const EMPTY_FORM = {
  name: "",
  category: "UTILITY" as string,
  language: "en_US",
  triggerEvent: "",
  headerText: "",
  messageBody: "",
  footerText: "",
  paramCount: 0,
  isActive: true,
};

function countParams(body: string) {
  const matches = body.match(/\{\{(\d+)\}\}/g);
  if (!matches) return 0;
  const nums = matches.map(m => parseInt(m.replace(/\{\{|\}\}/g, "")));
  return Math.max(...nums, 0);
}

function StatusBadge({ status }: { status: ApprovalStatus }) {
  const map: Record<ApprovalStatus, { label: string; className: string; icon: React.ReactNode }> = {
    draft:    { label: "Draft",    className: "bg-gray-50 text-gray-600 border-gray-200",    icon: <FileText className="w-3 h-3" /> },
    pending:  { label: "Pending",  className: "bg-amber-50 text-amber-700 border-amber-200", icon: <Clock className="w-3 h-3" /> },
    approved: { label: "Approved", className: "bg-green-50 text-green-700 border-green-200", icon: <CheckCircle2 className="w-3 h-3" /> },
    rejected: { label: "Rejected", className: "bg-red-50 text-red-700 border-red-200",       icon: <XCircle className="w-3 h-3" /> },
    paused:   { label: "Paused",   className: "bg-orange-50 text-orange-700 border-orange-200", icon: <AlertTriangle className="w-3 h-3" /> },
  };
  const s = map[status] ?? map.draft;
  return (
    <Badge variant="outline" className={`flex items-center gap-1 text-xs font-medium ${s.className}`}>
      {s.icon}{s.label}
    </Badge>
  );
}

export function WhatsAppTemplatesTab() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [actionLoading, setActionLoading] = useState<Record<number, string>>({});

  const { data: templates = [], isLoading } = useQuery<Template[]>({
    queryKey: ["/api/admin/whatsapp/templates"],
    queryFn: () => apiFetch("/api/admin/whatsapp/templates"),
  });

  const totalCount = templates.length;
  const approvedCount = templates.filter(t => t.approvalStatus === "approved").length;
  const pendingCount  = templates.filter(t => t.approvalStatus === "pending").length;
  const rejectedCount = templates.filter(t => t.approvalStatus === "rejected").length;
  const draftCount    = templates.filter(t => t.approvalStatus === "draft").length;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/admin/whatsapp/templates"] });
    qc.invalidateQueries({ queryKey: ["/api/admin/whatsapp/templates/approved"] });
    qc.invalidateQueries({ queryKey: ["/api/admin/whatsapp/templates/by-event"] });
    qc.invalidateQueries({ queryKey: ["/api/admin/whatsapp/meta-templates"] });
  };

  const syncFromMeta = useMutation({
    mutationFn: () => apiFetch("/api/admin/whatsapp/sync-meta-templates", { method: "POST" }),
    onSuccess: (r) => {
      invalidate();
      toast({
        title: "Synced from Meta",
        description: `${r.total} templates — ${r.created} new, ${r.updated} updated`,
      });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Meta sync failed", description: e.message }),
  });

  const createTemplate = useMutation({
    mutationFn: (data: typeof EMPTY_FORM) => apiFetch("/api/admin/whatsapp/templates", {
      method: "POST",
      body: JSON.stringify({ ...data, paramCount: countParams(data.messageBody) }),
    }),
    onSuccess: (d: any) => {
      invalidate();
      closeForm();
      toast({ title: d._skipped ? "A template with that name already exists" : "Template created!" });
    },
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });

  const updateTemplate = useMutation({
    mutationFn: ({ id, data }: { id: number; data: typeof EMPTY_FORM }) =>
      apiFetch(`/api/admin/whatsapp/templates/${id}`, {
        method: "PUT",
        body: JSON.stringify({ ...data, paramCount: countParams(data.messageBody) }),
      }),
    onSuccess: () => { invalidate(); closeForm(); toast({ title: "Template updated — resubmit to Meta to apply changes" }); },
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });

  const deleteTemplate = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/admin/whatsapp/templates/${id}`, { method: "DELETE" }),
    onSuccess: () => { invalidate(); toast({ title: "Template deleted" }); },
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });

  const seedTemplates = useMutation({
    mutationFn: async () => {
      const existing: Template[] = await apiFetch("/api/admin/whatsapp/templates");
      const existingNames = new Set(existing.map(t => t.name));
      const toAdd = DEFAULT_TEMPLATES.filter(t => !existingNames.has(t.name));
      if (!toAdd.length) return { added: 0 };
      for (const t of toAdd) await apiFetch("/api/admin/whatsapp/templates", { method: "POST", body: JSON.stringify(t) }).catch(() => {});
      return { added: toAdd.length };
    },
    onSuccess: (d: any) => {
      invalidate();
      toast({ title: d?.added === 0 ? "Already up to date" : `${d?.added} default template(s) added` });
    },
  });

  const fixFormat = useMutation({
    mutationFn: () => apiFetch("/api/admin/whatsapp/templates/fix-format", { method: "POST" }),
    onSuccess: (d: any) => {
      invalidate();
      toast({ title: d.fixed > 0 ? `Fixed ${d.fixed} template(s) — now using {{1}}, {{2}} format` : "All templates already use correct format" });
    },
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });

  async function submitToMeta(id: number) {
    setActionLoading(p => ({ ...p, [id]: "submit" }));
    try {
      const result = await apiFetch(`/api/admin/whatsapp/templates/${id}/submit-to-meta`, { method: "POST" });
      invalidate();
      toast({ title: `Submitted! Status: ${result.metaStatus ?? "pending"}` });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Submit failed", description: e.message });
    } finally {
      setActionLoading(p => ({ ...p, [id]: "" }));
    }
  }

  async function refreshStatus(id: number) {
    setActionLoading(p => ({ ...p, [id]: "refresh" }));
    try {
      const result = await apiFetch(`/api/admin/whatsapp/templates/${id}/refresh-status`, { method: "POST" });
      invalidate();
      toast({ title: `Status: ${result.metaStatus}` });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Refresh failed", description: e.message });
    } finally {
      setActionLoading(p => ({ ...p, [id]: "" }));
    }
  }

  function openCreate() {
    setForm({ ...EMPTY_FORM });
    setEditingId(null);
    setShowForm(true);
  }

  function openEdit(t: Template) {
    setForm({
      name: t.name,
      category: t.category,
      language: t.language,
      triggerEvent: t.triggerEvent ?? "",
      headerText: t.headerText ?? "",
      messageBody: t.messageBody,
      footerText: t.footerText ?? "",
      paramCount: t.paramCount,
      isActive: t.isActive,
    });
    setEditingId(t.id);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
  }

  function insertVar(varNum: number) {
    setForm(f => ({ ...f, messageBody: f.messageBody + `{{${varNum}}}` }));
  }

  function handleBodyChange(val: string) {
    setForm(f => ({ ...f, messageBody: val, paramCount: countParams(val) }));
  }

  function handleSubmitForm() {
    if (editingId !== null) {
      updateTemplate.mutate({ id: editingId, data: form });
    } else {
      createTemplate.mutate(form);
    }
  }

  const triggerLabel = (event: string) => TRIGGER_EVENTS.find(t => t.value === event)?.label ?? event;
  const langLabel = (code: string) => LANGUAGES.find(l => l.code === code)?.label ?? code;

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-foreground">WhatsApp Template Management</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Templates from Meta Business Manager appear here after sync. Approved templates auto-send on orders.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="default"
            size="sm"
            onClick={() => syncFromMeta.mutate()}
            disabled={syncFromMeta.isPending}
            className="gap-1.5 bg-[#25D366] hover:bg-[#1da851] text-white"
          >
            {syncFromMeta.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Sync from Meta
          </Button>
          <Button variant="outline" size="sm" onClick={() => fixFormat.mutate()} disabled={fixFormat.isPending} className="gap-1.5 border-orange-200 text-orange-700 hover:bg-orange-50">
            {fixFormat.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
            Fix Format
          </Button>
          <Button variant="outline" size="sm" onClick={() => seedTemplates.mutate()} disabled={seedTemplates.isPending} className="gap-1.5">
            {seedTemplates.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
            Add Defaults
          </Button>
          <Button size="sm" onClick={openCreate} style={{ backgroundColor: "#5FA800" }} className="text-white gap-1.5">
            <Plus className="w-3.5 h-3.5" />New Template
          </Button>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {[
          { label: "Total",    value: totalCount,    color: "text-foreground",    bg: "bg-muted/50" },
          { label: "Approved", value: approvedCount, color: "text-green-700",     bg: "bg-green-50" },
          { label: "Pending",  value: pendingCount,  color: "text-amber-700",     bg: "bg-amber-50" },
          { label: "Rejected", value: rejectedCount, color: "text-red-700",       bg: "bg-red-50" },
          { label: "Draft",    value: draftCount,    color: "text-muted-foreground", bg: "bg-muted/30" },
        ].map(s => (
          <div key={s.label} className={`rounded-lg border border-border ${s.bg} px-3 py-2 text-center`}>
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* ── Meta sync note ── */}
      <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 text-xs text-blue-800 flex items-start gap-2">
        <Zap className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-500" />
        <div>
          <span className="font-semibold">Meta sync: </span>
          Create templates in Meta Business Manager, then click <strong>Sync from Meta</strong>. Status (Approved / Pending / Rejected) updates automatically. Set <strong>Trigger Event</strong> to link each template to order automation. Server also syncs every 30 minutes.
        </div>
      </div>

      {/* ── Create / Edit Form ── */}
      {showForm && (
        <div className="border border-border rounded-xl overflow-hidden bg-card">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-muted/30">
            <p className="text-sm font-semibold">{editingId ? "Edit Template" : "New Template"}</p>
            <button onClick={closeForm} className="text-muted-foreground hover:text-foreground text-xs underline">Cancel</button>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Template Name <span className="text-red-500">*</span></Label>
                <Input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") }))}
                  placeholder="order_confirmation"
                  disabled={!!editingId}
                  className="font-mono text-sm"
                />
                <p className="text-[10px] text-muted-foreground">Lowercase letters, numbers, underscores only</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Category</Label>
                <select
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                >
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Language</Label>
                <select
                  value={form.language}
                  onChange={e => setForm(f => ({ ...f, language: e.target.value }))}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                >
                  {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Trigger Event (order automation)</Label>
              <select
                value={form.triggerEvent}
                onChange={e => setForm(f => ({ ...f, triggerEvent: e.target.value }))}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                <option value="">— None (manual use only) —</option>
                {TRIGGER_EVENTS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Header Text (optional)</Label>
              <Input
                value={form.headerText}
                onChange={e => setForm(f => ({ ...f, headerText: e.target.value }))}
                placeholder="KDF NUTS Order Update"
                maxLength={60}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">Message Body <span className="text-red-500">*</span></Label>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-muted-foreground mr-1">Insert variable:</span>
                  {[1, 2, 3, 4].map(n => (
                    <button
                      key={n}
                      onClick={() => insertVar(n)}
                      className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-border bg-muted hover:bg-muted/80 transition-colors"
                    >
                      {`{{${n}}}`}
                    </button>
                  ))}
                </div>
              </div>
              <Textarea
                value={form.messageBody}
                onChange={e => handleBodyChange(e.target.value)}
                rows={5}
                placeholder={"Hello! Your order {{1}} has been confirmed.\n\nTotal: Rs. {{2}}\n\nThank you for shopping with KDF NUTS!"}
                className="font-mono text-sm"
              />
              {form.paramCount > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {Array.from({ length: form.paramCount }).map((_, i) => (
                    <span key={i} className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 rounded px-1.5 py-0.5 font-mono">
                      {`{{${i + 1}}}`} = {i === 0 ? "order number" : i === 1 ? "total / tracking ID" : `param ${i + 1}`}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Footer Text (optional)</Label>
              <Input
                value={form.footerText}
                onChange={e => setForm(f => ({ ...f, footerText: e.target.value }))}
                placeholder="KDF NUTS - Premium Dry Fruits"
                maxLength={60}
              />
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                onClick={handleSubmitForm}
                disabled={createTemplate.isPending || updateTemplate.isPending || !form.name || !form.messageBody}
                style={{ backgroundColor: "#5FA800" }}
                className="text-white gap-1.5"
              >
                {(createTemplate.isPending || updateTemplate.isPending) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                {editingId ? "Save Changes" : "Create Template"}
              </Button>
              <Button size="sm" variant="outline" onClick={closeForm}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Template List ── */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" />Loading templates…
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border border-dashed rounded-xl">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-25" />
          <p className="text-sm font-medium">No templates yet</p>
          <p className="text-xs mt-1">Click "Add Defaults" to load the 7 standard order templates, or create your own.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map(t => {
            const isExpanded = expandedId === t.id;
            const isActioning = !!actionLoading[t.id];
            const actionType = actionLoading[t.id];

            return (
              <div key={t.id} className={`border rounded-xl overflow-hidden bg-card transition-all ${t.approvalStatus === "approved" ? "border-green-200" : t.approvalStatus === "rejected" ? "border-red-200" : "border-border"}`}>
                {/* Card header */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold truncate">{t.name}</span>
                    <StatusBadge status={t.approvalStatus as ApprovalStatus} />
                    <Badge variant="outline" className="text-[10px] bg-muted/50 text-muted-foreground border-border hidden sm:flex">
                      {t.category}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] bg-muted/50 text-muted-foreground border-border hidden sm:flex">
                      {langLabel(t.language)}
                    </Badge>
                    {t.triggerEvent && (
                      <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200 hidden md:flex gap-1">
                        <Zap className="w-2.5 h-2.5" />{triggerLabel(t.triggerEvent)}
                      </Badge>
                    )}
                    {t.paramCount > 0 && (
                      <span className="text-[10px] text-muted-foreground hidden lg:inline">
                        {t.paramCount} var{t.paramCount > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {/* Submit to Meta */}
                    {!t.submittedToMeta && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 text-xs h-7 px-2 text-blue-700 border-blue-200 hover:bg-blue-50"
                        onClick={() => submitToMeta(t.id)}
                        disabled={isActioning}
                        title="Submit to Meta for approval"
                      >
                        {isActioning && actionType === "submit" ? <Loader2 className="w-3 h-3 animate-spin" /> : <UploadCloud className="w-3 h-3" />}
                        <span className="hidden sm:inline">Submit</span>
                      </Button>
                    )}
                    {/* Resubmit (already submitted but body was edited or rejected) */}
                    {t.submittedToMeta && (t.approvalStatus === "rejected" || t.approvalStatus === "draft") && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 text-xs h-7 px-2 text-amber-700 border-amber-200 hover:bg-amber-50"
                        onClick={() => submitToMeta(t.id)}
                        disabled={isActioning}
                        title="Resubmit to Meta"
                      >
                        {isActioning && actionType === "submit" ? <Loader2 className="w-3 h-3 animate-spin" /> : <UploadCloud className="w-3 h-3" />}
                        <span className="hidden sm:inline">Resubmit</span>
                      </Button>
                    )}
                    {/* Refresh status */}
                    {t.submittedToMeta && (t.approvalStatus === "pending" || t.approvalStatus === "approved") && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 text-xs h-7 px-2"
                        onClick={() => refreshStatus(t.id)}
                        disabled={isActioning}
                        title="Refresh status from Meta"
                      >
                        {isActioning && actionType === "refresh" ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                        <span className="hidden sm:inline">Refresh</span>
                      </Button>
                    )}
                    {/* Edit */}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                      onClick={() => openEdit(t)}
                      title="Edit template"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </Button>
                    {/* Expand */}
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : t.id)}
                      className="h-7 w-7 flex items-center justify-center text-muted-foreground hover:text-foreground"
                    >
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                    {/* Delete */}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-red-500 hover:bg-red-50"
                      onClick={() => { if (confirm(`Delete "${t.name}"?`)) deleteTemplate.mutate(t.id); }}
                      title="Delete template"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Rejection reason */}
                {t.approvalStatus === "rejected" && t.rejectionReason && (
                  <div className="px-4 py-2 bg-red-50 border-t border-red-100 flex items-start gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-red-700"><span className="font-medium">Rejection reason:</span> {t.rejectionReason}</p>
                  </div>
                )}

                {/* Approved note */}
                {t.approvalStatus === "approved" && t.triggerEvent && (
                  <div className="px-4 py-2 bg-green-50 border-t border-green-100 flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                    <p className="text-xs text-green-700">
                      <span className="font-medium">Auto-sending enabled</span> — this template will be used automatically when <strong>{triggerLabel(t.triggerEvent)}</strong> event fires.
                    </p>
                  </div>
                )}

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-2 border-t border-border space-y-3">
                    {t.headerText && (
                      <div>
                        <p className="text-[10px] uppercase font-medium text-muted-foreground mb-1">Header</p>
                        <p className="text-xs text-foreground">{t.headerText}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-[10px] uppercase font-medium text-muted-foreground mb-1">Message Body</p>
                      <pre className="text-xs text-foreground whitespace-pre-wrap font-sans bg-muted/30 rounded-lg px-3 py-2 leading-relaxed">{t.messageBody}</pre>
                    </div>
                    {t.footerText && (
                      <div>
                        <p className="text-[10px] uppercase font-medium text-muted-foreground mb-1">Footer</p>
                        <p className="text-xs text-muted-foreground">{t.footerText}</p>
                      </div>
                    )}
                    {t.paramCount > 0 && (
                      <div>
                        <p className="text-[10px] uppercase font-medium text-muted-foreground mb-1">Variables ({t.paramCount})</p>
                        <div className="flex flex-wrap gap-1">
                          {Array.from({ length: t.paramCount }).map((_, i) => (
                            <span key={i} className="text-[10px] font-mono bg-blue-50 text-blue-700 border border-blue-200 rounded px-1.5 py-0.5">
                              {`{{${i + 1}}}`}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground pt-1">
                      {t.metaTemplateId && <span>Meta ID: <span className="font-mono">{t.metaTemplateId}</span></span>}
                      {t.metaSubmittedAt && <span>Submitted: {new Date(t.metaSubmittedAt).toLocaleDateString()}</span>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
