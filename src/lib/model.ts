import type { Evidence } from "@/lib/mesh-store";
import { getAiRuntimeConfig } from "@/lib/settings-store";

export type GroundedAnswer = { answer: string; model: string };

export async function answerWithModel(question: string, evidence: Evidence[], workspaceId = "workspace-northstar"): Promise<GroundedAnswer> {
  const runtime = getAiRuntimeConfig(workspaceId);
  const endpoint = runtime.endpoint;
  const apiKey = runtime.apiKey;
  if (!endpoint || !apiKey) return { answer: fallbackAnswer(evidence), model: "grounded-retrieval-v1" };
  const system = "Answer only from the supplied evidence. Cite sources as [n]. If evidence is insufficient, say so.";
  const user = JSON.stringify({ question, evidence: evidence.map((item, index) => ({ citation: `[${index + 1}] ${item.sourceName}: ${item.title}`, text: item.excerpt })) });
  const anthropic = runtime.provider === "anthropic";
  const headers: Record<string, string> = anthropic
    ? { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" }
    : { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` };
  const requestBody = anthropic
    ? { model: runtime.model, max_tokens: 2048, system, messages: [{ role: "user", content: user }] }
    : { model: runtime.model, temperature: 0, messages: [{ role: "system", content: system }, { role: "user", content: user }] };
  const response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(requestBody) });
  if (!response.ok) throw new Error(`Model provider returned ${response.status}.`);
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }>; content?: Array<{ type?: string; text?: string }> };
  const answer = anthropic
    ? payload.content?.find((item) => item.type === "text")?.text?.trim()
    : payload.choices?.[0]?.message?.content?.trim();
  if (!answer) throw new Error("Model provider returned an empty answer.");
  return { answer, model: runtime.model };
}

function fallbackAnswer(evidence: Evidence[]) { return evidence.length > 0 ? `Found ${evidence.length} matching record${evidence.length === 1 ? "" : "s"} in your data. Check the sources below before acting on this.` : "No matching data was found. Try adding more sources or rephrasing your question."; }
