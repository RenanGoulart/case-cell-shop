CREATE TYPE order_status AS ENUM ('pending', 'processing', 'retrying', 'confirmed', 'failed');
CREATE TYPE reservation_state AS ENUM ('active', 'consumed', 'released', 'expired');
CREATE TYPE processing_attempt_result AS ENUM ('confirmed', 'temporarily_unavailable', 'unavailable', 'timeout');
CREATE TYPE outbox_status AS ENUM ('pending', 'processing', 'published');

CREATE TABLE products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents > 0),
  currency TEXT NOT NULL CHECK (char_length(currency) = 3),
  available_quantity INTEGER NOT NULL CHECK (available_quantity >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE catalog_state (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO catalog_state (id, version) VALUES (1, 0);

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status order_status NOT NULL DEFAULT 'pending',
  request_id UUID NOT NULL,
  correlation_id UUID NOT NULL,
  current_attempt INTEGER NOT NULL DEFAULT 0 CHECK (current_attempt >= 0),
  final_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents > 0),
  currency TEXT NOT NULL CHECK (char_length(currency) = 3)
);

CREATE INDEX order_items_order_id_idx ON order_items(order_id);

CREATE TABLE idempotency_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL,
  canonical_body JSONB NOT NULL,
  order_id UUID REFERENCES orders(id),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idempotency_records_expires_at_idx ON idempotency_records(expires_at);

CREATE TABLE stock_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  state reservation_state NOT NULL DEFAULT 'active',
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  expired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (state = 'active' AND consumed_at IS NULL AND released_at IS NULL AND expired_at IS NULL)
    OR (state = 'consumed' AND consumed_at IS NOT NULL AND released_at IS NULL AND expired_at IS NULL)
    OR (state = 'released' AND released_at IS NOT NULL AND consumed_at IS NULL AND expired_at IS NULL)
    OR (state = 'expired' AND expired_at IS NOT NULL AND consumed_at IS NULL AND released_at IS NULL)
  )
);

CREATE INDEX stock_reservations_state_expires_at_idx ON stock_reservations(state, expires_at);

CREATE TABLE reservation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES stock_reservations(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0)
);

CREATE INDEX reservation_items_reservation_id_idx ON reservation_items(reservation_id);
CREATE INDEX reservation_items_product_id_idx ON reservation_items(product_id);

CREATE TABLE processing_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  correlation_id UUID NOT NULL,
  processing_token UUID NOT NULL,
  deadline_at TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  result processing_attempt_result,
  UNIQUE (order_id, attempt_number)
);

CREATE INDEX processing_attempts_deadline_at_idx ON processing_attempts(deadline_at);

CREATE TABLE outbox_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  payload JSONB NOT NULL,
  attempt_number INTEGER NOT NULL DEFAULT 1 CHECK (attempt_number BETWEEN 1 AND 3),
  publish_attempts INTEGER NOT NULL DEFAULT 0 CHECK (publish_attempts >= 0),
  status outbox_status NOT NULL DEFAULT 'pending',
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ,
  lock_token UUID,
  locked_at TIMESTAMPTZ,
  locked_until TIMESTAMPTZ,
  last_error VARCHAR(256),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (order_id, type, attempt_number)
);

CREATE INDEX outbox_events_status_available_at_idx ON outbox_events(status, available_at);
CREATE INDEX outbox_events_lock_token_idx ON outbox_events(lock_token);
