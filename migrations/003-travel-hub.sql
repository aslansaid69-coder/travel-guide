ALTER TABLE content_candidates ADD COLUMN IF NOT EXISTS id bigint GENERATED ALWAYS AS IDENTITY;
CREATE UNIQUE INDEX IF NOT EXISTS content_candidates_id ON content_candidates(id);
CREATE TABLE IF NOT EXISTS hub_catalog(id text PRIMARY KEY,data jsonb NOT NULL,status text NOT NULL CHECK(status IN ('approved','pending','hidden')),updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS hub_catalog_status ON hub_catalog(status);
CREATE TABLE IF NOT EXISTS hub_menu_drafts(id text PRIMARY KEY,item_id text NOT NULL REFERENCES hub_catalog(id),data jsonb NOT NULL,actor text NOT NULL,status text NOT NULL DEFAULT 'pending',created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS hub_settings(id boolean PRIMARY KEY DEFAULT true CHECK(id),data jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS hub_staff_profiles(user_id text PRIMARY KEY REFERENCES staff_roles(user_id),restaurant_ids jsonb NOT NULL DEFAULT '[]',languages jsonb NOT NULL DEFAULT '["en"]');
CREATE TABLE IF NOT EXISTS hub_plans(id text PRIMARY KEY,edit_hash text NOT NULL,data jsonb NOT NULL,version int NOT NULL DEFAULT 1,client_id text,email text,reminder_consent boolean NOT NULL DEFAULT false,marketing_consent boolean NOT NULL DEFAULT false,last_seen timestamptz NOT NULL DEFAULT now(),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS hub_requests(id text PRIMARY KEY,plan_id text NOT NULL REFERENCES hub_plans(id),guest jsonb NOT NULL,status text NOT NULL DEFAULT 'new' CHECK(status IN ('new','contacted','quote-sent','confirmed','completed','cancelled')),intent text NOT NULL DEFAULT 'booking',assigned_to text,quote_id text,payment_status text NOT NULL DEFAULT 'unpaid',paid_minor bigint NOT NULL DEFAULT 0,currency text NOT NULL DEFAULT 'KZT',idempotency_key text UNIQUE NOT NULL,version int NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),contacted_at timestamptz);
CREATE INDEX IF NOT EXISTS hub_requests_pipeline ON hub_requests(status,created_at DESC);
CREATE TABLE IF NOT EXISTS hub_messages(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,request_id text NOT NULL REFERENCES hub_requests(id),actor text NOT NULL,visibility text NOT NULL CHECK(visibility IN ('client','internal')),body text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS hub_quotes(id text PRIMARY KEY,request_id text NOT NULL REFERENCES hub_requests(id),plan_version int NOT NULL,plan jsonb NOT NULL,breakdown jsonb NOT NULL,amount_minor bigint NOT NULL CHECK(amount_minor>=0),currency text NOT NULL,deposit_percent int NOT NULL CHECK(deposit_percent BETWEEN 1 AND 100),terms text NOT NULL,status text NOT NULL DEFAULT 'pending',created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL DEFAULT now()+interval '3 days',approved_at timestamptz);
CREATE TABLE IF NOT EXISTS hub_slots(id text PRIMARY KEY,item_id text NOT NULL REFERENCES hub_catalog(id),starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL,capacity int NOT NULL CHECK(capacity BETWEEN 1 AND 1000),blackout boolean NOT NULL DEFAULT false,CHECK(ends_at>starts_at));
CREATE INDEX IF NOT EXISTS hub_slots_item_time ON hub_slots(item_id,starts_at);
CREATE TABLE IF NOT EXISTS hub_holds(request_id text NOT NULL REFERENCES hub_requests(id),slot_id text NOT NULL REFERENCES hub_slots(id),quantity int NOT NULL CHECK(quantity>0),expires_at timestamptz NOT NULL,state text NOT NULL CHECK(state IN ('held','confirmed','released')),PRIMARY KEY(request_id,slot_id));
CREATE TABLE IF NOT EXISTS hub_payment_sessions(id text PRIMARY KEY,request_id text NOT NULL REFERENCES hub_requests(id),quote_id text NOT NULL REFERENCES hub_quotes(id),amount_minor bigint NOT NULL,currency text NOT NULL,status text NOT NULL DEFAULT 'created',created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS hub_payment_events(id text PRIMARY KEY,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS hub_notifications(id text PRIMARY KEY,channel text NOT NULL DEFAULT 'email',recipient text NOT NULL,subject text NOT NULL,body text NOT NULL,status text NOT NULL DEFAULT 'pending',attempts int NOT NULL DEFAULT 0,due_at timestamptz NOT NULL DEFAULT now(),sent_at timestamptz,last_error text,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS hub_notifications_due ON hub_notifications(status,due_at);
CREATE TABLE IF NOT EXISTS hub_subscribers(id text PRIMARY KEY,email text UNIQUE NOT NULL,token_hash text NOT NULL,confirmed boolean NOT NULL DEFAULT false,active boolean NOT NULL DEFAULT true,language text NOT NULL DEFAULT 'en',created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS hub_reviews(id text PRIMARY KEY,request_id text NOT NULL UNIQUE REFERENCES hub_requests(id),rating int NOT NULL CHECK(rating BETWEEN 1 AND 5),body text NOT NULL,status text NOT NULL DEFAULT 'pending',created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS hub_analytics(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,event text NOT NULL,item_id text,day date NOT NULL DEFAULT current_date,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS hub_analytics_day ON hub_analytics(day,event);
CREATE TABLE IF NOT EXISTS hub_rate_limits(key text PRIMARY KEY,hits int NOT NULL,expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS hub_schedule_runs(key text PRIMARY KEY,status text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),details jsonb NOT NULL DEFAULT '{}');
CREATE OR REPLACE FUNCTION hub_reserve(p_request text,p_slots jsonb,p_quantity int,p_confirm boolean DEFAULT false) RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE s record; used int; requested text; expected int;
BEGIN
 PERFORM 1 FROM hub_requests WHERE id=p_request AND status NOT IN ('cancelled','completed') FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Request is unavailable'; END IF;
 IF p_quantity<1 OR p_quantity>80 THEN RAISE EXCEPTION 'Invalid guest count'; END IF;
 IF jsonb_array_length(p_slots)>50 THEN RAISE EXCEPTION 'Too many slots'; END IF;
 SELECT count(DISTINCT value) INTO expected FROM jsonb_array_elements_text(p_slots);
 IF expected<>jsonb_array_length(p_slots) THEN RAISE EXCEPTION 'Duplicate slots'; END IF;
 FOR requested IN SELECT value FROM jsonb_array_elements_text(p_slots) ORDER BY value LOOP
  SELECT * INTO s FROM hub_slots WHERE id=requested FOR UPDATE;
  IF NOT FOUND OR s.blackout OR s.starts_at<=now() THEN RAISE EXCEPTION 'A selected slot is unavailable'; END IF;
  SELECT COALESCE(sum(quantity),0) INTO used FROM hub_holds WHERE slot_id=requested AND request_id<>p_request AND (state='confirmed' OR (state='held' AND expires_at>now()));
  IF used+p_quantity>s.capacity THEN RAISE EXCEPTION 'Not enough capacity for this group'; END IF;
 END LOOP;
 UPDATE hub_holds SET state='released' WHERE request_id=p_request;
 FOR requested IN SELECT value FROM jsonb_array_elements_text(p_slots) LOOP
  INSERT INTO hub_holds(request_id,slot_id,quantity,expires_at,state) VALUES(p_request,requested,p_quantity,now()+interval '35 minutes',CASE WHEN p_confirm THEN 'confirmed' ELSE 'held' END) ON CONFLICT(request_id,slot_id) DO UPDATE SET quantity=EXCLUDED.quantity,expires_at=EXCLUDED.expires_at,state=EXCLUDED.state;
 END LOOP;
END;
$fn$;
CREATE OR REPLACE FUNCTION hub_apply_payment(p_event text,p_session text,p_amount bigint,p_currency text) RETURNS text LANGUAGE plpgsql AS $fn$
DECLARE session_row record; request_row record;
BEGIN
 INSERT INTO hub_payment_events(id) VALUES(p_event) ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN RETURN 'duplicate'; END IF;
 SELECT * INTO session_row FROM hub_payment_sessions WHERE id=p_session FOR UPDATE;
 IF NOT FOUND OR session_row.amount_minor<>p_amount OR lower(session_row.currency)<>lower(p_currency) THEN RAISE EXCEPTION 'Payment reconciliation failed'; END IF;
 IF session_row.status='paid' THEN RETURN 'duplicate'; END IF;
 SELECT * INTO request_row FROM hub_requests WHERE id=session_row.request_id FOR UPDATE;
 UPDATE hub_payment_sessions SET status='paid' WHERE id=p_session;
 UPDATE hub_requests SET paid_minor=paid_minor+p_amount,payment_status=CASE WHEN status='cancelled' THEN 'refund-review' ELSE 'paid' END,updated_at=now() WHERE id=session_row.request_id;
 IF request_row.status='cancelled' THEN RETURN 'refund-review'; END IF;
 IF EXISTS(SELECT 1 FROM hub_holds WHERE request_id=session_row.request_id AND state='held' AND expires_at<=now()) OR request_row.quote_id<>session_row.quote_id THEN
  UPDATE hub_requests SET payment_status='capacity-review' WHERE id=session_row.request_id;
  RETURN 'capacity-review';
 END IF;
 UPDATE hub_holds SET state='confirmed' WHERE request_id=session_row.request_id AND state='held';
 UPDATE hub_requests SET status='confirmed' WHERE id=session_row.request_id;
 RETURN 'confirmed';
END;
$fn$;
CREATE TABLE IF NOT EXISTS hub_route_cache(id text PRIMARY KEY,data jsonb NOT NULL,expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS hub_provider_usage(provider text NOT NULL,day date NOT NULL DEFAULT current_date,requests int NOT NULL DEFAULT 0,PRIMARY KEY(provider,day));
CREATE TABLE IF NOT EXISTS hub_access_links(token_hash text PRIMARY KEY,plan_id text NOT NULL REFERENCES hub_plans(id),expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days');
CREATE INDEX IF NOT EXISTS hub_access_links_plan ON hub_access_links(plan_id,expires_at);
CREATE TABLE IF NOT EXISTS hub_checkout_leases(request_id text PRIMARY KEY REFERENCES hub_requests(id),owner text NOT NULL,expires_at timestamptz NOT NULL);
