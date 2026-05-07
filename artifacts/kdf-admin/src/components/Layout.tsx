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
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { NotificationBell } from "./NotificationBell";

/* ═══════════════════════════════════════════════
   NAV DATA
═══════════════════════════════════════════════ */
const INVOICE_NAV_ITEMS = [
  { href: "/pos",                        label: "🖥 Admin POS",       icon: Zap            },
  { href: "/invoice",                    label: "Create Invoice",    icon: Receipt        },
  { href: "/invoice/history",            label: "All Invoices",      icon: History        },
  { href: "/invoice/purchase",           label: "Purchase Bill",     icon: ClipboardList  },
  { href: "/invoice/purchase/history",   label: "Purchase History",  icon: FileText       },
  { href: "/branch-pos",                 label: "Branch POS",        icon: Store          },
  { href: "/branches",                   label: "Branches",          icon: Building2      },
  { href: "/customers",                  label: "Customers",         icon: UserCheck      },
  { href: "/analytics",                  label: "Analytics",         icon: PieChart       },
];

const NAV_ITEMS = [
  { href: "/dashboard",          label: "Dashboard",            icon: LayoutDashboard },
  { href: "/analytics",          label: "Analytics",            icon: BarChart2      },
  { href: "/orders",             label: "Orders",               icon: ShoppingCart   },
  { href: "/products",           label: "Products",             icon: Package        },
  { href: "/categories",         label: "Categories",           icon: Tags           },
  { href: "/customers",          label: "Customers",            icon: Users          },
  { href: "/banners",            label: "Banners",              icon: ImageIcon      },
  { href: "/coupons",            label: "Coupons",              icon: Ticket         },
  { href: "/wallet",             label: "Wallet",               icon: Wallet         },
  { href: "/loyalty",            label: "Loyalty",              icon: Award          },
  { href: "/notifications",      label: "Notifications",        icon: Bell           },
  { href: "/couriers",           label: "Couriers",             icon: Truck          },
  { href: "/shipping-rules",     label: "Shipping Rules",       icon: Truck          },
  { href: "/same-day-delivery",  label: "Same Day Delivery",    icon: Zap            },
  { href: "/payments",           label: "Payments",             icon: CreditCard     },
  { href: "/import-export",      label: "Import / Export",      icon: FileUp         },
  { href: "/integrations",       label: "Integrations",         icon: Plug           },
  { href: "/sync-jobs",          label: "Sync Jobs",            icon: RefreshCw      },
  { href: "/location",           label: "Location",             icon: MapPin         },
  { href: "/cities",             label: "Cities",               icon: MapPin         },
  { href: "/whatsapp",           label: "WhatsApp",             icon: MessageCircle  },
  { href: "/wa-inbox",           label: "WA Inbox",             icon: MessageCircle  },
  { href: "/intelligence",       label: "Intelligence",         icon: Brain          },
  { href: "/social-ai",          label: "Social AI",            icon: Sparkles       },
  { href: "/bidding",            label: "Auctions / Bidding",   icon: Gavel          },
  { href: "/restock",            label: "Restock Alerts",       icon: Bell           },
  { href: "/header-builder",     label: "Header Builder",       icon: LayoutTemplate },
  { href: "/website-settings",   label: "Website Settings",     icon: Paintbrush     },
  { href: "/abandoned-checkouts",label: "Abandoned Checkouts",  icon: ShoppingBag    },
  { href: "/blog",               label: "Blog / Posts",         icon: BookOpen       },
  { href: "/seo",                label: "SEO Settings",         icon: Search         },
  { href: "/announcements",      label: "Announcements",        icon: Megaphone      },
  { href: "/footer",             label: "Footer",               icon: LayoutTemplate },
  { href: "/ai-content",         label: "AI Content",           icon: Sparkles       },
  { href: "/reviews",            label: "Reviews",              icon: Star           },
  { href: "/chat-conversations", label: "Chat",                 icon: MessageCircle  },
  { href: "/email-settings",     label: "Email Settings",       icon: Mail           },
  { href: "/image-optimization", label: "Image Optimization",   icon: Zap            },
  { href: "/failed-orders",      label: "Failed Orders",        icon: AlertTriangle  },
  { href: "/profile",            label: "My Profile",           icon: User           },
];

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
];

const BRANCHES_NAV_ITEMS = [
  { href: "/branches",      label: "Dashboard",       icon: BarChart2   },
  { href: "/branches/list", label: "All Branches",    icon: Building2   },
];

const LOGISTICS_NAV_ITEMS = [
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
  items: { href: string; label: string; icon: React.ElementType }[];
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
      <div className={`overflow-hidden transition-all duration-300 ${open && expanded ? "max-h-96 mt-1" : "max-h-0"}`}>
        <div className="ml-4 pl-3 border-l-2 space-y-0.5" style={{ borderColor: `${accentColor}66` }}>
          {items.map(item => {
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
  onToggleInvoice: () => void;
  onToggleShopify: () => void;
  onTogglePg: () => void;
  onToggleLogistics: () => void;
  onToggleBranches: () => void;
  onNavClick: () => void;
  onLogout: () => void;
  onToggleCollapse?: () => void;
  isCollapsed?: boolean;
  isMobile?: boolean;
}
function SidebarContent({
  location, expanded, invoiceOpen, shopifyOpen, pgOpen, logisticsOpen, branchesOpen,
  onToggleInvoice, onToggleShopify, onTogglePg, onToggleLogistics, onToggleBranches, onNavClick, onLogout,
  onToggleCollapse, isCollapsed, isMobile,
}: SidebarContentProps) {
  const isInvoiceActive   = location.startsWith("/invoice") || location.startsWith("/branch-pos") || location.startsWith("/branch-login");
  const isShopifyActive   = location.startsWith("/shopify");
  const isPgActive        = location.startsWith("/payment-gateway");
  const isLogisticsActive = location.startsWith("/logistics");
  const isBranchesActive  = location.startsWith("/branches");

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
      <div className={`flex-1 overflow-y-auto overflow-x-hidden py-3 space-y-0.5 ${expanded ? "px-3" : "px-1.5"}`}>

        {/* Invoice & Billing Section — top priority */}
        <SidebarSection
          label="Invoice & Billing"
          icon={Receipt}
          accentColor="#D97706"
          activeBg="bg-amber-600/10"
          activeText="text-amber-700"
          badgeLetter="₨"
          isActive={isInvoiceActive}
          expanded={expanded}
          open={invoiceOpen}
          onToggle={onToggleInvoice}
          items={INVOICE_NAV_ITEMS}
          location={location}
          onNavClick={onNavClick}
        />

        {/* Divider */}
        <div className={`my-2 transition-all duration-300 ${expanded ? "mx-0" : "mx-auto w-6"}`}>
          <div className="h-px bg-sidebar-border" />
        </div>

        {/* Main nav items */}
        {NAV_ITEMS.map(item => {
          const isActive = location === item.href || location.startsWith(item.href + "/");
          return (
            <NavItem
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              isActive={isActive}
              expanded={expanded}
              onClick={onNavClick}
            />
          );
        })}

        {/* Divider */}
        <div className={`my-2 transition-all duration-300 ${expanded ? "mx-0" : "mx-auto w-6"}`}>
          <div className="h-px bg-sidebar-border" />
        </div>

        {/* Payment Gateway Section */}
        <SidebarSection
          label="Payment Gateway"
          icon={Landmark}
          accentColor="#2563EB"
          activeBg="bg-blue-600/15"
          activeText="text-blue-700"
          badgeLetter="₨"
          isActive={isPgActive}
          expanded={expanded}
          open={pgOpen}
          onToggle={onTogglePg}
          items={PG_NAV_ITEMS}
          location={location}
          onNavClick={onNavClick}
        />

        {/* Shopify Section */}
        <SidebarSection
          label="Shopify"
          icon={Store}
          accentColor="#96BF48"
          activeBg="bg-green-600/10"
          activeText="text-green-700"
          badgeLetter="S"
          isActive={isShopifyActive}
          expanded={expanded}
          open={shopifyOpen}
          onToggle={onToggleShopify}
          items={SHOPIFY_NAV_ITEMS}
          location={location}
          onNavClick={onNavClick}
        />

        {/* Logistics Section */}
        <SidebarSection
          label="Logistics"
          icon={Truck}
          accentColor="#059669"
          activeBg="bg-emerald-600/10"
          activeText="text-emerald-700"
          badgeLetter="L"
          isActive={isLogisticsActive}
          expanded={expanded}
          open={logisticsOpen}
          onToggle={onToggleLogistics}
          items={LOGISTICS_NAV_ITEMS}
          location={location}
          onNavClick={onNavClick}
        />

        {/* Branches Section */}
        <SidebarSection
          label="Branches"
          icon={Building2}
          accentColor="#4F46E5"
          activeBg="bg-indigo-600/10"
          activeText="text-indigo-700"
          badgeLetter="B"
          isActive={isBranchesActive}
          expanded={expanded}
          open={branchesOpen}
          onToggle={onToggleBranches}
          items={BRANCHES_NAV_ITEMS}
          location={location}
          onNavClick={onNavClick}
        />
      </div>

      {/* Bottom: Logout */}
      <div className={`border-t border-sidebar-border shrink-0 transition-all duration-300 ${expanded ? "p-3" : "p-1.5"}`}>
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
  const [invoiceOpen,   setInvoiceOpen]   = useState(() => location.startsWith("/invoice") || location.startsWith("/branch-pos"));
  const [shopifyOpen,   setShopifyOpen]   = useState(() => location.startsWith("/shopify"));
  const [pgOpen,        setPgOpen]        = useState(() => location.startsWith("/payment-gateway"));
  const [logisticsOpen, setLogisticsOpen] = useState(() => location.startsWith("/logistics"));
  const [branchesOpen,  setBranchesOpen]  = useState(() => location.startsWith("/branches"));
  const [mobileOpen,    setMobileOpen]    = useState(false);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sidebarExpanded = !isCollapsed || isHovered;

  /* Auto-collapse sidebar after navigation */
  useEffect(() => {
    setIsCollapsed(true);
    setIsHovered(false);
    /* Keep sub-menus open when navigating within them */
    if (location.startsWith("/invoice") || location.startsWith("/branch-pos")) setInvoiceOpen(true);
    if (location.startsWith("/shopify"))          setShopifyOpen(true);
    if (location.startsWith("/payment-gateway"))  setPgOpen(true);
    if (location.startsWith("/logistics"))        setLogisticsOpen(true);
    if (location.startsWith("/branches"))         setBranchesOpen(true);
  }, [location]);

  const handleLogout = () => {
    localStorage.removeItem("kdf_admin_token");
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
    invoiceOpen,
    shopifyOpen,
    pgOpen,
    logisticsOpen,
    branchesOpen,
    onToggleInvoice:    () => setInvoiceOpen(o => !o),
    onToggleShopify:    () => setShopifyOpen(o => !o),
    onTogglePg:         () => setPgOpen(o => !o),
    onToggleLogistics:  () => setLogisticsOpen(o => !o),
    onToggleBranches:   () => setBranchesOpen(o => !o),
    onNavClick:         handleNavClick,
    onLogout:           handleLogout,
  };

  return (
    <div className="min-h-screen bg-background flex w-full">

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
      <div className="flex-1 flex flex-col min-w-0 transition-all duration-300">

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
        <main className="flex-1 p-4 md:p-7 overflow-x-hidden">
          <div className="mx-auto max-w-6xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
