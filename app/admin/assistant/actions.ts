"use server";
import { z } from "zod";
import { authorize } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";
import { back, failure, formObject, isRedirect } from "@/lib/admin/form";
import { database } from "@/lib/db";
import { assistantSettingsSchema, DEFAULT_PROMPT } from "@/lib/assistant/settings";

const form = z.object({
  enabled: z.literal("on").optional(),
  storeConversations: z.literal("on").optional(),
  systemPrompt: z.string(),
  hourlyLimit: z.coerce.number().int(),
  dailyLimit: z.coerce.number().int(),
  reset: z.literal("1").optional(),
});

export async function saveAssistant(formData: FormData) {
  try {
    const actor = await authorize("assistant.manage");
    const f = form.parse(formObject(formData));
    const data = assistantSettingsSchema.parse({
      enabled: f.enabled === "on",
      storeConversations: f.storeConversations === "on",
      systemPrompt: f.reset ? DEFAULT_PROMPT : f.systemPrompt,
      hourlyLimit: f.hourlyLimit,
      dailyLimit: f.dailyLimit,
    });
    await database()`INSERT INTO app_settings(key,data,updated_by) VALUES('assistant',${JSON.stringify(data)}::jsonb,${actor.id}) ON CONFLICT(key) DO UPDATE SET data=EXCLUDED.data,updated_at=now(),updated_by=EXCLUDED.updated_by`;
    await recordAudit(actor, "settings.assistant", "assistant", { enabled: data.enabled, hourlyLimit: data.hourlyLimit, dailyLimit: data.dailyLimit, promptLength: data.systemPrompt.length });
  } catch (error) {
    if (isRedirect(error)) throw error;
    back("/admin/assistant", failure(error), "bad");
  }
  back("/admin/assistant", "Assistant settings saved.");
}

export async function deleteConversation(formData: FormData) {
  const id = z.string().regex(/^ac_[a-z0-9]{20}$/).parse(formData.get("id"));
  try {
    const actor = await authorize("assistant.manage");
    await database()`DELETE FROM assistant_conversations WHERE id=${id}`;
    await recordAudit(actor, "assistant.conversation.delete", id);
  } catch (error) {
    if (isRedirect(error)) throw error;
    back(`/admin/assistant/${id}`, failure(error), "bad");
  }
  back("/admin/assistant", "Conversation deleted.");
}
