import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { claude, claudeError, CLAUDE_MODEL } from "@/lib/ai/claude";
import { GROUNDING_RULES, type AssistantSettings } from "./settings";
import { runTool, TOOLS, type ToolAction, type ToolContext } from "./tools";

export type AssistantEvent =
  | { type: "start"; conversationId: string }
  | { type: "text"; delta: string }
  | { type: "tool"; name: string }
  | { type: "action"; action: ToolAction }
  | { type: "done"; text: string; tools: string[]; usage: { input: number; output: number } }
  | { type: "error"; message: string };

const MAX_STEPS = 6;
type Msg = Anthropic.Beta.BetaMessageParam;

/**
 * Manual tool-use loop on the Messages API with streaming text.
 * Tools run on our server against our own database; tool input is validated with zod
 * (eager input streaming means the API does not validate it for us).
 */
export async function* runAssistant(opts: {
  history: { role: "user" | "assistant"; content: string }[];
  userText: string;
  lang: ToolContext["lang"];
  settings: AssistantSettings;
}): AsyncGenerator<AssistantEvent> {
  const ctx: ToolContext = { lang: opts.lang, actions: [] };
  const messages: Msg[] = [
    ...opts.history.map((m): Msg => ({ role: m.role, content: m.content })),
    { role: "user", content: opts.userText },
  ];
  const today = new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10);
  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    { type: "text", text: `${opts.settings.systemPrompt}\n${GROUNDING_RULES}`, cache_control: { type: "ephemeral" } },
    // Volatile context after the cached prefix.
    { type: "text", text: `Today in Almaty: ${today}. Interface language: ${opts.lang}.` },
  ];
  let text = "";
  const toolsUsed: string[] = [];
  const usage = { input: 0, output: 0 };
  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const stream = claude().beta.messages.stream({
        model: CLAUDE_MODEL,
        max_tokens: 4000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low" },
        system,
        tools: TOOLS,
        messages,
      });
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          text += event.delta.text;
          yield { type: "text", delta: event.delta.text };
        }
      }
      const message = await stream.finalMessage();
      usage.input += message.usage.input_tokens + (message.usage.cache_read_input_tokens || 0);
      usage.output += message.usage.output_tokens;
      if (message.stop_reason === "refusal") {
        const note = "\n\nI can't help with that request. I can help you plan places, prices and guides in Almaty.";
        text += note;
        yield { type: "text", delta: note };
        break;
      }
      if (message.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: message.content });
        continue;
      }
      const calls = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (!calls.length || message.stop_reason !== "tool_use") break;
      messages.push({ role: "assistant", content: message.content });
      for (const c of calls) {
        toolsUsed.push(c.name);
        yield { type: "tool", name: c.name };
      }
      const before = ctx.actions.length;
      const results = await Promise.all(calls.map((c) => runTool(c.name, c.input, ctx)));
      for (const action of ctx.actions.slice(before)) yield { type: "action", action };
      messages.push({
        role: "user",
        content: calls.map(
          (c, i): Anthropic.Beta.BetaToolResultBlockParam => ({
            type: "tool_result",
            tool_use_id: c.id,
            content: results[i].content,
            is_error: results[i].isError,
          }),
        ),
      });
      if (step === MAX_STEPS - 1) {
        const note = "\n\n(I stopped here to keep things short — ask me to continue.)";
        text += note;
        yield { type: "text", delta: note };
      }
    }
    yield { type: "done", text, tools: toolsUsed, usage };
  } catch (error) {
    yield { type: "error", message: claudeError(error).message };
  }
}
