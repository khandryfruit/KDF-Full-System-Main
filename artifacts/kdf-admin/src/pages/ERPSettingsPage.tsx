import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  Building2, Receipt, ShoppingCart, Package, GitBranch,
  Calculator, HardDrive, Users, ChevronRight, Settings,
  Smartphone, Save, Loader2, CheckCircle, RefreshCw,
} from "lucide-react";

/* ── Section definitions ── */
interface SettingField {
  key: string;
  label: string;
  type: "text" | "number" | "tel" | "email" | "url" | "select" | "textarea";
  placeholder?: string;
  options?: { value: string; label: string }[];
}
interface SettingToggle {
  key: string;
  label: string;
  desc?: string;
}
interface Section {
  id: string;
  label: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  desc: string;
  fields?: SettingField[];
  toggles?: SettingToggle[];
  link?: string;
  linkLabel?: string;
}

const SECTIONS: Section[] = [
  {
    id: "company", label: "Company Settings", icon: Building2,
    color: "text-blue-600", bgColor: "bg-blue-50",
    desc: "Company name, logo, address, contact details, NTN/GST",
    fields: [
      { key: "companyName",   label: "Company Name",       type: "text",   placeholder: "KDF NUTS"              },
      { key: "address",       label: "Address",            type: "textarea",placeholder: "Lahore, Pakistan"     },
      { key: "phone",         label: "Phone",              type: "tel",    placeholder: "+92 300 0000000"        },
      { key: "whatsapp",      label: "WhatsApp",           type: "tel",    placeholder: "+92 300 0000000"        },
      { key: "email",         label: "Email",              type: "email",  placeholder: "info@kdfnuts.com"       },
      { key: "ntn",           label: "NTN Number",         type: "text",   placeholder: "NTN-XXXXXXX"            },
      { key: "gst",           label: "GST Number",         type: "text",   placeholder: "GST-XXXXXXX"            },
      { key: "currency",      label: "Currency",           type: "select",
        options: [{ value: "PKR", label: "PKR — Pakistani Rupee" }, { value: "USD", label: "USD — US Dollar" }] },
    ],
  },
  {
    id: "invoice", label: "Invoice Settings", icon: Receipt,
    color: "text-amber-600", bgColor: "bg-amber-50",
    desc: "Thermal print, A4 print, invoice templates, numbering, QR/barcode",
    fields: [
      { key: "prefix",       label: "Invoice Prefix",     type: "text",   placeholder: "INV"                    },
      { key: "startNumber",  label: "Start Number",       type: "number", placeholder: "1"                      },
      { key: "taxRate",      label: "Default Tax Rate (%)",type: "number",placeholder: "0"                      },
      { key: "thermalSize",  label: "Thermal Size",       type: "select",
        options: [{ value: "58mm", label: "58mm (small)" }, { value: "80mm", label: "80mm (standard)" }]       },
      { key: "discountType", label: "Discount Type",      type: "select",
        options: [{ value: "percent", label: "Percentage (%)" }, { value: "fixed", label: "Fixed Amount (Rs)" }]},
    ],
    toggles: [
      { key: "thermalPrint",      label: "Enable Thermal Print (58mm/80mm)",  desc: "Print on thermal receipt printer" },
      { key: "a4Print",           label: "Enable A4 Invoice Print",           desc: "Full A4 invoice layout"           },
      { key: "showQr",            label: "Show QR Code on Invoice",           desc: "QR code for order verification"  },
      { key: "autoprint",         label: "Auto-print after saving invoice",   desc: "Automatically print when saved"  },
      { key: "showLogo",          label: "Show company logo on invoice",      desc: "Print logo header"               },
      { key: "taxInclusive",      label: "Tax Inclusive pricing",             desc: "Price already includes tax"      },
      { key: "showTaxBreakdown",  label: "Show tax breakdown on invoice",     desc: "Separate tax line on invoice"    },
    ],
  },
  {
    id: "branch", label: "Branch Settings", icon: GitBranch,
    color: "text-indigo-600", bgColor: "bg-indigo-50",
    desc: "Branch permissions, invoice access, analytics, inventory settings",
    toggles: [
      { key: "allowCreateInvoice",  label: "Allow branches to create invoices",   desc: "Branch staff can create new invoices"         },
      { key: "allowEditInvoice",    label: "Allow branches to edit invoices",     desc: "Branch staff can edit existing invoices"      },
      { key: "allowDeleteInvoice",  label: "Allow branches to delete invoices",   desc: "Branch staff can delete invoices"             },
      { key: "allowDiscount",       label: "Allow branches to apply discounts",   desc: "Branch staff can give item/bill discounts"    },
      { key: "allowViewAnalytics",  label: "Allow branches to view analytics",    desc: "Branch staff can see sales stats"             },
      { key: "allowInventoryAccess",label: "Allow branches to access inventory",  desc: "Branch staff can view/manage stock"           },
      { key: "allowPosAccess",      label: "Allow branches to use POS",           desc: "Branch staff can use the POS interface"       },
    ],
  },
  {
    id: "pos", label: "POS Settings", icon: ShoppingCart,
    color: "text-emerald-600", bgColor: "bg-emerald-50",
    desc: "Barcode scanner, keyboard shortcuts, payment method, hold invoice",
    fields: [
      { key: "defaultPayment", label: "Default Payment Method", type: "select",
        options: [{ value: "cash", label: "Cash" }, { value: "card", label: "Card" }, { value: "credit", label: "Credit" }] },
    ],
    toggles: [
      { key: "barcodeScanner",   label: "Enable Barcode Scanner",           desc: "USB/Bluetooth barcode scanner support"   },
      { key: "keyboardShortcuts",label: "Enable Keyboard Shortcuts (F-keys)",desc: "F2-F12 shortcuts in POS interface"      },
      { key: "autoPrint",        label: "Auto-print bill after checkout",   desc: "Automatically print after sale"         },
      { key: "holdInvoice",      label: "Enable Hold Invoice feature",      desc: "Park invoices and come back later"      },
      { key: "touchMode",        label: "Enable Touch Mode",                desc: "Optimized for touchscreen displays"     },
      { key: "showStockWarning", label: "Show stock warning at checkout",   desc: "Alert if item is low/out of stock"      },
    ],
  },
  {
    id: "stock", label: "Stock / Inventory Settings", icon: Package,
    color: "text-purple-600", bgColor: "bg-purple-50",
    desc: "KG/gram conversion, negative stock, alerts, auto deduction",
    fields: [
      { key: "lowStockThreshold", label: "Low Stock Threshold (KG/Pcs)", type: "number", placeholder: "1" },
    ],
    toggles: [
      { key: "kgGramConversion", label: "Enable KG/Gram unit conversion",   desc: "Allow selling in both KG and grams"       },
      { key: "negativeStock",    label: "Allow negative stock levels",      desc: "Sell even when stock is zero"             },
      { key: "lowStockAlert",    label: "Low stock alert notification",     desc: "Alert when stock drops below threshold"   },
      { key: "autoDeduct",       label: "Auto-deduct stock on invoice",     desc: "Stock reduces automatically on each sale" },
      { key: "warehouseMode",    label: "Enable warehouse management",      desc: "Multi-location stock tracking"            },
    ],
  },
  {
    id: "staff", label: "Staff & Permissions", icon: Users,
    color: "text-teal-600", bgColor: "bg-teal-50",
    desc: "Roles, access control, activity logs, session management",
    fields: [
      { key: "sessionTimeout", label: "Session Timeout (minutes)", type: "number", placeholder: "480" },
      { key: "defaultRole", label: "Default Staff Role", type: "select",
        options: [
          { value: "cashier",  label: "Cashier"  },
          { value: "sales",    label: "Sales"    },
          { value: "operator", label: "Operator" },
        ]},
      { key: "passwordPolicy", label: "Password Policy", type: "select",
        options: [{ value: "simple", label: "Simple (min 6 chars)" }, { value: "strong", label: "Strong (8+ chars, mixed)" }] },
    ],
    toggles: [
      { key: "activityLogs", label: "Enable activity logging",    desc: "Track all staff actions with audit trail" },
    ],
    link: "/branches", linkLabel: "Manage Branch Staff & Permissions →",
  },
  {
    id: "backup", label: "Backup & Sync", icon: HardDrive,
    color: "text-cyan-600", bgColor: "bg-cyan-50",
    desc: "Auto backup, Google Drive sync, import/export",
    fields: [
      { key: "backupTime",   label: "Auto Backup Time", type: "text", placeholder: "02:00" },
      { key: "exportFormat", label: "Export Format", type: "select",
        options: [{ value: "json", label: "JSON" }, { value: "csv", label: "CSV" }, { value: "excel", label: "Excel" }] },
    ],
    toggles: [
      { key: "autoDailyBackup", label: "Enable daily auto backup",  desc: "Automatic backup at specified time"        },
      { key: "googleDrive",     label: "Google Drive sync backup",  desc: "Backup to connected Google Drive account" },
      { key: "emailBackup",     label: "Email backup report daily", desc: "Send backup summary via email"            },
    ],
  },
  {
    id: "mobile", label: "Mobile / POS App Settings", icon: Smartphone,
    color: "text-rose-600", bgColor: "bg-rose-50",
    desc: "Mobile responsive controls, bottom navigation, touch mode",
    toggles: [
      { key: "bottomNavigation",   label: "Enable bottom navigation bar",    desc: "Fixed nav bar at bottom on mobile"        },
      { key: "touchMode",          label: "Enable touch-optimized mode",     desc: "Large tap targets for touch screens"      },
      { key: "responsiveControls", label: "Responsive controls on mobile",   desc: "Adaptive UI for small screens"            },
      { key: "mobilePermissions",  label: "Enforce permissions on mobile",   desc: "Apply same permissions on mobile app"     },
      { key: "gestureNavigation",  label: "Enable gesture navigation",       desc: "Swipe gestures for navigation"            },
    ],
  },
];

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${on ? "bg-primary" : "bg-muted"}`}
      type="button"
    >
      <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${on ? "left-6" : "left-1"}`} />
    </button>
  );
}

export default function ERPSettingsPage() {
  const { toast } = useToast();
  const [active, setActive]     = useState("company");
  const [allSettings, setAll]   = useState<Record<string, Record<string, any>>>({});
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);

  const section = SECTIONS.find(s => s.id === active)!;
  const settings = allSettings[active] ?? {};

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("kdf_admin_token");
      const res = await fetch("/api/admin/erp-settings", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setAll(await res.json());
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  function patchSetting(key: string, value: any) {
    setAll(prev => ({
      ...prev,
      [active]: { ...(prev[active] ?? {}), [key]: value },
    }));
  }

  async function save() {
    setSaving(true);
    try {
      const token = localStorage.getItem("kdf_admin_token");
      const res = await fetch(`/api/admin/erp-settings/${active}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setAll(prev => ({ ...prev, [active]: data.settings }));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      toast({ title: "Settings saved", description: `${section.label} updated successfully.` });
    } catch {
      toast({ title: "Save failed", description: "Could not save settings.", variant: "destructive" });
    }
    setSaving(false);
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Settings className="w-6 h-6" /> ERP Settings
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Database-driven settings — changes apply to all branches and POS instantly
          </p>
        </div>
        <button onClick={loadAll} className="p-2 rounded-lg hover:bg-muted transition-colors">
          <RefreshCw className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="flex gap-5">
          {/* Left menu */}
          <div className="w-56 shrink-0 space-y-1">
            {SECTIONS.map(s => {
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  onClick={() => setActive(s.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-sm transition-all ${
                    active === s.id
                      ? "bg-primary text-primary-foreground font-medium shadow-sm"
                      : "hover:bg-accent text-foreground"
                  }`}
                >
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                    active === s.id ? "bg-primary-foreground/20" : s.bgColor
                  }`}>
                    <Icon className={`w-3.5 h-3.5 ${active === s.id ? "text-primary-foreground" : s.color}`} />
                  </div>
                  <span className="flex-1 truncate">{s.label}</span>
                  <ChevronRight className="w-3 h-3 shrink-0 opacity-50" />
                </button>
              );
            })}
          </div>

          {/* Right panel */}
          <div className="flex-1 bg-card border border-border rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-3 p-5 border-b border-border">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${section.bgColor}`}>
                <section.icon className={`w-5 h-5 ${section.color}`} />
              </div>
              <div>
                <h2 className="font-bold">{section.label}</h2>
                <p className="text-xs text-muted-foreground">{section.desc}</p>
              </div>
              <div className="ml-auto">
                {saved && (
                  <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                    <CheckCircle className="w-3.5 h-3.5" /> Saved
                  </span>
                )}
              </div>
            </div>

            {/* Body */}
            <div className="p-6 space-y-5 min-h-[480px]">
              {/* Text/Select fields */}
              {(section.fields ?? []).map(f => (
                <div key={f.key}>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">
                    {f.label}
                  </label>
                  {f.type === "textarea" ? (
                    <textarea
                      rows={2}
                      placeholder={f.placeholder}
                      value={settings[f.key] ?? ""}
                      onChange={e => patchSetting(f.key, e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                    />
                  ) : f.type === "select" ? (
                    <select
                      value={settings[f.key] ?? ""}
                      onChange={e => patchSetting(f.key, e.target.value)}
                      className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      {(f.options ?? []).map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={f.type}
                      placeholder={f.placeholder}
                      value={settings[f.key] ?? ""}
                      onChange={e => patchSetting(f.key, f.type === "number" ? parseFloat(e.target.value) || 0 : e.target.value)}
                      className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  )}
                </div>
              ))}

              {/* Toggles */}
              {(section.fields ?? []).length > 0 && (section.toggles ?? []).length > 0 && (
                <div className="h-px bg-border" />
              )}
              {(section.toggles ?? []).map(t => (
                <label key={t.key} className="flex items-center justify-between gap-4 cursor-pointer py-0.5">
                  <div>
                    <p className="text-sm font-medium">{t.label}</p>
                    {t.desc && <p className="text-xs text-muted-foreground mt-0.5">{t.desc}</p>}
                  </div>
                  <Toggle on={!!settings[t.key]} onToggle={() => patchSetting(t.key, !settings[t.key])} />
                </label>
              ))}

              {section.link && (
                <a href={section.link}
                  className="inline-flex items-center gap-1.5 text-sm text-primary font-medium hover:underline">
                  {section.linkLabel}
                </a>
              )}

              {/* Save button */}
              {((section.fields?.length ?? 0) > 0 || (section.toggles?.length ?? 0) > 0) && (
                <div className="pt-4 border-t border-border flex items-center gap-3">
                  <button
                    onClick={save}
                    disabled={saving}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {saving ? "Saving…" : "Save Settings"}
                  </button>
                  <p className="text-xs text-muted-foreground">
                    Saved to database — applies to all branches & POS instantly
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
