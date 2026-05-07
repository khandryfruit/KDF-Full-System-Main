import { useState } from "react";
import {
  Building2, Receipt, ShoppingCart, Package, GitBranch,
  Calculator, HardDrive, Users, ChevronRight, Settings,
} from "lucide-react";

const SETTING_SECTIONS = [
  {
    id: "company",
    label: "Company Settings",
    icon: Building2,
    color: "bg-blue-50 text-blue-600",
    desc: "Company name, logo, address, phone, tax number",
    fields: [
      { label: "Company Name",  placeholder: "KDF NUTS",                type: "text"  },
      { label: "Address",       placeholder: "Lahore, Pakistan",         type: "text"  },
      { label: "Phone",         placeholder: "+92 300 0000000",          type: "tel"   },
      { label: "Tax Number (NTN)", placeholder: "NTN-XXXXXXX",          type: "text"  },
    ],
  },
  {
    id: "invoice",
    label: "Invoice Settings",
    icon: Receipt,
    color: "bg-amber-50 text-amber-600",
    desc: "Thermal print, A4 print, invoice templates, QR/barcode",
    fields: [],
    toggles: [
      { label: "Enable Thermal Print (58mm/80mm)", key: "thermal_print" },
      { label: "Show QR Code on Invoice",          key: "invoice_qr"    },
      { label: "Auto-print after save",            key: "auto_print"    },
      { label: "Show branch logo on invoice",      key: "branch_logo"   },
    ],
  },
  {
    id: "pos",
    label: "POS Settings",
    icon: ShoppingCart,
    color: "bg-emerald-50 text-emerald-600",
    desc: "Barcode scanner, keyboard shortcuts, default payment mode",
    fields: [],
    toggles: [
      { label: "Enable Barcode Scanner",           key: "barcode_scan"  },
      { label: "Enable Keyboard Shortcuts (F1-F12)", key: "kb_shortcuts" },
      { label: "Default Payment: Cash",            key: "default_cash"  },
      { label: "Show stock warning at checkout",   key: "stock_warn"    },
    ],
  },
  {
    id: "stock",
    label: "Stock Settings",
    icon: Package,
    color: "bg-purple-50 text-purple-600",
    desc: "Negative stock, unit conversion, alerts, auto deduction",
    fields: [],
    toggles: [
      { label: "Allow Negative Stock",             key: "neg_stock"     },
      { label: "Auto-deduct stock on invoice",     key: "auto_deduct"   },
      { label: "Low stock alert (below threshold)", key: "low_alert"    },
      { label: "Enable unit conversion (KG→Grams)", key: "unit_conv"   },
    ],
  },
  {
    id: "branch",
    label: "Branch Settings",
    icon: GitBranch,
    color: "bg-indigo-50 text-indigo-600",
    desc: "Branch permissions, POS permissions, invoice permissions",
    fields: [],
    toggles: [
      { label: "Allow branches to create invoices", key: "branch_inv"  },
      { label: "Allow branches to edit invoices",   key: "branch_edit" },
      { label: "Allow branches to apply discounts", key: "branch_disc" },
      { label: "Allow branches to view analytics",  key: "branch_stat" },
    ],
  },
  {
    id: "tax",
    label: "Tax Settings",
    icon: Calculator,
    color: "bg-rose-50 text-rose-600",
    desc: "GST/VAT rate, inclusive or exclusive tax mode",
    fields: [
      { label: "Default Tax Rate (%)", placeholder: "0", type: "number" },
    ],
    toggles: [
      { label: "Tax Inclusive (price already includes tax)", key: "tax_inc" },
      { label: "Show tax breakdown on invoice",              key: "tax_show" },
    ],
  },
  {
    id: "backup",
    label: "Backup Settings",
    icon: HardDrive,
    color: "bg-cyan-50 text-cyan-600",
    desc: "Google Drive sync, auto backup frequency, local storage",
    fields: [],
    toggles: [
      { label: "Enable Auto Backup (daily)",        key: "auto_bk"      },
      { label: "Google Drive Sync",                 key: "gdrive"       },
      { label: "Email backup report daily",         key: "bk_email"     },
    ],
  },
  {
    id: "users",
    label: "User & Staff Settings",
    icon: Users,
    color: "bg-teal-50 text-teal-600",
    desc: "Roles, permissions, access control",
    link: "/branches",
    linkLabel: "Manage in Branches →",
    fields: [],
  },
];

export default function ERPSettingsPage() {
  const [active, setActive] = useState("company");
  const [toggles, setToggles] = useState<Record<string, boolean>>({});
  const [fields, setFields] = useState<Record<string, string>>({});

  const section = SETTING_SECTIONS.find(s => s.id === active)!;

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Settings className="w-6 h-6" /> ERP Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">Configure all system settings from one place</p>
      </div>

      <div className="flex gap-6">
        {/* Left menu */}
        <div className="w-56 shrink-0 space-y-1">
          {SETTING_SECTIONS.map(s => {
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
                <Icon className="w-4 h-4 shrink-0" />
                <span className="flex-1 truncate">{s.label}</span>
                <ChevronRight className="w-3 h-3 shrink-0 opacity-50" />
              </button>
            );
          })}
        </div>

        {/* Right panel */}
        <div className="flex-1 bg-card border border-border rounded-2xl p-6 space-y-5 min-h-[480px]">
          <div className="flex items-center gap-3 pb-4 border-b border-border">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${section.color}`}>
              <section.icon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold">{section.label}</h2>
              <p className="text-xs text-muted-foreground">{section.desc}</p>
            </div>
          </div>

          {/* Text fields */}
          {(section.fields ?? []).map(f => (
            <div key={f.label}>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">{f.label}</label>
              <input
                type={f.type}
                placeholder={f.placeholder}
                value={fields[`${section.id}.${f.label}`] ?? ""}
                onChange={e => setFields(p => ({ ...p, [`${section.id}.${f.label}`]: e.target.value }))}
                className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          ))}

          {/* Toggles */}
          {(section.toggles ?? []).map(t => (
            <label key={t.key} className="flex items-center justify-between gap-4 cursor-pointer">
              <span className="text-sm">{t.label}</span>
              <button
                onClick={() => setToggles(p => ({ ...p, [t.key]: !p[t.key] }))}
                className={`w-10 h-6 rounded-full transition-colors relative shrink-0 ${toggles[t.key] ? "bg-primary" : "bg-muted"}`}
              >
                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${toggles[t.key] ? "left-5" : "left-1"}`} />
              </button>
            </label>
          ))}

          {section.link && (
            <a href={section.link} className="inline-flex items-center gap-1.5 text-sm text-primary font-medium hover:underline mt-2">
              {section.linkLabel}
            </a>
          )}

          {(section.fields?.length ?? 0) > 0 || (section.toggles?.length ?? 0) > 0 ? (
            <div className="pt-4 border-t border-border">
              <button className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors">
                Save Settings
              </button>
              <p className="text-xs text-muted-foreground mt-2">Settings engine connects in Phase 2 — UI is ready.</p>
            </div>
          ) : null}

          {!section.link && (section.fields?.length ?? 0) === 0 && (section.toggles?.length ?? 0) === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <section.icon className="w-10 h-10 text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground text-sm">This section is managed via Branches.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
