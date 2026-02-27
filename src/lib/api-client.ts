import type { CorrectionResult, ExplanationResult } from "@/types/gemini";

export type { CorrectionResult, ExplanationResult };
export type { Annotation, SentenceAnnotation } from "@/types/gemini";

async function apiFetch<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || `API error: ${res.status}`);
  }

  return data as T;
}

export async function correctText(text: string): Promise<CorrectionResult> {
  return apiFetch<CorrectionResult>("/api/correct", { text });
}

export async function explainText(text: string): Promise<ExplanationResult> {
  return apiFetch<ExplanationResult>("/api/explain", { text });
}

export async function chatWithAI(
  context: CorrectionResult | ExplanationResult,
  history: { role: 'user' | 'model', content: string }[],
  userMessage: string,
  originalText: string
): Promise<string> {
  const data = await apiFetch<{ response: string }>("/api/chat", {
    context,
    history,
    message: userMessage,
    originalText,
  });
  return data.response;
}
