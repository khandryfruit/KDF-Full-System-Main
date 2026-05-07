import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Megaphone, X, Trash2, Send, Edit3, CheckCircle, Clock, AlertCircle,
  Users, ShoppingBag, Tag, Link2, Image as ImageIcon,
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
  { value: "all", label: "All Customers", icon: Users, desc: "Send to all synced customers" },
  { value: "high_value", label: "High Value", icon: ShoppingBag, desc: "Customers who spent PKR 5,000+" },
  { value: "repeat", label: "Repeat Buyers", icon: CheckCircle, desc: "Customers with 2+ orders" },
  { value: "new", label: "New Customers", icon: Plus, desc: "Customers with exactly 1 order" },
];

const STATUS_CONFIG: Record<string, { color: string; icon: any; label: string }> = {
  draft: { color: "bg-gray-100 text-gray-700", icon: Edit3, label: "Draft" },
  running: { color: "bg-blue-100 text-blue-700", icon: Clock, label: "Running" },
  completed: { color: "bg-green-100 text-green-700", icon: CheckCircle, label: "Completed" },
  failed: { color: "bg-red-100 text-red-700", icon: AlertCircle, label: "Failed" },
};

const EMPTY_FORM = {
  name: "", message: "", imageUrl: "", targetSegment: "all",
  minOrderCount: "", minTotalSpent: "",
  discountCode: "", discountMessage: "",
  buttonShopNow: false, buttonViewProduct: false, buttonApplyDiscount: false,
  shopNowUrl: "", viewProductUrl: "",
};

export default function ShopifyCampaignsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editCampaign, setEditCampaign] = useState<any>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [confirmSend, setConfirmSend] = useState<any>(null);

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["shopify-campaigns"],
    queryFn: () => api("/admin/shopify/campaigns").then(r => r.json()),
    refetchInterval: 8000,
  });

  const f = (k: string, v: any) => setForm(prev => ({ ...prev, [k]: v }));

  const createMutation = useMutation({
    mutationFn: (data: any) => api("/admin/shopify/campaigns", { method: "POST", body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["shopify-campaigns"] }); setShowForm(false); setForm(EMPTY_FORM); toast({ title: "Campaign created" }); },
    onError: () => toast({ title: "Failed to create", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: any) => api(`/admin/shopify/campaigns/${id}`, { method: "PUT", body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["shopify-campaigns"] }); setEditCampaign(null); setShowForm(false); setForm(EMPTY_FORM); toast({ title: "Campaign updated" }); },
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api(`/admin/shopify/campaigns/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["shopify-campaigns"] }); toast({ title: "Campaign deleted" }); },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  const sendMutation = useMutation({
    mutationFn: (id: number) => api(`/admin/shopify/campaigns/${id}/send`, { method: "POST" }).then(r => r.json()),
    onSuccess: (data) => { qc.invalidateQueries({ queryKey: ["shopify-campaigns"] }); setConfirmSend(null); toast({ title: `Campaign launched — targeting ${data.targeting} customers` }); },
    onError: () => toast({ title: "Failed to send", variant: "destructive" }),
  });

  const handleSubmit = () => {
    const payload = {
      ...form,
      minOrderCount: form.minOrderCount ? parseInt(form.minOrderCount) : null,
      minTotalSpent: form.minTotalSpent ? form.minTotalSpent : null,
    };
    if (editCampaign) updateMutation.mutate({ id: editCampaign.id, data: payload });
    else createMutation.mutate(payload);
  };

  const openEdit = (c: any) => {
    setEditCampaign(c);
    setForm({
      name: c.name, message: c.message, imageUrl: c.imageUrl ?? "",
      targetSegment: c.targetSegment ?? "all",
      minOrderCount: c.minOrderCount ? String(c.minOrderCount) : "",
      minTotalSpent: c.minTotalSpent ? String(c.minTotalSpent) : "",
      discountCode: c.discountCode ?? "", discountMessage: c.discountMessage ?? "",
      buttonShopNow: c.buttonShopNow, buttonViewProduct: c.buttonViewProduct, buttonApplyDiscount: c.buttonApplyDiscount,
      shopNowUrl: c.shopNowUrl ?? "", viewProductUrl: c.viewProductUrl ?? "",
    });
    setShowForm(true);
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Shopify WA Campaigns</h1>
          <p className="text-muted-foreground text-sm">Create and send WhatsApp retargeting campaigns to Shopify customers</p>
        </div>
        <Button onClick={() => { setEditCampaign(null); setForm(EMPTY_FORM); setShowForm(true); }} className="gap-2">
          <Plus className="w-4 h-4" /> New Campaign
        </Button>
      </div>

      {/* Campaigns List */}
      {isLoading ? (
        <div className="p-12 text-center text-muted-foreground">Loading campaigns...</div>
      ) : campaigns.length === 0 ? (
        <div className="p-16 text-center bg-card border border-border rounded-xl">
          <Megaphone className="w-14 h-14 text-muted-foreground mx-auto mb-4" />
          <p className="text-xl font-semibold">No campaigns yet</p>
          <p className="text-muted-foreground text-sm mt-1 mb-4">Create your first WhatsApp retargeting campaign for Shopify customers</p>
          <Button onClick={() => { setEditCampaign(null); setForm(EMPTY_FORM); setShowForm(true); }} className="gap-2">
            <Plus className="w-4 h-4" /> Create Campaign
          </Button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {campaigns.map((c: any) => {
            const cfg = STATUS_CONFIG[c.status] ?? STATUS_CONFIG.draft;
            const Icon = cfg.icon;
            const seg = SEGMENTS.find(s => s.value === c.targetSegment);
            return (
              <div key={c.id} className="bg-card border border-border rounded-xl p-5 space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold truncate">{c.name}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${cfg.color}`}>
                        <Icon className="w-3 h-3" />{cfg.label}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{c.message}</p>
                  </div>
                  {c.imageUrl && (
                    <img src={c.imageUrl} alt="" className="w-12 h-12 rounded-lg object-cover border border-border shrink-0" />
                  )}
                </div>

                {/* Segment */}
                <div className="flex items-center gap-2 text-sm">
                  <Users className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">{seg?.label ?? c.targetSegment}</span>
                  {c.discountCode && (
                    <>
                      <span className="text-muted-foreground">·</span>
                      <Tag className="w-3.5 h-3.5 text-orange-500" />
                      <span className="text-orange-600 font-medium">{c.discountCode}</span>
                    </>
                  )}
                </div>

                {/* Buttons Preview */}
                {(c.buttonShopNow || c.buttonViewProduct || c.buttonApplyDiscount) && (
                  <div className="flex gap-1.5 flex-wrap">
                    {c.buttonShopNow && <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-1 rounded">🛒 Shop Now</span>}
                    {c.buttonViewProduct && <span className="text-xs bg-purple-50 text-purple-700 border border-purple-200 px-2 py-1 rounded">👁 View Product</span>}
                    {c.buttonApplyDiscount && <span className="text-xs bg-orange-50 text-orange-700 border border-orange-200 px-2 py-1 rounded">💰 Apply Discount</span>}
                  </div>
                )}

                {/* Stats */}
                {c.status === "completed" && (
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="bg-green-50 rounded-lg p-2"><p className="font-bold text-green-700 text-sm">{c.totalSent}</p><p className="text-green-600">Sent</p></div>
                    <div className="bg-blue-50 rounded-lg p-2"><p className="font-bold text-blue-700 text-sm">{c.totalDelivered}</p><p className="text-blue-600">Delivered</p></div>
                    <div className="bg-red-50 rounded-lg p-2"><p className="font-bold text-red-700 text-sm">{c.totalFailed}</p><p className="text-red-600">Failed</p></div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-1 border-t border-border">
                  {(c.status === "draft") && (
                    <Button size="sm" className="gap-1.5 flex-1 bg-green-600 hover:bg-green-700" onClick={() => setConfirmSend(c)}>
                      <Send className="w-3.5 h-3.5" /> Send Campaign
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => openEdit(c)} className="gap-1.5">
                    <Edit3 className="w-3.5 h-3.5" /> Edit
                  </Button>
                  <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => deleteMutation.mutate(c.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-card border border-border rounded-xl w-full max-w-2xl shadow-xl my-8">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h2 className="font-bold text-lg">{editCampaign ? "Edit Campaign" : "New Campaign"}</h2>
              <button onClick={() => { setShowForm(false); setEditCampaign(null); }}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <div className="p-5 space-y-5">
              {/* Name */}
              <div>
                <Label>Campaign Name *</Label>
                <Input className="mt-1" placeholder="e.g. Eid Sale Retargeting" value={form.name} onChange={e => f("name", e.target.value)} />
              </div>

              {/* Target Segment */}
              <div>
                <Label>Target Audience</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {SEGMENTS.map(s => {
                    const Icon = s.icon;
                    return (
                      <button key={s.value} onClick={() => f("targetSegment", s.value)}
                        className={`p-3 border rounded-lg text-left transition-colors ${form.targetSegment === s.value ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"}`}>
                        <div className="flex items-center gap-2 mb-0.5">
                          <Icon className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm font-medium">{s.label}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{s.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Optional filters */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Min Orders (optional)</Label>
                  <Input type="number" min="0" className="mt-1" placeholder="e.g. 3" value={form.minOrderCount} onChange={e => f("minOrderCount", e.target.value)} />
                </div>
                <div>
                  <Label>Min Total Spent PKR (optional)</Label>
                  <Input type="number" min="0" className="mt-1" placeholder="e.g. 10000" value={form.minTotalSpent} onChange={e => f("minTotalSpent", e.target.value)} />
                </div>
              </div>

              {/* Banner Image */}
              <div>
                <Label className="flex items-center gap-1.5"><ImageIcon className="w-4 h-4" /> Banner Image URL (optional)</Label>
                <Input className="mt-1" placeholder="https://..." value={form.imageUrl} onChange={e => f("imageUrl", e.target.value)} />
                {form.imageUrl && <img src={form.imageUrl} alt="" className="mt-2 h-24 object-cover rounded-lg border border-border" />}
              </div>

              {/* Message */}
              <div>
                <Label>Message *</Label>
                <p className="text-xs text-muted-foreground mt-0.5 mb-1">Use {"{name}"} for customer first name</p>
                <textarea className="w-full border border-border rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary" rows={5}
                  placeholder="Hi {name}! 🎉 We have an exclusive offer for you..." value={form.message} onChange={e => f("message", e.target.value)} />
              </div>

              {/* Discount */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="flex items-center gap-1.5"><Tag className="w-4 h-4" /> Discount Code</Label>
                  <Input className="mt-1" placeholder="EID20" value={form.discountCode} onChange={e => f("discountCode", e.target.value)} />
                </div>
                <div>
                  <Label>Discount Message</Label>
                  <Input className="mt-1" placeholder="20% off your order!" value={form.discountMessage} onChange={e => f("discountMessage", e.target.value)} />
                </div>
              </div>

              {/* Buttons */}
              <div>
                <Label className="flex items-center gap-1.5"><Link2 className="w-4 h-4" /> Call-to-Action Buttons</Label>
                <div className="space-y-3 mt-2">
                  <div className="flex items-start gap-3 p-3 border border-border rounded-lg">
                    <input type="checkbox" id="shopNow" checked={form.buttonShopNow} onChange={e => f("buttonShopNow", e.target.checked)} className="mt-0.5" />
                    <div className="flex-1">
                      <label htmlFor="shopNow" className="text-sm font-medium cursor-pointer">🛒 Shop Now Button</label>
                      {form.buttonShopNow && <Input className="mt-2" placeholder="https://your-store.com" value={form.shopNowUrl} onChange={e => f("shopNowUrl", e.target.value)} />}
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 border border-border rounded-lg">
                    <input type="checkbox" id="viewProduct" checked={form.buttonViewProduct} onChange={e => f("buttonViewProduct", e.target.checked)} className="mt-0.5" />
                    <div className="flex-1">
                      <label htmlFor="viewProduct" className="text-sm font-medium cursor-pointer">👁 View Product Button</label>
                      {form.buttonViewProduct && <Input className="mt-2" placeholder="https://your-store.com/products/xxx" value={form.viewProductUrl} onChange={e => f("viewProductUrl", e.target.value)} />}
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 border border-border rounded-lg">
                    <input type="checkbox" id="applyDiscount" checked={form.buttonApplyDiscount} onChange={e => f("buttonApplyDiscount", e.target.checked)} className="mt-0.5" />
                    <div className="flex-1">
                      <label htmlFor="applyDiscount" className="text-sm font-medium cursor-pointer">💰 Apply Discount Button</label>
                      <p className="text-xs text-muted-foreground">Will show the discount code</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Preview */}
              <div className="bg-[#ECE5DD] rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-2 font-medium">WhatsApp Preview</p>
                <div className="bg-white rounded-lg p-3 max-w-xs shadow-sm text-sm space-y-1">
                  {form.imageUrl && <img src={form.imageUrl} alt="" className="w-full rounded-lg mb-2 object-cover max-h-32" />}
                  <p className="whitespace-pre-wrap text-xs">
                    {(form.message || "Your message here...").replace("{name}", "Ahmed")}
                    {form.discountCode ? `\n\n🎁 Use code: *${form.discountCode}*` : ""}
                    {form.discountMessage ? `\n${form.discountMessage}` : ""}
                  </p>
                  {(form.buttonShopNow || form.buttonViewProduct || form.buttonApplyDiscount) && (
                    <div className="border-t pt-2 space-y-1">
                      {form.buttonShopNow && <div className="text-blue-600 text-xs text-center py-1 border border-blue-200 rounded">🛒 Shop Now</div>}
                      {form.buttonViewProduct && <div className="text-blue-600 text-xs text-center py-1 border border-blue-200 rounded">👁 View Product</div>}
                      {form.buttonApplyDiscount && <div className="text-blue-600 text-xs text-center py-1 border border-blue-200 rounded">💰 Apply Discount</div>}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-2 p-5 border-t border-border">
              <Button className="flex-1" onClick={handleSubmit} disabled={isSaving || !form.name || !form.message}>
                {isSaving ? "Saving..." : editCampaign ? "Update Campaign" : "Create Campaign"}
              </Button>
              <Button variant="outline" onClick={() => { setShowForm(false); setEditCampaign(null); }}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Send */}
      {confirmSend && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-sm shadow-xl">
            <div className="text-center">
              <Send className="w-12 h-12 text-primary mx-auto mb-3" />
              <h3 className="font-bold text-lg">Send Campaign?</h3>
              <p className="text-sm text-muted-foreground mt-1">
                <strong>{confirmSend.name}</strong> will be sent via WhatsApp to all matching Shopify customers.
              </p>
              <p className="text-xs text-muted-foreground mt-2">This action cannot be undone.</p>
            </div>
            <div className="flex gap-2 mt-5">
              <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={() => sendMutation.mutate(confirmSend.id)} disabled={sendMutation.isPending}>
                {sendMutation.isPending ? "Sending..." : "Yes, Send Now"}
              </Button>
              <Button variant="outline" onClick={() => setConfirmSend(null)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
