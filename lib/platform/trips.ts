import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { database } from "@/lib/db";
import { audit, catalog, settings } from "@/lib/hub/store";
import { HttpError } from "@/lib/hub/security";
import { getWeather } from "@/lib/weather/read";
import {
  booking,
  contactUnlocked,
  scrubContacts,
  notifyBooking,
  redactDeep,
} from "./store";
import { messageSchema } from "./types";
export async function tripData(request: Request, id: string) {
  const a = await booking(request, id),
    sql = database(),
    r = a.request,
    unlocked = contactUnlocked(r);
  const assignment = (
    await sql`SELECT a.id,a.status,a.starts_at,a.ends_at,g.data,g.user_id FROM guide_assignments a JOIN guides g ON g.id=a.guide_id WHERE a.request_id=${id} AND a.status IN ('accepted','started','completion_requested','completed') ORDER BY a.created_at DESC LIMIT 1`
  )[0];
  const visible = a.role === "owner" || a.role === "admin";
  if (a.role === "guide" && !unlocked) {
    r.plan = redactDeep(r.plan);
    r.guest = redactDeep(r.guest);
  }
  const messages = visible
    ? await sql`SELECT id,actor,visibility,body,extra,created_at FROM hub_messages WHERE request_id=${id} ORDER BY created_at LIMIT 300`
    : await sql`SELECT id,actor,visibility,body,extra,created_at FROM hub_messages WHERE request_id=${id} AND (visibility='client' OR visibility='internal' AND actor=${a.actor}) ORDER BY created_at LIMIT 300`;
  const assets =
    await sql`SELECT id,actor,caption,created_at FROM private_assets WHERE request_id=${id} ORDER BY created_at LIMIT 60`;
  const weather = await getWeather().catch(() => null);
  const items = await catalog();
  return {
    role: a.role,
    request: {
      id: r.id,
      status: r.status,
      paymentStatus: r.payment_status,
      planNeedsApproval:
        r.quoted_version !== null && r.quoted_version !== r.plan_version,
      planId: r.plan_id,
      guest:
        a.role === "guide"
          ? {
              ...r.guest,
              email: unlocked ? r.guest.email : "",
              phone: unlocked ? r.guest.phone : "",
            }
          : r.guest,
      plan: r.plan,
    },
    items: items.filter((i) =>
      r.plan.days.some((d) => d.stops.some((s) => s.itemId === i.id)),
    ),
    guide: assignment
      ? {
          id: assignment.id,
          status: assignment.status,
          name: assignment.data.name,
          photo: assignment.data.photo,
          phone: unlocked ? assignment.data.phone : "",
          email: unlocked ? assignment.data.email : "",
          languages: assignment.data.languages,
        }
      : null,
    messages: messages.map((m) => ({
      ...m,
      body: unlocked || visible ? m.body : scrubContacts(m.body),
    })),
    assets,
    weather,
    contactUnlocked: unlocked,
    translationConfigured: !!(
      process.env.TRAVEL_AI_URL &&
      process.env.TRAVEL_AI_KEY &&
      process.env.TRAVEL_AI_MODEL
    ),
    payOnArrival: (await settings()).payOnArrival,
    safety:
      await sql`SELECT id,kind,data,created_at,resolved_at FROM safety_events WHERE request_id=${id} ORDER BY created_at DESC LIMIT 20`,
    followups:
      await sql`SELECT id,guide_id,data,status FROM guide_followups WHERE request_id=${id} AND status IN ('approved','accepted') ORDER BY created_at DESC`,
    review: assignment
      ? (
          await sql`SELECT rating,body,status FROM guide_reviews WHERE assignment_id=${assignment.id}`
        )[0] || null
      : null,
  };
}
export async function postMessage(
  request: Request,
  id: string,
  input: unknown,
) {
  const a = await booking(request, id),
    r = a.request,
    m = messageSchema.parse(input),
    sql = database();
  if (!["confirmed", "completed"].includes(r.status) && a.role === "guide")
    throw new HttpError(409, "Guide chat opens after booking confirmation.");
  if (m.kind === "photo") {
    if (
      !m.assetId ||
      (
        await sql`SELECT id FROM private_assets WHERE id=${m.assetId} AND request_id=${id}`
      )[0] === undefined
    )
      throw new HttpError(400, "Upload a photo to this booking first.");
    if (!contactUnlocked(r) && !["owner", "admin"].includes(a.role))
      throw new HttpError(409, "Photo sharing opens after payment.");
  }
  if (m.kind === "location" && (m.lat === undefined || m.lng === undefined))
    throw new HttpError(400, "Enter both coordinates.");
  const body = contactUnlocked(r) ? m.body : scrubContacts(m.body);
  if (!body.trim() && m.kind === "text")
    throw new HttpError(400, "Write a message.");
  const extra = {
    kind: m.kind,
    language: m.language,
    ...(m.kind === "location" ? { lat: m.lat, lng: m.lng } : {}),
    ...(m.kind === "photo" ? { assetId: m.assetId } : {}),
  };
  const row =
    await sql`INSERT INTO hub_messages(request_id,actor,visibility,body,extra) VALUES(${id},${a.actor},'client',${body},${JSON.stringify(extra)}::jsonb) RETURNING id`;
  await notifyBooking(
    id,
    `chat:${row[0].id}`,
    "A new message about your Almaty trip",
    "Open your private booking thread to read and reply.",
  );
  return { ok: true };
}
export async function upload(request: Request, id: string) {
  const a = await booking(request, id);
  if (
    !["confirmed", "completed"].includes(a.request.status) ||
    !contactUnlocked(a.request)
  )
    throw new HttpError(409, "Photo sharing opens after confirmed payment.");
  const sql = database();
  if (Number(request.headers.get("content-length") || 0) > 4500000)
    throw new HttpError(413, "Use a photo under 3 MB.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "Choose a photo.");
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    length += part.value.length;
    if (length > 4500000) {
      await reader.cancel();
      throw new HttpError(413, "Upload exceeds the size limit.");
    }
    chunks.push(part.value);
  }
  const bytes = Buffer.concat(chunks);
  const form = await new Response(bytes, {
      headers: { "Content-Type": request.headers.get("content-type") || "" },
    }).formData(),
    file = form.get("photo");
  if (
    !(file instanceof File) ||
    file.size > 3000000 ||
    !["image/jpeg", "image/png", "image/webp"].includes(file.type)
  )
    throw new HttpError(400, "Choose a JPG, PNG or WebP under 3 MB.");
  const global = (
    await sql`SELECT COALESCE(sum(octet_length(data)),0) AS bytes FROM private_assets`
  )[0];
  if (
    Number(global.bytes) >
    Number(process.env.PRIVATE_GALLERY_LIMIT_MB || 250) * 1000000
  )
    throw new HttpError(
      409,
      "The private gallery storage allowance is full. Contact the owner.",
    );
  const total = (
    await sql`SELECT count(*)::int AS count,COALESCE(sum(octet_length(data)),0) AS bytes FROM private_assets WHERE request_id=${id}`
  )[0];
  if (total.count >= 60 || Number(total.bytes) > 18000000)
    throw new HttpError(
      409,
      "This booking’s private gallery is full. Contact the manager.",
    );
  let data: Buffer;
  try {
    data = await sharp(Buffer.from(await file.arrayBuffer()), {
      limitInputPixels: 25000000,
    })
      .rotate()
      .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 78 })
      .toBuffer();
  } catch {
    throw new HttpError(400, "This image could not be decoded.");
  }
  const assetId = randomUUID();
  await sql`INSERT INTO private_assets(id,request_id,actor,mime,data,caption) VALUES(${assetId},${id},${a.actor},'image/jpeg',${"\\x" + data.toString("hex")},${String(form.get("caption") || "").slice(0, 500)})`;
  await audit(a.actor, "trip.photo", id, { asset: assetId });
  return { id: assetId };
}
export async function readAsset(request: Request, id: string, assetId: string) {
  await booking(request, id);
  const row = (
    await database()`SELECT data,mime FROM private_assets WHERE id=${assetId} AND request_id=${id}`
  )[0];
  if (!row) throw new HttpError(404, "Photo not found.");
  const bytes =
    typeof row.data === "string"
      ? Buffer.from(row.data.replace(/^\\x/, ""), "hex")
      : Buffer.from(row.data);
  return new Response(bytes, {
    headers: {
      "Content-Type": row.mime,
      "Cache-Control": "private, no-store",
      "Content-Disposition": 'inline; filename="tour-photo.jpg"',
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export async function safety(
  request: Request,
  id: string,
  kind: "check-in" | "emergency",
  data: { lat?: number; lng?: number; message?: string },
) {
  const a = await booking(request, id);
  if (!["confirmed", "completed"].includes(a.request.status))
    throw new HttpError(409, "Safety check-ins open for a confirmed trip.");
  const event = randomUUID();
  await database()`INSERT INTO safety_events(id,request_id,actor,kind,data) VALUES(${event},${id},${a.actor},${kind},${JSON.stringify(data)}::jsonb)`;
  if (kind === "emergency")
    await notifyBooking(
      id,
      `emergency:${event}`,
      "Urgent: traveller requested help",
      `A traveller requested urgent help. ${data.message || ""} ${data.lat !== undefined ? `Shared coordinates: ${data.lat}, ${data.lng}` : ""}\nOpen the booking thread immediately. This alert does not call emergency services.`,
      false,
    );
  await audit(a.actor, `safety.${kind}`, id);
  return {
    ok: true,
    message:
      kind === "emergency"
        ? "Your alert was recorded and queued for the guide and manager. Delivery depends on configured providers. For immediate danger call 112."
        : "Your check-in was recorded.",
  };
}
