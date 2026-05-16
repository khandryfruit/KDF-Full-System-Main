import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Package,
  Tags,
  ShoppingCart,
  Users,
  Image as ImageIcon,
  Ticket,
  Wallet,
  Award,
  Bell,
  LogOut,
  Menu,
  FileUp,
  Plug,
  RefreshCw,
  Truck,
  CreditCard,
  MapPin,
  Camera,
  MessageCircle,
  Paintbrush,
  Search,
  BookOpen,
  ShoppingBag,
  BarChart2,
  User,
  Megaphone,
  LayoutTemplate,
  Sparkles,
  AlertTriangle,
  Star,
  Zap,
  Mail,
  Globe,
  Home,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Gavel,
  Store,
  Brain,
  Receipt,
  Landmark,
  Activity,
  Key,
  FileText,
  X,
  PanelLeftOpen,
  PanelLeftClose,
  Building2,
  RotateCcw,
  History,
  ClipboardList,
  UserCheck,
  PieChart,
  Boxes,
  TrendingDown,
  SlidersHorizontal,
  ArrowRightLeft,
  Settings,
  Building,
  Smartphone,
  Video,
  HardDrive,
  GitBranch,
  Calculator,
  DollarSign,
  Wifi,
  MessageSquareDashed,
  ShieldCheck,
  UserCog,
  ListChecks,
  Crown,
  Database,
  Factory,
  BarChart3,
  BadgeCheck,
  Circle,
  Clock3,
  Pin,
} from "lucide-react";
import { useState, useEffect, useRef, type ElementType } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { NotificationBell } from "./NotificationBell";
import { ThemeToggle } from "./ThemeToggle";
import { AdminCommandPalette, openAdminCommandPalette } from "./AdminCommandPalette";
import { useNotifications } from "@/context/NotificationContext";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { NavNewBadge } from "@/components/admin/NavNewBadge";

/** Sidebar leaf — add `isNew` / `badgeColor` / `notifyDot` when shipping new modules. */
export interface SidebarNavLeaf {
  href: string;
  label: string;
  icon: ElementType;
  isNew?: boolean;
  badgeColor?: string;
  notifyDot?: boolean;
}

export type SidebarNavBlockEntry = SidebarNavLeaf | { divider: true; label: string };

/* ═══════════════════════════════════════════════
   NAV DATA
═══════════════════════════════════════════════ */
const INVOICE_NAV_ITEMS = [
  { href: "/pos",                        label: "🖥 Admin POS",        icon: Zap            },
  { href: "/invoice",                    label: "Create Invoice",     icon: Receipt        },
  { href: "/invoice/history",            label: "All Invoices",       icon: History        },
  { href: "/invoice/purchase",           label: "Purchase Bill",      icon: ClipboardList  },
  { href: "/invoice/purchase/history",   label: "Purchase History",   icon: FileText       },
  { href: "/branch-pos",                 label: "Branch POS",         icon: Store          },
  { href: "/branches",                   label: "Branches",           icon: Building2      },
  { href: "/customers",                  label: "Customers",          icon: UserCheck      },
  { href: "/analytics",                  label: "Analytics",          icon: PieChart       },
  { divider: true,                       label: "ERP & Accounting"                         },
  { href: "/erp/suppliers",              label: "Suppliers",          icon: Factory        },
  { href: "/erp/purchases",              label: "Smart Purchase",     icon: ClipboardList  },
  { href: "/erp/transfers",              label: "Branch Transfers",   icon: ArrowRightLeft },
  { href: "/erp/reports",                label: "ERP Reports",        icon: BarChart3      },
  { divider: true,                       label: "Stock"                                    },
  { href: "/stock/overview",             label: "Stock Overview",     icon: Boxes          },
  { href: "/stock/products",             label: "Products",           icon: Package        },
  { href: "/stock/movement",             label: "Stock Movement",     icon: ArrowRightLeft },
  { href: "/stock/adjustment",           label: "Adjustment",         icon: SlidersHorizontal },
  { divider: true,                       label: "ERP Settings"                             },
  { href: "/erp-settings/company",       label: "Company",            icon: Building       },
  { href: "/erp-settings/invoice",       label: "Invoice",            icon: Receipt        },
  { href: "/erp-settings/pos",           label: "POS",                icon: ShoppingCart   },
  { href: "/erp-settings/stock",         label: "Stock / Inventory",  icon: Package        },
  { href: "/erp-settings/staff",         label: "Staff & Perms",      icon: Users          },
  { href: "/erp-settings/backup",        label: "Backup & Sync",      icon: HardDrive      },
  { href: "/erp-settings/mobile",        label: "Mobile / App",       icon: Smartphone     },
] as const satisfies ({ href: string; label: string; icon: React.ElementType; divider?: false } | { divider: true; label: string })[];

const COMMERCE_NAV: SidebarNavLeaf[] = [
  { href: "/orders",     label: "Orders",        icon: ShoppingCart },
  { href: "/products",   label: "Products",      icon: Package      },
  { href: "/categories", label: "Categories",    icon: Tags         },
  { href: "/customers",  label: "Customers",     icon: Users        },
  { href: "/reviews",    label: "Reviews",       icon: Star         },
  { href: "/analytics",  label: "Analytics",     icon: BarChart2    },
];

const STORE_NAV: SidebarNavLeaf[] = [
  { href: "/media",         label: "Media Library",  icon: ImageIcon   },
  { href: "/banners",       label: "Image Banners",  icon: ImageIcon   },
  { href: "/video-banners", label: "Video Banners",  icon: Video,       isNew: true, badgeColor: "#8b5cf6" },
  { href: "/mobile-reels",  label: "Mobile Reels",   icon: Smartphone, isNew: true, badgeColor: "#06b6d4" },
  { href: "/coupons",       label: "Coupons",        icon: Ticket      },
  { href: "/wallet",        label: "Wallet",         icon: Wallet      },
  { href: "/loyalty",       label: "Loyalty",        icon: Award       },
  { href: "/announcements", label: "Announcements",  icon: Megaphone   },
];

const MARKETING_NAV: SidebarNavLeaf[] = [
  { href: "/abandoned-checkouts", label: "Abandoned Carts",    icon: ShoppingBag },
  { href: "/ai-content",          label: "AI Content",         icon: Sparkles    },
  { href: "/blog",                label: "Blog / Posts",       icon: BookOpen    },
  { href: "/adsense",             label: "Blog Ads",           icon: DollarSign  },
  { href: "/social-ai",           label: "Social AI",          icon: Sparkles    },
  { href: "/bidding",             label: "Auctions / Bidding", icon: Gavel       },
  { href: "/restock",             label: "Restock Alerts",     icon: Bell        },
  { href: "/seo/dashboard",       label: "SEO Command Center", icon: TrendingDown },
  { href: "/seo",                 label: "SEO Settings",       icon: Search      },
  { href: "/seo/fast-indexing",   label: "Fast Indexing",      icon: Zap         },
  { href: "/seo/merchant-center", label: "Google Merchant",    icon: ShoppingBag },
  { href: "/seo/redirects",       label: "301 Redirects",      icon: ArrowRightLeft },
  { href: "/seo/schema",          label: "Schema.org",         icon: Database    },
  { href: "/seo/ai-writer",       label: "AI SEO Writer",      icon: Sparkles    },
];

const OPERATIONS_NAV: SidebarNavLeaf[] = [
  { href: "/couriers",           label: "Couriers",          icon: Truck          },
  { href: "/shipping-rules",     label: "Shipping Rules",    icon: Truck          },
  { href: "/same-day-delivery",  label: "Same Day Delivery", icon: Zap            },
  { href: "/payments",           label: "Payments",          icon: CreditCard     },
  { href: "/import-export",      label: "Import / Export",   icon: FileUp         },
  { href: "/failed-orders",      label: "Failed Orders",     icon: AlertTriangle  },
  { href: "/notifications",      label: "Notifications",     icon: Bell           },
  { href: "/sync-jobs",          label: "Sync Jobs",         icon: RefreshCw      },
];

const SETTINGS_NAV: SidebarNavLeaf[] = [
  { href: "/integrations",       label: "Integrations",      icon: Plug           },
  { href: "/location",           label: "Location",          icon: MapPin         },
  { href: "/cities",             label: "Cities",            icon: MapPin         },
  { href: "/website-settings",   label: "Website Settings",  icon: Paintbrush     },
  { href: "/header-builder",     label: "Header Builder",    icon: LayoutTemplate },
  { href: "/footer",             label: "Footer",            icon: LayoutTemplate },
  { href: "/image-optimization", label: "Image Optimize",    icon: Zap            },
  { href: "/email-settings",     label: "Email Settings",    icon: Mail           },
  { href: "/intelligence",       label: "Intelligence",      icon: Brain          },
  { href: "/profile",            label: "My Profile",        icon: User           },
];

const WA_CHAT_NAV_ITEMS = [
  { href: "/wa-chat",              label: "Unified Inbox",      icon: Wifi           },
  { href: "/wa-inbox",             label: "WhatsApp",           icon: MessageCircle  },
  { href: "/chat-conversations",   label: "Website Chat",       icon: Globe          },
  { href: "/chat-leads",           label: "Chat Leads CRM",     icon: Users          },
  { divider: true,                 label: "Tools"                                    },
  { href: "/shopify/campaigns",    label: "WA Campaigns",       icon: Megaphone      },
  { href: "/shopify/widget",       label: "Chat Widget",        icon: MessageSquareDashed },
  { href: "/whatsapp",             label: "WA Settings",        icon: Settings       },
  { href: "/wa-chat/settings",     label: "Payment Links",      icon: CreditCard     },
] as const satisfies ({ href: string; label: string; icon: React.ElementType; divider?: false } | { divider: true; label: string })[];

const PG_NAV_ITEMS: SidebarNavLeaf[] = [
  { href: "/payment-gateway",              label: "Overview",      icon: LayoutDashboard },
  { href: "/payment-gateway/transactions", label: "Transactions",  icon: Activity        },
  { href: "/payment-gateway/merchants",    label: "Merchant APIs", icon: Key             },
  { href: "/payment-gateway/disputes",     label: "Disputes",      icon: AlertTriangle   },
];

const SHOPIFY_NAV_ITEMS: SidebarNavLeaf[] = [
  { href: "/shopify",                  label: "Dashboard",        icon: LayoutDashboard },
  { href: "/shopify/orders",           label: "Orders",           icon: ShoppingCart    },
  { href: "/shopify/customers",        label: "Customers",        icon: Users           },
  { href: "/shopify/products",         label: "Products",         icon: Package         },
  { href: "/shopify/wa-inbox",         label: "WA Inbox",         icon: MessageCircle   },
  { href: "/shopify/marketing",        label: "Marketing Hub",    icon: Zap,             isNew: true, badgeColor: "#96BF48" },
  { href: "/shopify/campaigns",        label: "WA Campaigns",     icon: Megaphone       },
  { href: "/shopify/email-campaigns",  label: "Email Campaigns",  icon: Mail            },
  { href: "/shopify/widget",           label: "Chat Widget",      icon: MessageCircle   },
  { href: "/whatsapp?tab=templates",   label: "WA Templates",     icon: FileText        },
];

const BRANCHES_NAV_ITEMS: SidebarNavLeaf[] = [
  { href: "/branches",      label: "Dashboard",       icon: BarChart2   },
  { href: "/branches/list", label: "All Branches",    icon: Building2   },
];

const ADMIN_IAM_NAV_ITEMS: SidebarNavLeaf[] = [
  { href: "/admin/control-center",           label: "Control Center",  icon: Crown,          isNew: true, badgeColor: "#6366f1" },
  { href: "/admin/control-center?tab=users", label: "Admin Users",     icon: UserCog        },
  { href: "/admin/control-center?tab=roles", label: "Roles & Perms",   icon: ShieldCheck    },
  { href: "/admin/control-center?tab=audit", label: "Audit Logs",      icon: ListChecks     },
  { href: "/admin/control-center?tab=modules", label: "Module Controls", icon: SlidersHorizontal },
];

const LOGISTICS_NAV_ITEMS = [
  { href: "/couriers",                 label: "Courier Settings",  icon: Truck           },
  { href: "/logistics/live-map",       label: "🗺 Live Rider Map",   icon: MapPin          },
  { href: "/logistics/delivery-proofs", label: "Delivery proofs",   icon: Camera          },
  { href: "/logistics/lahore",         label: "Lahore Deliveries", icon: MapPin          },
  { href: "/logistics/riders",         label: "Riders & Accounting", icon: Users         },
  { href: "/logistics/confirmations",  label: "WA Confirmations",  icon: MessageCircle   },
  { href: "/logistics/automation",     label: "Automation",        icon: Zap             },
  { href: "/logistics/order-automation", label: "Order Automation", icon: Activity        },
];

const STORE_URL = "https://khanbabadryfruits.com";
const IS_DEV    = import.meta.env.DEV;

const WEBSITE_LINKS = [
  { label: "View Store Home", path: STORE_URL,                      icon: Home    },
  { label: "View Products",   path: `${STORE_URL}/products`,        icon: Package },
  { label: "View Categories", path: `${STORE_URL}/categories`,      icon: Tags    },
  ...(IS_DEV ? [{ label: "Preview (Local)", path: "/",              icon: Globe   }] : []),
];

const RECENT_NAV_ITEMS: SidebarNavLeaf[] = [
  { href: "/shopify/orders",     label: "Shopify Orders",    icon: ShoppingBag },
  { href: "/logistics/lahore",   label: "Lahore Deliveries", icon: Truck       },
  { href: "/seo/ai-writer",      label: "AI SEO Writer",     icon: Sparkles    },
];

function MiniSectionLabel({
  icon: Icon,
  label,
  expanded,
}: {
  icon: ElementType;
  label: string;
  expanded: boolean;
}) {
  if (!expanded) {
    return (
      <div className="my-3 flex justify-center" aria-hidden>
        <div className="h-px w-7 bg-gradient-to-r from-transparent via-sidebar-border to-transparent" />
      </div>
    );
  }

  return (
    <div className="px-3 pb-1.5 pt-3">
      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground/55">
        <Icon className="h-3.5 w-3.5" strokeWidth={2.2} />
        <span>{label}</span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   WEBSITE PREVIEW BUTTON
═══════════════════════════════════════════════ */
function WebsitePreviewButton() {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 h-8 text-xs font-medium border-border"
        onClick={() => setOpen(o => !o)}
      >
        <Globe className="w-3.5 h-3.5" />
        View Website
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1.5 z-20 bg-card border border-border rounded-lg shadow-lg py-1 min-w-[180px]">
            {WEBSITE_LINKS.map(({ label, path, icon: Icon }) => (
              <button
                key={path}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent transition-colors text-left"
                onClick={() => { window.open(path, "_blank"); setOpen(false); }}
              >
                <Icon className="w-4 h-4 text-muted-foreground" />
                {label}
                <ExternalLink className="w-3 h-3 ml-auto text-muted-foreground" />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   SIDEBAR NAV ITEM
═══════════════════════════════════════════════ */
interface NavItemProps {
  href: string;
  label: string;
  icon: ElementType;
  isActive: boolean;
  expanded: boolean;
  onClick?: () => void;
}
function NavItem({ href, label, icon: Icon, isActive, expanded, onClick }: NavItemProps) {
  return (
    <Link href={href} onClick={onClick} className="block">
      <motion.div
        layout
        title={!expanded ? label : undefined}
        whileHover={{ scale: expanded ? 1.012 : 1.06, x: expanded ? 2 : 0 }}
        whileTap={{ scale: 0.97 }}
        transition={{ type: "spring", stiffness: 420, damping: 28 }}
        className={`
          relative flex items-center rounded-2xl transition-all duration-200 cursor-pointer group overflow-hidden
          ${expanded ? "min-h-[48px] gap-3.5 px-3.5 py-3" : "justify-center mx-auto w-12 h-12"}
          ${isActive
            ? "text-primary bg-gradient-to-r from-primary/[0.20] via-primary/[0.12] to-sky-500/[0.04] shadow-[0_0_0_1px_hsl(var(--primary)/0.38),inset_0_1px_0_0_rgba(255,255,255,0.12),0_16px_42px_-18px_hsl(var(--primary)/0.75)]"
            : "text-muted-foreground hover:text-foreground hover:bg-white/[0.055] dark:hover:bg-white/[0.075] hover:shadow-[0_10px_30px_-22px_hsl(var(--primary)/0.45)]"
          }
        `}
      >
        {isActive && (
          <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-gradient-to-b from-primary via-sky-400 to-primary/40 shadow-[0_0_18px_hsl(var(--primary))]" />
        )}
        <span
          className={`
            flex shrink-0 items-center justify-center rounded-xl transition-all duration-200
            ${expanded ? "h-10 w-10" : "h-9 w-9"}
            ${isActive
              ? "bg-white/80 text-primary shadow-[0_0_24px_-7px_hsl(var(--primary)/0.85)] dark:bg-primary/20"
              : "bg-muted/45 text-muted-foreground ring-1 ring-border/30 group-hover:bg-primary/12 group-hover:text-primary group-hover:ring-primary/20"
            }
          `}
        >
          <Icon strokeWidth={2.15} className={expanded ? "h-5 w-5" : "h-[1.05rem] w-[1.05rem]"} />
        </span>
        <span
          className={`text-[14px] font-bold tracking-tight whitespace-nowrap overflow-hidden transition-all duration-300 ${
            expanded ? "opacity-100 max-w-[200px] w-auto" : "opacity-0 max-w-0 w-0"
          }`}
        >
          {label}
        </span>
      </motion.div>
    </Link>
  );
}

/* ═══════════════════════════════════════════════
   SIDEBAR SECTION (collapsible group)
═══════════════════════════════════════════════ */
interface SidebarSectionProps {
  label: string;
  icon: ElementType;
  accentColor: string;
  activeBg: string;
  activeText: string;
  badgeLetter: string;
  isActive: boolean;
  expanded: boolean;
  open: boolean;
  onToggle: () => void;
  items: readonly SidebarNavBlockEntry[];
  location: string;
  onNavClick?: () => void;
}
function SidebarSection({
  label, icon: Icon, accentColor,
  isActive, expanded, open, onToggle, items, location, onNavClick,
}: SidebarSectionProps) {
  return (
    <div>
      {/* Section header trigger */}
      <motion.button
        type="button"
        layout
        onClick={onToggle}
        title={!expanded ? label : undefined}
        whileHover={{ scale: expanded ? 1.012 : 1.06, x: expanded ? 2 : 0 }}
        whileTap={{ scale: 0.97 }}
        transition={{ type: "spring", stiffness: 400, damping: 26 }}
        className={`
          relative w-full flex items-center rounded-2xl transition-all duration-200 group overflow-hidden
          ${expanded ? "min-h-[50px] gap-3.5 px-3.5 py-3" : "justify-center mx-auto w-12 h-12"}
          ${isActive
            ? "text-foreground bg-gradient-to-r from-white/[0.08] via-white/[0.055] to-white/[0.02] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08),0_14px_38px_-28px_currentColor]"
            : "text-muted-foreground hover:text-foreground hover:bg-white/[0.055] dark:hover:bg-white/[0.075]"
          }
        `}
      >
        {isActive && (
          <span
            className="absolute left-0 top-2.5 bottom-2.5 w-1 rounded-r-full shadow-[0_0_16px_currentColor]"
            style={{ backgroundColor: accentColor, color: accentColor }}
          />
        )}
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all duration-200 ring-1 ${
            isActive ? "ring-white/15 shadow-[0_0_24px_-7px_currentColor]" : "ring-border/30 group-hover:bg-muted/55 group-hover:ring-primary/20"
          }`}
          style={isActive ? { backgroundColor: `${accentColor}22`, color: accentColor } : {}}
        >
          <Icon strokeWidth={2.15} className="h-5 w-5 shrink-0" style={isActive ? { color: accentColor } : undefined} />
        </div>

        <span className={`flex-1 text-left text-[14px] font-bold tracking-tight whitespace-nowrap overflow-hidden transition-all duration-300 ${expanded ? "opacity-100 max-w-[150px]" : "opacity-0 max-w-0"}`}>
          {label}
        </span>

        <motion.span
          animate={{ rotate: open ? 90 : 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className={`shrink-0 text-muted-foreground/50 ${expanded ? "opacity-100" : "opacity-0 w-0"}`}
        >
          <ChevronRight strokeWidth={2} className="h-3.5 w-3.5" />
        </motion.span>
      </motion.button>

      {/* Sub-items panel */}
      <motion.div
        initial={false}
        animate={{ height: open && expanded ? "auto" : 0, opacity: open && expanded ? 1 : 0 }}
        transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
        className="overflow-hidden"
      >
        <div className="ml-[14px] mt-1.5 border-l pl-3.5 space-y-1" style={{ borderColor: `${accentColor}35` }}>
          {items.map((item, idx) => {
            if ("divider" in item && item.divider) {
              return (
                <div key={`divider-${idx}`} className="px-2 pt-3 pb-1">
                  <span className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground/45">
                    {item.label}
                  </span>
                </div>
              );
            }
            const leaf = item as SidebarNavLeaf;
            const SubIcon = leaf.icon;
            const rawPath = leaf.href.split("?")[0];
            const locPath = location.split("?")[0];
            const subActive = locPath === rawPath || locPath.startsWith(`${rawPath}/`);
            return (
              <Link key={leaf.href} href={leaf.href} onClick={onNavClick} className="block">
                <motion.div
                  whileHover={{ x: 3, scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ type: "spring", stiffness: 380, damping: 28 }}
                  className={`relative flex min-h-[40px] items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] transition-all ${
                    subActive
                      ? "font-bold shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08),0_12px_28px_-24px_currentColor]"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/[0.055] dark:hover:bg-white/[0.075]"
                  }`}
                  style={subActive ? { color: accentColor, backgroundColor: `${accentColor}14` } : {}}
                >
                  {subActive && (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r-full" style={{ backgroundColor: accentColor }} />
                  )}
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/35 ring-1 ring-border/25 dark:bg-muted/25"
                    style={subActive ? { backgroundColor: `${accentColor}22` } : {}}
                  >
                    <SubIcon strokeWidth={2.1} className="h-4 w-4 shrink-0" style={subActive ? { color: accentColor } : {}} />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{leaf.label}</span>
                  {leaf.notifyDot && (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400 shadow-[0_0_8px_2px_rgba(56,189,248,0.55)]" title="Updates" />
                  )}
                  {leaf.isNew && <NavNewBadge accent={leaf.badgeColor} />}
                </motion.div>
              </Link>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   SIDEBAR CONTENT
═══════════════════════════════════════════════ */
interface SidebarContentProps {
  location: string;
  expanded: boolean;
  invoiceOpen: boolean;
  shopifyOpen: boolean;
  pgOpen: boolean;
  logisticsOpen: boolean;
  branchesOpen: boolean;
  waChatOpen: boolean;
  commerceOpen: boolean;
  storeOpen: boolean;
  marketingOpen: boolean;
  operationsOpen: boolean;
  settingsOpen: boolean;
  onToggleInvoice: () => void;
  onToggleShopify: () => void;
  onTogglePg: () => void;
  onToggleLogistics: () => void;
  onToggleBranches: () => void;
  onToggleWaChat: () => void;
  onToggleCommerce: () => void;
  onToggleStore: () => void;
  onToggleMarketing: () => void;
  onToggleOperations: () => void;
  onToggleSettings: () => void;
  onNavClick: () => void;
  onLogout: () => void;
  onToggleCollapse?: () => void;
  isCollapsed?: boolean;
  isMobile?: boolean;
  adminIamOpen: boolean;
  onToggleAdminIam: () => void;
}
function SidebarContent({
  location, expanded,
  invoiceOpen, shopifyOpen, pgOpen, logisticsOpen, branchesOpen, waChatOpen,
  commerceOpen, storeOpen, marketingOpen, operationsOpen, settingsOpen,
  onToggleInvoice, onToggleShopify, onTogglePg, onToggleLogistics, onToggleBranches, onToggleWaChat,
  onToggleCommerce, onToggleStore, onToggleMarketing, onToggleOperations, onToggleSettings,
  onNavClick, onLogout, onToggleCollapse, isCollapsed, isMobile,
  adminIamOpen, onToggleAdminIam,
}: SidebarContentProps) {
  const { hasPermission, user: adminUser } = useAdminAuth();
  const isInvoiceActive    = location.startsWith("/invoice") || location.startsWith("/branch-pos") || location.startsWith("/branch-login") || location.startsWith("/stock") || location.startsWith("/erp-settings") || location.startsWith("/erp/");
  const isShopifyActive    = location.startsWith("/shopify");
  const isPgActive         = location.startsWith("/payment-gateway");
  const isLogisticsActive  = location.startsWith("/logistics");
  const isBranchesActive   = location.startsWith("/branches");
  const isWaChatActive     = location.startsWith("/wa-chat") || location === "/wa-inbox" || location === "/chat-conversations" || location === "/chat-leads" || location === "/whatsapp";
  const isCommerceActive   = ["/orders","/products","/categories","/customers","/reviews","/analytics"].some(p => location === p || location.startsWith(p + "/"));
  const isStoreActive      = ["/banners","/video-banners","/mobile-reels","/coupons","/wallet","/loyalty","/announcements"].some(p => location === p || location.startsWith(p + "/"));
  const isMarketingActive  = ["/abandoned-checkouts","/ai-content","/blog","/adsense","/social-ai","/bidding","/restock","/seo"].some(p => location === p || location.startsWith(p + "/") || location.startsWith("/seo/"));
  const isOperationsActive = ["/couriers","/shipping-rules","/same-day-delivery","/payments","/import-export","/failed-orders","/notifications","/sync-jobs"].some(p => location === p || location.startsWith(p + "/"));
  const isSettingsActive   = ["/integrations","/location","/cities","/website-settings","/header-builder","/footer","/image-optimization","/email-settings","/intelligence","/profile"].some(p => location === p || location.startsWith(p + "/"));
  const { waUnread } = useNotifications();
  const favoriteItems = [
    hasPermission("dashboard.view") ? { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard } : null,
    hasPermission("orders.view") ? { href: "/orders", label: "Orders", icon: ShoppingCart } : null,
    hasPermission("products.view") ? { href: "/products", label: "Products", icon: Package } : null,
    hasPermission("billing.view") ? { href: "/pos", label: "POS", icon: Zap } : null,
    hasPermission("whatsapp.view") ? { href: "/wa-inbox", label: "WA Inbox", icon: MessageCircle } : null,
  ].filter(Boolean) as SidebarNavLeaf[];

  return (
    <div className="relative flex h-full flex-col overflow-hidden border-r border-white/[0.08] bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.16),transparent_32%),linear-gradient(180deg,hsl(var(--sidebar)/0.96),hsl(var(--sidebar)/0.78))] shadow-[16px_0_60px_-32px_rgba(0,0,0,0.78)] backdrop-blur-2xl dark:border-white/[0.07]">
      <div className="pointer-events-none absolute inset-x-3 top-3 h-28 rounded-full bg-primary/10 blur-3xl" />

      {/* Logo area */}
      <div className={`relative h-[72px] flex items-center border-b border-white/[0.07] shrink-0 transition-all duration-300 ${expanded ? "px-4 gap-3 justify-between" : "px-0 justify-center"}`}>
        {expanded ? (
          <>
            <div className="flex items-center gap-2.5 min-w-0">
              {/* Brand mark */}
              <div className="relative w-10 h-10 rounded-2xl bg-gradient-to-br from-primary via-emerald-500 to-sky-500 flex items-center justify-center shrink-0 shadow-[0_16px_34px_-18px_hsl(var(--primary))] ring-1 ring-white/20">
                <span className="text-primary-foreground text-[13px] font-black tracking-tight">KD</span>
                <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-sidebar bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]" />
              </div>
              <div className="min-w-0">
                <p className="font-black text-[15px] text-foreground leading-none truncate tracking-tight">KDF Admin</p>
                <p className="text-[10px] text-muted-foreground/70 leading-none mt-1 font-bold uppercase tracking-[0.18em]">Command Center</p>
              </div>
            </div>
            {!isMobile && onToggleCollapse && (
              <button
                onClick={onToggleCollapse}
                className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-white/[0.07] text-muted-foreground/70 hover:text-foreground transition-colors shrink-0 ring-1 ring-white/[0.06]"
                title="Collapse sidebar"
              >
                <PanelLeftClose size={16} />
              </button>
            )}
          </>
        ) : (
          <button
            onClick={onToggleCollapse}
            className="w-11 h-11 rounded-2xl flex items-center justify-center hover:bg-white/[0.07] transition-colors"
            title="Expand sidebar"
          >
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary via-emerald-500 to-sky-500 flex items-center justify-center shadow-[0_16px_34px_-18px_hsl(var(--primary))] ring-1 ring-white/20">
              <span className="text-primary-foreground text-[13px] font-black">KD</span>
            </div>
          </button>
        )}
      </div>

      {/* Scrollable nav */}
      <div className={`flex-1 overflow-y-auto overflow-x-hidden py-3 space-y-1.5 ${expanded ? "px-3" : "px-1.5"}`}>

        {favoriteItems.length > 0 && (
          <>
            <MiniSectionLabel icon={Pin} label="Pinned" expanded={expanded} />
            <div className={expanded ? "grid grid-cols-2 gap-2 px-1" : "space-y-1"}>
              {favoriteItems.slice(0, expanded ? 4 : 5).map((item) => {
                const FavIcon = item.icon;
                return (
                  <Link key={item.href} href={item.href} onClick={onNavClick} className="block">
                    <motion.div
                      title={!expanded ? item.label : undefined}
                      whileHover={{ y: expanded ? -1 : 0, scale: expanded ? 1.015 : 1.06 }}
                      whileTap={{ scale: 0.97 }}
                      className={`relative flex items-center rounded-2xl transition-all ${
                        expanded ? "min-h-[58px] flex-col justify-center gap-1.5 px-2 py-2 text-center" : "mx-auto h-12 w-12 justify-center"
                      } ${
                        location === item.href || location.startsWith(`${item.href}/`)
                          ? "bg-gradient-to-br from-primary/22 to-sky-500/10 text-primary shadow-[0_16px_38px_-24px_hsl(var(--primary))] ring-1 ring-primary/30"
                          : "bg-white/[0.045] text-muted-foreground ring-1 ring-white/[0.055] hover:bg-white/[0.075] hover:text-foreground"
                      }`}
                    >
                      <FavIcon className={expanded ? "h-5 w-5" : "h-[1.05rem] w-[1.05rem]"} strokeWidth={2.15} />
                      {expanded && <span className="max-w-full truncate text-[11px] font-black leading-tight">{item.label}</span>}
                    </motion.div>
                  </Link>
                );
              })}
            </div>
          </>
        )}

        <MiniSectionLabel icon={BarChart3} label="Business" expanded={expanded} />

        {/* ── Dashboard (standalone top link) ── */}
        {hasPermission("dashboard.view") && (
          <NavItem href="/dashboard" label="Dashboard" icon={LayoutDashboard}
            isActive={location === "/dashboard" || location === "/"}
            expanded={expanded} onClick={onNavClick} />
        )}

        {/* ── Shopify (TOP PRIORITY) ── */}
        {hasPermission("shopify.view") && (
          <SidebarSection label="Shopify" icon={Store}
            accentColor="#96BF48" activeBg="bg-green-600/10" activeText="text-green-700" badgeLetter="S"
            isActive={isShopifyActive} expanded={expanded} open={shopifyOpen} onToggle={onToggleShopify}
            items={SHOPIFY_NAV_ITEMS} location={location} onNavClick={onNavClick} />
        )}

        {/* ── Commerce ── */}
        {(hasPermission("orders.view") || hasPermission("products.view")) && (
          <SidebarSection label="Commerce" icon={ShoppingCart}
            accentColor="#3B82F6" activeBg="bg-blue-500/10" activeText="text-blue-700" badgeLetter="C"
            isActive={isCommerceActive} expanded={expanded} open={commerceOpen} onToggle={onToggleCommerce}
            items={COMMERCE_NAV} location={location} onNavClick={onNavClick} />
        )}

        {/* ── Store ── */}
        {(hasPermission("settings.view") || hasPermission("marketing.view")) && (
          <SidebarSection label="Store" icon={ImageIcon}
            accentColor="#8B5CF6" activeBg="bg-violet-500/10" activeText="text-violet-700" badgeLetter="S"
            isActive={isStoreActive} expanded={expanded} open={storeOpen} onToggle={onToggleStore}
            items={STORE_NAV} location={location} onNavClick={onNavClick} />
        )}

        <MiniSectionLabel icon={Boxes} label="Orders & Operations" expanded={expanded} />

        {/* ── Logistics (TOP PRIORITY) ── */}
        {hasPermission("riders.view") && (
          <SidebarSection label="Logistics" icon={Truck}
            accentColor="#059669" activeBg="bg-emerald-600/10" activeText="text-emerald-700" badgeLetter="L"
            isActive={isLogisticsActive} expanded={expanded} open={logisticsOpen} onToggle={onToggleLogistics}
            items={LOGISTICS_NAV_ITEMS as unknown as readonly SidebarNavBlockEntry[]} location={location} onNavClick={onNavClick} />
        )}

        {/* ── Invoice & Billing ── */}
        {hasPermission("billing.view") && (
          <SidebarSection label="Invoice & Billing" icon={Receipt}
            accentColor="#D97706" activeBg="bg-amber-600/10" activeText="text-amber-700" badgeLetter="₨"
            isActive={isInvoiceActive} expanded={expanded} open={invoiceOpen} onToggle={onToggleInvoice}
            items={INVOICE_NAV_ITEMS as unknown as readonly SidebarNavBlockEntry[]} location={location} onNavClick={onNavClick} />
        )}

        {/* ── Operations ── */}
        {(hasPermission("settings.manage") || hasPermission("orders.view")) && (
          <SidebarSection label="Operations" icon={GitBranch}
            accentColor="#F59E0B" activeBg="bg-amber-500/10" activeText="text-amber-700" badgeLetter="O"
            isActive={isOperationsActive} expanded={expanded} open={operationsOpen} onToggle={onToggleOperations}
            items={OPERATIONS_NAV} location={location} onNavClick={onNavClick} />
        )}

        <MiniSectionLabel icon={MessageCircle} label="Customers" expanded={expanded} />

        {/* ── WA Chat ── */}
        {hasPermission("whatsapp.view") && (
          <div className="relative">
            <SidebarSection label="WA Chat & Inbox" icon={MessageCircle}
              accentColor="#25D366" activeBg="bg-[#25D366]/10" activeText="text-[#128C7E]" badgeLetter="W"
              isActive={isWaChatActive} expanded={expanded} open={waChatOpen} onToggle={onToggleWaChat}
              items={WA_CHAT_NAV_ITEMS as unknown as readonly SidebarNavBlockEntry[]} location={location} onNavClick={onNavClick} />
            {waUnread > 0 && !waChatOpen && (
              <span className={`absolute top-2 min-w-[18px] h-5 bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center px-1 pointer-events-none leading-none shadow-[0_0_18px_rgba(239,68,68,0.65)] ${expanded ? "right-2" : "-right-1 -top-0.5"}`}>
                {waUnread > 99 ? "99+" : waUnread}
              </span>
            )}
          </div>
        )}

        {/* ── Marketing ── */}
        {hasPermission("marketing.view") && (
          <SidebarSection label="Marketing" icon={Megaphone}
            accentColor="#EC4899" activeBg="bg-pink-500/10" activeText="text-pink-700" badgeLetter="M"
            isActive={isMarketingActive} expanded={expanded} open={marketingOpen} onToggle={onToggleMarketing}
            items={MARKETING_NAV} location={location} onNavClick={onNavClick} />
        )}

        <MiniSectionLabel icon={Settings} label="System" expanded={expanded} />

        {/* ── Settings ── */}
        {(hasPermission("settings.view") || hasPermission("integrations.manage")) && (
          <SidebarSection label="Settings" icon={Settings}
            accentColor="#6B7280" activeBg="bg-gray-500/10" activeText="text-gray-700" badgeLetter="⚙"
            isActive={isSettingsActive} expanded={expanded} open={settingsOpen} onToggle={onToggleSettings}
            items={SETTINGS_NAV} location={location} onNavClick={onNavClick} />
        )}

        {/* ── Payment Gateway ── */}
        {hasPermission("merchant_api.manage") && (
          <SidebarSection label="Payment Gateway" icon={Landmark}
            accentColor="#2563EB" activeBg="bg-blue-600/15" activeText="text-blue-700" badgeLetter="₨"
            isActive={isPgActive} expanded={expanded} open={pgOpen} onToggle={onTogglePg}
            items={PG_NAV_ITEMS} location={location} onNavClick={onNavClick} />
        )}

        {/* ── Admin IAM (Users / Roles / Logs) ── */}
        {(hasPermission("users.view") || hasPermission("roles.view") || hasPermission("roles.manage") || hasPermission("logs.view") || hasPermission("modules.manage") || hasPermission("security.manage")) && (
          <SidebarSection label="Control Center" icon={ShieldCheck}
            accentColor="#dc2626" activeBg="bg-red-600/10" activeText="text-red-700" badgeLetter="A"
            isActive={location.startsWith("/admin/") || location.startsWith("/settings/modules")} expanded={expanded} open={adminIamOpen} onToggle={onToggleAdminIam}
            items={ADMIN_IAM_NAV_ITEMS} location={location} onNavClick={onNavClick} />
        )}

        {/* ── Branches ── */}
        {hasPermission("branches.view") && (
          <SidebarSection label="Branches" icon={Building2}
            accentColor="#4F46E5" activeBg="bg-indigo-600/10" activeText="text-indigo-700" badgeLetter="B"
            isActive={isBranchesActive} expanded={expanded} open={branchesOpen} onToggle={onToggleBranches}
            items={BRANCHES_NAV_ITEMS} location={location} onNavClick={onNavClick} />
        )}

        {expanded && (
          <>
            <MiniSectionLabel icon={Clock3} label="Recent" expanded={expanded} />
            <div className="space-y-1 px-1 pb-2">
              {RECENT_NAV_ITEMS.map((item) => {
                const RecentIcon = item.icon;
                return (
                  <Link key={item.href} href={item.href} onClick={onNavClick} className="block">
                    <div className="flex min-h-[38px] items-center gap-2.5 rounded-xl px-2.5 py-2 text-[12px] font-semibold text-muted-foreground transition-colors hover:bg-white/[0.055] hover:text-foreground">
                      <RecentIcon className="h-3.5 w-3.5" />
                      <span className="truncate">{item.label}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        )}

      </div>

      {/* Bottom: User + Logout */}
      <div className={`border-t border-white/[0.08] shrink-0 transition-all duration-300 ${expanded ? "p-3" : "p-1.5"}`}>

        {/* Profile card — expanded */}
        {expanded && adminUser && (
          <div className="relative mb-2 overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.075] via-white/[0.045] to-primary/[0.055] p-3 shadow-[0_18px_45px_-30px_rgba(0,0,0,0.85)]">
            <div className="pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full bg-primary/15 blur-2xl" />
            {/* Avatar */}
            <div className="relative flex items-center gap-3">
              <div className="relative shrink-0">
                <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-sky-500 to-emerald-500 shadow-[0_16px_32px_-18px_hsl(var(--primary))] ring-2 ring-white/15">
                  {adminUser.avatarUrl ? (
                    <img src={adminUser.avatarUrl} alt={adminUser.name} className="h-full w-full object-cover" />
                  ) : adminUser.isSuper ? (
                    <Crown size={17} className="text-amber-300" />
                  ) : (
                    <span className="text-primary-foreground text-sm font-black leading-none">{adminUser.name.charAt(0).toUpperCase()}</span>
                  )}
                </div>
                {/* Online dot */}
                <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-sidebar bg-emerald-500 shadow-[0_0_14px_rgba(16,185,129,0.85)]">
                  <Circle className="h-1.5 w-1.5 fill-white text-white" />
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-black leading-tight text-foreground">{adminUser.name}</p>
                <div className="mt-1 flex items-center gap-1.5">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-black leading-none ${adminUser.isSuper ? "bg-amber-400/15 text-amber-500 ring-1 ring-amber-400/25" : "bg-primary/12 text-primary ring-1 ring-primary/20"}`}>
                    <BadgeCheck className="h-3 w-3" />
                    {adminUser.isSuper ? "Super Admin" : (adminUser.roles?.[0]?.name ?? "Admin")}
                  </span>
                </div>
              </div>
              <Link
                href="/profile"
                onClick={onNavClick}
                className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground ring-1 ring-white/[0.08] transition-colors hover:bg-white/[0.07] hover:text-foreground"
                title="Quick settings"
              >
                <Settings className="h-4 w-4" />
              </Link>
            </div>
          </div>
        )}

        {/* Collapsed avatar only */}
        {!expanded && adminUser && (
          <div className="flex justify-center mb-2">
            <div className="relative">
              <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-sky-500 to-emerald-500 shadow-[0_16px_32px_-18px_hsl(var(--primary))] ring-1 ring-white/15" title={adminUser.name}>
                {adminUser.avatarUrl ? (
                  <img src={adminUser.avatarUrl} alt={adminUser.name} className="h-full w-full object-cover" />
                ) : adminUser.isSuper ? (
                  <Crown size={14} className="text-amber-300" />
                ) : (
                  <span className="text-primary-foreground text-[12px] font-black">{adminUser.name.charAt(0).toUpperCase()}</span>
                )}
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 border-2 border-sidebar shadow-[0_0_12px_rgba(16,185,129,0.85)]" />
            </div>
          </div>
        )}

        {/* Logout button */}
        <button
          onClick={onLogout}
          title={!expanded ? "Logout" : undefined}
          className={`
            flex items-center rounded-xl w-full transition-all duration-150 group
            text-muted-foreground hover:bg-red-500/10 hover:text-red-500
            ${expanded ? "min-h-[42px] gap-2.5 px-3 py-2.5" : "justify-center mx-auto w-10 h-10"}
          `}
        >
          <LogOut size={14} className="shrink-0 transition-colors group-hover:text-red-500" />
          <span className={`text-[13px] font-medium whitespace-nowrap overflow-hidden transition-all duration-300 ${expanded ? "opacity-100 max-w-[120px]" : "opacity-0 max-w-0"}`}>
            Sign out
          </span>
        </button>
      </div>
    </div>
  );
}

function MobileBottomNav({
  location,
  onOpenMenu,
}: {
  location: string;
  onOpenMenu: () => void;
}) {
  const [, nav] = useLocation();
  const homeActive = location === "/" || location === "/dashboard";
  const ordersActive = location.startsWith("/orders");
  const productsActive = location.startsWith("/products");

  const itemCls = (active: boolean) =>
    `flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 rounded-xl text-[10px] font-semibold tracking-tight transition-colors ${
      active ? "text-primary" : "text-muted-foreground"
    }`;
  const iconWrap = (active: boolean) =>
    `flex h-9 w-9 items-center justify-center rounded-xl transition-all ${
      active
        ? "bg-primary/15 text-primary shadow-[0_0_22px_-8px_hsla(93,100%,33%,0.55)]"
        : "text-muted-foreground"
    }`;

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border/60 bg-card/88 backdrop-blur-xl pb-[calc(env(safe-area-inset-bottom)+6px)] pt-1 shadow-[0_-12px_40px_-12px_rgba(0,0,0,0.4)] dark:bg-card/70"
      aria-label="Mobile primary navigation"
    >
      <div className="flex max-w-lg mx-auto">
        <button type="button" className={itemCls(homeActive)} onClick={() => nav("/dashboard")}>
          <span className={iconWrap(homeActive)}>
            <LayoutDashboard size={18} strokeWidth={2} />
          </span>
          Home
        </button>
        <button type="button" className={itemCls(ordersActive)} onClick={() => nav("/orders")}>
          <span className={iconWrap(ordersActive)}>
            <ShoppingCart size={18} strokeWidth={2} />
          </span>
          Orders
        </button>
        <button type="button" className={itemCls(productsActive)} onClick={() => nav("/products")}>
          <span className={iconWrap(productsActive)}>
            <Package size={18} strokeWidth={2} />
          </span>
          Products
        </button>
        <button type="button" className={itemCls(false)} onClick={onOpenMenu}>
          <span className={iconWrap(false)}>
            <Menu size={18} strokeWidth={2} />
          </span>
          More
        </button>
      </div>
    </nav>
  );
}

/* ═══════════════════════════════════════════════
   LAYOUT
═══════════════════════════════════════════════ */
export function Layout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isHovered,   setIsHovered]   = useState(false);
  const [invoiceOpen,    setInvoiceOpen]    = useState(() => location.startsWith("/invoice") || location.startsWith("/branch-pos") || location.startsWith("/stock") || location.startsWith("/erp-settings") || location.startsWith("/erp/"));
  const [shopifyOpen,    setShopifyOpen]    = useState(() => location.startsWith("/shopify"));
  const [pgOpen,         setPgOpen]         = useState(() => location.startsWith("/payment-gateway"));
  const [logisticsOpen,  setLogisticsOpen]  = useState(() => location.startsWith("/logistics"));
  const [branchesOpen,   setBranchesOpen]   = useState(() => location.startsWith("/branches"));
  const [waChatOpen,     setWaChatOpen]     = useState(() => location.startsWith("/wa-chat") || location === "/wa-inbox" || location === "/chat-conversations" || location === "/chat-leads" || location === "/whatsapp");
  const [commerceOpen,   setCommerceOpen]   = useState(() => ["/orders","/products","/categories","/customers","/reviews","/analytics"].some(p => location === p || location.startsWith(p + "/")));
  const [storeOpen,      setStoreOpen]      = useState(() => ["/banners","/video-banners","/mobile-reels","/coupons","/wallet","/loyalty","/announcements"].some(p => location === p));
  const [marketingOpen,  setMarketingOpen]  = useState(() => ["/abandoned-checkouts","/ai-content","/blog","/adsense","/social-ai","/bidding","/restock","/seo"].some(p => location === p || location.startsWith(p + "/")));
  const [operationsOpen, setOperationsOpen] = useState(() => ["/couriers","/shipping-rules","/same-day-delivery","/payments","/import-export","/failed-orders","/notifications","/sync-jobs"].some(p => location === p));
  const [settingsOpen,   setSettingsOpen]   = useState(() => ["/integrations","/location","/cities","/website-settings","/header-builder","/footer","/image-optimization","/email-settings","/intelligence","/profile"].some(p => location === p));
  const [adminIamOpen,   setAdminIamOpen]   = useState(() => location.startsWith("/admin/"));
  const [mobileOpen,     setMobileOpen]     = useState(false);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sidebarExpanded = !isCollapsed || isHovered;

  /* Auto-collapse sidebar after navigation */
  useEffect(() => {
    setIsCollapsed(true);
    setIsHovered(false);
    if (location.startsWith("/invoice") || location.startsWith("/branch-pos") || location.startsWith("/stock") || location.startsWith("/erp-settings") || location.startsWith("/erp/")) setInvoiceOpen(true);
    if (location.startsWith("/shopify") || location.startsWith("/admin/shopify"))         setShopifyOpen(true);
    if (location.startsWith("/payment-gateway")) setPgOpen(true);
    if (location.startsWith("/logistics"))       setLogisticsOpen(true);
    if (location.startsWith("/branches"))        setBranchesOpen(true);
    if (location.startsWith("/wa-chat") || location === "/wa-inbox" || location === "/chat-conversations" || location === "/chat-leads" || location === "/whatsapp") setWaChatOpen(true);
    if (["/orders","/products","/categories","/customers","/reviews","/analytics"].some(p => location === p || location.startsWith(p + "/"))) setCommerceOpen(true);
    if (["/banners","/video-banners","/mobile-reels","/coupons","/wallet","/loyalty","/announcements"].some(p => location === p)) setStoreOpen(true);
    if (["/abandoned-checkouts","/ai-content","/blog","/adsense","/social-ai","/bidding","/restock","/seo"].some(p => location === p || location.startsWith(p + "/"))) setMarketingOpen(true);
    if (["/couriers","/shipping-rules","/same-day-delivery","/payments","/import-export","/failed-orders","/notifications","/sync-jobs"].some(p => location === p)) setOperationsOpen(true);
    if (["/integrations","/location","/cities","/website-settings","/header-builder","/footer","/image-optimization","/email-settings","/intelligence","/profile"].some(p => location === p)) setSettingsOpen(true);
    if (location.startsWith("/admin/")) setAdminIamOpen(true);
  }, [location]);

  const handleLogout = () => {
    localStorage.removeItem("kdf_admin_token");
    localStorage.removeItem("kdf_admin_user");
    setLocation("/login");
  };

  const handleNavClick = () => {
    setIsCollapsed(true);
    setIsHovered(false);
    setMobileOpen(false);
  };

  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current !== null) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => setIsHovered(true), 80);
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current !== null) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => setIsHovered(false), 120);
  };

  const handleToggleCollapse = () => {
    setIsCollapsed(c => {
      const next = !c;
      if (!next) setIsHovered(false);
      return next;
    });
  };

  const sharedProps = {
    location,
    invoiceOpen, shopifyOpen, pgOpen, logisticsOpen, branchesOpen, waChatOpen,
    commerceOpen, storeOpen, marketingOpen, operationsOpen, settingsOpen,
    onToggleInvoice:    () => setInvoiceOpen(o => !o),
    onToggleShopify:    () => setShopifyOpen(o => !o),
    onTogglePg:         () => setPgOpen(o => !o),
    onToggleLogistics:  () => setLogisticsOpen(o => !o),
    onToggleBranches:   () => setBranchesOpen(o => !o),
    onToggleWaChat:     () => setWaChatOpen(o => !o),
    onToggleCommerce:   () => setCommerceOpen(o => !o),
    onToggleStore:      () => setStoreOpen(o => !o),
    onToggleMarketing:  () => setMarketingOpen(o => !o),
    onToggleOperations: () => setOperationsOpen(o => !o),
    onToggleSettings:   () => setSettingsOpen(o => !o),
    adminIamOpen,
    onToggleAdminIam:   () => setAdminIamOpen(o => !o),
    onNavClick:         handleNavClick,
    onLogout:           handleLogout,
  };

  const FULL_SCREEN_ROUTES = ["/wa-inbox", "/shopify/wa-inbox", "/wa-chat"];
  const isFullScreen = FULL_SCREEN_ROUTES.some(r => location === r || location.startsWith(r + "/"));

  return (
    <div className="h-screen overflow-hidden bg-background flex w-full">

      {/* ── Desktop Sidebar ── */}
      <div
        className={`
          hidden md:block h-screen sticky top-0 shrink-0 z-20
          transition-[width] duration-300 ease-in-out
          ${sidebarExpanded ? "w-[310px]" : "w-[68px]"}
        `}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <SidebarContent
          {...sharedProps}
          expanded={sidebarExpanded}
          isCollapsed={isCollapsed}
          onToggleCollapse={handleToggleCollapse}
        />
      </div>

      {/* ── Content area ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden transition-all duration-300">

        {/* Desktop topbar */}
        <div className="hidden h-16 shrink-0 items-center justify-between gap-4 border-b border-border/60 bg-gradient-to-r from-card/90 via-card/70 to-card/90 px-6 shadow-[0_12px_48px_-24px_rgba(0,0,0,0.35)] backdrop-blur-2xl md:flex dark:from-card/50 dark:via-card/40 dark:to-card/50">
          <div className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
            <motion.button
              type="button"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.96 }}
              onClick={handleToggleCollapse}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground ring-1 ring-border/40 transition-colors hover:bg-muted/60 hover:text-foreground"
              title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {isCollapsed ? <PanelLeftOpen className="h-4 w-4" strokeWidth={2} /> : <PanelLeftClose className="h-4 w-4" strokeWidth={2} />}
            </motion.button>
          </div>
          <div className="hidden min-w-0 flex-1 justify-center px-6 lg:flex">
            <motion.button
              type="button"
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              onClick={() => openAdminCommandPalette()}
              className="relative flex w-full max-w-xl items-center gap-3 rounded-2xl border border-border/50 bg-muted/25 px-4 py-3 text-left text-sm text-muted-foreground shadow-inner transition-all hover:border-primary/30 hover:bg-muted/40 hover:text-foreground hover:shadow-[0_0_40px_-12px_hsl(var(--primary)/0.4)]"
            >
              <Search className="h-4 w-4 shrink-0 opacity-70" strokeWidth={2} />
              <span className="truncate font-medium">Search pages, settings, Shopify…</span>
              <kbd className="ml-auto hidden h-6 items-center rounded-lg border border-border/60 bg-background/80 px-2 font-mono text-[10px] font-semibold text-muted-foreground sm:inline-flex">
                ⌘K
              </kbd>
            </motion.button>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <WebsitePreviewButton />
            <ThemeToggle />
            <NotificationBell />
          </div>
        </div>

        {/* Mobile header */}
        <header className="h-14 border-b border-border/70 bg-card/90 backdrop-blur-md flex items-center justify-between px-4 md:hidden sticky top-0 z-30">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shadow-sm shadow-primary/25">
              <span className="text-primary-foreground text-xs font-black">KD</span>
            </div>
            <h1 className="font-bold text-base text-foreground tracking-tight">KDF NUTS</h1>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <NotificationBell />
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="w-9 h-9">
                  <Menu size={20} />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-[320px] max-w-[92vw] border-r-0 bg-sidebar/95 backdrop-blur-xl">
                <SidebarContent
                  {...sharedProps}
                  expanded={true}
                  isMobile={true}
                />
              </SheetContent>
            </Sheet>
          </div>
        </header>

        {/* Page content */}
        {isFullScreen ? (
          <main className="flex-1 overflow-hidden flex flex-col">
            {children}
          </main>
        ) : (
          <main className="flex-1 overflow-y-auto p-4 md:p-7 pb-[calc(5.75rem+env(safe-area-inset-bottom))] md:pb-7">
            <div className="mx-auto max-w-6xl">
              {children}
            </div>
          </main>
        )}

        {!isFullScreen && (
          <MobileBottomNav location={location} onOpenMenu={() => setMobileOpen(true)} />
        )}
      </div>
      <AdminCommandPalette />
    </div>
  );
}
