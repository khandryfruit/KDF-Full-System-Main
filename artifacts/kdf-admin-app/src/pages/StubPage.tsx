import { useLocation } from "wouter";
import AppShell from "@/components/AppShell";
import { ExternalLink } from "lucide-react";

const PAGE_CONFIG: Record<string, {
  title: string; icon: string; desc: string; adminPath: string; color: string; bg: string;
}> = {
  payments:      { title: "Payments",      icon: "💳", desc: "Invoices, COD tracking & billing",       adminPath: "/",                  color: "text-pink-400",    bg: "bg-pink-500/10"    },
  branches:      { title: "Branches",      icon: "🏪", desc: "Multi-branch management & analytics",    adminPath: "/branches",          color: "text-indigo-400",  bg: "bg-indigo-500/10"  },
  store:         { title: "Store",         icon: "🛒", desc: "Storefront settings & SEO",               adminPath: "/seo",               color: "text-emerald-400", bg: "bg-emerald-500/10" },
  notifications: { title: "Notifications", icon: "🔔", desc: "Push & WhatsApp notification settings",  adminPath: "/notifications",     color: "text-amber-400",   bg: "bg-amber-500/10"   },
  logistics:     { title: "Logistics",     icon: "🚚", desc: "Courier confirmations & tracking",        adminPath: "/logistics/confirmations", color: "text-orange-400", bg: "bg-orange-500/10" },
};

export default function StubPage({ slug }: { slug: string }) {
  const cfg = PAGE_CONFIG[slug];
  const [, navigate] = useLocation();

  if (!cfg) {
    return (
      <AppShell title="Not Found">
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
          <p className="text-4xl mb-4">🔍</p>
          <p className="text-sm text-muted-foreground">Page not found</p>
          <button onClick={() => navigate("/")} className="mt-4 text-primary text-sm underline">Go Home</button>
        </div>
      </AppShell>
    );
  }

  const adminUrl = `${window.location.origin}${cfg.adminPath}`;

  return (
    <AppShell title={cfg.title}>
      <div className="p-6 flex flex-col items-center justify-center min-h-[60vh] text-center gap-6">
        {/* Icon */}
        <div className={`w-20 h-20 rounded-3xl flex items-center justify-center text-4xl ${cfg.bg}`}>
          {cfg.icon}
        </div>

        {/* Title */}
        <div>
          <h2 className={`text-2xl font-bold ${cfg.color}`}>{cfg.title}</h2>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-xs">{cfg.desc}</p>
        </div>

        {/* Info card */}
        <div className="w-full max-w-xs bg-card border border-border rounded-2xl p-4 text-left space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Available in Admin Panel</p>
          <p className="text-sm text-foreground leading-relaxed">
            This module is fully available in the desktop Admin Panel with complete features including reports, bulk actions, and detailed management.
          </p>
          <a
            href={adminUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center justify-center gap-2 w-full h-11 rounded-xl ${cfg.bg} border border-current/20 ${cfg.color} text-sm font-semibold`}
          >
            <ExternalLink className="w-4 h-4" />
            Open {cfg.title} in Admin Panel
          </a>
        </div>

        <button onClick={() => navigate("/")} className="text-xs text-muted-foreground underline">
          Back to Dashboard
        </button>
      </div>
    </AppShell>
  );
}
