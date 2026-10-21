CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE users (
 id uuid PRIMARY KEY, issuer text NOT NULL, subject text NOT NULL, email text NOT NULL,
 name varchar(120) NOT NULL DEFAULT '', role text NOT NULL DEFAULT 'customer' CHECK(role IN ('customer','admin')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(issuer,subject)
);
CREATE TABLE merchants (
 id uuid PRIMARY KEY, name varchar(120) NOT NULL, contact_email varchar(254) NOT NULL,
 verified boolean NOT NULL DEFAULT false, active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE products (
 id uuid PRIMARY KEY, name varchar(160) NOT NULL, description text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('product','service')), price_minor integer NOT NULL CHECK(price_minor > 0),
 currency text NOT NULL CHECK(currency IN ('USD','EUR','GBP')),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','unavailable','archived')),
 merchant_id uuid NOT NULL REFERENCES merchants(id), fulfillment_method text NOT NULL CHECK(fulfillment_method IN ('manual','none')),
 requirements text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX products_catalog ON products(status,created_at DESC);
CREATE TABLE payment_attempts (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), product_id uuid NOT NULL REFERENCES products(id),
 idempotency_key uuid NOT NULL, snapshot jsonb NOT NULL, amount_minor integer NOT NULL CHECK(amount_minor > 0), currency text NOT NULL,
 provider_session text UNIQUE, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','failed','expired')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,idempotency_key)
);
CREATE TABLE orders (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), payment_attempt_id uuid NOT NULL UNIQUE REFERENCES payment_attempts(id),
 snapshot jsonb NOT NULL, amount_minor integer NOT NULL, currency text NOT NULL,
 payment_reference text NOT NULL UNIQUE, payment_verified_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'paid' CHECK(status IN ('paid','fulfilled')),
 fulfillment_status text NOT NULL DEFAULT 'pending' CHECK(fulfillment_status IN ('pending','fulfilled')),
 fulfillment_note text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX orders_owner ON orders(user_id,created_at DESC);
CREATE TABLE fulfillment_events (
 id uuid PRIMARY KEY, order_id uuid NOT NULL UNIQUE REFERENCES orders(id), actor_id uuid NOT NULL REFERENCES users(id),
 note text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE payment_events (id text PRIMARY KEY, type text NOT NULL, processed_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE configuration (
 id integer PRIMARY KEY CHECK(id=1), maintenance boolean NOT NULL DEFAULT false,
 token jsonb NOT NULL DEFAULT '{}', updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO configuration(id) VALUES(1);
CREATE TABLE audit_logs (
 id uuid PRIMARY KEY, actor_id uuid REFERENCES users(id), action text NOT NULL, entity_id text NOT NULL,
 detail jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_recent ON audit_logs(created_at DESC);
CREATE TABLE rate_limits (key text PRIMARY KEY, count integer NOT NULL, expires_at timestamptz NOT NULL);
CREATE INDEX rate_expiry ON rate_limits(expires_at);
CREATE TABLE session (sid varchar PRIMARY KEY, sess json NOT NULL, expire timestamp NOT NULL);
CREATE INDEX session_expire ON session(expire);
-- All access is through the server. No browser database credentials or public policies.
REVOKE ALL ON users, merchants, products, payment_attempts, orders, fulfillment_events, payment_events, configuration, audit_logs, rate_limits, session FROM PUBLIC;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchants ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE fulfillment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuration ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE session ENABLE ROW LEVEL SECURITY;
