CREATE OR REPLACE FUNCTION hub_save_slot(p_id text,p_item text,p_start timestamptz,p_end timestamptz,p_capacity int,p_blackout boolean) RETURNS text LANGUAGE plpgsql AS $fn$
DECLARE old_row record; used int;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('slot:'||p_item,0));
 SELECT * INTO old_row FROM hub_slots WHERE id=p_id FOR UPDATE;
 IF FOUND THEN
  IF old_row.item_id<>p_item THEN RAISE EXCEPTION 'Slot belongs to another service'; END IF;
  SELECT COALESCE(sum(quantity),0) INTO used FROM hub_holds WHERE slot_id=p_id AND (state='confirmed' OR (state='held' AND expires_at>now()));
  IF used>p_capacity THEN RAISE EXCEPTION 'Capacity is below existing reservations'; END IF;
  UPDATE hub_slots SET capacity=p_capacity,blackout=p_blackout WHERE id=p_id;
 ELSE
  IF EXISTS(SELECT 1 FROM hub_slots WHERE item_id=p_item AND starts_at<p_end AND ends_at>p_start) THEN RAISE EXCEPTION 'Overlapping service slots are not allowed'; END IF;
  INSERT INTO hub_slots(id,item_id,starts_at,ends_at,capacity,blackout) VALUES(p_id,p_item,p_start,p_end,p_capacity,p_blackout);
 END IF;
 RETURN p_id;
END;
$fn$;
