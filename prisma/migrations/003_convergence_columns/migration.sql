ALTER TABLE stock_reservations ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ;
ALTER TABLE stock_reservations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'stock_reservations'::regclass
      AND conname = 'stock_reservations_check'
  ) THEN
    ALTER TABLE stock_reservations DROP CONSTRAINT stock_reservations_check;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'stock_reservations'::regclass
      AND conname = 'stock_reservations_state_timestamps_check'
  ) THEN
    ALTER TABLE stock_reservations
      ADD CONSTRAINT stock_reservations_state_timestamps_check CHECK (
        (state = 'active' AND consumed_at IS NULL AND released_at IS NULL AND expired_at IS NULL)
        OR (state = 'consumed' AND consumed_at IS NOT NULL AND released_at IS NULL AND expired_at IS NULL)
        OR (state = 'released' AND released_at IS NOT NULL AND consumed_at IS NULL AND expired_at IS NULL)
        OR (state = 'expired' AND expired_at IS NOT NULL AND consumed_at IS NULL AND released_at IS NULL)
      );
  END IF;
END $$;

ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS attempt_number INTEGER NOT NULL DEFAULT 1;
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS publish_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS last_error VARCHAR(256);
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE outbox_events
SET attempt_number = (payload->>'attemptNumber')::integer
WHERE payload ? 'attemptNumber'
  AND payload->>'attemptNumber' ~ '^[0-9]+$';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'outbox_events'::regclass
      AND conname = 'outbox_events_attempt_number_check'
  ) THEN
    ALTER TABLE outbox_events
      ADD CONSTRAINT outbox_events_attempt_number_check CHECK (attempt_number BETWEEN 1 AND 3);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'outbox_events'::regclass
      AND conname = 'outbox_events_publish_attempts_check'
  ) THEN
    ALTER TABLE outbox_events
      ADD CONSTRAINT outbox_events_publish_attempts_check CHECK (publish_attempts >= 0);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS outbox_events_order_id_type_attempt_number_idx
  ON outbox_events(order_id, type, attempt_number);