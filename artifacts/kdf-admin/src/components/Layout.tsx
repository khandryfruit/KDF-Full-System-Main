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
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { NotificationBell } from "./NotificationBell";
import { useNotifications } from "@/context/NotificationContext";
import { useAdminAuth } from "@/context/AdminAuthContext";

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

const COMMERCE_NAV = [
  { href: "/orders",     label: "Orders",        icon: ShoppingCart },
  { href: "/products",   label: "Products",      icon: Package      },
  { href: "/categories", label: "Categories",    icon: Tags         },
  { href: "/customers",  label: "Customers",     icon: Users        },
  { href: "/reviews",    label: "Reviews",       icon: Star         },
  { href: "/analytics",  label: "Analytics",     icon: BarChart2    },
];

const STORE_NAV = [
  { href: "/banners",       label: "Image Banners",  icon: ImageIcon   },
  { href: "/video-banners", label: "Video Banners",  icon: Video       },
  { href: "/mobile-reels",  label: "Mobile Reels",   icon: Smartphone  },
  { href: "/coupons",       label: "Coupons",        icon: Ticket      },
  { href: "/wallet",        label: "Wallet",         icon: Wallet      },
  { href: "/loyalty",       label: "Loyalty",        icon: Award       },
  { href: "/announcements", label: "Announcements",  icon: Megaphone   },
];

const MARKETING_NAV = [
  { href: "/abandoned-checkouts", label: "Abandoned Carts",    icon: ShoppingBag },
  { href: "/ai-content",          label: "AI Content",         icon: Sparkles    },
  { href: "/blog",                label: "Blog / Posts",       icon: BookOpen    },
  { href: "/adsense",             label: "Blog Ads",           icon: DollarSign  },
  { href: "/social-ai",           label: "Social AI",          icon: Sparkles    },
  { href: "/bidding",             label: "Auctions / Bidding", icon: Gavel       },
  { href: "/restock",             label: "Restock Alerts",     icon: Bell        },
  { href: "/seo",                 label: "SEO Settings",       icon: Search      },
  { href: "/seo/fast-indexing",   label: "Fast Indexing",      icon: Zap         },
  { href: "/seo/merchant-center", label: "Google Merchant",    icon: ShoppingBag },
];

const OPERATIONS_NAV = [
  { href: "/couriers",           label: "Couriers",          icon: Truck          },
  { href: "/shipping-rules",     label: "Shipping Rules",    icon: Truck          },
  { href: "/same-day-delivery",  label: "Same Day Delivery", icon: Zap            },
  { href: "/payments",           label: "Payments",          icon: CreditCard     },
  { href: "/import-export",      label: "Import / Export",   icon: FileUp         },
  { href: "/failed-orders",      label: "Failed Orders",     icon: AlertTriangle  },
  { href: "/notifications",      label: "Notifications",     icon: Bell           },
  { href: "/sync-jobs",          label: "Sync Jobs",         icon: RefreshCw      },
];

const SETTINGS_NAV = [
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

const PG_NAV_ITEMS = [
  { href: "/payment-gateway",              label: "Overview",      icon: LayoutDashboard },
  { href: "/payment-gateway/transactions", label: "Transactions",  icon: Activity        },
  { href: "/payment-gateway/merchants",    label: "Merchant APIs", icon: Key             },
  { href: "/payment-gateway/disputes",     label: "Disputes",      icon: AlertTriangle   },
];

const SHOPIFY_NAV_ITEMS = [
  { href: "/shopify",                  label: "Dashboard",        icon: LayoutDashboard },
  { href: "/shopify/orders",           label: "Orders",           icon: ShoppingCart    },
  { href: "/shopify/customers",        label: "Customers",        icon: Users           },
  { href: "/shopify/products",         label: "Products",         icon: Package         },
  { href: "/shopify/wa-inbox",         label: "WA Inbox",         icon: MessageCircle   },
  { href: "/shopify/marketing",        label: "Marketing Hub",    icon: Zap             },
  { href: "/shopify/campaigns",        label: "WA Campaigns",     icon: Megaphone       },
  { href: "/shopify/email-campaigns",  label: "Email Campaigns",  icon: Mail            },
  { href: "/shopify/widget",           label: "Chat Widget",      icon: MessageCircle   },
  { href: "/whatsapp?tab=templates",   label: "WA Templates",     icon: FileText        },
];

const BRANCHES_NAV_ITEMS = [
  { href: "/branches",      label: "Dashboard",       icon: BarChart2   },
  { href: "/branches/list", label: "All Branches",    icon: Building2   },
];

const ADMIN_IAM_NAV_ITEMS = [
  { href: "/admin/users",         label: "Admin Users",     icon: UserCog      },
  { href: "/admin/roles",         label: "Roles & Perms",   icon: ShieldCheck  },
  { href: "/admin/activity-logs", label: "Activity Logs",   icon: ListChecks   },
  { href: "/settings/modules",    label: "Module Controls", icon: SlidersHorizontal },
];

const LOGISTICS_NAV_ITEMS = [
  { href: "/couriers",                 label: "Courier Settings",  icon: Truck           },
  { href: "/logistics/live-map",       label: "🗺 Live Rider Map",   icon: MapPin          },
  { href: "/logistics/lahore",         label: "Lahore Deliveries", icon: MapPin          },
  { href: "/logistics/riders",         label: "Riders & Accounting", icon: Users         },
  { href: "/logistics/confirmations",  label: "WA Confirmations",  icon: MessageCircle   },
  { href: "/logistics/automation",     label: "Automation",        icon: Zap             },
];

const KDF_NUTS_BASE = "/kdf-nuts";
const REAL_STORE_URL = "https://www.khanbabadryfruits.com";
const WEBSITE_LINKS = [
  { label: "View Store Home", path: REAL_STORE_URL,                             icon: Home    },
  { label: "View Products",   path: `${REAL_STORE_URL}/collections/all`,        icon: Package },
  { label: "View Categories", path: `${REAL_STORE_URL}/collections`,            icon: Tags    },
  { label: "Preview (Local)", path: `${KDF_NUTS_BASE}/home`,                    icon: Globe   },
];

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
  icon: React.ElementType;
  isActive: boolean;
  expanded: boolean;
  onClick?: () => void;
}
function NavItem({ href, label, icon: Icon, isActive, expanded, onClick }: NavItemProps) {
  return (
    <Link href={href} onClick={onClick} className="block">
      <div
        title={!expanded ? label : undefined}
        className={`
          flex items-center rounded-lg transition-all duration-200 cursor-pointer group
          ${expanded ? "gap-3 px-3 py-2.5" : "justify-center px-0 py-2.5 mx-auto w-10"}
          ${isActive
            ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          }
        `}
      >
        <Icon
          size={18}
          className={`shrink-0 transition-colors ${isActive ? "text-sidebar-primary-foreground" : "text-muted-foreground group-hover:text-sidebar-accent-foreground"}`}
        />
        <span
          className={`text-sm font-medium whitespace-nowrap overflow-hidden transition-all duration-300 ${
            expanded ? "opacity-100 max-w-[180px] w-auto" : "opacity-0 max-w-0 w-0"
          }`}
        >
          {label}
        </span>
      </div>
    </Link>
  );
}

/* ═══════════════════════════════════════════════
   SIDEBAR SECTION (collapsible group)
═══════════════════════════════════════════════ */
interface SidebarSectionProps {
  label: string;
  icon: React.ElementType;
  /** hex color e.g. "#3B82F6" */
  accentColor: string;
  /** tailwind bg class for header active state e.g. "bg-blue-600/15" */
  activeBg: string;
  /** tailwind text class for header active state e.g. "text-blue-700" */
  activeText: string;
  badgeLetter: string;
  isActive: boolean;
  expanded: boolean;
  open: boolean;
  onToggle: () => void;
  items: ({ href: string; label: string; icon: React.ElementType; divider?: false } | { divider: true; label: string })[];
  location: string;
  onNavClick?: () => void;
}
function SidebarSection({
  label, icon: Icon, accentColor, activeBg, activeText,
  badgeLetter, isActive, expanded, open, onToggle, items, location, onNavClick,
}: SidebarSectionProps) {
  return (
    <div>
      <button
        onClick={onToggle}
        title={!expanded ? label : undefined}
        className={`
          w-full flex items-center rounded-lg transition-all duration-200
          ${expanded ? "gap-3 px-3 py-2.5" : "justify-center px-0 py-2.5 mx-auto w-10"}
          ${isActive
            ? `${activeBg} ${activeText} font-medium`
            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          }
        `}
      >
        <Icon
          size={18}
          className="shrink-0"
          style={{ color: isActive ? accentColor : undefined }}
        />
        <span className={`flex-1 text-sm text-left whitespace-nowrap overflow-hidden transition-all duration-300 ${expanded ? "opacity-100 max-w-[120px]" : "opacity-0 max-w-0"}`}>
          {label}
        </span>
        {/* Badge dot */}
        <div
          className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 transition-all duration-300 ${expanded ? "opacity-100" : "opacity-0 w-0"}`}
          style={{ backgroundColor: accentColor }}
        >
          <span className="text-white text-[9px] font-bold">{badgeLetter}</span>
        </div>
        <ChevronDown
          size={12}
          className={`shrink-0 transition-all duration-200 ${open ? "rotate-180" : ""} ${expanded ? "opacity-100" : "opacity-0 w-0"}`}
          style={{ color: isActive ? accentColor : undefined }}
        />
      </button>

      {/* Sub-items */}
      <div className={`overflow-hidden transition-all duration-500 ${open && expanded ? "max-h-[1200px] mt-1" : "max-h-0"}`}>
        <div className="ml-4 pl-3 border-l-2 space-y-0.5" style={{ borderColor: `${accentColor}66` }}>
          {items.map((item, idx) => {
            if (item.divider) {
              return (
                <div key={`divider-${idx}`} className="flex items-center gap-2 px-2 pt-3 pb-1">
                  <div className="h-px flex-1" style={{ backgroundColor: `${accentColor}44` }} />
                  <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: `${accentColor}99` }}>
                    {item.label}
                  </span>
                  <div className="h-px flex-1" style={{ backgroundColor: `${accentColor}44` }} />
                </div>
              );
            }
            const SubIcon = item.icon;
            const subActive = location === item.href;
            return (
              <Link key={item.href} href={item.href} onClick={onNavClick} className="block">
                <div
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-md transition-colors text-sm ${
                    subActive
                      ? "text-white font-medium shadow-sm"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  }`}
                  style={subActive ? { backgroundColor: accentColor } : {}}
                >
                  <SubIcon size={14} className={subActive ? "text-white" : "text-muted-foreground"} />
                  <span className="whitespace-nowrap overflow-hidden">{item.label}</span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
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
  const isInvoiceActive    = location.startsWith("/invoice") || location.startsWith("/branch-pos") || location.startsWith("/branch-login") || location.startsWith("/stock") || location.startsWith("/erp-settings");
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

  return (
    <div className="flex flex-col h-full bg-sidebar border-r border-sidebar-border overflow-hidden">

      {/* Logo area */}
      <div className={`h-14 flex items-center border-b border-sidebar-border shrink-0 transition-all duration-300 ${expanded ? "px-5 gap-3 justify-between" : "px-0 justify-center"}`}>
        {expanded ? (
          <>
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-sidebar-primary flex items-center justify-center shrink-0">
                <span className="text-sidebar-primary-foreground text-xs font-black">KD</span>
              </div>
              <div className="min-w-0">
                <p className="font-bold text-sm text-sidebar-primary leading-none truncate">KDF NUTS</p>
                <p className="text-[10px] text-muted-foreground leading-none mt-0.5">Admin</p>
              </div>
            </div>
            {!isMobile && onToggleCollapse && (
              <button
                onClick={onToggleCollapse}
                className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-sidebar-accent text-muted-foreground transition-colors shrink-0"
                title="Collapse sidebar"
              >
                <PanelLeftClose size={14} />
              </button>
            )}
          </>
        ) : (
          <button
            onClick={onToggleCollapse}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-sidebar-accent text-muted-foreground transition-colors"
            title="Expand sidebar"
          >
            <div className="w-6 h-6 rounded-md bg-sidebar-primary flex items-center justify-center">
              <span className="text-sidebar-primary-foreground text-[9px] font-black">KD</span>
            </div>
          </button>
        )}
      </div>

      {/* Scrollable nav */}
      <div className={`flex-1 overflow-y-auto overflow-x-hidden py-2 space-y-0.5 ${expanded ? "px-2" : "px-1"}`}>

        {/* ── Dashboard (standalone top link) ── */}
        <NavItem href="/dashboard" label="Dashboard" icon={LayoutDashboard}
          isActive={location === "/dashboard" || location === "/"}
          expanded={expanded} onClick={onNavClick} />

        <div className={`my-1.5 ${expanded ? "mx-1" : "mx-auto w-5"}`}><div className="h-px bg-sidebar-border/60" /></div>

        {/* ── Shopify (TOP PRIORITY) ── */}
        <SidebarSection label="Shopify" icon={Store}
          accentColor="#96BF48" activeBg="bg-green-600/10" activeText="text-green-700" badgeLetter="S"
          isActive={isShopifyActive} expanded={expanded} open={shopifyOpen} onToggle={onToggleShopify}
          items={SHOPIFY_NAV_ITEMS} location={location} onNavClick={onNavClick} />

        {/* ── Logistics (TOP PRIORITY) ── */}
        <SidebarSection label="Logistics" icon={Truck}
          accentColor="#059669" activeBg="bg-emerald-600/10" activeText="text-emerald-700" badgeLetter="L"
          isActive={isLogisticsActive} expanded={expanded} open={logisticsOpen} onToggle={onToggleLogistics}
          items={LOGISTICS_NAV_ITEMS} location={location} onNavClick={onNavClick} />

        <div className={`my-1.5 ${expanded ? "mx-1" : "mx-auto w-5"}`}><div className="h-px bg-sidebar-border/60" /></div>

        {/* ── WA Chat ── */}
        <div className="relative">
          <SidebarSection label="WA Chat & Inbox" icon={MessageCircle}
            accentColor="#25D366" activeBg="bg-[#25D366]/10" activeText="text-[#128C7E]" badgeLetter="W"
            isActive={isWaChatActive} expanded={expanded} open={waChatOpen} onToggle={onToggleWaChat}
            items={WA_CHAT_NAV_ITEMS} location={location} onNavClick={onNavClick} />
          {waUnread > 0 && !waChatOpen && (
            <span className={`absolute top-1.5 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5 pointer-events-none leading-none ${expanded ? "right-1.5" : "-right-1 -top-0.5"}`}>
              {waUnread > 99 ? "99+" : waUnread}
            </span>
          )}
        </div>

        {/* ── Invoice & Billing ── */}
        <SidebarSection label="Invoice & Billing" icon={Receipt}
          accentColor="#D97706" activeBg="bg-amber-600/10" activeText="text-amber-700" badgeLetter="₨"
          isActive={isInvoiceActive} expanded={expanded} open={invoiceOpen} onToggle={onToggleInvoice}
          items={INVOICE_NAV_ITEMS} location={location} onNavClick={onNavClick} />

        <div className={`my-1.5 ${expanded ? "mx-1" : "mx-auto w-5"}`}><div className="h-px bg-sidebar-border/60" /></div>

        {/* ── Commerce ── */}
        <SidebarSection label="Commerce" icon={ShoppingCart}
          accentColor="#3B82F6" activeBg="bg-blue-500/10" activeText="text-blue-700" badgeLetter="C"
          isActive={isCommerceActive} expanded={expanded} open={commerceOpen} onToggle={onToggleCommerce}
          items={COMMERCE_NAV} location={location} onNavClick={onNavClick} />

        {/* ── Store ── */}
        <SidebarSection label="Store" icon={ImageIcon}
          accentColor="#8B5CF6" activeBg="bg-violet-500/10" activeText="text-violet-700" badgeLetter="S"
          isActive={isStoreActive} expanded={expanded} open={storeOpen} onToggle={onToggleStore}
          items={STORE_NAV} location={location} onNavClick={onNavClick} />

        {/* ── Marketing ── */}
        <SidebarSection label="Marketing" icon={Megaphone}
          accentColor="#EC4899" activeBg="bg-pink-500/10" activeText="text-pink-700" badgeLetter="M"
          isActive={isMarketingActive} expanded={expanded} open={marketingOpen} onToggle={onToggleMarketing}
          items={MARKETING_NAV} location={location} onNavClick={onNavClick} />

        {/* ── Operations ── */}
        <SidebarSection label="Operations" icon={GitBranch}
          accentColor="#F59E0B" activeBg="bg-amber-500/10" activeText="text-amber-700" badgeLetter="O"
          isActive={isOperationsActive} expanded={expanded} open={operationsOpen} onToggle={onToggleOperations}
          items={OPERATIONS_NAV} location={location} onNavClick={onNavClick} />

        {/* ── Settings ── */}
        <SidebarSection label="Settings" icon={Settings}
          accentColor="#6B7280" activeBg="bg-gray-500/10" activeText="text-gray-700" badgeLetter="⚙"
          isActive={isSettingsActive} expanded={expanded} open={settingsOpen} onToggle={onToggleSettings}
          items={SETTINGS_NAV} location={location} onNavClick={onNavClick} />

        <div className={`my-1.5 ${expanded ? "mx-1" : "mx-auto w-5"}`}><div className="h-px bg-sidebar-border/60" /></div>

        {/* ── Branches ── */}
        <SidebarSection label="Branches" icon={Building2}
          accentColor="#4F46E5" activeBg="bg-indigo-600/10" activeText="text-indigo-700" badgeLetter="B"
          isActive={isBranchesActive} expanded={expanded} open={branchesOpen} onToggle={onToggleBranches}
          items={BRANCHES_NAV_ITEMS} location={location} onNavClick={onNavClick} />

        {/* ── Payment Gateway ── */}
        {hasPermission("merchant_api.manage") && (
          <SidebarSection label="Payment Gateway" icon={Landmark}
            accentColor="#2563EB" activeBg="bg-blue-600/15" activeText="text-blue-700" badgeLetter="₨"
            isActive={isPgActive} expanded={expanded} open={pgOpen} onToggle={onTogglePg}
            items={PG_NAV_ITEMS} location={location} onNavClick={onNavClick} />
        )}

        {/* ── Admin IAM (Users / Roles / Logs) ── */}
        {(hasPermission("users.view") || hasPermission("roles.manage") || hasPermission("logs.view")) && (
          <SidebarSection label="Admin Panel" icon={ShieldCheck}
            accentColor="#dc2626" activeBg="bg-red-600/10" activeText="text-red-700" badgeLetter="A"
            isActive={location.startsWith("/admin/")} expanded={expanded} open={adminIamOpen} onToggle={onToggleAdminIam}
            items={ADMIN_IAM_NAV_ITEMS} location={location} onNavClick={onNavClick} />
        )}

      </div>

      {/* Bottom: User + Logout */}
      <div className={`border-t border-sidebar-border shrink-0 transition-all duration-300 ${expanded ? "p-3" : "p-1.5"}`}>
        {expanded && adminUser && (
          <div className="flex items-center gap-2.5 px-2 py-2 mb-1 rounded-lg bg-muted/40">
            <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center shrink-0">
              {adminUser.isSuper
                ? <Crown size={12} className="text-amber-300" />
                : <span className="text-primary-foreground text-[10px] font-bold">{adminUser.name.charAt(0).toUpperCase()}</span>
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate leading-none">{adminUser.name}</p>
              <p className="text-[10px] text-muted-foreground truncate mt-0.5 leading-none">
                {adminUser.isSuper ? "Super Admin" : (adminUser.roles?.[0]?.name ?? "Admin")}
              </p>
            </div>
          </div>
        )}
        <button
          onClick={onLogout}
          title={!expanded ? "Logout" : undefined}
          className={`
            flex items-center rounded-lg w-full transition-all duration-200 text-muted-foreground hover:bg-red-50 hover:text-red-600 group
            ${expanded ? "gap-3 px-3 py-2.5" : "justify-center px-0 py-2.5"}
          `}
        >
          <LogOut size={16} className="shrink-0 group-hover:text-red-600" />
          <span className={`text-sm whitespace-nowrap overflow-hidden transition-all duration-300 ${expanded ? "opacity-100 max-w-[120px]" : "opacity-0 max-w-0"}`}>
            Logout
          </span>
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   LAYOUT
═══════════════════════════════════════════════ */
export function Layout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isHovered,   setIsHovered]   = useState(false);
  const [invoiceOpen,    setInvoiceOpen]    = useState(() => location.startsWith("/invoice") || location.startsWith("/branch-pos") || location.startsWith("/stock") || location.startsWith("/erp-settings"));
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
    if (location.startsWith("/invoice") || location.startsWith("/branch-pos") || location.startsWith("/stock") || location.startsWith("/erp-settings")) setInvoiceOpen(true);
    if (location.startsWith("/shopify"))         setShopifyOpen(true);
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
          ${sidebarExpanded ? "w-64" : "w-[60px]"}
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
        <div className="hidden md:flex h-12 border-b border-border bg-card items-center justify-between px-5 gap-3 shrink-0">
          {/* Left: current section breadcrumb */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <button
              onClick={handleToggleCollapse}
              className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-accent text-muted-foreground transition-colors"
              title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {isCollapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
            </button>
          </div>
          {/* Right: actions */}
          <div className="flex items-center gap-2">
            <WebsitePreviewButton />
            <NotificationBell />
          </div>
        </div>

        {/* Mobile header */}
        <header className="h-14 border-b border-border bg-card flex items-center justify-between px-4 md:hidden sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground text-xs font-black">KD</span>
            </div>
            <h1 className="font-bold text-base text-foreground">KDF NUTS</h1>
          </div>
          <div className="flex items-center gap-1">
            <NotificationBell />
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="w-9 h-9">
                  <Menu size={20} />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-72 border-r-0">
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
          <main className="flex-1 overflow-y-auto p-4 md:p-7">
            <div className="mx-auto max-w-6xl">
              {children}
            </div>
          </main>
        )}
      </div>
    </div>
  );
}
