-- ERP foundation: parties, purchases, weighted cost, transfers, audit

CREATE TABLE IF NOT EXISTS erp_parties (
  id serial PRIMARY KEY,
  type text NOT NULL DEFAULT 'supplier',
  name text NOT NULL,
  code text UNIQUE,
  phone text,
  email text,
  address text,
  city text,
  credit_limit numeric(12, 2) DEFAULT 0,
  opening_balance numeric(12, 2) DEFAULT 0,
  payment_terms_days integer DEFAULT 0,
  tax_id text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  branch_id integer REFERENCES branches(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS erp_party_ledger (
  id serial PRIMARY KEY,
  party_id integer NOT NULL REFERENCES erp_parties(id) ON DELETE CASCADE,
  branch_id integer REFERENCES branches(id) ON DELETE SET NULL,
  entry_type text NOT NULL,
  reference_type text,
  reference_id integer,
  debit numeric(12, 2) NOT NULL DEFAULT 0,
  credit numeric(12, 2) NOT NULL DEFAULT 0,
  balance_after numeric(12, 2),
  due_date date,
  notes text,
  created_by integer,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS erp_party_ledger_party_idx ON erp_party_ledger(party_id, created_at DESC);

CREATE TABLE IF NOT EXISTS erp_purchases (
  id serial PRIMARY KEY,
  purchase_no text NOT NULL UNIQUE,
  party_id integer NOT NULL REFERENCES erp_parties(id),
  branch_id integer NOT NULL REFERENCES branches(id),
  status text NOT NULL DEFAULT 'completed',
  purchase_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  subtotal numeric(12, 2) NOT NULL DEFAULT 0,
  tax_amt numeric(12, 2) NOT NULL DEFAULT 0,
  other_expenses numeric(12, 2) NOT NULL DEFAULT 0,
  grand_total numeric(12, 2) NOT NULL DEFAULT 0,
  paid_amount numeric(12, 2) NOT NULL DEFAULT 0,
  payment_status text NOT NULL DEFAULT 'unpaid',
  notes text,
  branch_invoice_id integer REFERENCES branch_invoices(id) ON DELETE SET NULL,
  created_by integer,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS erp_purchase_lines (
  id serial PRIMARY KEY,
  purchase_id integer NOT NULL REFERENCES erp_purchases(id) ON DELETE CASCADE,
  product_id integer REFERENCES branch_products(id) ON DELETE SET NULL,
  item_code text,
  name text NOT NULL,
  qty numeric(12, 3) NOT NULL,
  unit text NOT NULL DEFAULT 'KG',
  unit_cost numeric(12, 2) NOT NULL,
  line_total numeric(12, 2) NOT NULL,
  tax_amt numeric(12, 2) DEFAULT 0,
  batch_no text
);

CREATE TABLE IF NOT EXISTS erp_cost_layers (
  id serial PRIMARY KEY,
  product_id integer NOT NULL REFERENCES branch_products(id) ON DELETE CASCADE,
  branch_id integer REFERENCES branches(id) ON DELETE SET NULL,
  purchase_id integer REFERENCES erp_purchases(id) ON DELETE SET NULL,
  purchase_line_id integer REFERENCES erp_purchase_lines(id) ON DELETE SET NULL,
  qty_received numeric(12, 3) NOT NULL,
  qty_remaining numeric(12, 3) NOT NULL,
  unit_cost numeric(12, 2) NOT NULL,
  received_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS erp_cost_layers_product_idx ON erp_cost_layers(product_id, branch_id);

CREATE TABLE IF NOT EXISTS erp_price_history (
  id serial PRIMARY KEY,
  product_id integer NOT NULL REFERENCES branch_products(id) ON DELETE CASCADE,
  branch_id integer REFERENCES branches(id) ON DELETE SET NULL,
  purchase_price numeric(12, 2),
  sale_price numeric(12, 2),
  avg_cost numeric(12, 2),
  source text,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS erp_price_suggestions (
  id serial PRIMARY KEY,
  product_id integer NOT NULL REFERENCES branch_products(id) ON DELETE CASCADE,
  branch_id integer REFERENCES branches(id) ON DELETE SET NULL,
  current_sale_price numeric(12, 2),
  suggested_sale_price numeric(12, 2) NOT NULL,
  avg_cost numeric(12, 2),
  margin_pct numeric(5, 2),
  status text NOT NULL DEFAULT 'pending',
  created_at timestamp NOT NULL DEFAULT now(),
  resolved_at timestamp,
  resolved_by integer
);

CREATE TABLE IF NOT EXISTS erp_branch_transfers (
  id serial PRIMARY KEY,
  transfer_no text NOT NULL UNIQUE,
  from_branch_id integer NOT NULL REFERENCES branches(id),
  to_branch_id integer NOT NULL REFERENCES branches(id),
  status text NOT NULL DEFAULT 'pending',
  notes text,
  requested_by integer,
  approved_by integer,
  received_by integer,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  received_at timestamp
);

CREATE TABLE IF NOT EXISTS erp_branch_transfer_lines (
  id serial PRIMARY KEY,
  transfer_id integer NOT NULL REFERENCES erp_branch_transfers(id) ON DELETE CASCADE,
  product_id integer NOT NULL REFERENCES branch_products(id),
  item_code text,
  name text NOT NULL,
  qty numeric(12, 3) NOT NULL,
  unit text DEFAULT 'KG',
  unit_cost numeric(12, 2),
  qty_received numeric(12, 3)
);

CREATE TABLE IF NOT EXISTS erp_audit_logs (
  id serial PRIMARY KEY,
  module text NOT NULL,
  action text NOT NULL,
  resource_type text,
  resource_id integer,
  branch_id integer,
  user_id integer,
  user_email text,
  old_data jsonb,
  new_data jsonb,
  ip_address text,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS erp_audit_logs_created_idx ON erp_audit_logs(created_at DESC);

ALTER TABLE branch_products
  ADD COLUMN IF NOT EXISTS avg_cost numeric(12, 2),
  ADD COLUMN IF NOT EXISTS last_purchase_price numeric(12, 2);

ALTER TABLE branch_invoices
  ADD COLUMN IF NOT EXISTS party_id integer REFERENCES erp_parties(id) ON DELETE SET NULL;
