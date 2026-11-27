-- Stages 3–8: self-service tour builder, bookings, payments, place reviews, settings, assistant.

-- Owner-editable settings (pricing tariffs, assistant prompt, …) keyed by name.
CREATE TABLE IF NOT EXISTS app_settings(
  key text PRIMARY KEY,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

-- Self-service tour bookings. Lifecycle: pending → paid → confirmed → completed,
-- with cancelled / refunded as terminal states (lib/tours/status.ts).
CREATE TABLE IF NOT EXISTS tour_bookings(
  id text PRIMARY KEY,
  user_id text NOT NULL,
  email text NOT NULL,
  contact jsonb NOT NULL DEFAULT '{}',
  place_ids jsonb NOT NULL CHECK (jsonb_typeof(place_ids) = 'array'),
  adults int NOT NULL CHECK (adults BETWEEN 1 AND 40),
  children int NOT NULL DEFAULT 0 CHECK (children BETWEEN 0 AND 40),
  start_date date NOT NULL,
  end_date date NOT NULL,
  days int NOT NULL CHECK (days BETWEEN 1 AND 30),
  guide_id text REFERENCES guides(id),
  estimate jsonb NOT NULL,
  currency text NOT NULL DEFAULT 'KZT',
  estimate_min_minor bigint NOT NULL CHECK (estimate_min_minor >= 0),
  estimate_max_minor bigint NOT NULL CHECK (estimate_max_minor >= estimate_min_minor),
  amount_due_minor bigint NOT NULL CHECK (amount_due_minor >= 0),
  paid_minor bigint NOT NULL DEFAULT 0,
  refunded_minor bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','paid','confirmed','completed','cancelled','refunded')),
  notes text NOT NULL DEFAULT '',
  language text NOT NULL DEFAULT 'en',
  expires_at timestamptz,
  paid_at timestamptz,
  confirmed_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS tour_bookings_user ON tour_bookings(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tour_bookings_status ON tour_bookings(status, created_at DESC);
CREATE INDEX IF NOT EXISTS tour_bookings_guide ON tour_bookings(guide_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS tour_bookings_places ON tour_bookings USING gin (place_ids);

CREATE TABLE IF NOT EXISTS tour_booking_events(
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  booking_id text NOT NULL REFERENCES tour_bookings(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  actor text NOT NULL,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tour_booking_events_booking ON tour_booking_events(booking_id, created_at);

-- Provider-agnostic payments (Stripe today, local providers later).
CREATE TABLE IF NOT EXISTS tour_payments(
  id text PRIMARY KEY,
  booking_id text NOT NULL REFERENCES tour_bookings(id),
  provider text NOT NULL,
  provider_session_id text,
  provider_payment_id text,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL,
  status text NOT NULL DEFAULT 'created'
    CHECK (status IN ('created','paid','failed','expired','refunded','partially_refunded')),
  refunded_minor bigint NOT NULL DEFAULT 0,
  livemode boolean NOT NULL DEFAULT false,
  checkout_url text,
  receipt_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_session_id)
);
CREATE INDEX IF NOT EXISTS tour_payments_booking ON tour_payments(booking_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tour_payments_status ON tour_payments(status, created_at DESC);

-- Webhook idempotency: each provider event is processed once.
CREATE TABLE IF NOT EXISTS payment_events(
  provider text NOT NULL,
  event_id text NOT NULL,
  type text NOT NULL,
  booking_id text,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, event_id)
);

-- Traveller reviews of places: only after a completed trip that included the place.
CREATE TABLE IF NOT EXISTS place_reviews(
  id text PRIMARY KEY,
  place_id text NOT NULL REFERENCES hub_catalog(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  author_name text NOT NULL,
  booking_ref text NOT NULL,
  rating int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title text NOT NULL DEFAULT '',
  body text NOT NULL,
  language text NOT NULL DEFAULT 'en',
  verified boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  moderation_note text NOT NULL DEFAULT '',
  moderated_by text,
  moderated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (place_id, user_id, booking_ref)
);
CREATE INDEX IF NOT EXISTS place_reviews_place ON place_reviews(place_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS place_reviews_status ON place_reviews(status, created_at DESC);

-- Travel assistant conversations (viewable by staff; no payment data is ever stored here).
CREATE TABLE IF NOT EXISTS assistant_conversations(
  id text PRIMARY KEY,
  user_id text,
  visitor_hash text NOT NULL,
  language text NOT NULL DEFAULT 'en',
  title text NOT NULL DEFAULT '',
  message_count int NOT NULL DEFAULT 0,
  input_tokens bigint NOT NULL DEFAULT 0,
  output_tokens bigint NOT NULL DEFAULT 0,
  flagged boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assistant_conversations_time ON assistant_conversations(updated_at DESC);
CREATE TABLE IF NOT EXISTS assistant_messages(
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversation_id text NOT NULL REFERENCES assistant_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant','tool')),
  content text NOT NULL,
  tools jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assistant_messages_conversation ON assistant_messages(conversation_id, id);
