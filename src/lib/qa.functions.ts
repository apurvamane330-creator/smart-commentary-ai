import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({
  question: z.string().min(1).max(1000),
  language: z.enum(["en", "hi", "mr"]).default("en"),
  context: z.string().min(1).max(20000), // serialized insights + optional python extraction
});

export const dashboardQA = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Input.parse(i))
  .handler(async ({ data }): Promise<{ answer: string | null; error: string | null }> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) return { answer: null, error: "LOVABLE_API_KEY missing" };

    const langName =
      data.language === "hi"
        ? "Hindi (Devanagari script)"
        : data.language === "mr"
          ? "Marathi (Devanagari script)"
          : "English";

    const sys = `You are a business analyst answering questions about a specific dashboard the user already analyzed. Reply ONLY in ${langName} — no other language, no mixing scripts. Use the provided dashboard context (insights, KPIs, trends, anomalies, health scores, raw OCR extraction) as ground truth. If the answer is not present in the context, say so briefly in ${langName} and suggest what to look for. Keep the answer focused, 2-6 sentences, professional and clear when read aloud.

DASHBOARD CONTEXT:
${data.context.slice(0, 18000)}`;

    try {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: sys },
            { role: "user", content: data.question },
          ],
        }),
        signal: AbortSignal.timeout(60_000),
      });
      if (r.status === 429) return { answer: null, error: "Rate limit. Try again shortly." };
      if (r.status === 402) return { answer: null, error: "AI credits exhausted." };
      if (!r.ok) return { answer: null, error: `AI error ${r.status}` };
      const j = await r.json();
      const answer = j.choices?.[0]?.message?.content?.trim() ?? "";
      return { answer, error: null };
    } catch (e) {
      return { answer: null, error: (e as Error).message };
    }
  });
