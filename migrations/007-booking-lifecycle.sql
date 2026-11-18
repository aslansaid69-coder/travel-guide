ALTER TABLE hub_requests ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
CREATE OR REPLACE FUNCTION platform_cancel_request(p_request text,p_actor text) RETURNS boolean LANGUAGE plpgsql AS $fn$
DECLARE booking_row record;
BEGIN
 SELECT * INTO booking_row FROM hub_requests WHERE id=p_request FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Booking missing'; END IF;
 IF booking_row.status='cancelled' THEN RETURN false; END IF;
 UPDATE hub_requests SET status='cancelled',cancelled_at=COALESCE(cancelled_at,now()),payment_status=CASE WHEN paid_minor>0 THEN 'refund-review' ELSE payment_status END,updated_at=now() WHERE id=p_request;
 UPDATE hub_holds SET state='released' WHERE request_id=p_request;
 INSERT INTO hub_notifications(id,recipient,subject,body) SELECT 'guide-cancel:'||p_request||':'||g.id,g.data->>'email','Tour cancellation update','This tour has been cancelled. Open your guide workspace for current assignments.' FROM guides g JOIN guide_assignments a ON a.guide_id=g.id WHERE a.request_id=p_request AND a.status IN ('offered','accepted','started','completion_requested') ON CONFLICT DO NOTHING;
 UPDATE guide_assignments SET status='cancelled',updated_at=now() WHERE request_id=p_request AND status IN ('offered','accepted','started','completion_requested');
 INSERT INTO hub_messages(request_id,actor,visibility,body) VALUES(p_request,p_actor,'client','Cancellation requested. Refund eligibility uses the accepted quote and the recorded cancellation request time.');
 RETURN true;
END;
$fn$;
CREATE OR REPLACE FUNCTION platform_schedule_change(p_request text,p_start timestamptz,p_end timestamptz,p_currency text) RETURNS int LANGUAGE plpgsql AS $fn$
DECLARE changed int;
BEGIN
 PERFORM 1 FROM hub_requests WHERE id=p_request FOR UPDATE;
 IF EXISTS(SELECT 1 FROM guide_assignments WHERE request_id=p_request AND status IN ('started','completion_requested') AND (p_start IS NULL OR starts_at<>p_start OR ends_at<>p_end OR currency<>p_currency)) THEN RAISE EXCEPTION 'Coordinate a running trip before changing its schedule'; END IF;
 INSERT INTO hub_notifications(id,recipient,subject,body) SELECT 'guide-schedule:'||p_request||':'||g.id||':'||md5(COALESCE(p_start::text,'none')||COALESCE(p_end::text,'none')||p_currency),g.data->>'email','Tour schedule updated','The manager changed this tour’s schedule. Your prior assignment is closed; review and accept any new offer in your guide workspace.' FROM guides g JOIN guide_assignments a ON a.guide_id=g.id WHERE a.request_id=p_request AND a.status IN ('offered','accepted') AND (p_start IS NULL OR a.starts_at<>p_start OR a.ends_at<>p_end OR a.currency<>p_currency) ON CONFLICT DO NOTHING;
 UPDATE guide_assignments SET status='schedule-changed',updated_at=now() WHERE request_id=p_request AND status IN ('offered','accepted') AND (p_start IS NULL OR starts_at<>p_start OR ends_at<>p_end OR currency<>p_currency);
 GET DIAGNOSTICS changed=ROW_COUNT;
 RETURN changed;
END;
$fn$;

CREATE OR REPLACE FUNCTION platform_complete_request(p_request text) RETURNS boolean LANGUAGE plpgsql AS $fn$
BEGIN
 PERFORM 1 FROM hub_requests WHERE id=p_request FOR UPDATE;
 IF EXISTS(SELECT 1 FROM guide_assignments WHERE request_id=p_request AND status IN ('offered','accepted','started','completion_requested')) THEN RAISE EXCEPTION 'Approve guide completion first'; END IF;
 UPDATE hub_requests SET status='completed',version=version+1,updated_at=now() WHERE id=p_request;
 RETURN true;
END;
$fn$;
