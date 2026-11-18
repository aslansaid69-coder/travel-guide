import { randomUUID } from "node:crypto";
import { database } from "@/lib/db";
import { clientSession, requireStaff } from "@/lib/hub/access";
import { HttpError, token, hash } from "@/lib/hub/security";
import { audit, notify, getPlan } from "@/lib/hub/store";
import { siteUrl } from "@/lib/site";
import { guideSchema, type Guide } from "./types";
import { commerceSettings, ownedGuide, notifyBooking } from "./store";
import type { Plan } from "@/lib/hub/types";
export function tripWindow(plan: Plan) {
  const times = plan.days.flatMap((day, i) =>
    day.stops.map((s) => {
      const date = new Date(plan.startDate + "T00:00:00+05:00");
      date.setUTCDate(date.getUTCDate() + i);
      const start =
        date.valueOf() +
        (Number(s.start.slice(0, 2)) * 60 + Number(s.start.slice(3))) * 60000;
      return { start, end: start + s.duration * 60000 };
    }),
  );
  if (!times.length)
    throw new HttpError(400, "Add stops before assigning a guide.");
  return {
    start: new Date(Math.min(...times.map((t) => t.start))).toISOString(),
    end: new Date(Math.max(...times.map((t) => t.end))).toISOString(),
    hours: times.reduce((n, t) => n + (t.end - t.start) / 3600000, 0),
  };
}
export function matchScore(
  g: Guide,
  language: string,
  interests: string[],
  rating: number | null,
  preferred?: string,
) {
  return (
    (g.id === preferred ? 1000 : 0) +
    (g.languages.includes(language as any) ? 100 : 0) +
    g.specialties.filter((s) => interests.includes(s)).length * 15 +
    (rating || 0) * 4 -
    Math.min(g.rateMinor / 100000, 20)
  );
}
export async function saveGuide(input: unknown, actor: string) {
  const g = guideSchema.parse(input),
    sql = database();
  if (
    g.photo &&
    !g.photo.startsWith("/images/") &&
    !/^https:\/\//.test(g.photo)
  )
    throw new HttpError(400, "Use an HTTPS photo URL or a local image.");
  if (
    g.status === "removed" &&
    (
      await sql`SELECT id FROM guide_assignments WHERE guide_id=${g.id} AND status IN ('accepted','started','completion_requested')`
    )[0]
  )
    throw new HttpError(
      409,
      "Reassign or resolve this guide’s active tours before removing the profile.",
    );
  await sql`INSERT INTO guides(id,data,status) VALUES(${g.id},${JSON.stringify(g)}::jsonb,${g.status}) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data,status=EXCLUDED.status,updated_at=now()`;
  if (["paused", "removed"].includes(g.status))
    await sql`UPDATE guide_assignments SET status='declined',updated_at=now() WHERE guide_id=${g.id} AND status='offered'`;
  await audit(actor, "guide.save", g.id, { status: g.status });
  return g;
}
export async function inviteGuide(id: string, actor: string) {
  const sql = database(),
    r = (
      await sql`SELECT data FROM guides WHERE id=${id} AND status<>'removed'`
    )[0];
  if (!r) throw new HttpError(404, "Guide not found.");
  const g = guideSchema.parse(r.data),
    key = token();
  await sql`INSERT INTO guide_invites(token_hash,guide_id,email) VALUES(${hash(key)},${id},${g.email})`;
  await notify(
    `guide-invite:${hash(key)}`,
    g.email,
    "Your Almaty guide invitation",
    `Hello ${g.name},\nSign in with this email, verify it, then open this private invitation (valid 14 days):\n${siteUrl}/guide#invite=${key}\nReview the guide terms before accepting. Your access is limited to your assigned tours.`,
  );
  await audit(actor, "guide.invite", id);
  return { ok: true, delivery: "queued" };
}
export async function claimGuide(key: string, acceptTerms: boolean) {
  const user = await clientSession();
  if (!user)
    throw new HttpError(401, "Sign in and verify your invited email first.");
  if (!acceptTerms) throw new HttpError(400, "Accept the guide terms first.");
  const sql = database(),
    version = hash((await commerceSettings()).guideTerms);
  const result =
    await sql`SELECT platform_claim_guide(${hash(key)},${user.id},${user.email},${version}) AS id`;
  await audit(user.id, "guide.invite.accept", result[0].id);
  return { ok: true };
}
export async function candidates(requestId: string) {
  const sql = database(),
    r = (
      await sql`SELECT r.*,p.data AS plan FROM hub_requests r JOIN hub_plans p ON p.id=r.plan_id WHERE r.id=${requestId}`
    )[0];
  if (!r) throw new HttpError(404, "Booking not found.");
  const w = tripWindow(r.plan);
  const rows =
    await sql`SELECT g.*,avg(v.rating) FILTER(WHERE v.status='approved') AS rating FROM guides g LEFT JOIN guide_assignments a ON a.guide_id=g.id LEFT JOIN guide_reviews v ON v.assignment_id=a.id WHERE g.status='active' AND g.user_id IS NOT NULL AND g.terms_accepted IS NOT NULL AND g.data->>'currency'=${r.currency} AND EXISTS(SELECT 1 FROM guide_availability c WHERE c.guide_id=g.id AND c.blocked=false AND c.starts_at<=${w.start} AND c.ends_at>=${w.end}) AND NOT EXISTS(SELECT 1 FROM guide_availability c WHERE c.guide_id=g.id AND c.blocked=true AND c.starts_at<${w.end} AND c.ends_at>${w.start}) AND NOT EXISTS(SELECT 1 FROM guide_assignments b WHERE b.guide_id=g.id AND b.starts_at<${w.end} AND b.ends_at>${w.start} AND (b.status IN ('accepted','started','completion_requested') OR b.status='offered' AND b.expires_at>now())) AND NOT EXISTS(SELECT 1 FROM guide_assignments b WHERE b.request_id=${requestId} AND b.guide_id=g.id AND b.status IN ('declined','expired','reassigned')) GROUP BY g.id`;
  return rows
    .map((row) => {
      const g = guideSchema.parse(row.data);
      return {
        id: g.id,
        name: g.name,
        languages: g.languages,
        rateMinor: g.rateMinor,
        currency: g.currency,
        score: matchScore(
          g,
          r.guest.language,
          r.plan.interests,
          Number(row.rating) || null,
          r.plan.preferredGuideId,
        ),
        feeMinor: Math.ceil(
          g.rateMinor * (g.rateType === "hour" ? w.hours : 1),
        ),
        rating: row.rating ? Number(row.rating) : null,
        ...w,
      };
    })
    .sort((a, b) => b.score - a.score);
}
export async function offerGuide(
  requestId: string,
  guideId?: string,
  timeoutMinutes = 30,
) {
  const sql = database(),
    choices = await candidates(requestId),
    chosen = guideId ? choices.find((g) => g.id === guideId) : choices[0];
  if (!chosen)
    throw new HttpError(
      409,
      "No available guide matches this trip. Check currency, verified invitation and calendar.",
    );
  const id = randomUUID(),
    expires = new Date(
      Date.now() + Math.max(5, Math.min(120, timeoutMinutes)) * 60000,
    ).toISOString();
  try {
    await sql`SELECT platform_offer_guide(${id},${requestId},${chosen.id},${chosen.start},${chosen.end},${chosen.feeMinor},${expires})`;
  } catch {
    throw new HttpError(
      409,
      "Guide or booking availability changed. Refresh and choose again.",
    );
  }
  const guide = (await sql`SELECT data FROM guides WHERE id=${chosen.id}`)[0];
  await notify(
    `guide-offer:${id}`,
    guide.data.email,
    "A new Almaty tour offer",
    `Review and accept or decline before ${expires}:\n${siteUrl}/guide\nGuide fee allocation: ${chosen.feeMinor / 100} ${chosen.currency}. This must fit the manager’s final package quote.`,
  );
  await audit("assignment", "guide.offer", requestId, {
    assignment: id,
    guide: chosen.id,
  });
  return { id, expiresAt: expires };
}
export async function guideAction(id: string, action: string) {
  const { row, staff } = await ownedGuide(),
    sql = database();
  if (!["accept", "decline", "start", "complete"].includes(action))
    throw new HttpError(400, "Unknown tour action.");
  let result;
  try {
    result =
      await sql`SELECT platform_guide_action(${id},${row.id},${action}) AS request_id`;
  } catch {
    throw new HttpError(
      409,
      "Tour state or availability changed. Reload your dashboard.",
    );
  }
  const requestId = result[0].request_id;
  await audit(staff.id, `guide.${action}`, requestId, { assignment: id });
  if (action === "decline")
    await offerGuide(requestId).catch(() =>
      notifyBooking(
        requestId,
        `unassigned:${id}`,
        "Guide assignment needs attention",
        "No remaining available guide could be offered. A manager must review.",
        false,
      ),
    );
  else
    await notifyBooking(
      requestId,
      `guide-${action}:${id}`,
      `Guide update: ${action}`,
      action === "complete"
        ? "The guide requested completion approval. A manager will review the trip before earnings are released."
        : `Your guide updated the tour: ${action}.`,
      action === "accept" || action === "start",
    );
  return { ok: true };
}
export async function saveAvailability(
  guideId: string,
  start: string,
  end: string,
  blocked: boolean,
) {
  const { row, staff } = await ownedGuide(guideId);
  if (new Date(end) <= new Date(start))
    throw new HttpError(400, "End must follow start.");
  const sql = database();
  if (
    blocked &&
    (
      await sql`SELECT id FROM guide_assignments WHERE guide_id=${row.id} AND status IN ('accepted','started','completion_requested') AND starts_at<${end} AND ends_at>${start}`
    )[0]
  )
    throw new HttpError(
      409,
      "An accepted trip overlaps this block. Ask a manager to reassign it first.",
    );
  try {
    await sql`SELECT platform_calendar(${randomUUID()},${row.id},${start},${end},${blocked})`;
  } catch {
    throw new HttpError(
      409,
      "Calendar overlaps an accepted trip or has an invalid interval.",
    );
  }
  await audit(staff.id, "guide.calendar", row.id, { blocked, start, end });
  return { ok: true };
}
export async function approveCompletion(id: string, actor: string) {
  const sql = database(),
    r = (
      await sql`SELECT * FROM guide_assignments WHERE id=${id} AND status='completion_requested' AND ends_at<=now()`
    )[0];
  if (!r)
    throw new HttpError(
      409,
      "The tour must have ended and the guide must request completion.",
    );
  await sql.transaction([
    sql`UPDATE guide_assignments SET status='completed',completion_approved=true,updated_at=now() WHERE id=${id}`,
    sql`UPDATE hub_requests SET status='completed',updated_at=now() WHERE id=${r.request_id} AND status='confirmed'`,
  ]);
  await audit(actor, "guide.completion.approve", r.request_id, {
    assignment: id,
  });
  await notifyBooking(
    r.request_id,
    `gallery:${id}`,
    "Your Almaty trip photos and review",
    "Thank you for travelling with us. Open your private trip area to download the gallery and review your guide.",
  );
  return { ok: true };
}

export async function reassignGuide(id: string, actor: string) {
  const sql = database(),
    old = (
      await sql`SELECT a.*,g.data->>'email' AS email FROM guide_assignments a JOIN guides g ON g.id=a.guide_id WHERE a.id=${id}`
    )[0];
  if (!old) throw new HttpError(404, "Assignment not found.");
  let requestId: string;
  try {
    requestId = (
      await sql`SELECT platform_reassign_guide(${id}) AS request_id`
    )[0].request_id;
  } catch {
    throw new HttpError(
      409,
      "Only an offered or accepted trip can be reassigned here. A trip already in progress needs direct coordination.",
    );
  }
  await notify(
    `guide-reassigned:${id}`,
    old.email,
    "Your guide assignment changed",
    "The manager reassigned this tour. Open your guide dashboard for current assignments.",
  );
  await offerGuide(requestId).catch(async () => {
    await notifyBooking(
      requestId,
      `reassign-pending:${id}`,
      "Guide assignment is being adjusted",
      "The travel desk is arranging a replacement guide. Please use your booking thread for updates.",
    );
  });
  await audit(actor, "guide.reassign", requestId, { oldAssignment: id });
  return { ok: true };
}
