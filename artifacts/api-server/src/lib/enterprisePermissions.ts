/**
 * Enterprise permission catalogue — single source of truth for RBAC.
 * Keys follow: {module}.{action} convention.
 */

export type PermissionDef = {
  key: string;
  name: string;
  module: string;
  description?: string;
  risk?: "low" | "medium" | "high" | "critical";
};

export const ENTERPRISE_PERMISSIONS: PermissionDef[] = [
  /* Dashboard */
  { key: "dashboard.view", name: "View Dashboard", module: "Dashboard", risk: "low" },
  { key: "analytics.view", name: "View Analytics", module: "Dashboard", risk: "low" },
  { key: "reports.sales", name: "Sales Reports", module: "Reports", risk: "low" },
  { key: "reports.profit", name: "Profit Reports", module: "Reports", risk: "medium" },
  { key: "reports.customers", name: "Customer Reports", module: "Reports", risk: "low" },
  { key: "reports.riders", name: "Rider Reports", module: "Reports", risk: "low" },
  { key: "reports.seo", name: "SEO Reports", module: "Reports", risk: "low" },
  { key: "reports.whatsapp", name: "WhatsApp Reports", module: "Reports", risk: "low" },
  { key: "reports.inventory", name: "Inventory Reports", module: "Reports", risk: "low" },
  { key: "search.global", name: "Global Search", module: "Dashboard", risk: "low" },

  /* Orders */
  { key: "orders.view", name: "View Orders", module: "Orders", risk: "low" },
  { key: "orders.create", name: "Create Orders", module: "Orders", risk: "medium" },
  { key: "orders.edit", name: "Edit Orders", module: "Orders", risk: "medium" },
  { key: "orders.cancel", name: "Cancel Orders", module: "Orders", risk: "high" },
  { key: "orders.delete", name: "Delete Orders", module: "Orders", risk: "critical" },
  { key: "orders.export", name: "Export Orders", module: "Orders", risk: "medium" },
  { key: "orders.assign_rider", name: "Assign Riders", module: "Orders", risk: "medium" },
  { key: "orders.refund", name: "Refund Orders", module: "Orders", risk: "critical" },

  /* Shopify */
  { key: "shopify.view", name: "View Shopify", module: "Shopify", risk: "low" },
  { key: "shopify.sync", name: "Sync Shopify", module: "Shopify", risk: "medium" },
  { key: "shopify.manage", name: "Manage Shopify Settings", module: "Shopify", risk: "high" },
  { key: "shopify.orders.view", name: "View Shopify Orders", module: "Shopify", risk: "low" },
  { key: "shopify.orders.complete", name: "Complete Shopify Orders", module: "Shopify", risk: "medium" },
  { key: "shopify.orders.cancel", name: "Cancel Shopify Orders", module: "Shopify", risk: "high" },
  { key: "shopify.orders.refund", name: "Refund Shopify Orders", module: "Shopify", risk: "critical" },
  { key: "shopify.orders.export", name: "Export Shopify Orders", module: "Shopify", risk: "medium" },

  /* Products */
  { key: "products.view", name: "View Products", module: "Products", risk: "low" },
  { key: "products.create", name: "Add Products", module: "Products", risk: "medium" },
  { key: "products.edit", name: "Edit Products", module: "Products", risk: "medium" },
  { key: "products.delete", name: "Delete Products", module: "Products", risk: "high" },
  { key: "products.stock_manage", name: "Update Inventory", module: "Products", risk: "medium" },
  { key: "products.import", name: "Bulk Import Products", module: "Products", risk: "high" },
  { key: "products.seo_edit", name: "Edit Product SEO", module: "Products", risk: "low" },
  { key: "products.barcode", name: "Barcode Access", module: "Products", risk: "low" },
  { key: "products.approve", name: "Approve Product Changes", module: "Products", risk: "high" },

  /* Customers */
  { key: "customers.view", name: "View Customers", module: "Customers", risk: "low" },
  { key: "customers.add", name: "Add Customers", module: "Customers", risk: "low" },
  { key: "customers.edit", name: "Edit Customers", module: "Customers", risk: "medium" },
  { key: "customers.ban", name: "Ban Customers", module: "Customers", risk: "high" },
  { key: "customers.delete", name: "Delete Customers", module: "Customers", risk: "critical" },
  { key: "customers.export", name: "Export Customers", module: "Customers", risk: "medium" },
  { key: "customers.history", name: "Purchase History", module: "Customers", risk: "low" },
  { key: "customers.notes", name: "Customer Notes", module: "Customers", risk: "low" },

  /* Payments */
  { key: "payments.view", name: "View Payments", module: "Payments", risk: "low" },
  { key: "payments.manage", name: "Manage Payments", module: "Payments", risk: "high" },
  { key: "payments.refund", name: "Process Refunds", module: "Payments", risk: "critical" },
  { key: "payments.gateway", name: "Gateway Settings", module: "Payments", risk: "critical" },
  { key: "payments.meezan", name: "Meezan Settings", module: "Payments", risk: "critical" },
  { key: "payments.reports", name: "Payment Reports", module: "Payments", risk: "medium" },
  { key: "merchant_api.manage", name: "Manage Merchant APIs", module: "Payments", risk: "critical" },
  { key: "disputes.manage", name: "Manage Disputes", module: "Payments", risk: "high" },

  /* WhatsApp */
  { key: "whatsapp.view", name: "View Inbox", module: "WhatsApp", risk: "low" },
  { key: "whatsapp.send", name: "Send Messages", module: "WhatsApp", risk: "medium" },
  { key: "whatsapp.broadcast", name: "Campaigns", module: "WhatsApp", risk: "high" },
  { key: "whatsapp.templates", name: "Manage Templates", module: "WhatsApp", risk: "medium" },
  { key: "whatsapp.automation", name: "Automation Rules", module: "WhatsApp", risk: "high" },
  { key: "whatsapp.chatbot", name: "Chatbot Settings", module: "WhatsApp", risk: "high" },
  { key: "whatsapp.auto_reply", name: "Auto Reply", module: "WhatsApp", risk: "medium" },
  { key: "whatsapp.api_settings", name: "API Settings", module: "WhatsApp", risk: "critical" },

  /* SEO */
  { key: "seo.manage", name: "SEO Settings", module: "SEO", risk: "medium" },
  { key: "seo.meta_edit", name: "Edit Meta Titles/Descriptions", module: "SEO", risk: "low" },
  { key: "seo.ai_generate", name: "AI SEO Generation", module: "SEO", risk: "medium" },
  { key: "blogs.manage", name: "Manage Articles", module: "SEO", risk: "medium" },
  { key: "fast_indexing.run", name: "Run Fast Indexing", module: "SEO", risk: "medium" },

  /* Marketing */
  { key: "marketing.view", name: "Marketing Dashboard", module: "Marketing", risk: "low" },
  { key: "campaigns.manage", name: "Manage Campaigns", module: "Marketing", risk: "high" },
  { key: "campaigns.approve", name: "Approve Campaigns", module: "Marketing", risk: "high" },
  { key: "coupons.manage", name: "Coupon Management", module: "Marketing", risk: "medium" },
  { key: "coupons.approve", name: "Approve Discounts", module: "Marketing", risk: "high" },
  { key: "marketing.analytics", name: "Marketing Analytics", module: "Marketing", risk: "low" },
  { key: "pricing.approve", name: "Approve Price Changes", module: "Marketing", risk: "critical" },

  /* Riders / Logistics */
  { key: "riders.view", name: "View Riders", module: "Riders", risk: "low" },
  { key: "riders.assign", name: "Assign Riders", module: "Riders", risk: "medium" },
  { key: "riders.auto_assign", name: "Auto Assign", module: "Riders", risk: "medium" },
  { key: "riders.live_tracking", name: "Live Location", module: "Riders", risk: "low" },
  { key: "riders.proof_approve", name: "Approve Delivery Proof", module: "Riders", risk: "medium" },
  { key: "riders.earnings", name: "View Earnings", module: "Riders", risk: "medium" },
  { key: "riders.settlement", name: "Settlements", module: "Riders", risk: "high" },
  { key: "riders.export", name: "Export Rider Data", module: "Riders", risk: "medium" },
  { key: "delivery.status_update", name: "Update Delivery Status", module: "Riders", risk: "medium" },

  /* Warehouse */
  { key: "warehouse.inventory", name: "Warehouse Inventory", module: "Warehouse", risk: "medium" },
  { key: "warehouse.packing", name: "Packing Operations", module: "Warehouse", risk: "medium" },
  { key: "warehouse.dispatch", name: "Dispatch", module: "Warehouse", risk: "medium" },

  /* Support */
  { key: "support.tickets", name: "Support Tickets", module: "Support", risk: "low" },
  { key: "support.refunds", name: "Support Refunds", module: "Support", risk: "high" },
  { key: "support.complaints", name: "Complaints", module: "Support", risk: "medium" },
  { key: "refunds.approve", name: "Approve Refunds", module: "Support", risk: "critical" },

  /* Finance */
  { key: "finance.reports", name: "Finance Reports", module: "Finance", risk: "medium" },
  { key: "finance.expenses", name: "Expenses", module: "Finance", risk: "high" },
  { key: "finance.profit", name: "Profit & P&L", module: "Finance", risk: "high" },
  { key: "finance.payouts", name: "Payouts", module: "Finance", risk: "critical" },

  /* Billing / POS */
  { key: "billing.view", name: "View Billing", module: "Billing", risk: "low" },
  { key: "billing.create", name: "Create Invoice", module: "Billing", risk: "medium" },
  { key: "billing.edit", name: "Edit Invoice", module: "Billing", risk: "medium" },
  { key: "billing.delete", name: "Delete Invoice", module: "Billing", risk: "high" },
  { key: "billing.refund", name: "Refund Invoice", module: "Billing", risk: "critical" },
  { key: "billing.discount", name: "Apply Discount", module: "Billing", risk: "high" },
  { key: "billing.view_all", name: "View All Staff Sales", module: "Billing", risk: "medium" },

  /* Files */
  { key: "files.upload", name: "Upload Files", module: "Files", risk: "low" },
  { key: "files.download", name: "Download Files", module: "Files", risk: "low" },
  { key: "files.delete", name: "Delete Files", module: "Files", risk: "high" },
  { key: "files.export", name: "Export Data", module: "Files", risk: "medium" },

  /* Branches */
  { key: "branches.view", name: "View Branches", module: "Branches", risk: "low" },
  { key: "branches.manage", name: "Manage Branches", module: "Branches", risk: "high" },

  /* Settings */
  { key: "settings.view", name: "View Settings", module: "Settings", risk: "low" },
  { key: "settings.manage", name: "Manage Settings", module: "Settings", risk: "critical" },
  { key: "integrations.manage", name: "Manage Integrations", module: "Settings", risk: "critical" },

  /* Admin / IAM */
  { key: "users.view", name: "View Admin Users", module: "Admin", risk: "low" },
  { key: "users.manage", name: "Manage Admin Users", module: "Admin", risk: "critical" },
  { key: "users.reset_password", name: "Reset Passwords", module: "Admin", risk: "critical" },
  { key: "users.sessions", name: "Manage Sessions", module: "Admin", risk: "critical" },
  { key: "roles.manage", name: "Manage Roles", module: "Admin", risk: "critical" },
  { key: "roles.view", name: "View Roles", module: "Admin", risk: "low" },
  { key: "logs.view", name: "View Activity Logs", module: "Admin", risk: "low" },
  { key: "logs.export", name: "Export Audit Logs", module: "Admin", risk: "medium" },
  { key: "logs.security", name: "Security Logs", module: "Admin", risk: "medium" },
  { key: "modules.manage", name: "Module Controls", module: "Admin", risk: "critical" },
  { key: "security.manage", name: "Security Settings", module: "Admin", risk: "critical" },
  { key: "apikeys.manage", name: "API Key Management", module: "Admin", risk: "critical" },
  { key: "approvals.manage", name: "Approval Workflows", module: "Admin", risk: "high" },
  { key: "approvals.request", name: "Request Approvals", module: "Admin", risk: "low" },
  { key: "tasks.manage", name: "Team Tasks", module: "Admin", risk: "low" },
  { key: "notes.manage", name: "Internal Notes", module: "Admin", risk: "low" },
  { key: "compliance.export", name: "Compliance Export", module: "Admin", risk: "high" },
  { key: "compliance.gdpr", name: "GDPR Controls", module: "Admin", risk: "critical" },
  { key: "alerts.view", name: "Control Center Alerts", module: "Admin", risk: "low" },
];

export const ALL_PERMISSION_KEYS = ENTERPRISE_PERMISSIONS.map(p => p.key);

/** Backward-compatible alias for adminManagement */
export const ALL_PERMISSIONS = ENTERPRISE_PERMISSIONS.map(({ key, name, module, description }) => ({
  key, name, module, description,
}));

const SUPER_EXCLUDED = new Set([
  "merchant_api.manage", "settings.manage", "roles.manage", "users.manage",
  "logs.security", "security.manage", "apikeys.manage", "compliance.gdpr",
  "payments.gateway", "payments.meezan", "whatsapp.api_settings",
]);

export const SYSTEM_ROLES = [
  {
    name: "Super Admin", slug: "super_admin", hierarchyLevel: 100,
    description: "Owner-level — full system access",
    color: "#dc2626", isSystem: true,
    permissions: ALL_PERMISSION_KEYS,
    widgets: ["kpi_revenue", "kpi_orders", "kpi_riders", "kpi_whatsapp", "alerts", "approvals", "audit_feed"],
    allowedModules: ["*"],
  },
  {
    name: "Master Admin", slug: "master_admin", hierarchyLevel: 90,
    description: "Full operations without critical security/API",
    color: "#7c3aed", isSystem: true,
    permissions: ALL_PERMISSION_KEYS.filter(k => !SUPER_EXCLUDED.has(k)),
    widgets: ["kpi_revenue", "kpi_orders", "kpi_riders", "alerts", "approvals"],
    allowedModules: ["*"],
  },
  {
    name: "Admin", slug: "admin", hierarchyLevel: 80,
    description: "General administrator",
    color: "#4f46e5", isSystem: true,
    permissions: ALL_PERMISSION_KEYS.filter(k =>
      !["users.manage", "roles.manage", "security.manage", "apikeys.manage", "compliance.gdpr", "modules.manage"].includes(k),
    ),
    widgets: ["kpi_orders", "kpi_riders", "alerts"],
    allowedModules: ["orders", "products", "customers", "riders", "whatsapp", "shopify", "warehouse"],
  },
  {
    name: "Manager", slug: "manager", hierarchyLevel: 70,
    description: "Operations manager",
    color: "#0891b2", isSystem: true,
    permissions: [
      "dashboard.view", "analytics.view", "search.global", "orders.view", "orders.edit", "orders.assign_rider",
      "orders.export", "products.view", "products.edit", "products.stock_manage", "customers.view", "customers.edit",
      "customers.history", "customers.notes", "riders.view", "riders.assign", "riders.auto_assign", "riders.live_tracking",
      "billing.view", "billing.create", "shopify.view", "shopify.orders.view", "branches.view", "logs.view", "notes.manage",
      "tasks.manage", "warehouse.inventory", "warehouse.dispatch",
    ],
    widgets: ["kpi_orders", "kpi_riders"],
    allowedModules: ["orders", "products", "customers", "riders", "warehouse"],
  },
  {
    name: "SEO Manager", slug: "seo_manager", hierarchyLevel: 55,
    description: "SEO, content, and articles",
    color: "#a855f7", isSystem: true,
    permissions: [
      "dashboard.view", "seo.manage", "seo.meta_edit", "seo.ai_generate", "blogs.manage", "fast_indexing.run",
      "products.view", "products.seo_edit", "marketing.view", "reports.seo",
    ],
    widgets: ["kpi_seo"],
    allowedModules: ["seo", "marketing"],
  },
  {
    name: "Support Agent", slug: "support_agent", hierarchyLevel: 40,
    description: "Customer support — tickets, chat, orders",
    color: "#0ea5e9", isSystem: true,
    permissions: [
      "dashboard.view", "orders.view", "customers.view", "customers.history", "customers.notes",
      "whatsapp.view", "whatsapp.send", "support.tickets", "support.complaints", "notes.manage",
      "refunds.approve", "approvals.request",
    ],
    widgets: ["kpi_support"],
    allowedModules: ["support", "whatsapp"],
  },
  {
    name: "Warehouse Staff", slug: "warehouse_staff", hierarchyLevel: 35,
    description: "Inventory, packing, dispatch",
    color: "#ca8a04", isSystem: true,
    permissions: [
      "dashboard.view", "warehouse.inventory", "warehouse.packing", "warehouse.dispatch",
      "products.view", "products.stock_manage", "orders.view",
    ],
    widgets: ["kpi_inventory"],
    allowedModules: ["warehouse", "products"],
  },
  {
    name: "Finance Team", slug: "finance_team", hierarchyLevel: 60,
    description: "Finance, payouts, expenses",
    color: "#059669", isSystem: true,
    permissions: [
      "dashboard.view", "analytics.view", "finance.reports", "finance.expenses", "finance.profit", "finance.payouts",
      "payments.view", "payments.reports", "payments.refund", "orders.view", "orders.export", "billing.view",
      "billing.refund", "reports.sales", "reports.profit", "refunds.approve", "approvals.request",
    ],
    widgets: ["kpi_revenue", "kpi_profit"],
    allowedModules: ["finance", "payments", "billing"],
  },
  {
    name: "Rider Manager", slug: "rider_manager", hierarchyLevel: 55,
    description: "Dispatch, tracking, settlements",
    color: "#d97706", isSystem: true,
    permissions: [
      "dashboard.view", "orders.view", "orders.assign_rider", "riders.view", "riders.assign", "riders.auto_assign",
      "riders.live_tracking", "riders.proof_approve", "riders.earnings", "riders.settlement", "riders.export",
      "delivery.status_update", "reports.riders",
    ],
    widgets: ["kpi_riders"],
    allowedModules: ["riders", "orders"],
  },
  {
    name: "Marketing Manager", slug: "marketing_manager", hierarchyLevel: 55,
    description: "Campaigns, coupons, WhatsApp marketing",
    color: "#ec4899", isSystem: true,
    permissions: [
      "dashboard.view", "marketing.view", "campaigns.manage", "campaigns.approve", "coupons.manage",
      "seo.manage", "blogs.manage", "marketing.analytics", "whatsapp.view", "whatsapp.broadcast",
      "whatsapp.templates", "shopify.view", "reports.whatsapp",
    ],
    widgets: ["kpi_marketing"],
    allowedModules: ["marketing", "whatsapp", "seo"],
  },
  {
    name: "WhatsApp Manager", slug: "whatsapp_manager", hierarchyLevel: 50,
    description: "WhatsApp inbox, automation, templates",
    color: "#22c55e", isSystem: true,
    permissions: [
      "dashboard.view", "whatsapp.view", "whatsapp.send", "whatsapp.broadcast", "whatsapp.templates",
      "whatsapp.automation", "whatsapp.auto_reply", "whatsapp.chatbot", "customers.view",
    ],
    widgets: ["kpi_whatsapp"],
    allowedModules: ["whatsapp"],
  },
  {
    name: "Accounts Manager", slug: "accounts_manager", hierarchyLevel: 60,
    description: "Invoices, payments, settlements",
    color: "#059669", isSystem: true,
    permissions: [
      "dashboard.view", "analytics.view", "orders.view", "orders.export", "customers.view",
      "payments.view", "payments.manage", "payments.refund", "disputes.manage",
      "billing.view", "billing.create", "billing.edit", "billing.refund", "billing.view_all", "logs.view",
    ],
    widgets: ["kpi_revenue"],
    allowedModules: ["payments", "billing"],
  },
  {
    name: "Customer Support", slug: "customer_support", hierarchyLevel: 45,
    description: "WhatsApp + chat + order tracking",
    color: "#16a34a", isSystem: true,
    permissions: [
      "dashboard.view", "orders.view", "customers.view", "customers.history", "customers.notes",
      "whatsapp.view", "whatsapp.send", "shopify.view", "shopify.orders.view", "support.tickets",
    ],
    widgets: ["kpi_support"],
    allowedModules: ["support", "whatsapp"],
  },
  {
    name: "POS Cashier", slug: "pos_cashier", hierarchyLevel: 30,
    description: "Point of sale billing",
    color: "#f59e0b", isSystem: true,
    permissions: [
      "dashboard.view", "billing.view", "billing.create", "billing.discount",
      "customers.view", "customers.add", "products.view",
    ],
    widgets: ["kpi_pos"],
    allowedModules: ["billing"],
  },
  {
    name: "Staff", slug: "staff", hierarchyLevel: 20,
    description: "Read-only operational access",
    color: "#64748b", isSystem: true,
    permissions: [
      "dashboard.view", "orders.view", "products.view", "customers.view", "riders.view",
    ],
    widgets: [],
    allowedModules: ["orders", "products"],
  },
] as const;

export function permissionsByModule(): Record<string, PermissionDef[]> {
  const map: Record<string, PermissionDef[]> = {};
  for (const p of ENTERPRISE_PERMISSIONS) {
    (map[p.module] ??= []).push(p);
  }
  return map;
}
