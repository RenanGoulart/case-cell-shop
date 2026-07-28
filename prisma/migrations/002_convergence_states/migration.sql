ALTER TYPE reservation_state ADD VALUE IF NOT EXISTS 'expired';
ALTER TYPE outbox_status ADD VALUE IF NOT EXISTS 'processing';