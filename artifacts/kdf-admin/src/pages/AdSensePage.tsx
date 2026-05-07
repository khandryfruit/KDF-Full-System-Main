import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DollarSign, LayoutDashboard, Layers, Monitor, Smartphone,
  FileText, CheckCircle2, AlertCircle, Eye, Code, Save,
  MessageSquare, Trash2, Check, X as XIcon,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const SLOT_META: Record<string, { label: string; description: string; icon: React.ElementType; color: string }> = {
  top_banner:    { label: "Top Banner",      description: "Below article title — high CTR zone",        icon: LayoutDashboard, color: "#3b82f6" },
  in_content_1:  { label: "In-Content Ad 1", description: "Auto-injected at article midpoint",          icon: FileText,        color: "#8b5cf6" },
  in_content_2:  { label: "In-Content Ad 2", description: "Auto-injected near article end",              icon: FileText,        color: "#a78bfa" },
  sidebar_sticky: { label: "Sidebar Sticky", description: "Desktop right sidebar — sticky scroll",       icon: Monitor,         color: "#06b6d4" },
  bottom_banner:  { label: "Bottom Banner",  description: "After article content — reader retention",    icon: Layers,          color: "#10b981" },
  mobile_sticky:  { label: "Mobile Sticky",  description: "Fixed bottom bar on mobile devices",          icon: Smartphone,      color: "#f59e0b" },
};

interface AdSlot {
  id: number;
  name: string;
  position: string;
  ad_code: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

function AdSlotEditor({ slot, onSave }: { slot: AdSlot; onSave: (id: number, data: Partial<AdSlot>) => void }) {
  const [code, setCode] = useState(slot.ad_code);
  const [name, setName] = useState(slot.name);
  const [active, setActive] = useState(slot.is_active);
  const meta = SLOT_META[slot.position] ?? { label: slot.name, description: "", icon: DollarSign, color: "#6b7280" };
  const Icon = meta.icon;
  const dirty = code !== slot.ad_code || active !== slot.is_active || name !== slot.name;

  return (
    <Card className="overflow-hidden border-0 shadow-sm">
      <div className="h-1" style={{ background: meta.color }} />
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${meta.color}18` }}>
              <Icon className="w-4 h-4" style={{ color: meta.color }} />
            </div>
            <div>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                className="h-7 text-sm font-semibold border-0 p-0 shadow-none focus-visible:ring-0 bg-transparent"
              />
              <p className="text-xs text-muted-foreground">{meta.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Switch checked={active} onCheckedChange={setActive} />
            <Label className="text-xs cursor-pointer" onClick={() => setActive(a => !a)}>
              {active ? <Badge variant="default" className="text-[10px] gap-1 bg-green-600"><CheckCircle2 className="w-3 h-3" />Active</Badge>
                      : <Badge variant="secondary" className="text-[10px] gap-1"><AlertCircle className="w-3 h-3" />Disabled</Badge>}
            </Label>
          </div>
        </div>

        <div className="relative">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Code className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Ad Code (HTML / AdSense script)</span>
          </div>
          <Textarea
            value={code}
            onChange={e => setCode(e.target.value)}
            placeholder={`<!-- Paste your AdSense/HTML ad code for "${meta.label}" here -->\n<!-- Leave blank to disable this slot -->\n\n<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXXXXXXXX" crossorigin="anonymous"></script>\n<ins class="adsbygoogle"\n  style="display:block"\n  data-ad-client="ca-pub-XXXXXXXXXX"\n  data-ad-slot="XXXXXXXXXX"\n  data-ad-format="auto"\n  data-full-width-responsive="true"></ins>\n<script>(adsbygoogle = window.adsbygoogle || []).push({});</script>`}
            rows={6}
            className="font-mono text-xs resize-none"
          />
        </div>

        <div className="flex items-center justify-between mt-3">
          <div className="text-xs text-muted-foreground">
            Position: <code className="bg-muted px-1 py-0.5 rounded text-[11px]">{slot.position}</code>
          </div>
          <Button
            size="sm" disabled={!dirty}
            onClick={() => onSave(slot.id, { name, ad_code: code, is_active: active })}
            className="gap-1.5 text-xs"
          >
            <Save className="w-3.5 h-3.5" />Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CommentRow({ comment, onApprove, onDelete }: { comment: any; onApprove: (id: number) => void; onDelete: (id: number) => void }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b last:border-0">
      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-muted text-xs font-bold">
        {comment.name?.charAt(0)?.toUpperCase() ?? "?"}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <span className="font-semibold text-sm">{comment.name}</span>
          {comment.email && <span className="text-xs text-muted-foreground">{comment.email}</span>}
          {comment.parent_id && <Badge variant="outline" className="text-[10px]">Reply</Badge>}
          {comment.is_approved
            ? <Badge className="text-[10px] bg-green-600 gap-1"><CheckCircle2 className="w-3 h-3" />Approved</Badge>
            : <Badge variant="destructive" className="text-[10px]">Pending</Badge>}
          <span className="text-[10px] text-muted-foreground ml-auto">
            {new Date(comment.created_at).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" })}
          </span>
        </div>
        <p className="text-sm text-foreground/80 line-clamp-2">{comment.content}</p>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        {!comment.is_approved && (
          <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50"
            onClick={() => onApprove(comment.id)}>
            <Check className="w-3.5 h-3.5" />
          </Button>
        )}
        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:bg-red-50"
          onClick={() => onDelete(comment.id)}>
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

export default function AdSensePage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: slots = [], isLoading: slotsLoading } = useQuery<AdSlot[]>({
    queryKey: ["/api/admin/blog-ads"],
    queryFn: async () => {
      const token = localStorage.getItem("kdf_admin_token") ?? "";
      const r = await fetch("/api/admin/blog-ads", { headers: { Authorization: `Bearer ${token}` } });
      return r.ok ? r.json() : [];
    },
  });

  const { data: comments = [], isLoading: commentsLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/blog-comments"],
    queryFn: async () => {
      const token = localStorage.getItem("kdf_admin_token") ?? "";
      const r = await fetch("/api/admin/blog-comments", { headers: { Authorization: `Bearer ${token}` } });
      return r.ok ? r.json() : [];
    },
  });

  const saveSlot = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<AdSlot> }) => {
      const token = localStorage.getItem("kdf_admin_token") ?? "";
      const r = await fetch(`/api/admin/blog-ads/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error();
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/blog-ads"] });
      toast({ title: "Ad slot saved", description: "Changes will appear on the blog immediately." });
    },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  const approveComment = useMutation({
    mutationFn: async (id: number) => {
      const token = localStorage.getItem("kdf_admin_token") ?? "";
      await fetch(`/api/admin/blog-comments/${id}/approve`, { method: "PUT", headers: { Authorization: `Bearer ${token}` } });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/blog-comments"] }),
  });

  const deleteComment = useMutation({
    mutationFn: async (id: number) => {
      const token = localStorage.getItem("kdf_admin_token") ?? "";
      await fetch(`/api/admin/blog-comments/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/blog-comments"] }),
  });

  const activeCount   = slots.filter(s => s.is_active && s.ad_code?.trim()).length;
  const pendingCount  = comments.filter(c => !c.is_approved).length;
  const approvedCount = comments.filter(c => c.is_approved).length;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-green-600" />
            Blog Monetization & Comments
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage Google AdSense placements and reader comments
          </p>
        </div>
        <div className="flex gap-3">
          <Card className="border-0 shadow-sm px-4 py-2.5 text-center">
            <p className="text-2xl font-black text-green-600">{activeCount}</p>
            <p className="text-xs text-muted-foreground">Active Ads</p>
          </Card>
          <Card className="border-0 shadow-sm px-4 py-2.5 text-center">
            <p className="text-2xl font-black text-amber-500">{pendingCount}</p>
            <p className="text-xs text-muted-foreground">Pending</p>
          </Card>
          <Card className="border-0 shadow-sm px-4 py-2.5 text-center">
            <p className="text-2xl font-black text-blue-500">{approvedCount}</p>
            <p className="text-xs text-muted-foreground">Approved</p>
          </Card>
        </div>
      </div>

      <Tabs defaultValue="ads">
        <TabsList>
          <TabsTrigger value="ads" className="gap-2"><DollarSign className="w-3.5 h-3.5" />Ad Slots ({slots.length})</TabsTrigger>
          <TabsTrigger value="comments" className="gap-2">
            <MessageSquare className="w-3.5 h-3.5" />Comments
            {pendingCount > 0 && <Badge className="ml-1 text-[10px] bg-amber-500">{pendingCount}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="guide" className="gap-2"><Eye className="w-3.5 h-3.5" />Setup Guide</TabsTrigger>
        </TabsList>

        {/* ── Ad Slots ── */}
        <TabsContent value="ads" className="mt-6">
          {slotsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-48 rounded-xl bg-muted animate-pulse" />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {slots.map(slot => (
                <AdSlotEditor
                  key={slot.id}
                  slot={slot}
                  onSave={(id, data) => saveSlot.mutate({ id, data })}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Comments ── */}
        <TabsContent value="comments" className="mt-6">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />Reader Comments ({comments.length})
                </CardTitle>
                {pendingCount > 0 && (
                  <Badge className="bg-amber-500 gap-1">
                    <AlertCircle className="w-3 h-3" />{pendingCount} pending review
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {commentsLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}
                </div>
              ) : comments.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No comments yet.</p>
                  <p className="text-xs mt-1">Comments from blog readers will appear here.</p>
                </div>
              ) : (
                <div>
                  {comments.map(c => (
                    <CommentRow
                      key={c.id}
                      comment={c}
                      onApprove={id => approveComment.mutate(id)}
                      onDelete={id => deleteComment.mutate(id)}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Setup Guide ── */}
        <TabsContent value="guide" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="text-base">Getting Started with AdSense</CardTitle></CardHeader>
              <CardContent className="space-y-4 text-sm">
                {[
                  { step: "1", title: "Create Google AdSense Account", desc: "Sign up at adsense.google.com with your business email." },
                  { step: "2", title: "Verify Your Site",               desc: "Add the AdSense verification meta tag to your site. Contact developer to add it to <head>." },
                  { step: "3", title: "Create Ad Units",                desc: "In AdSense dashboard → Ads → By ad unit → Display ads. Copy the ad code." },
                  { step: "4", title: "Paste Code Above",              desc: "Paste the full <script> + <ins> code in the relevant slot editor above and toggle Active." },
                  { step: "5", title: "Wait for Approval",             desc: "Google typically approves new sites within 1-2 weeks. Ads will show automatically after approval." },
                ].map(({ step, title, desc }) => (
                  <div key={step} className="flex gap-3">
                    <div className="w-6 h-6 rounded-full bg-green-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{step}</div>
                    <div><p className="font-semibold">{title}</p><p className="text-muted-foreground text-xs mt-0.5">{desc}</p></div>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Ad Placement Tips</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="p-3 rounded-lg bg-blue-50 border border-blue-100">
                  <p className="font-semibold text-blue-800">🏆 Highest CTR Slots</p>
                  <p className="text-blue-700 text-xs mt-1">Top Banner + In-Content Ads typically generate 60-70% of ad revenue.</p>
                </div>
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-100">
                  <p className="font-semibold text-amber-800">⚡ Performance Tips</p>
                  <ul className="text-amber-700 text-xs mt-1 space-y-1">
                    <li>• Use responsive ad units (auto size)</li>
                    <li>• Don't place more than 3 ads per page</li>
                    <li>• Ensure content is substantial (500+ words)</li>
                  </ul>
                </div>
                <div className="p-3 rounded-lg bg-green-50 border border-green-100">
                  <p className="font-semibold text-green-800">✅ Policy Safe</p>
                  <p className="text-green-700 text-xs mt-1">
                    All ad slots are CLS-safe, lazy-loaded, and AdSense policy compliant. No fake clicks or invalid traffic.
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-purple-50 border border-purple-100">
                  <p className="font-semibold text-purple-800">💡 Alternative: Custom Banner Ads</p>
                  <p className="text-purple-700 text-xs mt-1">You can also paste any HTML/image banner code — not just AdSense. Useful for brand partnerships.</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
