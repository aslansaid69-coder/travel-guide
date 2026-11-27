import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { database } from "@/lib/db";
import { formatDate, Notice, PageHeader } from "@/components/admin/ui";
import { ConfirmButton } from "@/components/admin/confirm";
import { deleteConversation } from "../actions";
import type { SearchParams } from "@/lib/admin/list";

export const metadata = { title: "Conversation" };

export default async function Conversation({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const { id } = await params;
  const user = await requirePage("assistant.conversations", `/admin/assistant/${id}`);
  if (!/^ac_[a-z0-9]{20}$/.test(id)) notFound();
  const sql = database();
  const conv = (await sql`SELECT * FROM assistant_conversations WHERE id=${id}`)[0];
  if (!conv) notFound();
  const messages = await sql`SELECT role,content,tools,created_at FROM assistant_messages WHERE conversation_id=${id} ORDER BY id`;
  return (
    <>
      <PageHeader title={String(conv.title || "Conversation")} intro={`${String(conv.language).toUpperCase()} · started ${formatDate(conv.created_at as string)}`}>
        <Link className="admin-button" href="/admin/assistant">
          ← All conversations
        </Link>
      </PageHeader>
      <Notice message={(await searchParams).error} tone="bad" />
      <div className="admin-chat">
        {messages.map((m, i) => (
          <article key={i} data-role={String(m.role)}>
            <small className="admin-muted">
              {m.role === "user" ? "Visitor" : "Assistant"} · {formatDate(m.created_at as string)}
              {(m.tools as string[]).length ? ` · tools: ${(m.tools as string[]).join(", ")}` : ""}
            </small>
            <br />
            {String(m.content)}
          </article>
        ))}
      </div>
      {can(user.role, "assistant.manage") && (
        <form action={deleteConversation} style={{ marginTop: 16 }}>
          <input type="hidden" name="id" value={id} />
          <ConfirmButton message="Delete this conversation permanently?">Delete conversation</ConfirmButton>
        </form>
      )}
    </>
  );
}
