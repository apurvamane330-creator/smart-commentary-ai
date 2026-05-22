import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const InputSchema = z.object({
  imageUrl: z.string().url(),
  imageBase64: z.string().min(10), // data URL or raw base64
  language: z.enum(["en", "hi", "mr"]).default("en"),
});

export type Insights = {
  summary: string;
  keyInsights: string[];
  trends: string[];
  anomalies: string[];
  recommendations: string[];
  voiceScript: string;
  pythonExtractionJson: string | null;
};

export const analyzeDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<{ insights: Insights | null; error: string | null }> => {
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    if (!LOVABLE_API_KEY) return { insights: null, error: "LOVABLE_API_KEY missing" };

    // 1. Optional Python preprocessing/extraction
    let pythonExtraction: unknown = null;
    const pyUrl = process.env.PYTHON_ANALYSIS_URL;
    const pyToken = process.env.PYTHON_ANALYSIS_TOKEN;
    if (pyUrl) {
      try {
        const res = await fetch(pyUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(pyToken ? { Authorization: `Bearer ${pyToken}` } : {}),
          },
          body: JSON.stringify({ image_base64: data.imageBase64, image_url: data.imageUrl }),
          signal: AbortSignal.timeout(45_000),
        });
        if (res.ok) pythonExtraction = await res.json();
        else console.warn("Python service non-200:", res.status, await res.text());
      } catch (e) {
        console.warn("Python service unreachable:", (e as Error).message);
      }
    }

    // 2. Gemini multimodal call via Lovable AI Gateway
    const langName = data.language === "hi" ? "Hindi (Devanagari script)" : data.language === "mr" ? "Marathi (Devanagari script)" : "English";
    const sys = `You are a senior business analyst. Analyze the dashboard screenshot and produce STRICT JSON with keys:
summary, keyInsights (string[]), trends (string[]), anomalies (string[]), recommendations (string[]), voiceScript.
voiceScript should be 4-6 spoken sentences in ${langName} suitable for narration.
${pythonExtraction ? `Use this Python OCR/CV extraction as ground truth where helpful: ${JSON.stringify(pythonExtraction).slice(0, 4000)}` : ""}`;

    const userContent = [
      { type: "text", text: "Analyze this dashboard. Return ONLY JSON." },
      { type: "image_url", image_url: { url: data.imageBase64.startsWith("data:") ? data.imageBase64 : `data:image/png;base64,${data.imageBase64}` } },
    ];

    try {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-pro",
          messages: [
            { role: "system", content: sys },
            { role: "user", content: userContent },
          ],
          response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(90_000),
      });
      if (r.status === 429) return { insights: null, error: "Rate limit hit. Try again shortly." };
      if (r.status === 402) return { insights: null, error: "AI credits exhausted. Add credits in Lovable." };
      if (!r.ok) return { insights: null, error: `AI error ${r.status}: ${await r.text()}` };
      const j = await r.json();
      const content = j.choices?.[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(content);
      return {
        insights: {
          summary: parsed.summary ?? "",
          keyInsights: parsed.keyInsights ?? [],
          trends: parsed.trends ?? [],
          anomalies: parsed.anomalies ?? [],
          recommendations: parsed.recommendations ?? [],
          voiceScript: parsed.voiceScript ?? parsed.summary ?? "",
          pythonExtractionJson: pythonExtraction ? JSON.stringify(pythonExtraction) : null,
        },
        error: null,
      };
    } catch (e) {
      return { insights: null, error: (e as Error).message };
    }
  });
