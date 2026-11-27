import Link from "next/link";
import { requirePage } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { database } from "@/lib/db";
import { claudeConfigured, CLAUDE_MODEL } from "@/lib/ai/claude";
import { assistantSettings, GROUNDING_RULES } from "@/lib/assistant/settings";
import { likePattern, listParams, offset, PAGE_SIZE, type SearchParams } from "@/lib/admin/list";
import { Badge, Empty, Filters, formatDate, Notice, PageHeader, Pagination } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/confirm";
import { saveAssistant } from "./actions";

export const metadata = { title: "Assistant" };

export default async function AssistantAdmin({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePage("assistant.conversations", "/admin/assistant");
  const raw = await searchParams;
  const p = listParams(raw);
  const s = await assistantSettings();
  const sql = database();
  const like = likePattern(p.q);
  const where = sql`(${p.q} = '' OR c.title ILIKE ${like} OR EXISTS (SELECT 1 FROM assistant_messages m WHERE m.conversation_id=c.id AND m.content ILIKE ${like}))`;
  const [rows, count, stats] = await Promise.all([
    sql`SELECT c.id,c.title,c.language,c.message_count,c.input_tokens,c.output_tokens,c.user_id,c.updated_at FROM assistant_conversations c WHERE ${where} ORDER BY c.updated_at DESC LIMIT ${PAGE_SIZE} OFFSET ${offset(p)}`,
    sql`SELECT count(*)::int AS n FROM assistant_conversations c WHERE ${where}`,
    sql`SELECT count(*) FILTER (WHERE role='user' AND created_at > date_trunc('day', now()))::int AS today, count(*) FILTER (WHERE role='user' AND created_at > now() - interval '30 days')::int AS month FROM assistant_messages`,
  ]);
  const manage = can(user.role, "assistant.manage");
  return (
    <>
      <PageHeader title="Travel assistant" intro={`Claude (${CLAUDE_MODEL}) with tools for our places, prices and guides. Answers stream to visitors; prices only come from the estimate engine.`}>
        <Badge tone={!claudeConfigured() ? "bad" : s.enabled ? "ok" : "warn"}>
          {!claudeConfigured() ? "ANTHROPIC_API_KEY missing" : s.enabled ? "On" : "Off"}
        </Badge>
      </PageHeader>
      <Notice message={raw.notice} tone="ok" />
      <Notice message={raw.error} tone="bad" />
      <div className="admin-grid">
        <div className="admin-card admin-stat">
          <span>Questions today</span>
          <strong>{Number(stats[0]?.today || 0)}</strong>
          <span>limit {s.dailyLimit}/day · {s.hourlyLimit}/hour per visitor</span>
        </div>
        <div className="admin-card admin-stat">
          <span>Questions · 30 days</span>
          <strong>{Number(stats[0]?.month || 0)}</strong>
        </div>
      </div>
      <div className="admin-two">
        <section>
          <h2>Conversations</h2>
          <Filters params={p} placeholder="Search conversations" />
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>First question</th>
                  <th>Messages</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={String(r.id)}>
                    <td>
                      <Link href={`/admin/assistant/${String(r.id)}`}>{String(r.title || "(empty)")}</Link>
                      <small>
                        {String(r.language).toUpperCase()} · {r.user_id ? "signed-in" : "visitor"} · {Number(r.input_tokens) + Number(r.output_tokens)} tokens
                      </small>
                    </td>
                    <td>{Number(r.message_count)}</td>
                    <td>{formatDate(r.updated_at as string)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!rows.length && <Empty>No conversations yet.</Empty>}
          <Pagination base="/admin/assistant" params={p} total={Number(count[0]?.n || 0)} />
        </section>
        <section className="admin-card">
          <h2>Settings</h2>
          {manage ? (
            <form action={saveAssistant} className="admin-form">
              <label className="admin-check">
                <input type="checkbox" name="enabled" defaultChecked={s.enabled} /> Assistant enabled
              </label>
              <label className="admin-check">
                <input type="checkbox" name="storeConversations" defaultChecked={s.storeConversations} /> Keep conversations for review
              </label>
              <label>
                System prompt <small>Tone, focus and what to promote. Safety rules below are always added.</small>
                <textarea name="systemPrompt" rows={10} defaultValue={s.systemPrompt} minLength={20} maxLength={6000} />
              </label>
              <div className="admin-row">
                <label>
                  Per visitor / hour
                  <input name="hourlyLimit" type="number" min={1} max={500} defaultValue={s.hourlyLimit} />
                </label>
                <label>
                  Whole site / day
                  <input name="dailyLimit" type="number" min={10} max={100000} defaultValue={s.dailyLimit} />
                </label>
              </div>
              <div className="admin-actions">
                <SubmitButton>Save</SubmitButton>
                <SubmitButton name="reset" value="1" variant="default">
                  Reset prompt to default
                </SubmitButton>
              </div>
            </form>
          ) : (
            <p className="admin-muted">Only the owner changes assistant settings.</p>
          )}
          <details>
            <summary>Always-on rules</summary>
            <pre style={{ whiteSpace: "pre-wrap", fontSize: ".8rem" }}>{GROUNDING_RULES.trim()}</pre>
          </details>
        </section>
      </div>
    </>
  );
}
