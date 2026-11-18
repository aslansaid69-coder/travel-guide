ALTER TABLE staff_roles DROP CONSTRAINT IF EXISTS staff_roles_role_check;
ALTER TABLE staff_roles ADD CONSTRAINT staff_roles_role_check CHECK(role IN ('owner','manager','partner','guide'));
ALTER TABLE hub_messages ADD COLUMN IF NOT EXISTS extra jsonb NOT NULL DEFAULT '{}';
ALTER TABLE hub_payment_sessions ADD COLUMN IF NOT EXISTS payment_intent text;
ALTER TABLE hub_payment_sessions ADD COLUMN IF NOT EXISTS charge_id text;
ALTER TABLE hub_payment_sessions ADD COLUMN IF NOT EXISTS receipt_url text;
ALTER TABLE hub_payment_sessions ADD COLUMN IF NOT EXISTS refunded_minor bigint NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS platform_settings(id boolean PRIMARY KEY DEFAULT true CHECK(id),data jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS research_drafts(id text PRIMARY KEY,query text NOT NULL,data jsonb NOT NULL,status text NOT NULL DEFAULT 'pending',actor text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS research_cache(key text PRIMARY KEY,data jsonb NOT NULL,expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS research_sources(host text PRIMARY KEY,note text NOT NULL,actor text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS research_watches(item_id text PRIMARY KEY REFERENCES hub_catalog(id),url text NOT NULL,last_checked timestamptz,snapshot jsonb,status text NOT NULL DEFAULT 'pending',last_error text);
CREATE TABLE IF NOT EXISTS guides(id text PRIMARY KEY,user_id text UNIQUE,data jsonb NOT NULL,status text NOT NULL DEFAULT 'draft',stripe_account text,stripe_ready boolean NOT NULL DEFAULT false,terms_accepted text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS guide_invites(token_hash text PRIMARY KEY,guide_id text NOT NULL REFERENCES guides(id),email text NOT NULL,expires_at timestamptz NOT NULL DEFAULT now()+interval '14 days',used_at timestamptz);
CREATE TABLE IF NOT EXISTS guide_availability(id text PRIMARY KEY,guide_id text NOT NULL REFERENCES guides(id),starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL,blocked boolean NOT NULL DEFAULT false,CHECK(ends_at>starts_at));
CREATE TABLE IF NOT EXISTS guide_assignments(id text PRIMARY KEY,request_id text NOT NULL REFERENCES hub_requests(id),guide_id text NOT NULL REFERENCES guides(id),status text NOT NULL DEFAULT 'offered',starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,fee_minor bigint NOT NULL CHECK(fee_minor>=0),commission_percent numeric NOT NULL CHECK(commission_percent BETWEEN 0 AND 60),currency text NOT NULL,completion_approved boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),CHECK(ends_at>starts_at));
CREATE UNIQUE INDEX IF NOT EXISTS guide_assignment_active ON guide_assignments(request_id) WHERE status IN ('offered','accepted','started','completion_requested');
CREATE INDEX IF NOT EXISTS guide_workload ON guide_assignments(guide_id,starts_at,ends_at);
CREATE TABLE IF NOT EXISTS guide_reviews(id text PRIMARY KEY,assignment_id text UNIQUE NOT NULL REFERENCES guide_assignments(id),rating int NOT NULL CHECK(rating BETWEEN 1 AND 5),body text NOT NULL,status text NOT NULL DEFAULT 'pending',created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS private_assets(id text PRIMARY KEY,request_id text NOT NULL REFERENCES hub_requests(id),actor text NOT NULL,mime text NOT NULL,data bytea NOT NULL,caption text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS safety_events(id text PRIMARY KEY,request_id text NOT NULL REFERENCES hub_requests(id),actor text NOT NULL,kind text NOT NULL,data jsonb NOT NULL DEFAULT '{}',resolved_at timestamptz,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS platform_quote_terms(quote_id text PRIMARY KEY REFERENCES hub_quotes(id),data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS platform_checkout(request_id text PRIMARY KEY REFERENCES hub_requests(id),promo_code text,voucher_code text,discount_minor bigint NOT NULL DEFAULT 0,voucher_minor bigint NOT NULL DEFAULT 0,terms_version text,terms_accepted_at timestamptz,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS platform_codes(code text PRIMARY KEY,data jsonb NOT NULL,balance_minor bigint NOT NULL DEFAULT 0,uses int NOT NULL DEFAULT 0,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS platform_redemptions(request_id text NOT NULL REFERENCES hub_requests(id),code text NOT NULL REFERENCES platform_codes(code),quote_id text NOT NULL,kind text NOT NULL,value_minor bigint NOT NULL,status text NOT NULL DEFAULT 'held',expires_at timestamptz NOT NULL,PRIMARY KEY(request_id,code));
CREATE TABLE IF NOT EXISTS platform_documents(id text PRIMARY KEY,request_id text NOT NULL REFERENCES hub_requests(id),payment_id text UNIQUE,kind text NOT NULL,data jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS platform_refunds(id text PRIMARY KEY,request_id text NOT NULL REFERENCES hub_requests(id),payment_id text NOT NULL REFERENCES hub_payment_sessions(id),provider_id text UNIQUE,amount_minor bigint NOT NULL CHECK(amount_minor>0),status text NOT NULL DEFAULT 'requested',reason text NOT NULL,actor text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS guide_transfers(id text PRIMARY KEY,assignment_id text NOT NULL REFERENCES guide_assignments(id),payment_id text NOT NULL REFERENCES hub_payment_sessions(id),guide_id text NOT NULL REFERENCES guides(id),amount_minor bigint NOT NULL CHECK(amount_minor>0),currency text NOT NULL,provider_id text UNIQUE,reversed_minor bigint NOT NULL DEFAULT 0,status text NOT NULL DEFAULT 'pending',last_error text,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(assignment_id,payment_id));
CREATE TABLE IF NOT EXISTS transfer_reversals(id text PRIMARY KEY,transfer_id text NOT NULL REFERENCES guide_transfers(id),refund_id text NOT NULL REFERENCES platform_refunds(id),amount_minor bigint NOT NULL,provider_id text,status text NOT NULL DEFAULT 'pending',UNIQUE(transfer_id,refund_id));
CREATE TABLE IF NOT EXISTS bot_links(id text PRIMARY KEY,user_id text,plan_id text REFERENCES hub_plans(id),channel text NOT NULL,address text NOT NULL,active boolean NOT NULL DEFAULT true,consent boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(channel,address));
CREATE TABLE IF NOT EXISTS bot_pairings(token_hash text PRIMARY KEY,user_id text,plan_id text REFERENCES hub_plans(id),channel text NOT NULL,expires_at timestamptz NOT NULL DEFAULT now()+interval '15 minutes',used_at timestamptz);
CREATE TABLE IF NOT EXISTS bot_updates(id text PRIMARY KEY,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS waitlist(id text PRIMARY KEY,email text NOT NULL,user_id text,item_id text NOT NULL REFERENCES hub_catalog(id),guests int NOT NULL CHECK(guests BETWEEN 1 AND 80),confirmed boolean NOT NULL DEFAULT false,token_hash text NOT NULL,active boolean NOT NULL DEFAULT true,last_notice text,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS platform_deals(id text PRIMARY KEY,item_id text NOT NULL REFERENCES hub_catalog(id),percent numeric NOT NULL CHECK(percent BETWEEN 0 AND 80),starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL,active boolean NOT NULL DEFAULT true,note text NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS loyalty_accounts(user_id text PRIMARY KEY,referral_code text UNIQUE NOT NULL,points int NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS referral_rewards(request_id text PRIMARY KEY REFERENCES hub_requests(id),referrer_id text NOT NULL,status text NOT NULL DEFAULT 'pending',code text,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS guide_followups(id text PRIMARY KEY,request_id text NOT NULL REFERENCES hub_requests(id),guide_id text NOT NULL REFERENCES guides(id),data jsonb NOT NULL,status text NOT NULL DEFAULT 'pending',new_request_id text,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS platform_jobs(key text PRIMARY KEY,status text NOT NULL DEFAULT 'running',details jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz);
CREATE OR REPLACE FUNCTION platform_offer_guide(p_id text,p_request text,p_guide text,p_start timestamptz,p_end timestamptz,p_fee bigint,p_expiry timestamptz) RETURNS text LANGUAGE plpgsql AS $fn$
DECLARE profile record;
BEGIN
 PERFORM 1 FROM hub_requests WHERE id=p_request AND status NOT IN ('cancelled','completed') FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Request is closed'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('guide:'||p_guide,0));
 SELECT * INTO profile FROM guides WHERE id=p_guide AND status='active' FOR UPDATE;
 IF NOT FOUND OR profile.user_id IS NULL OR profile.terms_accepted IS NULL THEN RAISE EXCEPTION 'Guide is unavailable'; END IF;
 IF EXISTS(SELECT 1 FROM guide_assignments WHERE guide_id=p_guide AND starts_at<p_end AND ends_at>p_start AND (status IN ('accepted','started','completion_requested') OR (status='offered' AND expires_at>now()))) THEN RAISE EXCEPTION 'Guide is already booked'; END IF;
 IF NOT EXISTS(SELECT 1 FROM guide_availability WHERE guide_id=p_guide AND blocked=false AND starts_at<=p_start AND ends_at>=p_end) OR EXISTS(SELECT 1 FROM guide_availability WHERE guide_id=p_guide AND blocked=true AND starts_at<p_end AND ends_at>p_start) THEN RAISE EXCEPTION 'Guide calendar does not cover the trip'; END IF;
 UPDATE guide_assignments SET status='expired',updated_at=now() WHERE request_id=p_request AND status='offered' AND expires_at<=now();
 INSERT INTO guide_assignments(id,request_id,guide_id,starts_at,ends_at,expires_at,fee_minor,commission_percent,currency) VALUES(p_id,p_request,p_guide,p_start,p_end,p_expiry,p_fee,(profile.data->>'commissionPercent')::numeric,profile.data->>'currency');
 RETURN p_id;
END;
$fn$;
CREATE OR REPLACE FUNCTION platform_lock_discounts(p_request text,p_total bigint,p_currency text,p_customer text) RETURNS jsonb LANGUAGE plpgsql AS $fn$
DECLARE checkout_row record; code_row record; redemption record; code_value text; requested_codes text[]; applied_total bigint:=0; discount_total bigint:=0; voucher_total bigint:=0; remaining bigint; held_elsewhere bigint; amount bigint; kind_value text;
BEGIN
 PERFORM 1 FROM hub_requests WHERE id=p_request AND status<>'cancelled' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Order is closed'; END IF;
 SELECT * INTO checkout_row FROM platform_checkout WHERE request_id=p_request FOR UPDATE;
 IF NOT FOUND THEN INSERT INTO platform_checkout(request_id) VALUES(p_request); SELECT * INTO checkout_row FROM platform_checkout WHERE request_id=p_request; END IF;
 IF checkout_row.promo_code IS NOT NULL AND checkout_row.promo_code=checkout_row.voucher_code THEN RAISE EXCEPTION 'Use a code once only'; END IF;
 requested_codes:=array_remove(ARRAY[checkout_row.promo_code,checkout_row.voucher_code],NULL);
 PERFORM 1 FROM platform_codes WHERE code=ANY(requested_codes) ORDER BY code FOR UPDATE;
 FOR code_value IN SELECT unnest(requested_codes) LOOP
  SELECT * INTO code_row FROM platform_codes WHERE code=code_value FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Code not found'; END IF;
  SELECT * INTO redemption FROM platform_redemptions WHERE request_id=p_request AND code=code_value;
  IF FOUND AND redemption.status='applied' THEN
   IF redemption.kind='voucher' THEN voucher_total:=voucher_total+redemption.value_minor; ELSE discount_total:=discount_total+redemption.value_minor; END IF;
   CONTINUE;
  END IF;
  IF NOT (code_row.data->>'active')::boolean OR (code_row.data->>'startsAt')::timestamptz>now() OR (code_row.data->>'expiresAt')::timestamptz<now() OR code_row.data->>'currency'<>p_currency OR (code_row.data->>'minimumMinor')::bigint>p_total THEN RAISE EXCEPTION 'Code is unavailable for this order'; END IF;
  IF COALESCE(code_row.data->>'customerId','')<>'' AND code_row.data->>'customerId'<>p_customer THEN RAISE EXCEPTION 'Code requires the verified recipient account'; END IF;
  SELECT count(*) INTO held_elsewhere FROM platform_redemptions WHERE code=code_value AND request_id<>p_request AND status='held' AND expires_at>now();
  IF code_row.uses+held_elsewhere>=(code_row.data->>'maxUses')::int THEN RAISE EXCEPTION 'Code usage limit reached'; END IF;
  kind_value:=CASE WHEN code_row.data->>'kind' IN ('voucher','loyalty') THEN 'voucher' ELSE 'promo' END;
  IF (code_value=checkout_row.promo_code AND kind_value<>'promo') OR (code_value=checkout_row.voucher_code AND kind_value<>'voucher') THEN RAISE EXCEPTION 'Wrong code type'; END IF;
  remaining:=greatest(0,p_total-discount_total-voucher_total);
  IF kind_value='voucher' THEN
   SELECT COALESCE(sum(value_minor),0) INTO held_elsewhere FROM platform_redemptions WHERE code=code_value AND request_id<>p_request AND status='held' AND expires_at>now();
   amount:=least(remaining,greatest(0,code_row.balance_minor-held_elsewhere));
  ELSE amount:=least(remaining,greatest((p_total*(code_row.data->>'percent')::numeric/100)::bigint,(code_row.data->>'amountMinor')::bigint)); END IF;
  IF amount<=0 THEN RAISE EXCEPTION 'Code has no available value'; END IF;
  INSERT INTO platform_redemptions(request_id,code,quote_id,kind,value_minor,expires_at,status) SELECT p_request,code_value,quote_id,kind_value,amount,now()+interval '35 minutes','held' FROM hub_requests WHERE id=p_request ON CONFLICT(request_id,code) DO UPDATE SET quote_id=EXCLUDED.quote_id,kind=EXCLUDED.kind,value_minor=EXCLUDED.value_minor,expires_at=EXCLUDED.expires_at,status='held';
  IF kind_value='voucher' THEN voucher_total:=voucher_total+amount; ELSE discount_total:=discount_total+amount; END IF;
 END LOOP;
 UPDATE platform_checkout SET discount_minor=discount_total,voucher_minor=voucher_total,updated_at=now() WHERE request_id=p_request;
 RETURN jsonb_build_object('discountMinor',discount_total,'voucherMinor',voucher_total,'totalMinor',greatest(0,p_total-discount_total-voucher_total));
END;
$fn$;
CREATE OR REPLACE FUNCTION platform_apply_discounts(p_request text) RETURNS boolean LANGUAGE plpgsql AS $fn$
DECLARE redemption record; current_balance bigint;
BEGIN
 PERFORM 1 FROM hub_requests WHERE id=p_request AND status<>'cancelled' AND payment_status IN ('paid','deposit-paid','pay-on-arrival','voucher-paid') FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM platform_checkout c, LATERAL unnest(array_remove(ARRAY[c.promo_code,c.voucher_code],NULL)) AS candidate(value) WHERE c.request_id=p_request AND NOT EXISTS(SELECT 1 FROM platform_redemptions d WHERE d.request_id=p_request AND d.code=candidate.value AND (d.status='applied' OR d.status='held' AND d.expires_at>now()))) THEN
  UPDATE hub_requests SET payment_status='pricing-review',status='quote-sent' WHERE id=p_request;
  UPDATE hub_holds SET state='released' WHERE request_id=p_request;
  RETURN false;
 END IF;
 FOR redemption IN SELECT * FROM platform_redemptions WHERE request_id=p_request AND status='held' ORDER BY code LOOP
  SELECT balance_minor INTO current_balance FROM platform_codes WHERE code=redemption.code FOR UPDATE;
  IF redemption.expires_at<now() OR (redemption.kind='voucher' AND current_balance<redemption.value_minor) THEN
   UPDATE hub_requests SET payment_status='pricing-review',status='quote-sent' WHERE id=p_request;
   UPDATE hub_holds SET state='released' WHERE request_id=p_request;
   RETURN false;
  END IF;
 END LOOP;
 FOR redemption IN SELECT * FROM platform_redemptions WHERE request_id=p_request AND status='held' ORDER BY code LOOP
  UPDATE platform_codes SET balance_minor=CASE WHEN redemption.kind='voucher' THEN balance_minor-redemption.value_minor ELSE balance_minor END,uses=uses+1 WHERE code=redemption.code;
  UPDATE platform_redemptions SET status='applied' WHERE request_id=p_request AND code=redemption.code;
 END LOOP;
 RETURN true;
END;
$fn$;
CREATE OR REPLACE FUNCTION platform_claim_guide(p_hash text,p_user text,p_email text,p_terms text) RETURNS text LANGUAGE plpgsql AS $fn$
DECLARE invitation record; existing_role text; existing_user text;
BEGIN
 SELECT * INTO invitation FROM guide_invites WHERE token_hash=p_hash AND used_at IS NULL AND expires_at>now() FOR UPDATE;
 IF NOT FOUND OR lower(invitation.email)<>lower(p_email) THEN RAISE EXCEPTION 'Invitation invalid'; END IF;
 SELECT role INTO existing_role FROM staff_roles WHERE user_id=p_user FOR UPDATE;
 IF existing_role IS NOT NULL AND existing_role<>'guide' THEN RAISE EXCEPTION 'Existing staff role cannot be replaced'; END IF;
 SELECT user_id INTO existing_user FROM guides WHERE id=invitation.guide_id AND status<>'removed' FOR UPDATE;
 IF NOT FOUND OR (existing_user IS NOT NULL AND existing_user<>p_user) THEN RAISE EXCEPTION 'Guide already claimed'; END IF;
 UPDATE guides SET user_id=p_user,terms_accepted=p_terms,updated_at=now() WHERE id=invitation.guide_id;
 INSERT INTO staff_roles(user_id,email,role) VALUES(p_user,p_email,'guide') ON CONFLICT(user_id) DO NOTHING;
 UPDATE guide_invites SET used_at=now() WHERE token_hash=p_hash;
 RETURN invitation.guide_id;
END;
$fn$;
CREATE OR REPLACE FUNCTION platform_guide_action(p_id text,p_guide text,p_action text) RETURNS text LANGUAGE plpgsql AS $fn$
DECLARE assignment record;
BEGIN
 SELECT * INTO assignment FROM guide_assignments WHERE id=p_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Assignment missing'; END IF;
 PERFORM 1 FROM hub_requests WHERE id=assignment.request_id AND status NOT IN ('cancelled','completed') FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Request closed'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('guide:'||p_guide,0));
 SELECT * INTO assignment FROM guide_assignments WHERE id=p_id AND guide_id=p_guide FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Assignment unavailable'; END IF;
 IF p_action IN ('accept','decline') THEN
  IF assignment.status<>'offered' OR assignment.expires_at<=now() THEN RAISE EXCEPTION 'Offer expired'; END IF;
  IF p_action='accept' THEN
   IF NOT EXISTS(SELECT 1 FROM guides WHERE id=p_guide AND status='active') OR EXISTS(SELECT 1 FROM guide_assignments WHERE id<>p_id AND guide_id=p_guide AND starts_at<assignment.ends_at AND ends_at>assignment.starts_at AND status IN ('accepted','started','completion_requested')) OR NOT EXISTS(SELECT 1 FROM guide_availability WHERE guide_id=p_guide AND blocked=false AND starts_at<=assignment.starts_at AND ends_at>=assignment.ends_at) OR EXISTS(SELECT 1 FROM guide_availability WHERE guide_id=p_guide AND blocked=true AND starts_at<assignment.ends_at AND ends_at>assignment.starts_at) THEN RAISE EXCEPTION 'Calendar changed'; END IF;
  END IF;
  UPDATE guide_assignments SET status=CASE WHEN p_action='accept' THEN 'accepted' ELSE 'declined' END,updated_at=now() WHERE id=p_id;
 ELSIF p_action='start' THEN
  IF assignment.status<>'accepted' OR NOT EXISTS(SELECT 1 FROM hub_requests WHERE id=assignment.request_id AND status='confirmed') OR now()<assignment.starts_at-interval '2 hours' THEN RAISE EXCEPTION 'Tour not ready'; END IF;
  UPDATE guide_assignments SET status='started',updated_at=now() WHERE id=p_id;
 ELSIF p_action='complete' THEN
  IF assignment.status<>'started' OR now()<assignment.ends_at THEN RAISE EXCEPTION 'Tour has not ended'; END IF;
  UPDATE guide_assignments SET status='completion_requested',updated_at=now() WHERE id=p_id;
 ELSE RAISE EXCEPTION 'Unknown action'; END IF;
 RETURN assignment.request_id;
END;
$fn$;
CREATE OR REPLACE FUNCTION platform_apply_refund(p_id text,p_provider text,p_status text,p_amount bigint) RETURNS text LANGUAGE plpgsql AS $fn$
DECLARE refund_row record;
BEGIN
 SELECT * INTO refund_row FROM platform_refunds WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR refund_row.amount_minor<>p_amount OR (refund_row.provider_id IS NOT NULL AND refund_row.provider_id<>p_provider) THEN RAISE EXCEPTION 'Refund mismatch'; END IF;
 IF refund_row.status='succeeded' THEN RETURN 'duplicate'; END IF;
 UPDATE platform_refunds SET provider_id=p_provider,status=p_status WHERE id=p_id;
 IF p_status='succeeded' THEN
  UPDATE hub_payment_sessions SET refunded_minor=refunded_minor+p_amount WHERE id=refund_row.payment_id;
  UPDATE hub_requests SET paid_minor=greatest(0,paid_minor-p_amount),payment_status=CASE WHEN paid_minor<=p_amount THEN 'refunded' ELSE 'partially-refunded' END,updated_at=now() WHERE id=refund_row.request_id;
 END IF;
 RETURN p_status;
END;
$fn$;
CREATE TABLE IF NOT EXISTS whatsapp_windows(address text PRIMARY KEY,last_inbound timestamptz NOT NULL);
CREATE OR REPLACE FUNCTION platform_reward_referral(p_request text,p_reward bigint) RETURNS boolean LANGUAGE plpgsql AS $fn$
DECLARE reward record; customer text; currency_value text; code_value text;
BEGIN
 SELECT * INTO reward FROM referral_rewards WHERE request_id=p_request AND status='pending' FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT p.client_id,r.currency INTO customer,currency_value FROM hub_requests r JOIN hub_plans p ON p.id=r.plan_id WHERE r.id=p_request AND r.status='completed' AND r.payment_status='paid' AND r.paid_minor>0;
 IF NOT FOUND OR customer IS NULL OR customer=reward.referrer_id OR EXISTS(SELECT 1 FROM platform_refunds WHERE request_id=p_request AND status<>'failed') OR EXISTS(SELECT 1 FROM hub_requests r JOIN hub_plans p ON p.id=r.plan_id WHERE p.client_id=customer AND r.id<>p_request AND r.paid_minor>0 AND r.created_at<(SELECT created_at FROM hub_requests WHERE id=p_request)) THEN UPDATE referral_rewards SET status='ineligible' WHERE request_id=p_request; RETURN false; END IF;
 code_value:='THANKS-'||upper(substr(replace(p_request,'-',''),1,24));
 INSERT INTO platform_codes(code,data,balance_minor) VALUES(code_value,jsonb_build_object('code',code_value,'kind','loyalty','percent',0,'amountMinor',p_reward,'currency',currency_value,'maxUses',1,'minimumMinor',0,'customerId',reward.referrer_id,'startsAt',now(),'expiresAt',now()+interval '1 year','active',true),p_reward) ON CONFLICT DO NOTHING;
 UPDATE loyalty_accounts SET points=points+100 WHERE user_id=reward.referrer_id;
 UPDATE referral_rewards SET status='rewarded',code=code_value WHERE request_id=p_request;
 RETURN true;
END;
$fn$;
CREATE UNIQUE INDEX IF NOT EXISTS bot_message_unique ON hub_messages((extra->>'botUpdate')) WHERE extra ? 'botUpdate';
CREATE OR REPLACE FUNCTION platform_calendar(p_id text,p_guide text,p_start timestamptz,p_end timestamptz,p_blocked boolean) RETURNS text LANGUAGE plpgsql AS $fn$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('guide:'||p_guide,0));
 IF p_end<=p_start THEN RAISE EXCEPTION 'Invalid interval'; END IF;
 IF p_blocked AND EXISTS(SELECT 1 FROM guide_assignments WHERE guide_id=p_guide AND status IN ('accepted','started','completion_requested') AND starts_at<p_end AND ends_at>p_start) THEN RAISE EXCEPTION 'Accepted tour overlaps'; END IF;
 INSERT INTO guide_availability(id,guide_id,starts_at,ends_at,blocked) VALUES(p_id,p_guide,p_start,p_end,p_blocked);
 RETURN p_id;
END;
$fn$;
CREATE TABLE IF NOT EXISTS platform_cash(id text PRIMARY KEY,request_id text NOT NULL REFERENCES hub_requests(id),amount_minor bigint NOT NULL CHECK(amount_minor>0),currency text NOT NULL,actor text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE OR REPLACE FUNCTION platform_record_cash(p_id text,p_request text,p_amount bigint,p_actor text) RETURNS boolean LANGUAGE plpgsql AS $fn$
DECLARE booking_row record; total_due bigint;
BEGIN
 SELECT * INTO booking_row FROM hub_requests WHERE id=p_request FOR UPDATE;
 IF EXISTS(SELECT 1 FROM platform_cash WHERE id=p_id AND request_id=p_request) THEN RETURN false; END IF;
 IF booking_row.status NOT IN ('confirmed','completed') OR p_amount<=0 THEN RAISE EXCEPTION 'Confirmed booking and a positive cash amount required'; END IF;
 SELECT q.amount_minor-COALESCE(c.discount_minor,0)-COALESCE(c.voucher_minor,0) INTO total_due FROM hub_quotes q LEFT JOIN platform_checkout c ON c.request_id=p_request WHERE q.id=booking_row.quote_id AND q.status='approved';
 IF total_due IS NULL OR p_amount>total_due-booking_row.paid_minor THEN RAISE EXCEPTION 'Cash exceeds the outstanding balance'; END IF;
 INSERT INTO platform_cash(id,request_id,amount_minor,currency,actor) VALUES(p_id,p_request,p_amount,booking_row.currency,p_actor);
 UPDATE hub_requests SET paid_minor=paid_minor+p_amount,payment_status=CASE WHEN paid_minor+p_amount>=total_due THEN 'cash-paid' ELSE 'cash-deposit' END,updated_at=now() WHERE id=p_request;
 INSERT INTO platform_documents(id,request_id,payment_id,kind,data) VALUES(p_id,p_request,p_id,'cash-acknowledgment',jsonb_build_object('number','CASH-'||p_id,'amountMinor',p_amount,'currency',booking_row.currency,'paidAt',now(),'operatorTaxId',''));
 RETURN true;
END;
$fn$;
CREATE TABLE IF NOT EXISTS platform_cash_refunds(id text PRIMARY KEY,request_id text NOT NULL REFERENCES hub_requests(id),amount_minor bigint NOT NULL CHECK(amount_minor>0),actor text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE OR REPLACE FUNCTION platform_record_cash_refund(p_id text,p_request text,p_amount bigint,p_actor text) RETURNS boolean LANGUAGE plpgsql AS $fn$
DECLARE booking_row record; cash_available bigint;
BEGIN
 SELECT * INTO booking_row FROM hub_requests WHERE id=p_request FOR UPDATE;
 IF EXISTS(SELECT 1 FROM platform_cash_refunds WHERE id=p_id AND request_id=p_request) THEN RETURN false; END IF;
 SELECT COALESCE((SELECT sum(amount_minor) FROM platform_cash WHERE request_id=p_request),0)-COALESCE((SELECT sum(amount_minor) FROM platform_cash_refunds WHERE request_id=p_request),0) INTO cash_available;
 IF booking_row.status<>'cancelled' OR p_amount<=0 OR p_amount>cash_available OR p_amount>booking_row.paid_minor THEN RAISE EXCEPTION 'Invalid actual cash refund'; END IF;
 INSERT INTO platform_cash_refunds(id,request_id,amount_minor,actor) VALUES(p_id,p_request,p_amount,p_actor);
 UPDATE hub_requests SET paid_minor=paid_minor-p_amount,payment_status=CASE WHEN paid_minor<=p_amount THEN 'refunded' ELSE 'partially-refunded' END,updated_at=now() WHERE id=p_request;
 INSERT INTO platform_documents(id,request_id,payment_id,kind,data) VALUES(p_id,p_request,p_id,'cash-refund-acknowledgment',jsonb_build_object('number','CASH-REFUND-'||p_id,'amountMinor',-p_amount,'currency',booking_row.currency,'paidAt',now(),'operatorTaxId',''));
 RETURN true;
END;
$fn$;
CREATE OR REPLACE FUNCTION platform_reassign_guide(p_id text) RETURNS text LANGUAGE plpgsql AS $fn$
DECLARE assignment record;
BEGIN
 SELECT * INTO assignment FROM guide_assignments WHERE id=p_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Assignment missing'; END IF;
 PERFORM 1 FROM hub_requests WHERE id=assignment.request_id AND status NOT IN ('cancelled','completed') FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Booking closed'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('guide:'||assignment.guide_id,0));
 UPDATE guide_assignments SET status='reassigned',updated_at=now() WHERE id=p_id AND status IN ('offered','accepted');
 IF NOT FOUND THEN RAISE EXCEPTION 'A started trip needs direct manager coordination'; END IF;
 RETURN assignment.request_id;
END;
$fn$;

-- Preserve completion when an established package pays its remaining balance.
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
 UPDATE hub_requests SET status=CASE WHEN request_row.status='completed' THEN 'completed' ELSE 'confirmed' END WHERE id=session_row.request_id;
 RETURN CASE WHEN request_row.status='completed' THEN 'completed' ELSE 'confirmed' END;
END;
$fn$;
