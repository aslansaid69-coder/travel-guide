import { database } from "@/lib/db";
export const emailAlertsConfigured = () =>
  !!(
    process.env.RESEND_API_KEY &&
    process.env.ALERT_FROM &&
    process.env.ALERT_TO
  );
export async function sendAlert(
  alert: { id: string; subject: string; body: string },
  fetcher: typeof fetch = fetch,
) {
  if (!emailAlertsConfigured())
    throw new Error(
      "Email alerts need RESEND_API_KEY, ALERT_FROM and ALERT_TO.",
    );
  try {
    const response = await fetcher("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": alert.id,
      },
      body: JSON.stringify({
        from: process.env.ALERT_FROM,
        to: [process.env.ALERT_TO],
        subject: alert.subject,
        text: alert.body,
      }),
      signal: AbortSignal.timeout(10000),
      redirect: "error",
    });
    if (!response.ok)
      throw new Error(`Email provider returned HTTP ${response.status}.`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Email"))
      throw error;
    throw new Error("Email provider is temporarily unavailable.");
  }
}
export async function drainAlerts() {
  const sql = database();
  await sql`UPDATE notification_outbox SET status='failed',last_error='Delivery worker was interrupted.' WHERE status='sending' AND next_attempt<now()-interval '10 minutes'`;
  const rows =
    await sql`SELECT id,subject,body FROM notification_outbox WHERE status IN ('pending','configuration_required','failed') AND attempts<5 AND next_attempt<=now() ORDER BY created_at LIMIT 5`;
  for (const row of rows) {
    if (!emailAlertsConfigured()) {
      await sql`UPDATE notification_outbox SET status='configuration_required',last_error='Configure Resend key, verified sender and recipient.',next_attempt=now()+interval '30 minutes' WHERE id=${row.id}`;
      continue;
    }
    const claimed =
      await sql`UPDATE notification_outbox SET status='sending',attempts=attempts+1,next_attempt=now() WHERE id=${row.id} AND status IN ('pending','configuration_required','failed') RETURNING attempts`;
    if (!claimed.length) continue;
    try {
      await sendAlert({
        id: String(row.id),
        subject: String(row.subject),
        body: String(row.body),
      });
      await sql`UPDATE notification_outbox SET status='sent',sent_at=now(),last_error=NULL WHERE id=${row.id}`;
    } catch (error) {
      await sql`UPDATE notification_outbox SET status='failed',last_error=${error instanceof Error ? error.message : "Email unavailable."},next_attempt=now()+interval '30 minutes' WHERE id=${row.id}`;
    }
  }
}
