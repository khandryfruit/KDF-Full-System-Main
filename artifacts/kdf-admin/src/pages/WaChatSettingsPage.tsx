import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CreditCard, Plus, Trash2, Edit2, Check, X, Star, ToggleLeft, ToggleRight,
  Smartphone, Building2, QrCode, Loader2, Save, AlertTriangle, Upload,
  DollarSign, ChevronDown, ChevronRight, Settings, Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const token = () => localStorage.getItem("kdf_admin_token") ?? "";
function api(path: string, opts?: RequestInit) {
  return fetch(`/api${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}`, ...(opts?.headers ?? {}) },
  });
}

type AccountType = "bank" | "jazzcash" | "easypaisa" | "stripe" | "cod" | "shopify";

interface PaymentAccount {
  id: string;
  type: AccountType;
  title: string;
  bankName?: string;
  iban?: string;
  accountNumber?: string;
  accountHolder?: string;
  instructions?: string;
  isActive: boolean;
  isDefault: boolean;
  qrCode?: string;
}

const ACCOUNT_TYPES: { key: AccountType; label: string; color: string; bg: string; icon: any }[] = [
  { key: "bank", label: "Bank Transfer", color: "text-blue-700", bg: "bg-blue-50", icon: Building2 },
  { key: "jazzcash", label: "JazzCash", color: "text-red-700", bg: "bg-red-50", icon: Smartphone },
  { key: "easypaisa", label: "EasyPaisa", color: "text-green-700", bg: "bg-green-50", icon: Smartphone },
  { key: "cod", label: "Cash on Delivery", color: "text-amber-700", bg: "bg-amber-50", icon: DollarSign },
  { key: "stripe", label: "Stripe", color: "text-violet-700", bg: "bg-violet-50", icon: CreditCard },
  { key: "shopify", label: "Shopify Payments", color: "text-[#96BF48]", bg: "bg-green-50", icon: Shield },
];

const EMPTY_FORM: Omit<PaymentAccount, "id"> = {
  type: "bank",
  title: "",
  bankName: "",
  iban: "",
  accountNumber: "",
  accountHolder: "",
  instructions: "",
  isActive: true,
  isDefault: false,
};

function TypeBadge({ type }: { type: AccountType }) {
  const def = ACCOUNT_TYPES.find(t => t.key === type) ?? ACCOUNT_TYPES[0];
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${def.bg} ${def.color}`}>
      <def.icon className="w-3 h-3" />
      {def.label}
    </span>
  );
}

/* ── Account Form Modal ── */
function AccountFormModal({
  initial,
  onSave,
  onClose,
}: {
  initial?: PaymentAccount;
  onSave: (acc: Omit<PaymentAccount, "id">) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<Omit<PaymentAccount, "id">>(initial ? { ...initial } : { ...EMPTY_FORM });
  const set = (k: keyof typeof form, v: any) => setForm(f => ({ ...f, [k]: v }));

  const typeDef = ACCOUNT_TYPES.find(t => t.key === form.type)!;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-800 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-primary" />
            {initial ? "Edit Payment Account" : "Add Payment Account"}
          </h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Type selector */}
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-2 block">Account Type</label>
            <div className="grid grid-cols-3 gap-2">
              {ACCOUNT_TYPES.map(t => (
                <button
                  key={t.key}
                  onClick={() => set("type", t.key)}
                  className={`flex flex-col items-center gap-1 py-2.5 px-2 rounded-xl border-2 text-xs font-medium transition-all ${
                    form.type === t.key
                      ? `border-primary ${t.bg} ${t.color}`
                      : "border-gray-100 text-gray-500 hover:border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <t.icon className="w-4 h-4" />
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">Account Title *</label>
            <input
              value={form.title}
              onChange={e => set("title", e.target.value)}
              placeholder={`e.g. ${typeDef.label} — KDF NUTS`}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
            />
          </div>

          {/* Account Holder */}
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">Account Holder Name</label>
            <input
              value={form.accountHolder ?? ""}
              onChange={e => set("accountHolder", e.target.value)}
              placeholder="e.g. Khan Baba Dry Fruits"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
            />
          </div>

          {/* Bank-specific fields */}
          {form.type === "bank" && (
            <>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">Bank Name</label>
                <input
                  value={form.bankName ?? ""}
                  onChange={e => set("bankName", e.target.value)}
                  placeholder="e.g. HBL, Meezan, MCB"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">IBAN</label>
                <input
                  value={form.iban ?? ""}
                  onChange={e => set("iban", e.target.value)}
                  placeholder="PK00XXXX0000000000000000"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">Account Number</label>
                <input
                  value={form.accountNumber ?? ""}
                  onChange={e => set("accountNumber", e.target.value)}
                  placeholder="e.g. 01234567890"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary"
                />
              </div>
            </>
          )}

          {/* JazzCash / EasyPaisa */}
          {(form.type === "jazzcash" || form.type === "easypaisa") && (
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Mobile Number</label>
              <input
                value={form.accountNumber ?? ""}
                onChange={e => set("accountNumber", e.target.value)}
                placeholder="e.g. 03XXXXXXXXX"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary"
              />
            </div>
          )}

          {/* Instructions */}
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">Payment Instructions</label>
            <textarea
              value={form.instructions ?? ""}
              onChange={e => set("instructions", e.target.value)}
              placeholder="e.g. Transfer to this account and send screenshot on WhatsApp"
              rows={2}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary resize-none"
            />
          </div>

          {/* Toggles */}
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <button
                onClick={() => set("isActive", !form.isActive)}
                className={`w-9 h-5 rounded-full transition-colors ${form.isActive ? "bg-primary" : "bg-gray-300"}`}
              >
                <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${form.isActive ? "translate-x-4" : ""}`} />
              </button>
              <span className="text-xs text-gray-600">Active</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <button
                onClick={() => set("isDefault", !form.isDefault)}
                className={`w-9 h-5 rounded-full transition-colors ${form.isDefault ? "bg-amber-500" : "bg-gray-300"}`}
              >
                <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${form.isDefault ? "translate-x-4" : ""}`} />
              </button>
              <span className="text-xs text-gray-600">Set as Default</span>
            </label>
          </div>
        </div>

        <div className="flex items-center gap-2 px-5 py-4 border-t border-gray-100 bg-gray-50">
          <Button variant="outline" size="sm" onClick={onClose} className="flex-1">Cancel</Button>
          <Button
            size="sm"
            onClick={() => onSave(form)}
            disabled={!form.title.trim()}
            className="flex-1 gap-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            {initial ? "Save Changes" : "Add Account"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════
   MAIN PAGE
══════════════════════════════════ */
export default function WaChatSettingsPage() {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PaymentAccount | undefined>();
  const [activeSection, setActiveSection] = useState<"payments" | "chatbot" | "general">("payments");

  // Load from localStorage
  useEffect(() => {
    const stored = localStorage.getItem("kdf_payment_accounts");
    if (stored) {
      try { setAccounts(JSON.parse(stored)); } catch {}
    } else {
      // Default accounts
      const defaults: PaymentAccount[] = [
        {
          id: "1",
          type: "bank",
          title: "HBL Bank — KDF NUTS",
          bankName: "HBL",
          accountHolder: "Khan Baba Dry Fruits",
          iban: "",
          accountNumber: "",
          instructions: "Transfer to this account and send screenshot on WhatsApp: 03XXXXXXXXX",
          isActive: true,
          isDefault: true,
        },
        {
          id: "2",
          type: "jazzcash",
          title: "JazzCash — KDF NUTS",
          accountHolder: "Khan Baba Dry Fruits",
          accountNumber: "",
          instructions: "Send payment to this JazzCash number",
          isActive: true,
          isDefault: false,
        },
        {
          id: "3",
          type: "cod",
          title: "Cash on Delivery",
          accountHolder: "",
          instructions: "Pay cash when your order arrives at your doorstep.",
          isActive: true,
          isDefault: false,
        },
      ];
      setAccounts(defaults);
      localStorage.setItem("kdf_payment_accounts", JSON.stringify(defaults));
    }
  }, []);

  const save = (list: PaymentAccount[]) => {
    setAccounts(list);
    localStorage.setItem("kdf_payment_accounts", JSON.stringify(list));
  };

  const handleAdd = (form: Omit<PaymentAccount, "id">) => {
    const newAcc: PaymentAccount = { ...form, id: Date.now().toString() };
    let list = [...accounts, newAcc];
    if (form.isDefault) list = list.map(a => a.id === newAcc.id ? a : { ...a, isDefault: false });
    save(list);
    setShowForm(false);
    toast({ title: "Payment account added ✓" });
  };

  const handleEdit = (form: Omit<PaymentAccount, "id">) => {
    let list = accounts.map(a => a.id === editing!.id ? { ...form, id: a.id } : a);
    if (form.isDefault) list = list.map(a => a.id === editing!.id ? a : { ...a, isDefault: false });
    save(list);
    setEditing(undefined);
    toast({ title: "Account updated ✓" });
  };

  const handleDelete = (id: string) => {
    if (!confirm("Delete this payment account?")) return;
    save(accounts.filter(a => a.id !== id));
    toast({ title: "Account deleted" });
  };

  const toggleActive = (id: string) => {
    save(accounts.map(a => a.id === id ? { ...a, isActive: !a.isActive } : a));
  };

  const setDefault = (id: string) => {
    save(accounts.map(a => ({ ...a, isDefault: a.id === id })));
    toast({ title: "Default account updated ✓" });
  };

  const tabs = [
    { key: "payments", label: "Payment Accounts", icon: CreditCard },
    { key: "chatbot", label: "Chatbot Settings", icon: Settings },
    { key: "general", label: "General", icon: Shield },
  ] as const;

  return (
    <>
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Settings className="w-5 h-5 text-primary" />
            WA Chat Settings
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage payment accounts, chatbot config, and communication settings</p>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-5 bg-gray-100 rounded-xl p-1">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveSection(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all flex-1 justify-center ${
                activeSection === tab.key
                  ? "bg-white text-gray-800 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Payment Accounts Section */}
        {activeSection === "payments" && (
          <div className="space-y-3">
            {/* Header row */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-800">Payment Accounts</h2>
                <p className="text-xs text-gray-500 mt-0.5">Manage bank accounts, JazzCash, EasyPaisa and other payment methods</p>
              </div>
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => { setEditing(undefined); setShowForm(true); }}
              >
                <Plus className="w-3.5 h-3.5" />
                Add Account
              </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white border border-gray-100 rounded-xl p-3 text-center shadow-sm">
                <p className="text-lg font-bold text-gray-800">{accounts.length}</p>
                <p className="text-[11px] text-gray-500">Total Accounts</p>
              </div>
              <div className="bg-white border border-gray-100 rounded-xl p-3 text-center shadow-sm">
                <p className="text-lg font-bold text-emerald-600">{accounts.filter(a => a.isActive).length}</p>
                <p className="text-[11px] text-gray-500">Active</p>
              </div>
              <div className="bg-white border border-gray-100 rounded-xl p-3 text-center shadow-sm">
                <p className="text-lg font-bold text-amber-500">{accounts.filter(a => a.isDefault).length}</p>
                <p className="text-[11px] text-gray-500">Default</p>
              </div>
            </div>

            {/* Account cards */}
            {accounts.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm">No payment accounts yet</p>
                <Button size="sm" className="mt-3 gap-1.5" onClick={() => setShowForm(true)}>
                  <Plus className="w-3.5 h-3.5" /> Add First Account
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {accounts.map(acc => {
                  const typeDef = ACCOUNT_TYPES.find(t => t.key === acc.type)!;
                  return (
                    <div
                      key={acc.id}
                      className={`bg-white border rounded-xl p-4 shadow-sm transition-all ${
                        acc.isDefault ? "border-amber-200 ring-1 ring-amber-100" : "border-gray-100"
                      } ${!acc.isActive ? "opacity-60" : ""}`}
                    >
                      <div className="flex items-start gap-3">
                        {/* Icon */}
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${typeDef.bg}`}>
                          <typeDef.icon className={`w-5 h-5 ${typeDef.color}`} />
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-gray-800 text-sm">{acc.title}</p>
                            <TypeBadge type={acc.type} />
                            {acc.isDefault && (
                              <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-0.5">
                                <Star className="w-2 h-2" /> DEFAULT
                              </span>
                            )}
                            {!acc.isActive && (
                              <span className="text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-bold">INACTIVE</span>
                            )}
                          </div>

                          {acc.accountHolder && (
                            <p className="text-xs text-gray-600 mt-0.5">{acc.accountHolder}</p>
                          )}

                          <div className="mt-2 space-y-1">
                            {acc.bankName && (
                              <p className="text-xs text-gray-500 flex items-center gap-1.5">
                                <Building2 className="w-3 h-3" /> {acc.bankName}
                              </p>
                            )}
                            {acc.iban && (
                              <p className="text-xs font-mono text-gray-600 flex items-center gap-1.5">
                                <CreditCard className="w-3 h-3 text-gray-400" /> {acc.iban}
                              </p>
                            )}
                            {acc.accountNumber && (
                              <p className="text-xs font-mono text-gray-600 flex items-center gap-1.5">
                                <Smartphone className="w-3 h-3 text-gray-400" /> {acc.accountNumber}
                              </p>
                            )}
                            {acc.instructions && (
                              <p className="text-xs text-gray-500 italic mt-1 bg-gray-50 rounded-lg px-2 py-1.5">
                                {acc.instructions}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          <div className="flex items-center gap-1">
                            {!acc.isDefault && (
                              <button
                                onClick={() => setDefault(acc.id)}
                                title="Set as default"
                                className="p-1.5 rounded-lg hover:bg-amber-50 text-gray-400 hover:text-amber-500 transition-colors"
                              >
                                <Star className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => toggleActive(acc.id)}
                              title={acc.isActive ? "Deactivate" : "Activate"}
                              className={`p-1.5 rounded-lg transition-colors ${acc.isActive ? "text-emerald-500 hover:bg-emerald-50" : "text-gray-400 hover:bg-gray-50"}`}
                            >
                              {acc.isActive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                            </button>
                            <button
                              onClick={() => { setEditing(acc); setShowForm(true); }}
                              className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-500 transition-colors"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(acc.id)}
                              className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Chatbot Settings Section */}
        {activeSection === "chatbot" && (
          <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm space-y-4">
            <h2 className="font-semibold text-gray-800 flex items-center gap-2">
              <Settings className="w-4 h-4 text-primary" /> Chatbot Settings
            </h2>
            <p className="text-sm text-gray-500">
              Chatbot settings are managed in{" "}
              <a href="/admin/whatsapp" className="text-primary font-medium hover:underline">WhatsApp Settings</a>{" "}
              and{" "}
              <a href="/admin/ai-content" className="text-primary font-medium hover:underline">AI Content</a>.
            </p>
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-700">
              <p className="font-medium mb-1">Quick Links</p>
              <ul className="space-y-1 text-xs">
                <li>• <a href="/admin/whatsapp" className="hover:underline font-medium">WhatsApp API settings → phone, tokens, webhook</a></li>
                <li>• <a href="/admin/ai-content" className="hover:underline font-medium">AI Content → OpenAI key, model, system prompt</a></li>
                <li>• <a href="/admin/chat-leads" className="hover:underline font-medium">Chat Leads CRM → lead management</a></li>
                <li>• <a href="/admin/shopify/widget" className="hover:underline font-medium">Chat Widget → Shopify embed code</a></li>
              </ul>
            </div>
          </div>
        )}

        {/* General Section */}
        {activeSection === "general" && (
          <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm space-y-4">
            <h2 className="font-semibold text-gray-800 flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" /> General Settings
            </h2>
            <p className="text-sm text-gray-500">General communication and notification preferences.</p>
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-sm text-amber-700">
              <p className="font-medium">Coming Soon</p>
              <p className="text-xs mt-1">Business hours, auto-reply, notification preferences — coming in next update.</p>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {showForm && (
        <AccountFormModal
          initial={editing}
          onSave={editing ? handleEdit : handleAdd}
          onClose={() => { setShowForm(false); setEditing(undefined); }}
        />
      )}
    </>
  );
}
