import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Landmark, Activity, ShieldCheck, AlertTriangle, Key,
  BarChart3, Download, RefreshCw, Search, Filter,
  CheckCircle, XCircle, Clock, MinusCircle,
  Copy, ExternalLink, Eye, Plus, Trash2,
  TrendingUp, TrendingDown, ArrowUpRight, ArrowDownLeft,
  CreditCard, Banknote, Wallet, QrCode, Globe,
  Smartphone, Code, Zap, Lock, Unlock,
  FileText, PieChart, DollarSign, Percent,
  AlertCircle, ShieldAlert, UserCheck, Monitor,
  ChevronRight, Info, Send, Upload, RotateCcw,
  Building2, Store, Package, Layers, Users,
  Receipt, ArrowLeftRight, Gauge, Star, Calendar,
  CircleDot, CheckCircle2, XOctagon, MessageCircle,
  Settings, Link2, Webhook, Server, Terminal, TestTube,
  Play, Wifi, WifiOff, FlaskConical, ScanLine, Share2,
  Mail, Phone, Printer, Hash, Ban, LayoutGrid,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

/* ═══════════════════════════════ API HELPERS ═════════════════════════ */
const ADMIN_TOKEN = () => localStorage.getItem("kdf_admin_token") ?? "";
const authHeaders = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${ADMIN_TOKEN()}` });

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...opts, headers: { ...authHeaders(), ...(opts?.headers ?? {}) } });
  if (!res.ok) { const e = await res.json().catch(() => ({ error: res.statusText })); throw new Error((e as any).error ?? res.statusText); }
  return res.json() as Promise<T>;
}

/* ═══════════════════════════════ TYPES ═══════════════════════════════ */
type PgTab = "overview" | "transactions" | "commission" | "disputes" | "merchants" | "analytics" | "security" | "reports" | "api-config" | "qr-payments" | "invoice-pay" | "refunds" | "settlement";

type TxnStatus = "success" | "pending" | "failed" | "refunded" | "held";
type DisputeStatus = "pending" | "under_review" | "approved" | "rejected" | "refunded";

interface PgTransaction {
  id: string; txnId: string; invoiceNo: string;
  customer: string; merchant: string;
  appSource: "kdf-admin" | "shopify" | "wordpress" | "laravel" | "mobile" | "custom";
  amount: number; gatewayCharge: number; commission: number; netAmount: number;
  method: "card" | "qr" | "bank" | "easypaisa" | "jazzcash" | "link";
  status: TxnStatus;
  gateway: string; createdAt: Date;
}

interface Dispute {
  id: string; txnId: string; customer: string; merchant: string;
  amount: number; reason: string; status: DisputeStatus;
  createdAt: Date; updatedAt: Date; evidence?: string;
}

interface MerchantKey {
  id: string; name: string; platform: string;
  apiKey: string; secretKey: string; webhookUrl: string;
  status: "active" | "inactive" | "suspended";
  txnCount: number; volume: number; createdAt: Date;
}

/* ═══════════════════════════════ MOCK DATA ══════════════════════════ */
const MOCK_TRANSACTIONS: PgTransaction[] = [
  { id: "t1",  txnId: "MBL2026050601234", invoiceNo: "INV-2026-001", customer: "Ahmed Khan",    merchant: "KDF MART",       appSource: "kdf-admin", amount: 5350,  gatewayCharge: 107,  commission: 54,   netAmount: 5189,  method: "card",      status: "success",  gateway: "Meezan EPG", createdAt: new Date("2026-05-06T10:30") },
  { id: "t2",  txnId: "MBL2026050601235", invoiceNo: "INV-2026-002", customer: "Sara Malik",    merchant: "KDF MART",       appSource: "shopify",   amount: 3400,  gatewayCharge: 68,   commission: 34,   netAmount: 3298,  method: "qr",        status: "pending",  gateway: "Meezan EPG", createdAt: new Date("2026-05-06T11:15") },
  { id: "t3",  txnId: "MBL2026050601236", invoiceNo: "INV-2026-003", customer: "Muhammad Ali",  merchant: "KDF MART",       appSource: "kdf-admin", amount: 12300, gatewayCharge: 246,  commission: 123,  netAmount: 11931, method: "bank",      status: "success",  gateway: "Manual",     createdAt: new Date("2026-05-06T12:00") },
  { id: "t4",  txnId: "MBL2026050601237", invoiceNo: "ORD-WP-0041",  customer: "Fatima Zahra",  merchant: "KDF WordPress",  appSource: "wordpress", amount: 2800,  gatewayCharge: 56,   commission: 28,   netAmount: 2716,  method: "card",      status: "failed",   gateway: "Meezan EPG", createdAt: new Date("2026-05-06T13:20") },
  { id: "t5",  txnId: "EP2026050601238",  invoiceNo: "INV-2026-005", customer: "Usman Tariq",   merchant: "KDF MART",       appSource: "kdf-admin", amount: 8900,  gatewayCharge: 178,  commission: 89,   netAmount: 8633,  method: "easypaisa", status: "success",  gateway: "EasyPaisa",  createdAt: new Date("2026-05-06T14:45") },
  { id: "t6",  txnId: "MBL2026050501239", invoiceNo: "ORD-SH-2201",  customer: "Ali Raza",      merchant: "KDF Shopify",    appSource: "shopify",   amount: 1500,  gatewayCharge: 30,   commission: 15,   netAmount: 1455,  method: "card",      status: "refunded", gateway: "Meezan EPG", createdAt: new Date("2026-05-05T09:00") },
  { id: "t7",  txnId: "MBL2026050501240", invoiceNo: "INV-2026-007", customer: "Hina Baig",     merchant: "KDF MART",       appSource: "kdf-admin", amount: 4200,  gatewayCharge: 84,   commission: 42,   netAmount: 4074,  method: "link",      status: "success",  gateway: "Meezan EPG", createdAt: new Date("2026-05-05T15:30") },
  { id: "t8",  txnId: "LRV2026050501241", invoiceNo: "ORD-LRV-0088", customer: "Kamran Shah",   merchant: "KDF Laravel App",appSource: "laravel",   amount: 7600,  gatewayCharge: 152,  commission: 76,   netAmount: 7372,  method: "card",      status: "success",  gateway: "Meezan EPG", createdAt: new Date("2026-05-05T16:00") },
  { id: "t9",  txnId: "MB2026050401242",  invoiceNo: "MOB-0034",     customer: "Zara Noor",     merchant: "KDF Mobile",     appSource: "mobile",    amount: 2200,  gatewayCharge: 44,   commission: 22,   netAmount: 2134,  method: "jazzcash",  status: "held",     gateway: "JazzCash",   createdAt: new Date("2026-05-04T10:00") },
  { id: "t10", txnId: "MBL2026050401243", invoiceNo: "ORD-SH-2202",  customer: "Bilal Ahmed",   merchant: "KDF Shopify",    appSource: "shopify",   amount: 9100,  gatewayCharge: 182,  commission: 91,   netAmount: 8827,  method: "card",      status: "success",  gateway: "Meezan EPG", createdAt: new Date("2026-05-04T14:30") },
];

const MOCK_DISPUTES: Dispute[] = [
  { id: "d1", txnId: "MBL2026050601237", customer: "Fatima Zahra",  merchant: "KDF WordPress", amount: 2800,  reason: "Payment deducted but order not confirmed",   status: "under_review", createdAt: new Date("2026-05-06T14:00"), updatedAt: new Date("2026-05-06T14:30") },
  { id: "d2", txnId: "MBL2026050501239", customer: "Ali Raza",      merchant: "KDF Shopify",   amount: 1500,  reason: "Duplicate charge — paid twice",              status: "refunded",     createdAt: new Date("2026-05-05T10:00"), updatedAt: new Date("2026-05-06T09:00") },
  { id: "d3", txnId: "EP2026040301244",  customer: "Sana Mirza",    merchant: "KDF MART",      amount: 3600,  reason: "Product not delivered — refund requested",   status: "pending",      createdAt: new Date("2026-05-03T11:00"), updatedAt: new Date("2026-05-03T11:00") },
  { id: "d4", txnId: "MBL2026040301245", customer: "Hamza Sheikh",  merchant: "KDF Laravel",   amount: 6200,  reason: "Unauthorized transaction",                   status: "approved",     createdAt: new Date("2026-05-02T09:00"), updatedAt: new Date("2026-05-04T15:00") },
  { id: "d5", txnId: "MB2026050401242",  customer: "Zara Noor",     merchant: "KDF Mobile",    amount: 2200,  reason: "Amount held incorrectly by gateway",         status: "under_review", createdAt: new Date("2026-05-04T11:00"), updatedAt: new Date("2026-05-05T10:00") },
];

const MOCK_MERCHANT_KEYS: MerchantKey[] = [
  { id: "m1", name: "KDF MART (Admin)",    platform: "kdf-admin",  apiKey: "kdf_live_ak_7x9mN3pQrT8vW2", secretKey: "kdf_live_sk_H4jK6nR1sY9bE5", webhookUrl: "https://admin.kdfmart.pk/webhook/payment", status: "active",    txnCount: 847,  volume: 2840000, createdAt: new Date("2026-01-01") },
  { id: "m2", name: "KDF Shopify Store",   platform: "shopify",    apiKey: "kdf_live_ak_2bR8mX5nQ7vP9",  secretKey: "kdf_live_sk_L9kT3wE6yN2cF8", webhookUrl: "https://kdfnuts.myshopify.com/webhook",    status: "active",    txnCount: 412,  volume: 1240000, createdAt: new Date("2026-01-15") },
  { id: "m3", name: "KDF WordPress Site",  platform: "wordpress",  apiKey: "kdf_live_ak_5nW3xK8mT2vR6",  secretKey: "kdf_live_sk_P7jN4eB9yQ1cM3", webhookUrl: "https://kdfnuts.com/wp/webhook",           status: "active",    txnCount: 189,  volume: 680000,  createdAt: new Date("2026-02-01") },
  { id: "m4", name: "KDF Laravel API",     platform: "laravel",    apiKey: "kdf_live_ak_9mR5xN7bT4vP2",  secretKey: "kdf_live_sk_W6kE3jY8nQ9cL1", webhookUrl: "https://api.kdfnuts.com/payment/callback", status: "active",    txnCount: 94,   volume: 380000,  createdAt: new Date("2026-02-15") },
  { id: "m5", name: "KDF Mobile App",      platform: "mobile",     apiKey: "kdf_live_ak_4xT7mB2nQ9vR5",  secretKey: "kdf_live_sk_K3jE8wN6yP1cF4", webhookUrl: "https://api.kdfnuts.com/mobile/callback",  status: "active",    txnCount: 203,  volume: 720000,  createdAt: new Date("2026-03-01") },
  { id: "m6", name: "KDF Custom App",      platform: "custom",     apiKey: "kdf_test_ak_3vB6mR9xT2nP7",  secretKey: "kdf_test_sk_Q8kN5eJ1yW4cM2", webhookUrl: "https://custom.kdfapp.pk/webhook",        status: "inactive",  txnCount: 12,   volume: 48000,   createdAt: new Date("2026-04-01") },
];

const LIVE_FEED = [
  { id: "l1", type: "success",  msg: "Card payment received — Ahmed Khan · Rs. 5,350 · KDF MART",         time: "2m ago" },
  { id: "l2", type: "pending",  msg: "QR payment initiated — Sara Malik · Rs. 3,400 · KDF Shopify",       time: "5m ago" },
  { id: "l3", type: "success",  msg: "EasyPaisa payment cleared — Usman Tariq · Rs. 8,900",               time: "8m ago" },
  { id: "l4", type: "failed",   msg: "Card declined — Fatima Zahra · Rs. 2,800 · WordPress · Retry #1",   time: "15m ago"},
  { id: "l5", type: "success",  msg: "Bank transfer confirmed — Muhammad Ali · Rs. 12,300 · Manual",       time: "22m ago"},
  { id: "l6", type: "dispute",  msg: "New dispute opened — Ali Raza · Rs. 1,500 · Shopify Store",         time: "1h ago" },
  { id: "l7", type: "success",  msg: "Laravel API payment — Kamran Shah · Rs. 7,600 · Meezan EPG",        time: "2h ago" },
  { id: "l8", type: "held",     msg: "Payment held for review — Zara Noor · Rs. 2,200 · JazzCash · Risk", time: "3h ago" },
];

const DAILY_DATA = [
  { day: "Mon", txns: 9,  vol: 28400,  comm: 284,  fail: 1 },
  { day: "Tue", txns: 12, vol: 34200,  comm: 342,  fail: 2 },
  { day: "Wed", txns: 7,  vol: 19800,  comm: 198,  fail: 0 },
  { day: "Thu", txns: 15, vol: 42100,  comm: 421,  fail: 3 },
  { day: "Fri", txns: 19, vol: 55300,  comm: 553,  fail: 1 },
  { day: "Sat", txns: 24, vol: 67800,  comm: 678,  fail: 2 },
  { day: "Sun", txns: 13, vol: 38900,  comm: 389,  fail: 1 },
];

/* ═══════════════════════════════ HELPERS ════════════════════════════ */
const fmt   = (n: number) => n.toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const fmtRs = (n: number) => `Rs. ${fmt(n)}`;
const genId = () => Math.random().toString(36).slice(2, 10).toUpperCase();

const SOURCE_CONFIG: Record<string, { label: string; color: string; icon: React.FC<any> }> = {
  "kdf-admin":  { label: "KDF Admin",   color: "bg-blue-50  text-blue-700  border-blue-200",  icon: Receipt   },
  "shopify":    { label: "Shopify",     color: "bg-[#96BF48]/10 text-[#5C9B2D] border-[#96BF48]/30", icon: Store },
  "wordpress":  { label: "WordPress",  color: "bg-sky-50   text-sky-700   border-sky-200",    icon: Globe     },
  "laravel":    { label: "Laravel",    color: "bg-red-50   text-red-700   border-red-200",    icon: Code      },
  "mobile":     { label: "Mobile App", color: "bg-purple-50 text-purple-700 border-purple-200", icon: Smartphone },
  "custom":     { label: "Custom App", color: "bg-slate-50 text-slate-700 border-slate-200",  icon: Layers    },
};

const METHOD_CONFIG: Record<string, { label: string; icon: React.FC<any> }> = {
  card:      { label: "Card",      icon: CreditCard  },
  qr:        { label: "QR Code",   icon: QrCode      },
  bank:      { label: "Bank",      icon: Building2   },
  easypaisa: { label: "EasyPaisa", icon: Smartphone  },
  jazzcash:  { label: "JazzCash",  icon: Wallet      },
  link:      { label: "Pay Link",  icon: Link2       },
};

const TXN_STATUS: Record<TxnStatus, { label: string; cls: string; icon: React.FC<any> }> = {
  success:  { label: "Success",  icon: CheckCircle, cls: "bg-green-50  text-green-700  border-green-200"  },
  pending:  { label: "Pending",  icon: Clock,       cls: "bg-amber-50  text-amber-700  border-amber-200"  },
  failed:   { label: "Failed",   icon: XCircle,     cls: "bg-red-50    text-red-700    border-red-200"    },
  refunded: { label: "Refunded", icon: MinusCircle, cls: "bg-blue-50   text-blue-700   border-blue-200"   },
  held:     { label: "On Hold",  icon: AlertCircle, cls: "bg-orange-50 text-orange-700 border-orange-200" },
};

const DISPUTE_STATUS: Record<DisputeStatus, { label: string; cls: string; icon: React.FC<any> }> = {
  pending:      { label: "Pending",      icon: Clock,         cls: "bg-amber-50  text-amber-700  border-amber-200"  },
  under_review: { label: "Under Review", icon: Eye,           cls: "bg-blue-50   text-blue-700   border-blue-200"   },
  approved:     { label: "Approved",     icon: CheckCircle,   cls: "bg-green-50  text-green-700  border-green-200"  },
  rejected:     { label: "Rejected",     icon: XCircle,       cls: "bg-red-50    text-red-700    border-red-200"    },
  refunded:     { label: "Refunded",     icon: ArrowDownLeft, cls: "bg-purple-50 text-purple-700 border-purple-200" },
};

const PLATFORM_CONFIG: Record<string, { label: string; color: string; icon: React.FC<any> }> = {
  "kdf-admin": { label: "KDF Admin",   color: "text-blue-600",   icon: Receipt    },
  "shopify":   { label: "Shopify",     color: "text-[#5C9B2D]",  icon: Store      },
  "wordpress": { label: "WordPress",   color: "text-sky-600",    icon: Globe      },
  "laravel":   { label: "Laravel",     color: "text-red-600",    icon: Code       },
  "mobile":    { label: "Mobile App",  color: "text-purple-600", icon: Smartphone },
  "custom":    { label: "Custom",      color: "text-slate-600",  icon: Layers     },
};

/* ═══════════════════════════════ MEEZAN TYPES ════════════════════════ */
interface MeezanTxn {
  id: number;
  meezanOrderId: string | null;
  meezanTxnId: string | null;
  invoiceNumber: string | null;
  orderId: number | null;
  amount: string;
  refundedAmount: string;
  currency: string;
  description: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  paymentMethod: string | null;
  cardMask: string | null;
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  refundReason: string | null;
  refundedAt: string | null;
  isLive: boolean;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

interface MeezanStats {
  total: number;
  paid: number;
  pending: number;
  failed: number;
  refunded: number;
  reversed: number;
  totalVolume: number;
  refundVolume: number;
  todayVolume: number;
  todayCount: number;
}

interface MeezanSettings {
  id?: number;
  environment: string;
  sandboxUsername?: string | null;
  sandboxPassword?: string | null;
  sandboxMerchantId?: string | null;
  liveUsername?: string | null;
  livePassword?: string | null;
  liveMerchantId?: string | null;
  returnUrl?: string | null;
  failUrl?: string | null;
  callbackUrl?: string | null;
  webhookSecret?: string | null;
  isActive?: boolean;
}

const MEEZAN_STATUS_MAP: Record<string, { label: string; cls: string; icon: React.FC<any> }> = {
  initiated:    { label: "Initiated",     icon: Clock,         cls: "bg-slate-50  text-slate-700  border-slate-200" },
  pending:      { label: "Pending",       icon: Clock,         cls: "bg-amber-50  text-amber-700  border-amber-200" },
  paid:         { label: "Paid",          icon: CheckCircle,   cls: "bg-green-50  text-green-700  border-green-200" },
  failed:       { label: "Failed",        icon: XCircle,       cls: "bg-red-50    text-red-700    border-red-200"   },
  refunded:     { label: "Refunded",      icon: ArrowDownLeft, cls: "bg-blue-50   text-blue-700   border-blue-200"  },
  partial_refund:{ label: "Part.Refund",  icon: MinusCircle,   cls: "bg-indigo-50 text-indigo-700 border-indigo-200"},
  reversed:     { label: "Reversed",      icon: RotateCcw,     cls: "bg-purple-50 text-purple-700 border-purple-200"},
  disputed:     { label: "Disputed",      icon: AlertCircle,   cls: "bg-orange-50 text-orange-700 border-orange-200"},
  chargeback:   { label: "Chargeback",    icon: AlertTriangle, cls: "bg-red-50    text-red-700    border-red-200"   },
};

/* ═══════════════════════════════ SUB-COMPONENTS ════════════════════ */

/* ── Live Feed Item ── */
function FeedItem({ item }: { item: typeof LIVE_FEED[0] }) {
  const dot = item.type === "success" ? "bg-green-500" : item.type === "failed" ? "bg-red-500" : item.type === "dispute" ? "bg-orange-500" : item.type === "held" ? "bg-yellow-500" : "bg-amber-500";
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border/50 last:border-0 hover:bg-muted/20 px-5 transition-colors">
      <span className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${dot} ${item.type === "success" ? "animate-pulse" : ""}`} />
      <p className="text-xs text-muted-foreground flex-1 leading-relaxed">{item.msg}</p>
      <span className="text-[10px] text-muted-foreground shrink-0 font-mono">{item.time}</span>
    </div>
  );
}

/* ── Live Feed Panel — real transactions (30s polling) ── */
function LiveFeedPanel() {
  const { data, isLoading } = useQuery<{ transactions: MeezanTxn[] }>({
    queryKey: ["meezan-txns-feed"],
    queryFn:  () => apiFetch("/api/admin/meezan/transactions?limit=5"),
    refetchInterval: 30000,
  });

  const items = (data?.transactions ?? []).map(t => {
    const status = t.status as string;
    const type = status === "paid" ? "success" : status === "failed" ? "failed" : status === "disputed" ? "dispute" : status === "held" ? "held" : "pending";
    const amt  = `Rs. ${Number(t.amount).toLocaleString("en-PK")}`;
    const who  = t.customerName ?? t.customerPhone ?? "Customer";
    const ref  = t.invoiceNumber ?? t.meezanOrderId ?? `#${t.id}`;
    const when = (() => {
      const diff = Math.floor((Date.now() - new Date(t.createdAt).getTime()) / 1000);
      if (diff < 60)   return `${diff}s ago`;
      if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
      return `${Math.floor(diff / 3600)}h ago`;
    })();
    const labels: Record<string, string> = { paid: "Payment received", failed: "Payment failed", pending: "Payment pending", initiated: "Payment initiated", held: "Payment held", refunded: "Refund issued", reversed: "Payment reversed" };
    const label = labels[status] ?? "Transaction";
    return { id: String(t.id), type, msg: `${label} — ${who} · ${amt} · ${ref}`, time: when };
  });

  const fallback = LIVE_FEED.slice(0, 5);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <h3 className="font-semibold text-sm">Live Feed</h3>
        </div>
        <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200">● Live</Badge>
      </div>
      <div className="overflow-y-auto max-h-64">
        {isLoading
          ? <div className="flex items-center justify-center py-8 text-muted-foreground text-xs gap-2"><RefreshCw className="w-3.5 h-3.5 animate-spin" />Loading…</div>
          : items.length > 0
            ? items.map(item => <FeedItem key={item.id} item={item} />)
            : fallback.map(item => <FeedItem key={item.id} item={item} />)
        }
      </div>
      <div className="px-5 py-3 border-t border-border"><Button variant="ghost" size="sm" className="w-full text-xs gap-1">View all activity <ChevronRight className="w-3 h-3" /></Button></div>
    </div>
  );
}

/* ── Overview Tab ── */
function OverviewTab() {
  const { toast } = useToast();
  const { data: stats } = useQuery<MeezanStats>({
    queryKey: ["meezan-stats"],
    queryFn:  () => apiFetch("/api/admin/meezan/stats"),
    refetchInterval: 30000,
  });

  const totalVol   = stats?.totalVolume ?? MOCK_TRANSACTIONS.filter(t => t.status === "success").reduce((s, t) => s + t.amount, 0);
  const totalComm  = 0;
  const totalFees  = 0;
  const pendingVol = stats ? 0 : MOCK_TRANSACTIONS.filter(t => t.status === "pending").reduce((s, t) => s + t.amount, 0);
  const maxVol = Math.max(...DAILY_DATA.map(d => d.vol));

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Volume",      value: fmtRs(totalVol),                                    sub: `${stats?.paid ?? 0} paid transactions`,    icon: DollarSign, color: "from-blue-600 to-blue-700",   iconBg: "bg-blue-500/20" },
          { label: "Today's Volume",    value: fmtRs(stats?.todayVolume ?? 0),                     sub: `${stats?.todayCount ?? 0} transactions today`,icon: TrendingUp, color: "from-green-600 to-green-700", iconBg: "bg-green-500/20" },
          { label: "Refunds Issued",    value: fmtRs(stats?.refundVolume ?? 0),                    sub: `${stats?.refunded ?? 0} refunded`,           icon: ArrowDownLeft,color:"from-purple-600 to-purple-700",iconBg: "bg-purple-500/20"},
          { label: "Pending / Failed",  value: String((stats?.pending ?? 0) + (stats?.failed ?? 0)),sub: "Awaiting confirmation",                     icon: Clock,      color: "from-amber-500 to-amber-600",  iconBg: "bg-amber-500/20" },
        ].map(s => (
          <div key={s.label} className={`bg-gradient-to-br ${s.color} rounded-xl p-5 text-white`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs text-white/70 font-medium uppercase tracking-wide">{s.label}</p>
                <p className="text-2xl font-black mt-1 leading-tight">{s.value}</p>
                <p className="text-xs text-white/60 mt-1">{s.sub}</p>
              </div>
              <div className={`w-10 h-10 rounded-xl ${s.iconBg} flex items-center justify-center shrink-0`}>
                <s.icon className="w-5 h-5 text-white" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: "Total Txns",  value: String(stats?.total    ?? 0), icon: Activity,       cls: "text-blue-600   bg-blue-50  " },
          { label: "Paid",        value: String(stats?.paid     ?? 0), icon: CheckCircle,    cls: "text-green-600  bg-green-50 " },
          { label: "Pending",     value: String(stats?.pending  ?? 0), icon: Clock,          cls: "text-amber-600  bg-amber-50 " },
          { label: "Failed",      value: String(stats?.failed   ?? 0), icon: XCircle,        cls: "text-red-600    bg-red-50   " },
          { label: "Refunded",    value: String(stats?.refunded ?? 0), icon: ArrowDownLeft,  cls: "text-purple-600 bg-purple-50" },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${s.cls}`}><s.icon className="w-4 h-4" /></div>
            <div><p className="text-xs text-muted-foreground">{s.label}</p><p className="text-xl font-bold">{s.value}</p></div>
          </div>
        ))}
      </div>

      {/* Chart + Live Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Daily volume chart */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2"><BarChart3 className="w-4 h-4 text-muted-foreground" /><h3 className="font-semibold">Daily Transaction Volume</h3></div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">{fmtRs(DAILY_DATA.reduce((s, d) => s + d.vol, 0))} / week</Badge>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1"><RefreshCw className="w-3 h-3" /> Refresh</Button>
            </div>
          </div>
          <div className="px-6 py-6">
            <div className="flex items-end gap-3 h-40">
              {DAILY_DATA.map(d => {
                const pct = (d.vol / maxVol) * 100;
                return (
                  <div key={d.day} className="flex-1 flex flex-col items-center gap-1.5 group cursor-pointer">
                    <div className="text-[9px] text-muted-foreground font-mono opacity-0 group-hover:opacity-100 transition-opacity">{(d.vol / 1000).toFixed(0)}K</div>
                    <div className="w-full rounded-t-lg relative overflow-hidden transition-all group-hover:brightness-110" style={{ height: `${Math.max(8, pct)}%`, minHeight: "8px" }}>
                      <div className="absolute inset-0 bg-gradient-to-t from-blue-700 to-blue-400 rounded-t-lg" />
                      {d.fail > 0 && <div className="absolute bottom-0 left-0 right-0 bg-red-500/60" style={{ height: `${(d.fail / d.txns) * 100}%` }} />}
                    </div>
                    <span className="text-[9px] font-medium text-muted-foreground">{d.day}</span>
                    <span className="text-[8px] text-muted-foreground">{d.txns} txn</span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-4 mt-3 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" />Successful</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500/60" />Failed</span>
            </div>
          </div>
        </div>

        {/* Live Transaction Feed — real data */}
        <LiveFeedPanel />
      </div>

      {/* Source breakdown + Method breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* App source breakdown */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2"><Layers className="w-4 h-4 text-muted-foreground" /><h3 className="font-semibold">Volume by Source</h3></div>
          <div className="px-5 py-4 space-y-3">
            {[
              { source: "kdf-admin",  vol: 30750, pct: 42 },
              { source: "shopify",    vol: 10600, pct: 22 },
              { source: "laravel",    vol: 7600,  pct: 15 },
              { source: "mobile",     vol: 2200,  pct: 11 },
              { source: "wordpress",  vol: 2800,  pct: 7  },
              { source: "custom",     vol: 0,     pct: 3  },
            ].map(s => {
              const conf = SOURCE_CONFIG[s.source];
              return (
                <div key={s.source} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <conf.icon className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="font-medium">{conf.label}</span>
                    </div>
                    <span className="text-muted-foreground">{s.pct}% · {fmtRs(s.vol)}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-400" style={{ width: `${s.pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Payment methods */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2"><PieChart className="w-4 h-4 text-muted-foreground" /><h3 className="font-semibold">Payment Methods</h3></div>
          <div className="px-5 py-4 space-y-3">
            {[
              { method: "Card (Debit/Credit)", pct: 47, color: "from-blue-600 to-blue-400"    },
              { method: "Bank Transfer",       pct: 24, color: "from-purple-600 to-purple-400" },
              { method: "EasyPaisa",           pct: 14, color: "from-green-600 to-green-400"   },
              { method: "Pay Link",            pct: 8,  color: "from-indigo-600 to-indigo-400" },
              { method: "QR Code",             pct: 5,  color: "from-amber-600 to-amber-400"   },
              { method: "JazzCash",            pct: 2,  color: "from-red-600 to-red-400"       },
            ].map(m => (
              <div key={m.method} className="space-y-1">
                <div className="flex items-center justify-between text-xs"><span className="text-muted-foreground">{m.method}</span><span className="font-semibold">{m.pct}%</span></div>
                <div className="h-2 bg-muted rounded-full overflow-hidden"><div className={`h-full rounded-full bg-gradient-to-r ${m.color}`} style={{ width: `${m.pct}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Gateway config summary */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center"><Landmark className="w-5 h-5 text-white" /></div>
            <div><h3 className="font-semibold">Active Gateways</h3><p className="text-xs text-muted-foreground">Connected payment processors</p></div>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs"><Plus className="w-3.5 h-3.5" /> Add Gateway</Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border">
          {[
            { name: "Meezan Bank EPG", mode: "Sandbox", fee: "2%", txns: "847", status: "active", color: "bg-blue-600" },
            { name: "EasyPaisa",       mode: "Live",    fee: "1.5%", txns: "203", status: "active", color: "bg-green-600" },
            { name: "JazzCash",        mode: "Live",    fee: "1.8%", txns: "89",  status: "active", color: "bg-red-600"  },
          ].map(g => (
            <div key={g.name} className="px-5 py-4 flex items-center gap-4">
              <div className={`w-10 h-10 rounded-xl ${g.color} flex items-center justify-center shrink-0`}><Landmark className="w-5 h-5 text-white" /></div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2"><p className="font-semibold text-sm">{g.name}</p><Badge variant="outline" className={`text-[9px] ${g.status === "active" ? "bg-green-50 text-green-700 border-green-200" : "bg-muted"}`}>● {g.mode}</Badge></div>
                <p className="text-xs text-muted-foreground mt-0.5">Fee: {g.fee} · {g.txns} transactions</p>
              </div>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0"><Settings className="w-3.5 h-3.5" /></Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Meezan Transaction Detail Dialog ── */
function MeezanTxnDialog({ txn, onClose }: { txn: MeezanTxn | null; onClose: () => void }) {
  if (!txn) return null;
  const st = MEEZAN_STATUS_MAP[txn.status] ?? MEEZAN_STATUS_MAP.pending;
  const StIcon = st.icon;
  return (
    <Dialog open={!!txn} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Activity className="w-5 h-5" />Transaction Detail</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="bg-muted/30 rounded-xl p-4 space-y-2">
            {([ ["Meezan Order ID", txn.meezanOrderId ?? "—"], ["Meezan Txn ID", txn.meezanTxnId ?? "—"], ["Invoice / Order", txn.invoiceNumber ?? "—"], ["Customer", txn.customerName ?? "—"], ["Phone", txn.customerPhone ?? "—"], ["Description", txn.description ?? "—"], ["Card Mask", txn.cardMask ?? "—"], ["Payment Method", txn.paymentMethod ?? "—"], ["Date & Time", new Date(txn.createdAt).toLocaleString("en-PK")], ["Completed At", txn.completedAt ? new Date(txn.completedAt).toLocaleString("en-PK") : "—"], ["Environment", txn.isLive ? "🔴 Live" : "🔵 Sandbox"], ] as [string, string][]).map(([l, v]) => (
              <div key={l} className="flex items-center justify-between text-sm border-b border-border/50 last:border-0 py-1.5">
                <span className="text-muted-foreground text-xs">{l}</span>
                <span className="font-medium font-mono text-xs">{v}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-blue-50 rounded-xl p-3 text-center"><p className="text-xs text-blue-600">Amount (PKR)</p><p className="text-xl font-black text-blue-800">{fmtRs(Number(txn.amount))}</p></div>
            <div className="bg-red-50 rounded-xl p-3 text-center"><p className="text-xs text-red-600">Refunded</p><p className="text-xl font-black text-red-800">{fmtRs(Number(txn.refundedAmount ?? 0))}</p></div>
          </div>
          <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border ${st.cls}`}>
            <StIcon className="w-5 h-5 shrink-0" />
            <div><p className="font-bold text-sm">{st.label}</p><p className="text-xs opacity-70">{txn.errorMessage ?? `Transaction is ${txn.status}`}</p></div>
          </div>
          {txn.status === "paid" && (
            <Button variant="outline" className="w-full gap-2 text-red-600 border-red-200 hover:bg-red-50" onClick={onClose}><ArrowDownLeft className="w-4 h-4" /> Go to Refunds Tab</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Transactions Tab ── */
function TransactionsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedTxn, setSelectedTxn] = useState<MeezanTxn | null>(null);
  const [verifyingId, setVerifyingId] = useState<number | null>(null);

  const { data, isLoading, refetch } = useQuery<{ transactions: MeezanTxn[]; total: number }>({
    queryKey: ["meezan-txns", statusFilter],
    queryFn:  () => apiFetch(`/api/admin/meezan/transactions?status=${statusFilter}&limit=100`),
    refetchInterval: 30000,
  });

  const txns = data?.transactions ?? [];
  const filtered = search.trim()
    ? txns.filter(t => {
        const q = search.toLowerCase();
        return (t.meezanOrderId ?? "").toLowerCase().includes(q)
          || (t.invoiceNumber ?? "").toLowerCase().includes(q)
          || (t.customerName ?? "").toLowerCase().includes(q)
          || (t.customerPhone ?? "").toLowerCase().includes(q)
          || (t.description ?? "").toLowerCase().includes(q);
      })
    : txns;

  const verifyTxn = async (id: number) => {
    setVerifyingId(id);
    try {
      await apiFetch(`/api/admin/meezan/transactions/${id}/verify`, { method: "POST" });
      toast({ title: "Status verified & updated" });
      qc.invalidateQueries({ queryKey: ["meezan-txns"] });
      qc.invalidateQueries({ queryKey: ["meezan-stats"] });
    } catch (e: any) {
      toast({ title: "Verify failed", description: e.message, variant: "destructive" });
    } finally {
      setVerifyingId(null);
    }
  };

  const totalVol = filtered.filter(t => t.status === "paid").reduce((s, t) => s + Number(t.amount), 0);

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        {(["all","initiated","pending","paid","failed","refunded"] as const).map(s => {
          const cnt = s === "all" ? txns.length : txns.filter(t => t.status === s).length;
          const cfg = MEEZAN_STATUS_MAP[s] ?? { label: "All", cls: "text-foreground bg-card", icon: Activity };
          return (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-3 rounded-xl border text-sm font-semibold transition-all ${statusFilter === s ? "border-primary bg-primary/5 text-primary shadow-sm" : "border-border bg-card"}`}>
              <p className="text-xl font-black">{cnt}</p>
              <p className="text-xs text-muted-foreground capitalize">{s === "all" ? "All" : cfg.label}</p>
            </button>
          );
        })}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {/* Filters */}
        <div className="px-5 py-4 border-b border-border flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search Meezan ID, invoice, customer…" className="pl-9 h-9 text-sm" />
          </div>
          <Button variant="outline" size="sm" className="gap-1.5 h-9" onClick={() => refetch()}>
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 h-9"><Download className="w-3.5 h-3.5" /> Export CSV</Button>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="text-[11px] font-bold uppercase">Meezan Order ID</TableHead>
                <TableHead className="text-[11px] font-bold uppercase">Invoice</TableHead>
                <TableHead className="text-[11px] font-bold uppercase">Customer</TableHead>
                <TableHead className="text-[11px] font-bold uppercase">Description</TableHead>
                <TableHead className="text-[11px] font-bold uppercase">Method</TableHead>
                <TableHead className="text-[11px] font-bold uppercase text-right">Amount</TableHead>
                <TableHead className="text-[11px] font-bold uppercase">Env</TableHead>
                <TableHead className="text-[11px] font-bold uppercase">Status</TableHead>
                <TableHead className="text-[11px] font-bold uppercase">Date</TableHead>
                <TableHead className="text-[11px] font-bold uppercase text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading
                ? <TableRow><TableCell colSpan={10} className="text-center py-10 text-muted-foreground"><RefreshCw className="w-4 h-4 animate-spin inline mr-2" />Loading transactions…</TableCell></TableRow>
                : filtered.length === 0
                ? <TableRow><TableCell colSpan={10} className="text-center py-10 text-muted-foreground">No transactions found</TableCell></TableRow>
                : filtered.map(t => {
                  const st = MEEZAN_STATUS_MAP[t.status] ?? MEEZAN_STATUS_MAP.pending;
                  return (
                    <TableRow key={t.id} className="hover:bg-muted/20 transition-colors">
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-xs text-muted-foreground truncate max-w-[120px]">{t.meezanOrderId ?? "—"}</span>
                          {t.meezanOrderId && <button onClick={() => { navigator.clipboard.writeText(t.meezanOrderId!).catch(() => {}); toast({ title: "Copied!" }); }}><Copy className="w-3 h-3 text-muted-foreground hover:text-foreground" /></button>}
                        </div>
                      </TableCell>
                      <TableCell><span className="font-mono text-xs text-primary font-bold">{t.invoiceNumber ?? "—"}</span></TableCell>
                      <TableCell>
                        <p className="font-medium text-sm whitespace-nowrap">{t.customerName ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">{t.customerPhone ?? ""}</p>
                      </TableCell>
                      <TableCell><span className="text-xs text-muted-foreground line-clamp-1 max-w-[140px]">{t.description ?? "—"}</span></TableCell>
                      <TableCell><span className="text-xs text-muted-foreground">{t.paymentMethod ?? "—"}</span></TableCell>
                      <TableCell className="text-right font-bold">{fmtRs(Number(t.amount))}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[9px] ${t.isLive ? "bg-red-50 text-red-700 border-red-200" : "bg-blue-50 text-blue-700 border-blue-200"}`}>
                          {t.isLive ? "LIVE" : "SAND"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${st.cls}`}>
                          <st.icon className="w-3 h-3" />{st.label}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(t.createdAt).toLocaleDateString("en-PK", { day: "numeric", month: "short" })}{" "}
                        {new Date(t.createdAt).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" })}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setSelectedTxn(t)}><Eye className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => verifyTxn(t.id)} disabled={verifyingId === t.id} title="Re-verify from bank">
                            {verifyingId === t.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              }
            </TableBody>
          </Table>
        </div>

        <div className="px-5 py-3 border-t border-border flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Showing {filtered.length} of {data?.total ?? 0} transactions</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Paid Volume: <strong className="text-foreground">{fmtRs(totalVol)}</strong></span>
          </div>
        </div>
      </div>

      {/* Transaction Detail Dialog */}
      <MeezanTxnDialog txn={selectedTxn} onClose={() => setSelectedTxn(null)} />
    </div>
  );
}

/* ── Commission Tab ── */
function CommissionTab() {
  const { toast } = useToast();
  const totalComm = MOCK_TRANSACTIONS.filter(t => t.status === "success").reduce((s, t) => s + t.commission, 0);
  const totalFees = MOCK_TRANSACTIONS.filter(t => t.status === "success").reduce((s, t) => s + t.gatewayCharge, 0);
  const totalVol  = MOCK_TRANSACTIONS.filter(t => t.status === "success").reduce((s, t) => s + t.amount, 0);

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Total Commission Earned", value: fmtRs(totalComm), sub: "This month",      icon: Percent,    cls: "from-green-600 to-green-700"  },
          { label: "Gateway Fees Paid",        value: fmtRs(totalFees), sub: "To Meezan Bank", icon: Landmark,   cls: "from-blue-600 to-blue-700"    },
          { label: "Net Profit After Fees",    value: fmtRs(totalComm - totalFees * 0.1), sub: "Our earnings", icon: TrendingUp, cls: "from-purple-600 to-purple-700" },
        ].map(s => (
          <div key={s.label} className={`bg-gradient-to-br ${s.cls} rounded-xl p-5 text-white`}>
            <div className="flex items-center justify-between gap-2">
              <div><p className="text-xs text-white/70 uppercase tracking-wide">{s.label}</p><p className="text-2xl font-black mt-1">{s.value}</p><p className="text-xs text-white/60 mt-1">{s.sub}</p></div>
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center"><s.icon className="w-5 h-5 text-white" /></div>
            </div>
          </div>
        ))}
      </div>

      {/* Commission Rules */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2"><Percent className="w-4 h-4 text-muted-foreground" /><h3 className="font-semibold">Commission Rules</h3></div>
            <Button size="sm" className="gap-1.5 h-7 text-xs"><Plus className="w-3 h-3" /> Add Rule</Button>
          </div>
          <div className="divide-y divide-border">
            {[
              { source: "KDF Admin",    type: "Percentage", rate: "1.0%", status: "active",   vol: fmtRs(totalVol * 0.42) },
              { source: "Shopify",      type: "Percentage", rate: "0.8%", status: "active",   vol: fmtRs(totalVol * 0.22) },
              { source: "Laravel API",  type: "Fixed",      rate: "Rs. 50/txn", status: "active", vol: fmtRs(totalVol * 0.15) },
              { source: "WordPress",    type: "Percentage", rate: "1.2%", status: "active",   vol: fmtRs(totalVol * 0.07) },
              { source: "Mobile App",   type: "Percentage", rate: "0.5%", status: "active",   vol: fmtRs(totalVol * 0.11) },
              { source: "Custom App",   type: "Percentage", rate: "1.5%", status: "inactive", vol: fmtRs(0) },
            ].map(r => (
              <div key={r.source} className="px-5 py-3.5 flex items-center justify-between hover:bg-muted/20 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${r.status === "active" ? "bg-green-50 text-green-600" : "bg-muted text-muted-foreground"}`}><Percent className="w-4 h-4" /></div>
                  <div><p className="font-medium text-sm">{r.source}</p><p className="text-xs text-muted-foreground">{r.type} · {r.rate}</p></div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right"><p className="text-xs text-muted-foreground">Volume</p><p className="text-xs font-semibold">{r.vol}</p></div>
                  <Badge variant="outline" className={`text-[10px] ${r.status === "active" ? "bg-green-50 text-green-700 border-green-200" : "bg-muted text-muted-foreground"}`}>{r.status === "active" ? "Active" : "Inactive"}</Badge>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0"><Settings className="w-3.5 h-3.5 text-muted-foreground" /></Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Per-source commission breakdown */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2"><BarChart3 className="w-4 h-4 text-muted-foreground" /><h3 className="font-semibold">Commission Breakdown</h3></div>
          <div className="divide-y divide-border">
            {MOCK_TRANSACTIONS.filter(t => t.status === "success").reduce((acc, t) => {
              const ex = acc.find(a => a.source === t.appSource);
              if (ex) { ex.commission += t.commission; ex.count++; ex.volume += t.amount; }
              else acc.push({ source: t.appSource, commission: t.commission, count: 1, volume: t.amount });
              return acc;
            }, [] as { source: string; commission: number; count: number; volume: number }[]).map(s => {
              const conf = SOURCE_CONFIG[s.source];
              return (
                <div key={s.source} className="px-5 py-3.5 flex items-center justify-between hover:bg-muted/20 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${conf.color.replace("border", "").split(" ").slice(0, 2).join(" ")}`}><conf.icon className="w-4 h-4" /></div>
                    <div><p className="font-medium text-sm">{conf.label}</p><p className="text-xs text-muted-foreground">{s.count} transactions · {fmtRs(s.volume)}</p></div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-sm text-green-600">+{fmtRs(s.commission)}</p>
                    <p className="text-[10px] text-muted-foreground">{((s.commission / s.volume) * 100).toFixed(2)}% rate</p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="px-5 py-4 border-t border-border bg-green-50/50 flex items-center justify-between">
            <span className="text-sm font-bold text-green-800">Total Commission</span>
            <span className="text-xl font-black text-green-700">{fmtRs(totalComm)}</span>
          </div>
        </div>
      </div>

      {/* Commission settings */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border"><h3 className="font-semibold">Commission Configuration</h3></div>
        <div className="px-5 py-5 grid grid-cols-1 sm:grid-cols-3 gap-5">
          {[
            { label: "Default Rate", placeholder: "e.g. 1.0", suffix: "%" },
            { label: "Minimum Fee",  placeholder: "e.g. 20",  suffix: "Rs" },
            { label: "Maximum Cap",  placeholder: "e.g. 500", suffix: "Rs" },
          ].map(f => (
            <div key={f.label} className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground uppercase">{f.label}</Label>
              <div className="flex items-center gap-2"><Input placeholder={f.placeholder} className="h-9 text-sm" /><span className="text-sm font-bold text-muted-foreground shrink-0">{f.suffix}</span></div>
            </div>
          ))}
          <div className="sm:col-span-3"><Button className="gap-2"><CheckCircle2 className="w-4 h-4" /> Save Commission Settings</Button></div>
        </div>
      </div>
    </div>
  );
}

/* ── Disputes Tab ── */
function DisputesTab() {
  const { toast } = useToast();
  const [selected, setSelected] = useState<Dispute | null>(null);
  const [filter, setFilter] = useState("all");

  const filtered = MOCK_DISPUTES.filter(d => filter === "all" || d.status === filter);

  return (
    <div className="space-y-5">
      {/* Dispute stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {(["all", "pending", "under_review", "approved", "refunded"] as const).map(s => {
          const cnt = s === "all" ? MOCK_DISPUTES.length : MOCK_DISPUTES.filter(d => d.status === s).length;
          const conf = s === "all" ? { label: "Total", cls: "" } : { label: DISPUTE_STATUS[s].label, cls: DISPUTE_STATUS[s].cls };
          return (<button key={s} onClick={() => setFilter(s)} className={`px-4 py-3 rounded-xl border text-sm transition-all ${filter === s ? "border-primary bg-primary/5" : "border-border bg-card"}`}><p className="text-xl font-black">{cnt}</p><p className="text-xs text-muted-foreground">{conf.label}</p></button>);
        })}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-orange-500" /><h3 className="font-semibold">Dispute Center</h3><Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-200">{MOCK_DISPUTES.filter(d => d.status === "pending" || d.status === "under_review").length} active</Badge></div>
          <Button size="sm" className="gap-1.5 h-8 text-xs bg-orange-600 hover:bg-orange-700"><Plus className="w-3 h-3" /> New Dispute</Button>
        </div>
        <div className="divide-y divide-border">
          {filtered.map(d => {
            const st = DISPUTE_STATUS[d.status];
            return (
              <div key={d.id} className="px-5 py-4 hover:bg-muted/20 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${st.cls}`}><st.icon className="w-5 h-5" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{d.customer}</span>
                        <span className="text-xs text-muted-foreground">vs</span>
                        <span className="text-xs text-muted-foreground">{d.merchant}</span>
                        <Badge variant="outline" className={`text-[10px] ${st.cls}`}><st.icon className="w-2.5 h-2.5 mr-1" />{st.label}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{d.reason}</p>
                      <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
                        <span className="font-mono">{d.txnId}</span>
                        <span>·</span>
                        <span>Opened: {d.createdAt.toLocaleDateString("en-PK", { day: "numeric", month: "short" })}</span>
                        <span>·</span>
                        <span>Updated: {d.updatedAt.toLocaleDateString("en-PK", { day: "numeric", month: "short" })}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span className="font-bold text-base">{fmtRs(d.amount)}</span>
                    <div className="flex gap-1.5">
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setSelected(d)}><Eye className="w-3 h-3" /> Review</Button>
                      {(d.status === "pending" || d.status === "under_review") && (
                        <Button size="sm" className="h-7 text-xs gap-1 bg-green-600 hover:bg-green-700" onClick={() => toast({ title: "Dispute resolved" })}><CheckCircle className="w-3 h-3" /> Resolve</Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Dispute Detail Dialog */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-orange-500" />Dispute Review</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                <p className="font-semibold text-orange-900">{selected.reason}</p>
                <div className="flex items-center gap-3 mt-2 text-xs text-orange-700">
                  <span>{selected.customer}</span>·<span className="font-mono">{selected.txnId}</span>·<span className="font-bold">{fmtRs(selected.amount)}</span>
                </div>
              </div>
              <div className="space-y-3">
                <Label className="text-xs font-semibold">Dispute Status</Label>
                <Select defaultValue={selected.status}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="under_review">Under Review</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                    <SelectItem value="refunded">Refunded</SelectItem>
                  </SelectContent>
                </Select>
                <Textarea placeholder="Add resolution notes or merchant response…" rows={3} className="text-sm resize-none" />
                <div className="border-2 border-dashed border-border rounded-xl p-4 flex flex-col items-center gap-2 text-center cursor-pointer hover:bg-muted/20 transition-colors">
                  <Upload className="w-6 h-6 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Upload evidence (PDF, screenshot, invoice)</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button className="gap-2 bg-green-600 hover:bg-green-700" onClick={() => { toast({ title: "Dispute resolved!" }); setSelected(null); }}><CheckCircle2 className="w-4 h-4" /> Resolve</Button>
                  <Button variant="outline" className="gap-2 text-red-600 border-red-200 hover:bg-red-50" onClick={() => { toast({ title: "Dispute rejected" }); setSelected(null); }}><XOctagon className="w-4 h-4" /> Reject</Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Merchant APIs Tab ── */
function MerchantApiTab() {
  const { toast } = useToast();
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [revealKey, setRevealKey] = useState<string | null>(null);
  const [newPlatform, setNewPlatform] = useState("laravel");
  const [newName, setNewName] = useState("");

  const copyKey = (key: string) => { navigator.clipboard.writeText(key).catch(() => {}); toast({ title: "Copied to clipboard!" }); };

  const mask = (key: string) => `${key.slice(0, 16)}${"•".repeat(12)}${key.slice(-6)}`;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Active APIs",     value: String(MOCK_MERCHANT_KEYS.filter(k => k.status === "active").length),   icon: Key,     cls: "bg-blue-50   text-blue-600"   },
          { label: "Total Merchants", value: String(MOCK_MERCHANT_KEYS.length),                                       icon: Building2,cls: "bg-green-50  text-green-600"  },
          { label: "API Transactions",value: String(MOCK_MERCHANT_KEYS.reduce((s, k) => s + k.txnCount, 0)),          icon: Activity, cls: "bg-purple-50 text-purple-600" },
          { label: "API Volume",      value: fmtRs(MOCK_MERCHANT_KEYS.reduce((s, k) => s + k.volume, 0)),            icon: DollarSign,cls: "bg-amber-50  text-amber-600"  },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-5 flex items-start gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${s.cls}`}><s.icon className="w-5 h-5" /></div>
            <div><p className="text-xs text-muted-foreground uppercase tracking-wide">{s.label}</p><p className="text-xl font-bold mt-0.5">{s.value}</p></div>
          </div>
        ))}
      </div>

      {/* Integration guide */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-xl p-6 text-white">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2"><Code className="w-5 h-5 text-blue-400" /><h3 className="font-bold text-base">Integration Quick Start</h3></div>
            <p className="text-sm text-slate-300 mb-4">Integrate KDF Payment Gateway into your app in minutes</p>
            <div className="bg-slate-700/60 rounded-lg p-4 font-mono text-xs text-green-400 space-y-1">
              <p className="text-slate-400">// PHP / Laravel Example</p>
              <p>{`$kdf = new KdfPayment('YOUR_API_KEY', 'YOUR_SECRET');`}</p>
              <p>{`$order = $kdf->createOrder(['amount' => 5000, 'currency' => 'PKR']);`}</p>
              <p>{`return redirect($order->payment_url);`}</p>
            </div>
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            <Button size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700"><Download className="w-3.5 h-3.5" /> SDK Docs</Button>
            <Button size="sm" variant="outline" className="gap-1.5 border-slate-600 text-slate-200 hover:bg-slate-700"><ExternalLink className="w-3.5 h-3.5" /> API Reference</Button>
          </div>
        </div>
      </div>

      {/* API Keys Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2"><Key className="w-4 h-4 text-muted-foreground" /><h3 className="font-semibold">API Keys & Webhooks</h3></div>
          <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={() => setShowNewDialog(true)}><Plus className="w-3.5 h-3.5" /> Generate New API Key</Button>
        </div>
        <div className="divide-y divide-border">
          {MOCK_MERCHANT_KEYS.map(mk => {
            const pc = PLATFORM_CONFIG[mk.platform];
            const isRevealed = revealKey === mk.id;
            return (
              <div key={mk.id} className="px-5 py-4 hover:bg-muted/20 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className={`w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0`}><pc.icon className={`w-5 h-5 ${pc.color}`} /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm">{mk.name}</p>
                        <Badge variant="outline" className={`text-[9px] ${mk.status === "active" ? "bg-green-50 text-green-700 border-green-200" : mk.status === "suspended" ? "bg-red-50 text-red-700 border-red-200" : "bg-muted text-muted-foreground"}`}>{mk.status === "active" ? "● Active" : mk.status === "suspended" ? "⊘ Suspended" : "○ Inactive"}</Badge>
                        <span className={`text-[10px] font-bold ${pc.color}`}>{pc.label}</span>
                      </div>
                      <div className="mt-2 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground w-16 shrink-0">API Key:</span>
                          <div className="flex items-center gap-1.5 bg-muted/60 rounded-lg px-2.5 py-1 flex-1">
                            <span className="font-mono text-[10px] flex-1 truncate">{isRevealed ? mk.apiKey : mask(mk.apiKey)}</span>
                            <button onClick={() => copyKey(mk.apiKey)} className="hover:text-primary transition-colors shrink-0"><Copy className="w-3 h-3 text-muted-foreground" /></button>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground w-16 shrink-0">Secret:</span>
                          <div className="flex items-center gap-1.5 bg-muted/60 rounded-lg px-2.5 py-1 flex-1">
                            <span className="font-mono text-[10px] flex-1 truncate">{isRevealed ? mk.secretKey : "•".repeat(30)}</span>
                            <button onClick={() => copyKey(mk.secretKey)} className="hover:text-primary transition-colors shrink-0"><Copy className="w-3 h-3 text-muted-foreground" /></button>
                          </div>
                        </div>
                        {mk.webhookUrl && (
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground w-16 shrink-0">Webhook:</span>
                            <div className="flex items-center gap-1.5 bg-muted/60 rounded-lg px-2.5 py-1 flex-1">
                              <Webhook className="w-3 h-3 text-muted-foreground shrink-0" />
                              <span className="text-[10px] flex-1 truncate text-blue-600">{mk.webhookUrl}</span>
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                        <span>{mk.txnCount} transactions</span>·<span>{fmtRs(mk.volume)} volume</span>·<span>Created {mk.createdAt.toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" })}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1" onClick={() => setRevealKey(isRevealed ? null : mk.id)}>
                      {isRevealed ? <><EyeOff className="w-3 h-3" /> Hide</> : <><Eye className="w-3 h-3" /> Reveal</>}
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1"><RotateCcw className="w-3 h-3" /> Rotate</Button>
                    <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1 text-red-600 border-red-200 hover:bg-red-50"><Trash2 className="w-3 h-3" /> Revoke</Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Generate API Dialog */}
      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Key className="w-5 h-5" />Generate New API Key</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label className="text-xs font-semibold">Merchant / App Name</Label><Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. My Laravel Store" className="h-9 text-sm" /></div>
            <div className="space-y-2"><Label className="text-xs font-semibold">Platform</Label>
              <Select value={newPlatform} onValueChange={setNewPlatform}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PLATFORM_CONFIG).map(([k, v]) => (<SelectItem key={k} value={k}><div className="flex items-center gap-2"><v.icon className={`w-4 h-4 ${v.color}`} />{v.label}</div></SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label className="text-xs font-semibold">Webhook URL (optional)</Label><Input placeholder="https://yourapp.com/payment/callback" className="h-9 text-sm" /></div>
            <div className="space-y-2"><Label className="text-xs font-semibold">Permissions</Label>
              <div className="grid grid-cols-2 gap-2">
                {["Create Payment", "Check Status", "Refund", "Webhook Events", "View Transactions", "Generate Reports"].map(p => (
                  <label key={p} className="flex items-center gap-2 text-xs cursor-pointer"><input type="checkbox" defaultChecked={["Create Payment", "Check Status", "Webhook Events"].includes(p)} className="rounded" />{p}</label>
                ))}
              </div>
            </div>
            <Button className="w-full gap-2" onClick={() => { setShowNewDialog(false); toast({ title: "API Key Generated!", description: `kdf_live_ak_${genId()}` }); }}><Key className="w-4 h-4" /> Generate API Key</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── EyeOff (missing from imports) ── */
function EyeOff({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>;
}

/* ── Analytics Tab ── */
function AnalyticsTab() {
  const monthly = [
    { month: "Jan", vol: 1280000, comm: 12800, txns: 284 },
    { month: "Feb", vol: 1540000, comm: 15400, txns: 312 },
    { month: "Mar", vol: 2120000, comm: 21200, txns: 443 },
    { month: "Apr", vol: 1890000, comm: 18900, txns: 398 },
    { month: "May", vol: 2560000, comm: 25600, txns: 512 },
  ];
  const maxVol = Math.max(...monthly.map(d => d.vol));

  return (
    <div className="space-y-6">
      {/* Monthly KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "May Volume",    value: fmtRs(2560000), delta: "+35.4%", up: true,  icon: TrendingUp,  cls: "from-blue-600 to-blue-700"    },
          { label: "Commission",    value: fmtRs(25600),   delta: "+35.4%", up: true,  icon: Percent,     cls: "from-green-600 to-green-700"   },
          { label: "Transactions",  value: "512",           delta: "+28.6%", up: true,  icon: Activity,    cls: "from-purple-600 to-purple-700"  },
          { label: "Dispute Rate",  value: "0.97%",         delta: "-0.3%",  up: false, icon: AlertTriangle, cls: "from-amber-500 to-amber-600" },
        ].map(s => (
          <div key={s.label} className={`bg-gradient-to-br ${s.cls} rounded-xl p-5 text-white`}>
            <div className="flex items-start justify-between">
              <div><p className="text-xs text-white/70 uppercase tracking-wide">{s.label}</p><p className="text-2xl font-black mt-1">{s.value}</p><p className={`text-xs mt-1 font-semibold ${s.up ? "text-green-300" : "text-red-300"}`}>{s.delta} vs Apr</p></div>
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center"><s.icon className="w-5 h-5 text-white" /></div>
            </div>
          </div>
        ))}
      </div>

      {/* Monthly chart */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2"><BarChart3 className="w-4 h-4 text-muted-foreground" /><h3 className="font-semibold">Monthly Volume Trend</h3></div>
          <Select defaultValue="2026"><SelectTrigger className="h-8 w-20 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="2026">2026</SelectItem><SelectItem value="2025">2025</SelectItem></SelectContent></Select>
        </div>
        <div className="px-6 py-6">
          <div className="flex items-end gap-4 h-44">
            {monthly.map(d => {
              const pct = (d.vol / maxVol) * 100;
              return (
                <div key={d.month} className="flex-1 flex flex-col items-center gap-2">
                  <span className="text-[10px] text-muted-foreground font-mono">{(d.vol / 1000000).toFixed(2)}M</span>
                  <div className="w-full rounded-t-xl relative overflow-hidden" style={{ height: `${Math.max(12, pct)}%`, minHeight: "12px" }}>
                    <div className="absolute inset-0 bg-gradient-to-t from-blue-700 to-blue-400 rounded-t-xl" />
                  </div>
                  <span className="text-[10px] font-semibold text-muted-foreground">{d.month}</span>
                  <span className="text-[9px] text-muted-foreground">{d.txns} txns</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Merchant growth + failure analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border"><h3 className="font-semibold">Merchant Performance</h3></div>
          <div className="divide-y divide-border">
            {MOCK_MERCHANT_KEYS.filter(k => k.txnCount > 0).sort((a, b) => b.volume - a.volume).map((mk, i) => {
              const pc = PLATFORM_CONFIG[mk.platform];
              const pct = (mk.volume / MOCK_MERCHANT_KEYS.reduce((s, k) => s + k.volume, 0)) * 100;
              return (
                <div key={mk.id} className="px-5 py-3 hover:bg-muted/20 transition-colors">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-xs text-muted-foreground w-4 font-mono">{i + 1}</span>
                    <pc.icon className={`w-4 h-4 ${pc.color} shrink-0`} />
                    <p className="font-medium text-sm flex-1 truncate">{mk.name}</p>
                    <span className="text-sm font-bold">{fmtRs(mk.volume)}</span>
                    <span className="text-[10px] text-muted-foreground">{pct.toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden ml-7">
                    <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-400" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border"><h3 className="font-semibold">Key Financial Metrics</h3></div>
          <div className="px-5 py-4 space-y-4">
            {[
              { label: "Average Transaction Value", value: fmtRs(5390),       icon: DollarSign, trend: "+12% ↑" },
              { label: "Payment Success Rate",      value: "71%",              icon: CheckCircle, trend: "-2% ↓" },
              { label: "Avg Settlement Time",        value: "T+1 Day",          icon: Clock,      trend: "Same" },
              { label: "Commission Per Txn",         value: fmtRs(74),          icon: Percent,    trend: "+5% ↑" },
              { label: "Monthly Revenue Growth",     value: "+35.4%",           icon: TrendingUp, trend: "Strong" },
              { label: "Merchant Retention",         value: "94%",              icon: Users,      trend: "+2% ↑" },
            ].map(m => (
              <div key={m.label} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                <div className="flex items-center gap-2"><m.icon className="w-4 h-4 text-muted-foreground" /><p className="text-sm">{m.label}</p></div>
                <div className="flex items-center gap-2"><span className="text-sm font-bold">{m.value}</span><span className="text-[10px] text-muted-foreground">{m.trend}</span></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Security Tab ── */
function SecurityTab() {
  return (
    <div className="space-y-6">
      {/* Risk Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        {[
          { label: "Risk Score",    value: "Low",  sub: "System healthy",      icon: ShieldCheck,  cls: "from-green-600 to-green-700"  },
          { label: "Fraud Alerts",  value: "2",    sub: "Needs review",         icon: ShieldAlert,  cls: "from-orange-500 to-orange-600" },
          { label: "Held Payments", value: "1",    sub: "Under monitoring",     icon: AlertCircle,  cls: "from-amber-500 to-amber-600"   },
          { label: "Verified Merchants", value: "5", sub: "KYC complete",      icon: UserCheck,    cls: "from-blue-600 to-blue-700"    },
        ].map(s => (
          <div key={s.label} className={`bg-gradient-to-br ${s.cls} rounded-xl p-5 text-white`}>
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0"><s.icon className="w-5 h-5 text-white" /></div>
              <div><p className="text-xs text-white/70 uppercase tracking-wide">{s.label}</p><p className="text-2xl font-black mt-0.5">{s.value}</p><p className="text-xs text-white/60">{s.sub}</p></div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Fraud Alerts */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-orange-500" /><h3 className="font-semibold">Fraud & Risk Alerts</h3></div>
          <div className="divide-y divide-border">
            {[
              { id: "FR-001", msg: "Multiple failed card attempts — Zara Noor", risk: "Medium", time: "2h ago",  action: "Hold payment" },
              { id: "FR-002", msg: "Unusual amount pattern — Custom App integration", risk: "Low",    time: "5h ago",  action: "Monitor" },
              { id: "FR-003", msg: "New device login — API key access from unknown IP", risk: "High",   time: "1d ago",  action: "Review API" },
            ].map(a => (
              <div key={a.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2"><span className="font-mono text-[10px] text-muted-foreground">{a.id}</span><Badge variant="outline" className={`text-[9px] ${a.risk === "High" ? "bg-red-50 text-red-700 border-red-200" : a.risk === "Medium" ? "bg-orange-50 text-orange-700 border-orange-200" : "bg-yellow-50 text-yellow-700 border-yellow-200"}`}>{a.risk} Risk</Badge></div>
                    <p className="text-sm mt-1">{a.msg}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Suggested: {a.action} · {a.time}</p>
                  </div>
                  <Button variant="outline" size="sm" className="h-7 text-xs shrink-0">Review</Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Transaction Monitoring Rules */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between"><div className="flex items-center gap-2"><Settings className="w-4 h-4 text-muted-foreground" /><h3 className="font-semibold">Monitoring Rules</h3></div><Button size="sm" className="h-7 text-xs gap-1"><Plus className="w-3 h-3" /> Add Rule</Button></div>
          <div className="divide-y divide-border">
            {[
              { rule: "Max single transaction",   limit: "Rs. 50,000",  action: "Hold for review",  active: true  },
              { rule: "Daily limit per customer", limit: "Rs. 100,000", action: "Block & alert",     active: true  },
              { rule: "Failed attempts",          limit: "3 in 10 min", action: "Block IP",          active: true  },
              { rule: "New merchant volume",      limit: "Rs. 20,000",  action: "Manual verify",     active: false },
              { rule: "International card",       limit: "Any amount",  action: "Extra 3DS check",   active: true  },
            ].map(r => (
              <div key={r.rule} className="px-5 py-3 flex items-center justify-between hover:bg-muted/20">
                <div>
                  <p className="text-sm font-medium">{r.rule}</p>
                  <p className="text-xs text-muted-foreground">{r.limit} → {r.action}</p>
                </div>
                <button className={`w-10 h-5 rounded-full transition-colors relative ${r.active ? "bg-green-500" : "bg-muted"}`}><span className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all" style={{ left: r.active ? "calc(100% - 18px)" : "2px" }} /></button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Device / Login Activity */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2"><Monitor className="w-4 h-4 text-muted-foreground" /><h3 className="font-semibold">API Access Log</h3></div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Merchant</TableHead><TableHead>IP Address</TableHead><TableHead>Endpoint</TableHead><TableHead>Method</TableHead><TableHead>Response</TableHead><TableHead>Time</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {[
                { merchant: "KDF MART",      ip: "182.180.xx.xx", endpoint: "/api/v1/order",     method: "POST", response: "200 OK",     time: "2m ago",  ok: true  },
                { merchant: "KDF Shopify",   ip: "72.44.xx.xx",   endpoint: "/api/v1/status",    method: "GET",  response: "200 OK",     time: "5m ago",  ok: true  },
                { merchant: "KDF Laravel",   ip: "103.xx.xx.xx",  endpoint: "/api/v1/refund",    method: "POST", response: "403 Denied", time: "12m ago", ok: false },
                { merchant: "KDF Mobile",    ip: "39.xx.xx.xx",   endpoint: "/api/v1/order",     method: "POST", response: "200 OK",     time: "20m ago", ok: true  },
                { merchant: "Unknown",       ip: "91.xx.xx.xx",   endpoint: "/api/v1/secret",    method: "GET",  response: "401 Unauth", time: "1h ago",  ok: false },
              ].map((row, i) => (
                <TableRow key={i} className="hover:bg-muted/20">
                  <TableCell className="text-sm font-medium">{row.merchant}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{row.ip}</TableCell>
                  <TableCell className="font-mono text-xs text-blue-600">{row.endpoint}</TableCell>
                  <TableCell><Badge variant="outline" className={`text-[10px] ${row.method === "POST" ? "bg-blue-50 text-blue-700" : "bg-green-50 text-green-700"}`}>{row.method}</Badge></TableCell>
                  <TableCell><span className={`font-mono text-xs ${row.ok ? "text-green-600" : "text-red-600"}`}>{row.response}</span></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{row.time}</TableCell>
                  <TableCell>{row.ok ? <CheckCircle className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-red-500" />}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

/* ── Reports Tab ── */
function ReportsTab() {
  const { toast } = useToast();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Generate Report */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2"><FileText className="w-4 h-4 text-muted-foreground" /><h3 className="font-semibold">Generate Report</h3></div>
          <div className="px-5 py-5 space-y-4">
            <div className="space-y-2"><Label className="text-xs font-semibold text-muted-foreground uppercase">Report Type</Label>
              <Select defaultValue="transactions">
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="transactions">Transaction Report</SelectItem>
                  <SelectItem value="commission">Commission Report</SelectItem>
                  <SelectItem value="settlement">Settlement Report</SelectItem>
                  <SelectItem value="dispute">Dispute Report</SelectItem>
                  <SelectItem value="merchant">Merchant Report</SelectItem>
                  <SelectItem value="financial">Full Financial Report</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label className="text-xs font-semibold text-muted-foreground uppercase">From Date</Label><Input type="date" className="h-9 text-sm" defaultValue="2026-05-01" /></div>
              <div className="space-y-2"><Label className="text-xs font-semibold text-muted-foreground uppercase">To Date</Label><Input type="date" className="h-9 text-sm" defaultValue="2026-05-06" /></div>
            </div>
            <div className="space-y-2"><Label className="text-xs font-semibold text-muted-foreground uppercase">Source Filter</Label>
              <Select defaultValue="all"><SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Sources</SelectItem>{Object.entries(SOURCE_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="space-y-2"><Label className="text-xs font-semibold text-muted-foreground uppercase">Format</Label>
              <div className="grid grid-cols-3 gap-2">
                {[{ f: "PDF", icon: FileText }, { f: "CSV", icon: Download }, { f: "Excel", icon: Layers }].map(f => (
                  <button key={f.f} className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-border hover:border-primary hover:bg-primary/5 transition-all" onClick={() => toast({ title: `${f.f} report generated!` })}>
                    <f.icon className="w-5 h-5 text-muted-foreground" />
                    <span className="text-xs font-semibold">{f.f}</span>
                  </button>
                ))}
              </div>
            </div>
            <Button className="w-full gap-2" onClick={() => toast({ title: "Report generated!", description: "Downloading now…" })}><Download className="w-4 h-4" /> Generate &amp; Download</Button>
          </div>
        </div>

        {/* Scheduled Reports */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between"><div className="flex items-center gap-2"><Calendar className="w-4 h-4 text-muted-foreground" /><h3 className="font-semibold">Scheduled Reports</h3></div><Button size="sm" className="h-7 text-xs gap-1"><Plus className="w-3 h-3" /> Schedule</Button></div>
          <div className="divide-y divide-border">
            {[
              { name: "Daily Transaction Summary",  freq: "Daily · 9:00 AM",   email: "admin@kdfmart.pk", active: true  },
              { name: "Weekly Commission Report",   freq: "Monday · 8:00 AM",  email: "finance@kdfmart.pk", active: true },
              { name: "Monthly Settlement Report",  freq: "1st of month",      email: "cfo@kdfmart.pk",   active: true  },
              { name: "Dispute Status Report",      freq: "Daily · 6:00 PM",   email: "admin@kdfmart.pk", active: false },
            ].map(r => (
              <div key={r.name} className="px-5 py-3.5 flex items-center justify-between hover:bg-muted/20">
                <div>
                  <p className="font-medium text-sm">{r.name}</p>
                  <p className="text-xs text-muted-foreground">{r.freq} → {r.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button className={`w-10 h-5 rounded-full transition-colors relative ${r.active ? "bg-primary" : "bg-muted"}`}><span className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all" style={{ left: r.active ? "calc(100% - 18px)" : "2px" }} /></button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0"><Send className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent reports */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border"><h3 className="font-semibold">Recent Reports</h3></div>
        <Table>
          <TableHeader><TableRow><TableHead>Report Name</TableHead><TableHead>Type</TableHead><TableHead>Period</TableHead><TableHead>Generated By</TableHead><TableHead>Size</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {[
              { name: "Transaction Report — May 1-6",  type: "PDF",   period: "May 01–06",  by: "Admin",  size: "284 KB" },
              { name: "Commission Summary — April",    type: "Excel", period: "April 2026", by: "Admin",  size: "156 KB" },
              { name: "Settlement — April",            type: "PDF",   period: "April 2026", by: "Finance",size: "512 KB" },
              { name: "Dispute Log — Q1 2026",         type: "CSV",   period: "Jan–Mar",    by: "Admin",  size: "48 KB"  },
            ].map((r, i) => (
              <TableRow key={i} className="hover:bg-muted/20">
                <TableCell className="font-medium text-sm">{r.name}</TableCell>
                <TableCell><Badge variant="outline" className="text-[10px]">{r.type}</Badge></TableCell>
                <TableCell className="text-sm text-muted-foreground">{r.period}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{r.by}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{r.size}</TableCell>
                <TableCell><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="sm" className="h-7 w-7 p-0"><Eye className="w-3.5 h-3.5" /></Button><Button variant="ghost" size="sm" className="h-7 w-7 p-0"><Download className="w-3.5 h-3.5" /></Button></div></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   TAB — PAYMENT GATEWAY CONFIGURATION (WooCommerce-style)
════════════════════════════════════════════════════════════════════ */
function ApiConfigTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [revealSecrets, setRevealSecrets] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; environment?: string; errorCode?: string; errorMessage?: string; orderId?: string } | null>(null);
  const [activeGateway, setActiveGateway] = useState<string>("meezan");
  const [gatewayTitle, setGatewayTitle] = useState("Credit Or Debit Card");

  const { data: savedSettings, isLoading: loadingSettings } = useQuery<MeezanSettings>({
    queryKey: ["meezan-settings"],
    queryFn:  () => apiFetch("/api/admin/meezan/settings"),
  });

  const { data: serverIpData } = useQuery<{ ip: string | null }>({
    queryKey: ["meezan-server-ip"],
    queryFn:  () => apiFetch("/api/admin/meezan/server-ip"),
    staleTime: 5 * 60 * 1000,
  });

  const [form, setForm] = useState<MeezanSettings>({
    environment:       "sandbox",
    sandboxUsername:   "",
    sandboxPassword:   "",
    sandboxMerchantId: "",
    liveUsername:      "",
    livePassword:      "",
    liveMerchantId:    "",
    returnUrl:         "https://www.khanbabadryfruits.com/payment/success",
    failUrl:           "https://www.khanbabadryfruits.com/payment/failed",
    callbackUrl:       "https://admin.khanbabadryfruits.com/api/payment/meezan/callback",
    isActive:          false,
  });

  useEffect(() => {
    if (savedSettings && savedSettings.environment) {
      setForm(prev => ({ ...prev, ...savedSettings }));
    }
  }, [savedSettings]);

  const env = form.environment as "sandbox" | "live";

  const saveMutation = useMutation({
    mutationFn: (data: MeezanSettings) => apiFetch("/api/admin/meezan/settings", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      toast({ title: "Settings saved!", description: `${env.toUpperCase()} credentials updated` });
      qc.invalidateQueries({ queryKey: ["meezan-settings"] });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const testMutation = useMutation({
    mutationFn: () => apiFetch<any>("/api/admin/meezan/test-connection", { method: "POST" }),
    onSuccess: (data) => {
      setTestResult(data);
      if (data.success) {
        toast({ title: "✅ Connection successful!", description: `${data.environment?.toUpperCase()} environment is working` });
      } else {
        toast({ title: "❌ Connection failed", description: data.errorMessage ?? "Check credentials", variant: "destructive" });
      }
    },
    onError: (e: any) => {
      setTestResult({ success: false, errorMessage: e.message });
      toast({ title: "Test failed", description: e.message, variant: "destructive" });
    },
  });

  const GATEWAYS = [
    { id: "meezan",    name: "MEEZANBANK", subtitle: "Credit / Debit Cards — Meezan Bank EPG", configured: true,  active: form.isActive },
    { id: "easypaisa", name: "EASYPAISA",  subtitle: "Mobile Wallet Payments — EasyPaisa",      configured: false, active: false },
    { id: "jazzcash",  name: "JAZZCASH",   subtitle: "Mobile Wallet Payments — JazzCash",        configured: false, active: false },
  ];

  const INTEGRATION_ENDPOINTS = [
    { key: "initiate",  label: "Initiate Payment",    method: "POST", path: "/api/payment/meezan/initiate",   desc: "Create EPG session, returns formUrl" },
    { key: "status",    label: "Check Status",         method: "GET",  path: "/api/payment/meezan/status/:id", desc: "Verify payment by Meezan order ID"   },
    { key: "callback",  label: "Meezan Callback",      method: "POST", path: "/api/payment/meezan/callback",   desc: "Meezan posts payment result here"    },
    { key: "external",  label: "External Payment",     method: "POST", path: "/api/payment/external/receive",  desc: "Shopify/Laravel/Mobile reports payment" },
    { key: "qr",        label: "QR Payment",           method: "POST", path: "/api/payment/meezan/qr",         desc: "Generate QR-code payment via EPG"    },
  ];

  const WEBHOOK_EVENTS = [
    { label: "Payment Success",  url: (form.callbackUrl ?? "") + "?event=payment.success",  active: true  },
    { label: "Payment Failed",   url: (form.callbackUrl ?? "") + "?event=payment.failed",   active: true  },
    { label: "Refund Processed", url: (form.callbackUrl ?? "") + "?event=refund.processed", active: false },
  ];

  const API_LOGS = [
    { time: "08:28:41", method: "POST", endpoint: "/api/payment/meezan/initiate",         status: 200, ms: 312, txn: "MBL2026050601234", ok: true  },
    { time: "08:15:22", method: "GET",  endpoint: "/api/payment/meezan/status/:id",        status: 200, ms: 145, txn: "MBL2026050601233", ok: true  },
    { time: "08:02:05", method: "POST", endpoint: "/api/payment/meezan/qr",               status: 200, ms: 228, txn: "QR-20260506-0041", ok: true  },
    { time: "07:54:18", method: "POST", endpoint: "/api/payment/external/receive",         status: 200, ms: 89,  txn: "EXT-SHOPIFY-0041", ok: true  },
    { time: "07:41:00", method: "POST", endpoint: "/api/payment/external/receive",         status: 422, ms: 18,  txn: "—",               ok: false },
    { time: "07:28:30", method: "POST", endpoint: "/api/payment/meezan/callback",          status: 200, ms: 44,  txn: "MBL2026050501240", ok: true  },
    { time: "06:55:12", method: "GET",  endpoint: "/api/admin/meezan/transactions",        status: 200, ms: 102, txn: "—",               ok: true  },
    { time: "06:42:07", method: "POST", endpoint: "/api/payment/meezan/initiate",         status: 401, ms: 12,  txn: "—",               ok: false },
  ];

  const RESPONSE_CODES = [
    { code: "00",  label: "Approved",                 cls: "text-green-600" },
    { code: "05",  label: "Do Not Honor",              cls: "text-red-600"   },
    { code: "14",  label: "Invalid Card Number",       cls: "text-red-600"   },
    { code: "41",  label: "Lost Card — Pickup",        cls: "text-orange-600"},
    { code: "51",  label: "Insufficient Funds",        cls: "text-amber-600" },
    { code: "54",  label: "Expired Card",              cls: "text-amber-600" },
    { code: "57",  label: "Not Permitted to Merchant", cls: "text-red-600"   },
    { code: "61",  label: "Exceeds Daily Limit",       cls: "text-amber-600" },
    { code: "91",  label: "Issuer Unavailable",        cls: "text-orange-600"},
    { code: "99",  label: "General Error",             cls: "text-red-600"   },
  ];

  return (
    <div className="space-y-6">

      {/* Gateway List - WooCommerce Style */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-semibold">Payment Gateways</h3>
          </div>
          <p className="text-xs text-muted-foreground">Choose payment methods for your customers</p>
        </div>
        <div className="divide-y divide-border">
          {GATEWAYS.map(gw => (
            <div key={gw.id}>
              {/* Gateway Header Row */}
              <div
                className="px-5 py-4 flex items-center gap-4 cursor-pointer hover:bg-muted/20 transition-colors"
                onClick={() => setActiveGateway(activeGateway === gw.id ? "" : gw.id)}
              >
                <input
                  type="checkbox"
                  checked={gw.active}
                  onChange={e => { if (gw.id === "meezan") setForm(p => ({ ...p, isActive: e.target.checked })); }}
                  onClick={e => e.stopPropagation()}
                  className="w-4 h-4 rounded cursor-pointer"
                />
                <div className="flex-1">
                  <p className="font-black text-sm tracking-widest">{gw.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{gw.subtitle}</p>
                </div>
                {gw.configured
                  ? <Badge className="text-[10px] bg-green-50 text-green-700 border-green-200 shrink-0">Configured</Badge>
                  : <Badge variant="outline" className="text-[10px] text-muted-foreground shrink-0">Not Set Up</Badge>
                }
                <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform duration-200 shrink-0 ${activeGateway === gw.id ? "rotate-90" : ""}`} />
              </div>

              {/* MEEZAN BANK — expanded settings */}
              {activeGateway === "meezan" && gw.id === "meezan" && (
                <div className="px-5 pb-6 pt-3 border-t border-border/50 bg-muted/5">
                  {loadingSettings && <div className="text-xs text-muted-foreground flex items-center gap-2 py-4"><RefreshCw className="w-3.5 h-3.5 animate-spin" />Loading saved settings…</div>}

                  {/* Visa + MasterCard logos */}
                  <div className="flex gap-3 mb-5">
                    <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl flex items-center justify-center py-5">
                      <svg viewBox="0 0 300 100" className="h-8 w-auto">
                        <text x="8" y="82" fontFamily="Arial,sans-serif" fontSize="96" fontWeight="900" fill="#1A1F71" letterSpacing="-4">VISA</text>
                      </svg>
                    </div>
                    <div className="flex-1 bg-[#16366F] border border-[#16366F]/30 rounded-xl flex items-center justify-center py-5 gap-2">
                      <svg viewBox="0 0 60 40" className="h-8 w-auto">
                        <circle cx="20" cy="20" r="16" fill="#EB001B"/>
                        <circle cx="40" cy="20" r="16" fill="#F79E1B"/>
                        <path d="M30 7.8 A16 16 0 0 1 30 32.2 A16 16 0 0 1 30 7.8Z" fill="#FF5F00"/>
                      </svg>
                      <span className="text-white text-[11px] font-bold tracking-wide">MasterCard</span>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {/* Environment */}
                    <div>
                      <Select value={form.environment} onValueChange={v => setForm(p => ({ ...p, environment: v }))}>
                        <SelectTrigger className="h-11 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="live">Live</SelectItem>
                          <SelectItem value="sandbox">Sandbox / Test</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* API User */}
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">Api User <span className="text-red-500">*</span></Label>
                      <Input
                        value={env === "live" ? (form.liveUsername ?? "") : (form.sandboxUsername ?? "")}
                        onChange={e => setForm(p => env === "live" ? { ...p, liveUsername: e.target.value } : { ...p, sandboxUsername: e.target.value })}
                        className="h-11 text-sm"
                        placeholder="API Username"
                      />
                    </div>

                    {/* Password */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium">Password <span className="text-red-500">*</span></Label>
                        <button onClick={() => setRevealSecrets(r => !r)} className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1">
                          {revealSecrets ? <><Lock className="w-3 h-3" /> Hide</> : <><Unlock className="w-3 h-3" /> Show</>}
                        </button>
                      </div>
                      <Input
                        type={revealSecrets ? "text" : "password"}
                        value={env === "live" ? (form.livePassword ?? "") : (form.sandboxPassword ?? "")}
                        onChange={e => setForm(p => env === "live" ? { ...p, livePassword: e.target.value } : { ...p, sandboxPassword: e.target.value })}
                        className="h-11 text-sm"
                        placeholder="••••••••"
                      />
                    </div>

                    {/* Payment gateway title */}
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">Payment gateway title</Label>
                      <Input
                        value={gatewayTitle}
                        onChange={e => setGatewayTitle(e.target.value)}
                        className="h-11 text-sm"
                        placeholder="Credit Or Debit Card"
                      />
                    </div>

                    {/* Logo Upload */}
                    <div>
                      <div className="flex border border-border rounded-lg overflow-hidden h-11">
                        <div className="flex-1 flex items-center px-3 text-sm text-muted-foreground bg-background">Choose Logo</div>
                        <label className="px-4 border-l border-border flex items-center text-sm font-medium hover:bg-muted/40 cursor-pointer transition-colors">
                          Browse
                          <input type="file" accept="image/*" className="hidden" onChange={() => toast({ title: "Logo selected" })} />
                        </label>
                      </div>
                    </div>

                    {/* Advanced settings */}
                    <details className="group">
                      <summary className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer hover:text-foreground list-none select-none">
                        <ChevronRight className="w-3 h-3 group-open:rotate-90 transition-transform" />
                        Advanced Settings (Merchant ID, Callback URLs, Webhook)
                      </summary>
                      <div className="mt-3 space-y-3 pl-4 border-l-2 border-border/50">
                        {([
                          { label: env === "live" ? "Live Merchant ID" : "Sandbox Merchant ID", key: env === "live" ? "liveMerchantId" : "sandboxMerchantId" },
                          { label: "Return URL (Success)", key: "returnUrl"    },
                          { label: "Fail URL",             key: "failUrl"      },
                          { label: "Callback URL",         key: "callbackUrl"  },
                          { label: "Webhook Secret",       key: "webhookSecret", secret: true },
                        ] as { label: string; key: keyof MeezanSettings; secret?: boolean }[]).map(f => (
                          <div key={f.key} className="space-y-1">
                            <Label className="text-xs text-muted-foreground">{f.label}</Label>
                            <div className="relative">
                              <Input
                                type={f.secret && !revealSecrets ? "password" : "text"}
                                value={(form[f.key] as string) ?? ""}
                                onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                                className="h-9 text-xs font-mono pr-9"
                              />
                              <button
                                onClick={() => { navigator.clipboard.writeText((form[f.key] as string) ?? "").catch(() => {}); toast({ title: "Copied!" }); }}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                              ><Copy className="w-3.5 h-3.5" /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </details>

                    {/* Server IP — for Meezan Bank whitelist */}
                    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
                      <Server className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-amber-900">Server IP — Must be whitelisted by Meezan Bank</p>
                        <div className="flex items-center gap-2 mt-1">
                          <code className="font-mono text-sm font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded">
                            {serverIpData?.ip ?? "Fetching…"}
                          </code>
                          {serverIpData?.ip && (
                            <button
                              onClick={() => { navigator.clipboard.writeText(serverIpData.ip!).catch(() => {}); }}
                              className="text-amber-600 hover:text-amber-800"
                              title="Copy IP"
                            ><Copy className="w-3.5 h-3.5" /></button>
                          )}
                        </div>
                        <p className="text-[10px] text-amber-700 mt-1">Email this IP to Meezan Bank tech support to enable sandbox &amp; live access.</p>
                      </div>
                    </div>

                    {/* Test result */}
                    {testResult && (
                      <div className={`rounded-xl px-4 py-3 border text-sm ${testResult.success ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"}`}>
                        {testResult.success
                          ? <><CheckCircle className="w-4 h-4 inline mr-2" />Connection OK — {testResult.environment?.toUpperCase()} active</>
                          : <><XCircle className="w-4 h-4 inline mr-2" />{testResult.errorMessage ?? "Connection failed"}</>
                        }
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 pt-1">
                      <Button className="flex-1 gap-2 h-10 text-sm" onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}>
                        {saveMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Save Changes
                      </Button>
                      <Button variant="outline" className="gap-2 h-10 text-sm" onClick={() => testMutation.mutate()} disabled={testMutation.isPending}>
                        {testMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FlaskConical className="w-4 h-4" />} Test Connection
                      </Button>
                    </div>

                    {/* Enable toggle */}
                    <div className="flex items-center justify-between py-3 border-t border-border">
                      <div>
                        <p className="text-sm font-medium">Enable Meezan Gateway</p>
                        <p className="text-xs text-muted-foreground">Activate for live payment processing</p>
                      </div>
                      <button
                        onClick={() => setForm(p => ({ ...p, isActive: !p.isActive }))}
                        className={`w-11 h-6 rounded-full transition-colors relative ${form.isActive ? "bg-green-500" : "bg-muted"}`}
                      >
                        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${form.isActive ? "left-5" : "left-0.5"}`} />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* EASYPAISA — coming soon */}
              {activeGateway === "easypaisa" && gw.id === "easypaisa" && (
                <div className="px-5 py-10 text-center border-t border-border/50 bg-muted/5">
                  <div className="w-12 h-12 rounded-2xl bg-green-100 flex items-center justify-center mx-auto mb-3"><Smartphone className="w-6 h-6 text-green-600" /></div>
                  <p className="text-sm font-semibold">EasyPaisa Integration</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">EasyPaisa mobile wallet gateway coming soon. Contact support to enable early access.</p>
                </div>
              )}

              {/* JAZZCASH — coming soon */}
              {activeGateway === "jazzcash" && gw.id === "jazzcash" && (
                <div className="px-5 py-10 text-center border-t border-border/50 bg-muted/5">
                  <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-3"><Wallet className="w-6 h-6 text-red-600" /></div>
                  <p className="text-sm font-semibold">JazzCash Integration</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">JazzCash mobile wallet gateway coming soon. Contact support to enable early access.</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* API Endpoints Reference */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2"><Server className="w-4 h-4 text-muted-foreground" /><h3 className="font-semibold">API Endpoints — Central Hub</h3></div>
          <Badge variant="outline" className="text-[10px]">For Shopify / Laravel / Mobile / POS</Badge>
        </div>
        <div className="divide-y divide-border">
          {INTEGRATION_ENDPOINTS.map(ep => (
            <div key={ep.key} className="px-5 py-3.5 hover:bg-muted/20 transition-colors">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <Badge variant="outline" className={`text-[9px] font-bold shrink-0 mt-0.5 ${ep.method === "POST" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-green-50 text-green-700 border-green-200"}`}>{ep.method}</Badge>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm">{ep.label}</p>
                    <p className="font-mono text-[10px] text-blue-600 truncate">{ep.path}</p>
                    <p className="text-[10px] text-muted-foreground">{ep.desc}</p>
                  </div>
                </div>
                <button onClick={() => { navigator.clipboard.writeText(ep.path).catch(() => {}); toast({ title: "Path copied!" }); }} className="text-muted-foreground hover:text-foreground shrink-0"><Copy className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Webhook and Callback Configuration */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2"><Webhook className="w-4 h-4 text-muted-foreground" /><h3 className="font-semibold">Webhook & Callback Setup</h3></div>
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => toast({ title: "Test webhook sent!" })}><Send className="w-3.5 h-3.5" /> Send Test Event</Button>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-border">
          {WEBHOOK_EVENTS.map(w => (
            <div key={w.label} className="px-5 py-4">
              <div className="flex items-center justify-between gap-2 mb-3">
                <p className="font-semibold text-sm">{w.label}</p>
                <div className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${w.active ? "bg-green-50 text-green-700" : "bg-muted text-muted-foreground"}`}>
                  {w.active ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                  {w.active ? "Active" : "Disabled"}
                </div>
              </div>
              <p className="font-mono text-[10px] text-blue-600 break-all leading-relaxed">{w.url}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Integration Code Snippets */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl overflow-hidden border border-slate-700">
        <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2"><Terminal className="w-4 h-4 text-green-400" /><h3 className="font-semibold text-white">Integration Code Snippets</h3></div>
          <div className="flex items-center gap-2">
            {["PHP/Laravel", "Node.js", "Python"].map(l => (
              <button key={l} className="text-[10px] px-2.5 py-1 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white transition-colors font-mono">{l}</button>
            ))}
          </div>
        </div>
        <div className="px-5 py-5 space-y-4">
          <div>
            <p className="text-[10px] text-slate-400 font-mono mb-2">// Initiate Payment — POST /api/payment/meezan/initiate</p>
            <div className="bg-slate-950/60 rounded-xl p-4 font-mono text-xs text-green-400 space-y-0.5">
              <p className="text-slate-500">{"<?php"}</p>
              <p>{`$response = Http::post('/api/payment/meezan/initiate', [`}</p>
              <p>{`  'amount'         => 5000,`}</p>
              <p>{`  'invoiceNumber'  => 'INV-2026-001',`}</p>
              <p>{`  'customerName'   => 'Ahmed Khan',`}</p>
              <p>{`  'customerPhone'  => '03001234567',`}</p>
              <p className="text-yellow-400">{`  'platformSource' => 'laravel',   // shopify|laravel|mobile|pos`}</p>
              <p>{`]);`}</p>
              <p className="mt-2">{`return redirect($response->json('formUrl'));`}</p>
            </div>
          </div>
          <div>
            <p className="text-[10px] text-slate-400 font-mono mb-2">// External Payment Report — POST /api/payment/external/receive</p>
            <div className="bg-slate-950/60 rounded-xl p-4 font-mono text-xs text-green-400 space-y-0.5">
              <p>{`$report = Http::post('/api/payment/external/receive', [`}</p>
              <p>{`  'platformSource' => 'shopify',`}</p>
              <p>{`  'externalRef'    => 'ORD-2026-1234',`}</p>
              <p>{`  'amount'         => 3400,`}</p>
              <p>{`  'status'         => 'paid',`}</p>
              <p>{`  'customerName'   => 'Sara Malik',`}</p>
              <p>{`]);`}</p>
            </div>
          </div>
        </div>
      </div>

      {/* API Logs and Bank Response Codes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* API Logs */}
        <div className="lg:col-span-2 bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2"><Terminal className="w-4 h-4 text-muted-foreground" /><h3 className="font-semibold">Live API Logs</h3></div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200">● Streaming</Badge>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1"><Download className="w-3 h-3" /> Export</Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="bg-muted/40 border-b border-border">
                <th className="px-4 py-2.5 text-left font-bold text-muted-foreground uppercase tracking-wide text-[10px]">Time</th>
                <th className="px-4 py-2.5 text-left font-bold text-muted-foreground uppercase tracking-wide text-[10px]">Method</th>
                <th className="px-4 py-2.5 text-left font-bold text-muted-foreground uppercase tracking-wide text-[10px]">Endpoint</th>
                <th className="px-4 py-2.5 text-left font-bold text-muted-foreground uppercase tracking-wide text-[10px]">Txn ID</th>
                <th className="px-4 py-2.5 text-right font-bold text-muted-foreground uppercase tracking-wide text-[10px]">Status</th>
                <th className="px-4 py-2.5 text-right font-bold text-muted-foreground uppercase tracking-wide text-[10px]">ms</th>
              </tr></thead>
              <tbody>
                {API_LOGS.map((l, i) => (
                  <tr key={i} className="border-b border-border/50 last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-2.5 font-mono text-muted-foreground">{l.time}</td>
                    <td className="px-4 py-2.5"><Badge variant="outline" className={`text-[9px] font-bold ${l.method === "POST" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-green-50 text-green-700 border-green-200"}`}>{l.method}</Badge></td>
                    <td className="px-4 py-2.5 font-mono text-blue-600">{l.endpoint}</td>
                    <td className="px-4 py-2.5 font-mono text-muted-foreground text-[10px]">{l.txn}</td>
                    <td className="px-4 py-2.5 text-right"><span className={`font-mono font-bold ${l.ok ? "text-green-600" : "text-red-600"}`}>{l.status}</span></td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">{l.ms}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Bank Response Codes */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2"><Hash className="w-4 h-4 text-muted-foreground" /><h3 className="font-semibold text-sm">Bank Response Codes</h3></div>
          <div className="divide-y divide-border">
            {RESPONSE_CODES.map(rc => (
              <div key={rc.code} className="px-5 py-2.5 flex items-center gap-3 hover:bg-muted/20">
                <span className="font-mono font-black text-sm w-8 shrink-0">{rc.code}</span>
                <span className={`text-xs font-medium ${rc.cls}`}>{rc.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function QrPaymentsTab() {
  const { toast } = useToast();
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const [genQr, setGenQr] = useState<{ amount: string; ref: string; url: string } | null>(null);
  const [generating, setGenerating] = useState(false);

  const generateQr = async () => {
    if (!amount || isNaN(+amount)) { toast({ variant: "destructive", title: "Enter valid amount" }); return; }
    setGenerating(true);
    await new Promise(r => setTimeout(r, 1400));
    const ref = `QR-${Date.now().toString(36).toUpperCase()}`;
    setGenQr({ amount, ref, url: `https://pay.kdfmart.pk/qr/${ref}` });
    setGenerating(false);
    toast({ title: "QR Code Generated!", description: `Ref: ${ref}` });
  };

  const QR_HISTORY = [
    { ref: "QR-20260506-001", amount: 3400,  customer: "Sara Malik",    status: "paid",    created: "06 May 11:15", scanned: 2  },
    { ref: "QR-20260506-002", amount: 8900,  customer: "Pending Scan",  status: "pending", created: "06 May 14:30", scanned: 0  },
    { ref: "QR-20260505-012", amount: 1250,  customer: "Walk-in",       status: "paid",    created: "05 May 09:20", scanned: 1  },
    { ref: "QR-20260505-013", amount: 5600,  customer: "Ahmed Khan",    status: "expired", created: "05 May 16:00", scanned: 3  },
    { ref: "QR-20260504-008", amount: 2200,  customer: "Zara Noor",     status: "paid",    created: "04 May 10:00", scanned: 1  },
    { ref: "QR-20260503-005", amount: 7800,  customer: "Kamran Shah",   status: "paid",    created: "03 May 14:22", scanned: 2  },
  ];

  const fmtRs = (n: number) => `Rs. ${n.toLocaleString("en-PK")}`;

  const QR_STATUS: Record<string, { label: string; cls: string }> = {
    paid:    { label: "Paid",    cls: "bg-green-50  text-green-700  border-green-200"  },
    pending: { label: "Pending", cls: "bg-amber-50  text-amber-700  border-amber-200"  },
    expired: { label: "Expired", cls: "bg-slate-50  text-slate-600  border-slate-200"  },
  };

  const totalQrVol = QR_HISTORY.filter(q => q.status === "paid").reduce((s, q) => s + q.amount, 0);

  return (
    <div className="space-y-6">

      {/* Stats Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "QR Payments Today", value: "6",           icon: QrCode,      cls: "bg-blue-500"   },
          { label: "QR Volume",          value: fmtRs(totalQrVol), icon: DollarSign,  cls: "bg-green-500"  },
          { label: "Pending QR Scans",   value: "1",           icon: ScanLine,    cls: "bg-amber-500"  },
          { label: "Avg Scan Time",      value: "42 sec",      icon: Clock,       cls: "bg-purple-500" },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${s.cls}`}><s.icon className="w-4 h-4 text-white" /></div>
            <div><p className="text-xs text-muted-foreground truncate">{s.label}</p><p className="text-base font-black mt-0.5">{s.value}</p></div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* QR Generator */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-blue-100 flex items-center justify-center"><QrCode className="w-3.5 h-3.5 text-blue-600" /></div>
            <h3 className="font-semibold text-sm">Generate QR Payment</h3>
          </div>
          <div className="px-5 py-5 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase">Amount (PKR)</Label>
              <Input value={amount} onChange={e => setAmount(e.target.value)} placeholder="Enter amount…" type="number" className="h-10 text-sm font-bold" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase">Description (optional)</Label>
              <Input value={desc} onChange={e => setDesc(e.target.value)} placeholder="e.g. Invoice INV-2026-012" className="h-9 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {["Rs. 500", "Rs. 1,000", "Rs. 2,000", "Rs. 5,000"].map(p => (
                <button key={p} onClick={() => setAmount(p.replace(/[^0-9]/g, ""))} className="text-xs font-semibold py-2 rounded-xl border border-border hover:border-primary hover:bg-primary/5 transition-all">{p}</button>
              ))}
            </div>
            <Button className="w-full gap-2 h-11 font-bold text-sm" onClick={generateQr} disabled={generating}>
              {generating ? <><RefreshCw className="w-4 h-4 animate-spin" /> Generating…</> : <><QrCode className="w-4 h-4" /> Generate QR Code</>}
            </Button>

            {/* Generated QR Display */}
            {genQr && (
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl p-5 text-center space-y-3">
                <div className="w-32 h-32 bg-white border-2 border-gray-200 rounded-2xl flex flex-col items-center justify-center mx-auto shadow-md">
                  <QrCode className="w-20 h-20 text-gray-800" />
                </div>
                <div>
                  <p className="font-black text-xl text-blue-900">Rs. {parseInt(genQr.amount).toLocaleString("en-PK")}</p>
                  <p className="text-xs font-mono text-blue-600 mt-0.5">{genQr.ref}</p>
                  <p className="text-[10px] text-blue-400 mt-0.5 break-all">{genQr.url}</p>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  <Button size="sm" variant="outline" className="gap-1 text-[10px] h-8 border-blue-200 text-blue-700 hover:bg-blue-100" onClick={() => { navigator.clipboard.writeText(genQr.url).catch(() => {}); toast({ title: "Link copied!" }); }}>
                    <Copy className="w-3 h-3" /> Copy
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1 text-[10px] h-8 border-green-200 text-green-700 hover:bg-green-100" onClick={() => toast({ title: "WhatsApp opened!" })}>
                    <MessageCircle className="w-3 h-3" /> WA
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1 text-[10px] h-8" onClick={() => window.print()}>
                    <Printer className="w-3 h-3" /> Print
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* QR History */}
        <div className="lg:col-span-2 bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2"><ScanLine className="w-4 h-4 text-muted-foreground" /><h3 className="font-semibold">QR Payment History</h3></div>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5"><Download className="w-3.5 h-3.5" /> Export</Button>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="text-[11px] font-bold uppercase">QR Reference</TableHead>
                  <TableHead className="text-[11px] font-bold uppercase">Customer</TableHead>
                  <TableHead className="text-[11px] font-bold uppercase text-right">Amount</TableHead>
                  <TableHead className="text-[11px] font-bold uppercase text-center">Scans</TableHead>
                  <TableHead className="text-[11px] font-bold uppercase">Created</TableHead>
                  <TableHead className="text-[11px] font-bold uppercase">Status</TableHead>
                  <TableHead className="text-[11px] font-bold uppercase text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {QR_HISTORY.map(q => {
                  const st = QR_STATUS[q.status];
                  return (
                    <TableRow key={q.ref} className="hover:bg-muted/20">
                      <TableCell className="font-mono text-xs text-primary font-bold">{q.ref}</TableCell>
                      <TableCell className="text-sm">{q.customer}</TableCell>
                      <TableCell className="text-right font-bold tabular-nums">{fmtRs(q.amount)}</TableCell>
                      <TableCell className="text-center"><span className="text-sm font-bold">{q.scanned}</span></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{q.created}</TableCell>
                      <TableCell><div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${st.cls}`}>{st.label}</div></TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => toast({ title: "QR copied!" })}><Copy className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => toast({ title: "Sent via WhatsApp" })}><MessageCircle className="w-3.5 h-3.5" /></Button>
                          {q.status === "pending" && <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500" onClick={() => toast({ title: "QR cancelled" })}><Ban className="w-3.5 h-3.5" /></Button>}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      {/* QR Integration Guide */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl p-6 border border-slate-700">
        <div className="flex items-center gap-2 mb-4"><QrCode className="w-5 h-5 text-blue-400" /><h3 className="font-bold text-white">QR API Integration</h3></div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-slate-950/60 rounded-xl p-4 font-mono text-xs text-green-400 space-y-0.5">
            <p className="text-slate-400">// Generate Dynamic QR via API</p>
            <p>{`POST /api/v1/qr/generate`}</p>
            <p>{`Content-Type: application/json`}</p>
            <p>{`X-API-KEY: {your_api_key}`}</p>
            <p className="mt-2">{`{`}</p>
            <p>{`  "amount":      5000,`}</p>
            <p>{`  "currency":    "PKR",`}</p>
            <p>{`  "description": "Invoice INV-2026-001",`}</p>
            <p>{`  "expiry_min":  30,`}</p>
            <p>{`  "callback_url":"/api/payment/callback",`}</p>
            <p>{`}`}</p>
          </div>
          <div className="bg-slate-950/60 rounded-xl p-4 font-mono text-xs text-blue-400 space-y-0.5">
            <p className="text-slate-400">// API Response</p>
            <p>{`{`}</p>
            <p>{`  "status":      "success",`}</p>
            <p>{`  "qr_ref":      "QR-20260506-XYZ",`}</p>
            <p>{`  "qr_image_url":"https://epg.meezan.com/qr/...",`}</p>
            <p>{`  "payment_url": "https://pay.kdfmart.pk/qr/XYZ",`}</p>
            <p>{`  "amount":      5000,`}</p>
            <p>{`  "expires_at":  "2026-05-06T09:30:00Z",`}</p>
            <p>{`  "deep_link":   "intent://pay?ref=XYZ"`}</p>
            <p>{`}`}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   NEW TAB 3 — INVOICE PAYMENT CENTER
════════════════════════════════════════════════════════════════════ */
function InvoicePayTab() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [showGenDialog, setShowGenDialog] = useState(false);
  const [sendingId, setSendingId]         = useState<number | null>(null);
  const [genLinkId, setGenLinkId]         = useState<number | null>(null);
  const [linkFilter, setLinkFilter]       = useState("all");
  const [genForm, setGenForm] = useState({
    invoiceNumber: "", customerName: "", customerPhone: "",
    customerEmail: "", amount: "", description: "",
  });

  const fmtRs = (n: number) => `Rs. ${Number(n).toLocaleString("en-PK")}`;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["invoices", linkFilter],
    queryFn: async () => {
      const qs = linkFilter !== "all" ? `?status=${linkFilter}` : "";
      const r  = await fetch(`/api/admin/invoices${qs}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load invoices");
      return r.json() as Promise<{ invoices: any[]; total: number; stats: any }>;
    },
    refetchInterval: 30_000,
  });

  const { data: domainInfo } = useQuery({
    queryKey: ["meezan-domain-info"],
    queryFn: async () => {
      const r = await fetch("/api/admin/meezan/domain-info", { credentials: "include" });
      return r.json();
    },
  });

  const invoices = data?.invoices ?? [];
  const stats    = data?.stats    ?? {};

  const createMutation = useMutation({
    mutationFn: async (body: typeof genForm) => {
      const r = await fetch("/api/admin/invoices", {
        method:      "POST",
        headers:     { "Content-Type": "application/json" },
        credentials: "include",
        body:        JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed to create invoice");
      return j as { ok: boolean; invoice: any };
    },
    onSuccess: async (data) => {
      toast({ title: "Invoice created!", description: "Generating Meezan payment link…" });
      genLinkMutation.mutate(data.invoice.id);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const genLinkMutation = useMutation({
    mutationFn: async (id: number) => {
      setGenLinkId(id);
      const r = await fetch(`/api/admin/invoices/${id}/generate-link`, {
        method: "POST", credentials: "include",
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed to generate link");
      return j as { ok: boolean; invoice: any; paymentUrl: string; invoiceUrl: string };
    },
    onSuccess: (d) => {
      setGenLinkId(null);
      setShowGenDialog(false);
      setGenForm({ invoiceNumber: "", customerName: "", customerPhone: "", customerEmail: "", amount: "", description: "" });
      toast({ title: "Payment link generated!", description: d.paymentUrl?.slice(0, 60) + "…" });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (e: Error) => {
      setGenLinkId(null);
      toast({ title: "Gateway Error", description: e.message, variant: "destructive" });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });

  const sendMutation = useMutation({
    mutationFn: async ({ id, via }: { id: number; via: string }) => {
      setSendingId(id);
      const r = await fetch(`/api/admin/invoices/${id}/send`, {
        method:      "POST",
        headers:     { "Content-Type": "application/json" },
        credentials: "include",
        body:        JSON.stringify({ via }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed to send");
      return j;
    },
    onSuccess: (_, v) => {
      setSendingId(null);
      toast({ title: `Invoice marked as sent via ${v.via}` });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (e: Error) => { setSendingId(null); toast({ title: "Error", description: e.message, variant: "destructive" }); },
  });

  const LINK_STATUS: Record<string, { label: string; cls: string }> = {
    draft:     { label: "Draft",     cls: "bg-slate-50  text-slate-600  border-slate-200" },
    sent:      { label: "Sent",      cls: "bg-amber-50  text-amber-700  border-amber-200" },
    paid:      { label: "Paid",      cls: "bg-green-50  text-green-700  border-green-200" },
    expired:   { label: "Expired",   cls: "bg-slate-100 text-slate-500  border-slate-200" },
    cancelled: { label: "Cancelled", cls: "bg-red-50    text-red-600    border-red-200"   },
  };

  const isGenerating = createMutation.isPending || genLinkMutation.isPending;

  return (
    <div className="space-y-6">

      {/* Dynamic Domain Banner */}
      {domainInfo && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-start gap-3">
          <Globe className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-blue-800">
              Active Domain: <span className="font-mono">{domainInfo.baseUrl}</span>
              {domainInfo.isProduction && <span className="ml-2 text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">✓ Production</span>}
            </p>
            <p className="text-[10px] text-blue-600 mt-0.5 break-all">
              Invoice URL: <span className="font-mono">{domainInfo.invoiceBase}/INV-XXXX</span>
              &nbsp;·&nbsp;Callback: <span className="font-mono">{domainInfo.callbackUrl}</span>
            </p>
          </div>
          <button onClick={() => refetch()} className="text-blue-500 hover:text-blue-700 shrink-0">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Stats + Create button */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1">
          {[
            { label: "Active Links", value: String(Number(stats.totalPending ?? 0)), cls: "bg-amber-500"  },
            { label: "Paid",         value: String(Number(stats.totalPaid    ?? 0)), cls: "bg-green-500"  },
            { label: "Total Volume", value: fmtRs(Number(stats.totalVolume   ?? 0)), cls: "bg-blue-500"   },
            { label: "All Invoices", value: String(Number(stats.totalCount   ?? 0)), cls: "bg-purple-500" },
          ].map(s => (
            <div key={s.label} className="bg-card border border-border rounded-xl p-3 flex items-center gap-2.5">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${s.cls}`}><Receipt className="w-3.5 h-3.5 text-white" /></div>
              <div><p className="text-[10px] text-muted-foreground leading-none">{s.label}</p><p className="font-black text-sm mt-0.5">{s.value}</p></div>
            </div>
          ))}
        </div>
        <Button className="gap-2 h-10 font-bold shrink-0" onClick={() => setShowGenDialog(true)}>
          <Plus className="w-4 h-4" /> Create Invoice
        </Button>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 bg-muted/40 p-1 rounded-xl border border-border w-fit">
        {["all", "draft", "sent", "paid", "expired"].map(f => (
          <button key={f} onClick={() => setLinkFilter(f)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${linkFilter === f ? "bg-card shadow-sm text-foreground border border-border" : "text-muted-foreground hover:text-foreground"}`}>
            {f}
          </button>
        ))}
      </div>

      {/* Invoice List */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2"><Link2 className="w-4 h-4 text-muted-foreground" /><h3 className="font-semibold">Invoice Payment Links</h3></div>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5"><Download className="w-3.5 h-3.5" /> Export</Button>
        </div>

        {isLoading && (
          <div className="px-5 py-12 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" /> Loading invoices…
          </div>
        )}

        {!isLoading && invoices.length === 0 && (
          <div className="px-5 py-16 text-center">
            <Receipt className="w-10 h-10 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-sm font-semibold">No invoices yet</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
              Create your first invoice — the system will automatically generate a Meezan Bank payment link using your live domain.
            </p>
            <Button className="mt-4 gap-2" onClick={() => setShowGenDialog(true)}>
              <Plus className="w-4 h-4" /> Create First Invoice
            </Button>
          </div>
        )}

        <div className="divide-y divide-border">
          {invoices.map((inv: any) => {
            const st        = LINK_STATUS[inv.status as string] ?? LINK_STATUS.draft;
            const isSending = sendingId === inv.id;
            const isGenning = genLinkId === inv.id;

            return (
              <div key={inv.id} className="px-5 py-4 hover:bg-muted/20 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      inv.status === "paid"   ? "bg-green-100" :
                      inv.status === "sent"   ? "bg-amber-100" : "bg-slate-100"}`}>
                      <Receipt className={`w-5 h-5 ${
                        inv.status === "paid"   ? "text-green-700" :
                        inv.status === "sent"   ? "text-amber-700" : "text-slate-500"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-sm text-primary">{inv.invoiceNumber}</span>
                        {inv.customerName && <span className="font-semibold text-sm">{inv.customerName}</span>}
                        <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${st.cls}`}>{st.label}</div>
                        {inv.meezanOrderId && (
                          <Badge variant="outline" className="text-[9px] bg-blue-50 text-blue-700 border-blue-200">Meezan ✓</Badge>
                        )}
                      </div>
                      {inv.customerPhone && (
                        <p className="flex items-center gap-1 mt-0.5 text-[10px] text-muted-foreground">
                          <Phone className="w-3 h-3" />{inv.customerPhone}
                          {inv.customerEmail && <span className="ml-2"><Mail className="w-3 h-3 inline mr-0.5" />{inv.customerEmail}</span>}
                        </p>
                      )}
                      {inv.paymentUrl ? (
                        <p className="flex items-center gap-1 mt-0.5 text-[10px] text-blue-600">
                          <Link2 className="w-3 h-3 shrink-0" />
                          <span className="truncate max-w-xs font-mono">{inv.paymentUrl}</span>
                        </p>
                      ) : (
                        <p className="text-[10px] text-muted-foreground mt-0.5 italic">No payment link yet — click "Gen Link"</p>
                      )}
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                        <span>Created: {new Date(inv.createdAt).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" })}</span>
                        {inv.sentAt && <><span>·</span><span className="text-amber-600">Sent: {new Date(inv.sentAt).toLocaleDateString("en-PK", { day: "numeric", month: "short" })} via {inv.sentVia}</span></>}
                        {inv.paidAt && <><span>·</span><span className="text-green-600">Paid: {new Date(inv.paidAt).toLocaleDateString("en-PK", { day: "numeric", month: "short" })}</span></>}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span className="font-black text-base tabular-nums">{fmtRs(Number(inv.amount))}</span>
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      {!inv.paymentUrl ? (
                        <Button size="sm" className="h-7 text-[10px] gap-1" onClick={() => genLinkMutation.mutate(inv.id)} disabled={isGenning}>
                          {isGenning ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                          {isGenning ? "Generating…" : "Gen Link"}
                        </Button>
                      ) : (
                        <>
                          <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1 text-green-700 border-green-200 hover:bg-green-50"
                            onClick={() => sendMutation.mutate({ id: inv.id, via: "whatsapp" })} disabled={isSending}>
                            {isSending ? <RefreshCw className="w-3 h-3 animate-spin" /> : <MessageCircle className="w-3 h-3" />} WA
                          </Button>
                          <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1 text-blue-700 border-blue-200 hover:bg-blue-50"
                            onClick={() => sendMutation.mutate({ id: inv.id, via: "email" })} disabled={isSending}>
                            {isSending ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />} Email
                          </Button>
                          <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1"
                            onClick={() => { navigator.clipboard.writeText(inv.paymentUrl).catch(() => {}); toast({ title: "Payment link copied!" }); }}>
                            <Copy className="w-3 h-3" /> Copy
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Create Invoice Dialog */}
      <Dialog open={showGenDialog} onOpenChange={setShowGenDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Link2 className="w-5 h-5" />Create Invoice & Payment Link</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {domainInfo && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5 text-xs text-blue-800">
                <Zap className="w-3.5 h-3.5 inline mr-1" />
                Payment link will use: <span className="font-mono font-semibold">{domainInfo.baseUrl}</span>
                {!domainInfo.isProduction && <span className="block mt-0.5 text-amber-700">⚠ Dev mode — Meezan API requires whitelisted IP on live server</span>}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Invoice No <span className="text-muted-foreground font-normal">(auto-gen if empty)</span></Label>
                <Input value={genForm.invoiceNumber} onChange={e => setGenForm(p => ({ ...p, invoiceNumber: e.target.value }))}
                  placeholder="INV-2026-001" className="h-9 text-sm font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Amount (PKR) <span className="text-red-500">*</span></Label>
                <Input type="number" value={genForm.amount} onChange={e => setGenForm(p => ({ ...p, amount: e.target.value }))}
                  placeholder="5000" className="h-9 text-sm" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Customer Name</Label>
              <Input value={genForm.customerName} onChange={e => setGenForm(p => ({ ...p, customerName: e.target.value }))}
                placeholder="Ahmed Khan" className="h-9 text-sm" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Phone</Label>
                <Input value={genForm.customerPhone} onChange={e => setGenForm(p => ({ ...p, customerPhone: e.target.value }))}
                  placeholder="03xx-xxxxxxx" className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Email</Label>
                <Input value={genForm.customerEmail} onChange={e => setGenForm(p => ({ ...p, customerEmail: e.target.value }))}
                  placeholder="customer@email.com" className="h-9 text-sm" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Description</Label>
              <Input value={genForm.description} onChange={e => setGenForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Order for dry fruits…" className="h-9 text-sm" />
            </div>

            <Button className="w-full gap-2 h-10" onClick={() => {
              if (!genForm.amount || isNaN(Number(genForm.amount))) {
                toast({ title: "Enter a valid amount", variant: "destructive" }); return;
              }
              createMutation.mutate(genForm);
            }} disabled={isGenerating}>
              {isGenerating
                ? <><RefreshCw className="w-4 h-4 animate-spin" /> {createMutation.isPending ? "Creating invoice…" : "Generating Meezan link…"}</>
                : <><Zap className="w-4 h-4" /> Create Invoice + Generate Payment Link</>
              }
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   NEW TAB 4 — REFUND MANAGEMENT
════════════════════════════════════════════════════════════════════ */
function RefundsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [refundFilter, setRefundFilter] = useState("all");
  const [selectedRefund, setSelectedRefund] = useState<MeezanTxn | null>(null);
  const [refundForm, setRefundForm] = useState({ txnId: "", amount: "", reason: "Customer Request" });

  const fmtRs = (n: number) => `Rs. ${n.toLocaleString("en-PK")}`;

  const { data: refundData, isLoading: loadingRefunds, refetch } = useQuery<{ transactions: MeezanTxn[]; total: number }>({
    queryKey: ["meezan-refunds", refundFilter],
    queryFn: () => {
      const statusParam = refundFilter === "all" ? "refunded,partial_refund,reversed" : refundFilter;
      return apiFetch(`/api/admin/meezan/transactions?status=${statusParam}&limit=100`);
    },
    refetchInterval: 30000,
  });

  const refundMutation = useMutation({
    mutationFn: ({ id, amount, reason }: { id: number; amount: number; reason: string }) =>
      apiFetch(`/api/admin/meezan/transactions/${id}/refund`, { method: "POST", body: JSON.stringify({ amount, reason }) }),
    onSuccess: () => {
      toast({ title: "Refund initiated!", description: "Sent to Meezan Bank for processing" });
      qc.invalidateQueries({ queryKey: ["meezan-refunds"] });
      qc.invalidateQueries({ queryKey: ["meezan-txns"] });
      qc.invalidateQueries({ queryKey: ["meezan-stats"] });
      setShowDialog(false);
    },
    onError: (e: any) => toast({ title: "Refund failed", description: e.message, variant: "destructive" }),
  });

  const txns = refundData?.transactions ?? [];
  const filtered = txns;
  const totalRefunded = txns.filter(t => t.status === "refunded" || t.status === "partial_refund").reduce((s, t) => s + Number(t.refundedAmount ?? 0), 0);
  const totalPending  = txns.filter(t => t.status === "reversed").reduce((s, t) => s + Number(t.amount), 0);

  const REFUND_STATUS: Record<string, { label: string; cls: string; icon: React.FC<any> }> = {
    refunded:      { label: "Refunded",     cls: "bg-blue-50   text-blue-700   border-blue-200",   icon: ArrowDownLeft },
    partial_refund:{ label: "Part.Refund",  cls: "bg-indigo-50 text-indigo-700 border-indigo-200", icon: MinusCircle   },
    reversed:      { label: "Reversed",     cls: "bg-purple-50 text-purple-700 border-purple-200", icon: RotateCcw     },
    pending:       { label: "Pending",      cls: "bg-amber-50  text-amber-700  border-amber-200",  icon: Clock         },
  };

  return (
    <div className="space-y-6">

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Refunded",    value: fmtRs(totalRefunded), icon: ArrowDownLeft, cls: "from-green-600 to-green-700"   },
          { label: "Reversed Volume",   value: fmtRs(totalPending),  icon: RotateCcw,     cls: "from-amber-500 to-amber-600"   },
          { label: "Refund Records",    value: String(txns.length),  icon: Receipt,       cls: "from-blue-600 to-blue-700"     },
          { label: "Refund Statuses",   value: "DB Live",            icon: ShieldCheck,   cls: "from-purple-600 to-purple-700" },
        ].map(s => (
          <div key={s.label} className={`bg-gradient-to-br ${s.cls} rounded-xl p-5 text-white`}>
            <div className="flex items-start justify-between">
              <div><p className="text-xs text-white/70 uppercase tracking-wide">{s.label}</p><p className="text-xl font-black mt-1">{s.value}</p></div>
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center"><s.icon className="w-5 h-5 text-white" /></div>
            </div>
          </div>
        ))}
      </div>

      {/* Filter + New Refund */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1 bg-muted/40 p-1 rounded-xl border border-border">
          {(["all","refunded","partial_refund","reversed"] as const).map(f => (
            <button key={f} onClick={() => setRefundFilter(f)} className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${refundFilter === f ? "bg-card shadow-sm text-foreground border border-border" : "text-muted-foreground hover:text-foreground"}`}>
              {f === "all" ? "All" : f === "partial_refund" ? "Partial" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => refetch()} disabled={loadingRefunds}>
            <RefreshCw className={`w-3.5 h-3.5 ${loadingRefunds ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button className="gap-2 h-9 text-sm" onClick={() => setShowDialog(true)}><Plus className="w-4 h-4" /> New Refund</Button>
        </div>
      </div>

      {/* Refunds List */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <ArrowDownLeft className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-semibold">Meezan Refund Records</h3>
          <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200 ml-1">{txns.length} records</Badge>
        </div>
        <div className="divide-y divide-border">
          {loadingRefunds
            ? <div className="py-10 text-center text-muted-foreground text-sm"><RefreshCw className="w-4 h-4 animate-spin inline mr-2" />Loading…</div>
            : filtered.length === 0
            ? <div className="py-10 text-center text-muted-foreground text-sm">No refund records found</div>
            : filtered.map(t => {
              const st = REFUND_STATUS[t.status] ?? MEEZAN_STATUS_MAP[t.status] ?? MEEZAN_STATUS_MAP.refunded;
              const StIcon = st.icon;
              const isPartial = Number(t.refundedAmount) < Number(t.amount) && Number(t.refundedAmount) > 0;
              return (
                <div key={t.id} className="px-5 py-4 hover:bg-muted/20 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${st.cls}`}><StIcon className="w-5 h-5" /></div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{t.customerName ?? "Customer"}</span>
                          <span className="font-mono text-xs text-muted-foreground">{t.meezanOrderId ?? `#${t.id}`}</span>
                          <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${st.cls}`}><StIcon className="w-2.5 h-2.5" />{st.label}</div>
                          {isPartial && <Badge variant="outline" className="text-[9px] bg-orange-50 text-orange-700 border-orange-200">Partial</Badge>}
                        </div>
                        {t.refundReason && <p className="text-xs text-muted-foreground mt-0.5 italic">"{t.refundReason}"</p>}
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground flex-wrap">
                          {t.invoiceNumber && <span className="font-mono text-primary">{t.invoiceNumber}</span>}
                          <span>·</span>
                          <span>Meezan EPG</span>
                          <span>·</span>
                          <span>Initiated: {new Date(t.createdAt).toLocaleDateString("en-PK", { day: "numeric", month: "short" })}</span>
                          {t.refundedAt && <><span>·</span><span className="text-green-600">Refunded: {new Date(t.refundedAt).toLocaleDateString("en-PK", { day: "numeric", month: "short" })}</span></>}
                          <Badge variant="outline" className={`text-[9px] ${t.isLive ? "bg-red-50 text-red-700 border-red-200" : "bg-blue-50 text-blue-700 border-blue-200"}`}>{t.isLive ? "LIVE" : "SAND"}</Badge>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <div className="text-right">
                        <p className="font-black text-base tabular-nums">{fmtRs(Number(t.refundedAmount ?? 0))}</p>
                        <p className="text-[10px] text-muted-foreground">of {fmtRs(Number(t.amount))}</p>
                      </div>
                      <div className="flex gap-1.5">
                        <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1" onClick={() => setSelectedRefund(t)}><Eye className="w-3 h-3" /> View</Button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          }
        </div>
        <div className="px-5 py-3 border-t border-border bg-muted/10 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{filtered.length} records shown</span>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-muted-foreground">Refunded: <strong className="text-blue-600">{fmtRs(totalRefunded)}</strong></span>
            <span className="text-muted-foreground">Reversed: <strong className="text-purple-600">{fmtRs(totalPending)}</strong></span>
          </div>
        </div>
      </div>

      {/* New Refund Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><ArrowDownLeft className="w-5 h-5" />Initiate Refund via Meezan</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800"><AlertTriangle className="w-3.5 h-3.5 inline mr-1" />Refunds are processed directly through Meezan Bank EPG. Make sure the transaction is in <strong>Paid</strong> status.</div>
            <div className="space-y-1.5"><Label className="text-xs font-semibold">Transaction DB ID (from Transactions tab)</Label>
              <Input value={refundForm.txnId} onChange={e => setRefundForm(p => ({ ...p, txnId: e.target.value }))} placeholder="e.g. 42" className="h-9 text-sm font-mono" /></div>
            <div className="space-y-1.5"><Label className="text-xs font-semibold">Refund Amount (PKR)</Label>
              <Input type="number" value={refundForm.amount} onChange={e => setRefundForm(p => ({ ...p, amount: e.target.value }))} placeholder="0" className="h-9 text-sm" /></div>
            <div className="space-y-1.5"><Label className="text-xs font-semibold">Reason</Label>
              <select value={refundForm.reason} onChange={e => setRefundForm(p => ({ ...p, reason: e.target.value }))} className="w-full h-9 text-sm border border-input rounded-md px-3 bg-background">
                <option>Customer Request</option><option>Duplicate Charge</option><option>Item Not Delivered</option><option>Unauthorized Transaction</option><option>Product Quality Issue</option><option>Other</option>
              </select>
            </div>
            <Button className="w-full gap-2 h-10" disabled={refundMutation.isPending || !refundForm.txnId || !refundForm.amount}
              onClick={() => refundMutation.mutate({ id: Number(refundForm.txnId), amount: Number(refundForm.amount), reason: refundForm.reason })}>
              {refundMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ArrowDownLeft className="w-4 h-4" />} Submit Refund to Meezan
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Refund Detail Dialog */}
      <Dialog open={!!selectedRefund} onOpenChange={() => setSelectedRefund(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><ArrowDownLeft className="w-5 h-5" />Refund Detail</DialogTitle></DialogHeader>
          {selectedRefund && (
            <div className="space-y-4">
              <div className="space-y-2">
                {([
                  ["Meezan Order ID", selectedRefund.meezanOrderId ?? "—"],
                  ["Invoice / Order", selectedRefund.invoiceNumber ?? "—"],
                  ["Customer", selectedRefund.customerName ?? "—"],
                  ["Phone", selectedRefund.customerPhone ?? "—"],
                  ["Gateway", "Meezan EPG"],
                  ["Status", selectedRefund.status],
                  ["Refund Reason", selectedRefund.refundReason ?? "—"],
                  ["Created", new Date(selectedRefund.createdAt).toLocaleString("en-PK")],
                  ["Refunded At", selectedRefund.refundedAt ? new Date(selectedRefund.refundedAt).toLocaleString("en-PK") : "—"],
                  ["Environment", selectedRefund.isLive ? "🔴 LIVE" : "🔵 Sandbox"],
                ] as [string,string][]).map(([l, v]) => (
                  <div key={l} className="flex items-start justify-between text-sm border-b border-border/50 last:border-0 py-1.5">
                    <span className="text-muted-foreground text-xs">{l}</span>
                    <span className="font-medium text-xs font-mono text-right max-w-[220px] break-all">{v}</span>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-blue-50 rounded-xl p-3 text-center"><p className="text-xs text-blue-600">Original</p><p className="text-xl font-black text-blue-800">{fmtRs(Number(selectedRefund.amount))}</p></div>
                <div className="bg-green-50 rounded-xl p-3 text-center"><p className="text-xs text-green-600">Refunded</p><p className="text-xl font-black text-green-800">{fmtRs(Number(selectedRefund.refundedAmount ?? 0))}</p></div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   NEW TAB 5 — SETTLEMENT CENTER
════════════════════════════════════════════════════════════════════ */
function SettlementTab() {
  const { toast } = useToast();

  const fmtRs = (n: number) => `Rs. ${n.toLocaleString("en-PK")}`;

  const SETTLEMENTS = [
    { id: "s1", period: "May 06, 2026",   vol: 47350,  fees: 947,   net: 45929,  txns: 10, status: "pending",   bankRef: "—",                settledDate: "—",            batch: "BATCH-20260506" },
    { id: "s2", period: "May 05, 2026",   vol: 38900,  fees: 778,   net: 37736,  txns: 13, status: "settled",   bankRef: "MBL-SETT-0501001", settledDate: "06 May 07:00", batch: "BATCH-20260505" },
    { id: "s3", period: "May 04, 2026",   vol: 55300,  fees: 1106,  net: 53634,  txns: 19, status: "settled",   bankRef: "MBL-SETT-0401002", settledDate: "05 May 07:00", batch: "BATCH-20260504" },
    { id: "s4", period: "May 03, 2026",   vol: 42100,  fees: 842,   net: 40808,  txns: 15, status: "settled",   bankRef: "MBL-SETT-0301003", settledDate: "04 May 07:00", batch: "BATCH-20260503" },
    { id: "s5", period: "May 02, 2026",   vol: 19800,  fees: 396,   net: 19206,  txns: 7,  status: "settled",   bankRef: "MBL-SETT-0201004", settledDate: "03 May 07:00", batch: "BATCH-20260502" },
    { id: "s6", period: "May 01, 2026",   vol: 34200,  fees: 684,   net: 33132,  txns: 12, status: "settled",   bankRef: "MBL-SETT-0101005", settledDate: "02 May 07:00", batch: "BATCH-20260501" },
  ];

  const totalSettled = SETTLEMENTS.filter(s => s.status === "settled").reduce((a, s) => a + s.net, 0);
  const totalFees    = SETTLEMENTS.reduce((a, s) => a + s.fees, 0);
  const pendingSettle = SETTLEMENTS.filter(s => s.status === "pending").reduce((a, s) => a + s.net, 0);

  const SETT_STATUS: Record<string, { label: string; cls: string; icon: React.FC<any> }> = {
    pending: { label: "Pending T+1", cls: "bg-amber-50  text-amber-700  border-amber-200",  icon: Clock        },
    settled: { label: "Settled",     cls: "bg-green-50  text-green-700  border-green-200",  icon: CheckCircle  },
    failed:  { label: "Failed",      cls: "bg-red-50    text-red-700    border-red-200",    icon: XCircle      },
  };

  return (
    <div className="space-y-6">

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Settled (Week)",  value: fmtRs(totalSettled),  icon: CheckCircle,   cls: "from-green-600 to-green-700"   },
          { label: "Pending Settlement",    value: fmtRs(pendingSettle), icon: Clock,         cls: "from-amber-500 to-amber-600"   },
          { label: "Total Gateway Fees",    value: fmtRs(totalFees),     icon: Landmark,      cls: "from-blue-600 to-blue-700"     },
          { label: "Settlement Cycle",      value: "T + 1 Day",          icon: Calendar,      cls: "from-slate-700 to-slate-800"   },
        ].map(s => (
          <div key={s.label} className={`bg-gradient-to-br ${s.cls} rounded-xl p-5 text-white`}>
            <div className="flex items-start justify-between">
              <div><p className="text-xs text-white/70 uppercase tracking-wide">{s.label}</p><p className="text-lg font-black mt-1 leading-tight">{s.value}</p></div>
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0"><s.icon className="w-5 h-5 text-white" /></div>
            </div>
          </div>
        ))}
      </div>

      {/* Settlement Schedule Info */}
      <div className="bg-blue-50 border border-blue-100 rounded-2xl px-6 py-4 flex items-start gap-4">
        <Info className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold text-blue-900 text-sm">Meezan Bank Settlement Schedule</p>
          <p className="text-xs text-blue-700 mt-1">Daily settlements run at <strong>07:00 AM PKT</strong> for the previous day's transactions (T+1). Weekend transactions settle on the next business day. Bank Reference numbers are provided by Meezan EPG for each batch.</p>
          <div className="flex items-center gap-4 mt-2 text-[10px] text-blue-600 flex-wrap">
            <span>✓ Card payments: T+1</span>
            <span>✓ EasyPaisa: T+1</span>
            <span>✓ JazzCash: T+2</span>
            <span>✓ Bank Transfer: T+1</span>
          </div>
        </div>
      </div>

      {/* Settlement Table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2"><Building2 className="w-4 h-4 text-muted-foreground" /><h3 className="font-semibold">Settlement History</h3></div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5"><Download className="w-3.5 h-3.5" /> Export CSV</Button>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5"><FileText className="w-3.5 h-3.5" /> PDF</Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="text-[11px] font-bold uppercase">Period</TableHead>
                <TableHead className="text-[11px] font-bold uppercase">Batch ID</TableHead>
                <TableHead className="text-[11px] font-bold uppercase text-center">Txns</TableHead>
                <TableHead className="text-[11px] font-bold uppercase text-right">Gross Volume</TableHead>
                <TableHead className="text-[11px] font-bold uppercase text-right">Gateway Fees</TableHead>
                <TableHead className="text-[11px] font-bold uppercase text-right">Net Settled</TableHead>
                <TableHead className="text-[11px] font-bold uppercase">Bank Ref</TableHead>
                <TableHead className="text-[11px] font-bold uppercase">Settled At</TableHead>
                <TableHead className="text-[11px] font-bold uppercase">Status</TableHead>
                <TableHead className="text-[11px] font-bold uppercase text-right">Report</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {SETTLEMENTS.map(s => {
                const st = SETT_STATUS[s.status];
                const StIcon = st.icon;
                return (
                  <TableRow key={s.id} className="hover:bg-muted/20">
                    <TableCell className="font-semibold text-sm">{s.period}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{s.batch}</TableCell>
                    <TableCell className="text-center font-bold">{s.txns}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{fmtRs(s.vol)}</TableCell>
                    <TableCell className="text-right text-red-500 text-sm tabular-nums">–{fmtRs(s.fees)}</TableCell>
                    <TableCell className="text-right font-black text-primary tabular-nums">{fmtRs(s.net)}</TableCell>
                    <TableCell className="font-mono text-xs text-blue-600">{s.bankRef}</TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{s.settledDate}</TableCell>
                    <TableCell>
                      <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${st.cls}`}>
                        <StIcon className="w-2.5 h-2.5" />{st.label}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => toast({ title: `Downloading ${s.batch} report…` })}><Download className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0"><Eye className="w-3.5 h-3.5" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <div className="px-5 py-4 border-t border-border bg-muted/10 grid grid-cols-3 gap-4 text-center">
          <div><p className="text-xs text-muted-foreground">Total Volume (6d)</p><p className="text-base font-black">{fmtRs(SETTLEMENTS.reduce((a, s) => a + s.vol, 0))}</p></div>
          <div><p className="text-xs text-muted-foreground">Total Fees Paid</p><p className="text-base font-black text-red-600">–{fmtRs(totalFees)}</p></div>
          <div><p className="text-xs text-muted-foreground">Net Received</p><p className="text-base font-black text-primary">{fmtRs(totalSettled)}</p></div>
        </div>
      </div>

      {/* Reconciliation Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2"><LayoutGrid className="w-4 h-4 text-muted-foreground" /><h3 className="font-semibold text-sm">Settlement by Payment Method</h3></div>
          <div className="px-5 py-4 space-y-3">
            {[
              { method: "Card (Debit/Credit)", vol: 41000, fees: 820,  pct: 64 },
              { method: "Bank Transfer",       vol: 12300, fees: 246,  pct: 19 },
              { method: "EasyPaisa",           vol: 8900,  fees: 178,  pct: 14 },
              { method: "JazzCash",            vol: 2200,  fees: 44,   pct: 3  },
            ].map(m => (
              <div key={m.method} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">{m.method}</span>
                  <span className="text-muted-foreground">{fmtRs(m.vol - m.fees)} net · {m.pct}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-blue-400" style={{ width: `${m.pct}%` }} /></div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2"><Building2 className="w-4 h-4 text-muted-foreground" /><h3 className="font-semibold text-sm">Bank Account Details</h3></div>
          <div className="px-5 py-5 space-y-3">
            {[
              { label: "Bank Name",       value: "Meezan Bank Limited" },
              { label: "Account Title",   value: "KDF Trading Company" },
              { label: "Account No",      value: "0264-****-****-1829" },
              { label: "IBAN",            value: "PK64MEZN0002640000001829" },
              { label: "Branch Code",     value: "0264 — Gulberg Branch" },
              { label: "Settlement A/C",  value: "Designated EPG Account" },
            ].map(f => (
              <div key={f.label} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                <span className="text-xs text-muted-foreground">{f.label}</span>
                <span className="font-mono text-xs font-semibold">{f.value}</span>
              </div>
            ))}
            <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs mt-1" onClick={() => toast({ title: "Account details updated" })}>
              <Settings className="w-3.5 h-3.5" /> Update Bank Account
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Header Stats (real data) ── */
function HeaderStats() {
  const { data: stats } = useQuery<MeezanStats>({
    queryKey: ["meezan-stats"],
    queryFn:  () => apiFetch("/api/admin/meezan/stats"),
    refetchInterval: 30000,
  });
  return (
    <>
      <div className="text-right bg-white/5 border border-white/10 rounded-xl px-4 py-2.5">
        <p className="text-[10px] text-blue-300 uppercase tracking-wide">Today's Volume</p>
        <p className="text-xl font-black">{stats ? fmtRs(stats.todayVolume) : "—"}</p>
        <p className="text-[10px] text-blue-400">{stats?.todayCount ?? 0} transactions</p>
      </div>
      <div className="text-right bg-white/5 border border-white/10 rounded-xl px-4 py-2.5">
        <p className="text-[10px] text-blue-300 uppercase tracking-wide">Total Volume</p>
        <p className="text-xl font-black text-green-400">{stats ? fmtRs(stats.totalVolume) : "—"}</p>
        <p className="text-[10px] text-blue-400">{stats?.paid ?? 0} paid</p>
      </div>
    </>
  );
}

/* ════════════════════════════════ MAIN PAGE ═════════════════════════ */
export default function PaymentGatewayPage() {
  const [tab, setTab] = useState<PgTab>("overview");
  const { data: stats } = useQuery<MeezanStats>({
    queryKey: ["meezan-stats"],
    queryFn:  () => apiFetch("/api/admin/meezan/stats"),
    refetchInterval: 60000,
  });

  const TABS: { key: PgTab; label: string; icon: React.FC<any>; badge?: string; group?: string }[] = [
    { key: "overview",     label: "Overview",        icon: Gauge                    },
    { key: "transactions", label: "Transactions",    icon: Activity,   badge: stats ? String(stats.total) : undefined },
    { key: "commission",   label: "Commission",      icon: Percent                  },
    { key: "disputes",     label: "Disputes",        icon: AlertTriangle, badge: String(MOCK_DISPUTES.filter(d => d.status === "pending" || d.status === "under_review").length) },
    { key: "merchants",    label: "Merchant APIs",   icon: Key                      },
    { key: "analytics",    label: "Analytics",       icon: BarChart3                },
    { key: "security",     label: "Security",        icon: ShieldCheck              },
    { key: "reports",      label: "Reports",         icon: FileText                 },
    { key: "api-config",   label: "API Integration", icon: Server,     group: "bank" },
    { key: "qr-payments",  label: "QR Payments",     icon: QrCode,     group: "bank" },
    { key: "invoice-pay",  label: "Invoice Pay",     icon: Link2,      group: "bank" },
    { key: "refunds",      label: "Refunds",         icon: ArrowDownLeft, badge: stats?.refunded ? String(stats.refunded) : undefined, group: "bank" },
    { key: "settlement",   label: "Settlement",      icon: Building2,  group: "bank" },
  ];

  return (
    <div className="space-y-6">

      {/* Page Header */}
      <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 rounded-2xl p-6 text-white">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center">
              <Landmark className="w-7 h-7 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-2xl font-black tracking-tight">KDF Payment Gateway</h1>
                <Badge className="bg-green-500/20 text-green-300 border-green-500/40 text-[10px] font-bold">● Live</Badge>
              </div>
              <p className="text-sm text-blue-200">Meezan Bank EPG · Enterprise Payment Engine · Central Financial Hub</p>
              <div className="flex items-center gap-4 mt-2 text-xs text-blue-300">
                <span className="flex items-center gap-1"><ShieldCheck className="w-3 h-3 text-green-400" /> SSL Secured</span>
                <span className="flex items-center gap-1"><Zap className="w-3 h-3 text-yellow-400" /> PCI DSS</span>
                <span className="flex items-center gap-1"><Lock className="w-3 h-3 text-blue-400" /> 3-D Secure</span>
                <span className="flex items-center gap-1"><Globe className="w-3 h-3 text-purple-400" /> 6 Integrations</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <HeaderStats />
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 bg-muted/50 p-1 rounded-xl border border-border flex-wrap">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-all relative ${tab === t.key ? "bg-card shadow-sm text-foreground border border-border" : "text-muted-foreground hover:text-foreground"}`}>
            <t.icon className="w-4 h-4" />
            <span>{t.label}</span>
            {t.badge && (
              <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold ${tab === t.key ? "bg-primary text-primary-foreground" : "bg-muted-foreground/20 text-muted-foreground"}`}>{t.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === "overview"     && <OverviewTab />}
      {tab === "transactions" && <TransactionsTab />}
      {tab === "commission"   && <CommissionTab />}
      {tab === "disputes"     && <DisputesTab />}
      {tab === "merchants"    && <MerchantApiTab />}
      {tab === "analytics"    && <AnalyticsTab />}
      {tab === "security"     && <SecurityTab />}
      {tab === "reports"      && <ReportsTab />}
      {tab === "api-config"   && <ApiConfigTab />}
      {tab === "qr-payments"  && <QrPaymentsTab />}
      {tab === "invoice-pay"  && <InvoicePayTab />}
      {tab === "refunds"      && <RefundsTab />}
      {tab === "settlement"   && <SettlementTab />}
    </div>
  );
}
