CREATE OR REPLACE FUNCTION platform_accept_followup(p_id text,p_version text,p_plan text,p_hash text,p_request text,p_quote text,p_user text,p_manager text,p_slots jsonb,p_assignment text,p_start timestamptz,p_end timestamptz,p_fee bigint) RETURNS text LANGUAGE plpgsql AS $fn$
DECLARE offer record; parent record; data_plan jsonb; terms jsonb;
BEGIN
 SELECT * INTO offer FROM guide_followups WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR offer.status NOT IN ('approved','accepted') OR (offer.data->>'offerVersion') IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'Offer changed or unavailable'; END IF;
 IF offer.new_request_id IS NOT NULL THEN RETURN offer.new_request_id; END IF;
 SELECT * INTO parent FROM hub_requests WHERE id=offer.request_id;
 IF parent.status<>'completed' THEN RAISE EXCEPTION 'Original trip is not completed'; END IF;
 data_plan:=offer.data->'plan'; terms:=offer.data->'policy';
 IF (data_plan->>'startDate')::date<(now() AT TIME ZONE 'Asia/Almaty')::date OR (offer.data->'quote'->>'amountMinor')::bigint<0 THEN RAISE EXCEPTION 'Offer expired'; END IF;
 INSERT INTO hub_plans(id,edit_hash,data,client_id,email) VALUES(p_plan,p_hash,data_plan,p_user,parent.guest->>'email');
 INSERT INTO hub_requests(id,plan_id,guest,intent,assigned_to,idempotency_key,quote_id,currency,status) VALUES(p_request,p_plan,parent.guest,'booking',p_manager,'followup:'||p_id,p_quote,offer.data->'quote'->>'currency','quote-sent');
 INSERT INTO hub_quotes(id,request_id,plan_version,plan,breakdown,amount_minor,currency,deposit_percent,terms,status,approved_at) VALUES(p_quote,p_request,1,data_plan,jsonb_build_object('followup',p_id),(offer.data->'quote'->>'amountMinor')::bigint,offer.data->'quote'->>'currency',(offer.data->'quote'->>'depositPercent')::int,offer.data->'quote'->>'terms','approved',now());
 INSERT INTO platform_quote_terms(quote_id,data) VALUES(p_quote,terms);
 INSERT INTO platform_checkout(request_id,terms_version,terms_accepted_at) VALUES(p_request,terms->>'version',now());
 PERFORM hub_reserve(p_request,p_slots,(data_plan->>'adults')::int+(data_plan->>'children')::int,false);
 PERFORM platform_offer_guide(p_assignment,p_request,offer.guide_id,p_start,p_end,p_fee,now()+interval '30 minutes');
 UPDATE guide_followups SET status='accepted',new_request_id=p_request WHERE id=p_id;
 INSERT INTO hub_messages(request_id,actor,visibility,body) VALUES(p_request,'client','client','Accepted the manager-approved follow-up offer and its payment/cancellation terms.');
 RETURN p_request;
END;
$fn$;
ALTER TABLE hub_payment_sessions ADD COLUMN IF NOT EXISTS invoice_url text;
ALTER TABLE hub_payment_sessions ADD COLUMN IF NOT EXISTS invoice_hosted_url text;
ALTER TABLE hub_payment_sessions ADD COLUMN IF NOT EXISTS invoice_number text;
ALTER TABLE hub_payment_sessions ADD COLUMN IF NOT EXISTS invoice_reference text;
ALTER TABLE hub_payment_sessions ADD COLUMN IF NOT EXISTS invoice_id text;
CREATE UNIQUE INDEX IF NOT EXISTS hub_payment_invoice_reference ON hub_payment_sessions(invoice_reference) WHERE invoice_reference IS NOT NULL;
