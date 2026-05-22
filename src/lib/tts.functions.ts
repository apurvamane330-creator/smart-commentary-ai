import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({
  text: z.string().min(1).max(5000),
  language: z.enum(["en", "hi", "mr"]).default("en"),
  voice: z.string().optional(),
  speed: z.number().min(0.5).max(2).default(1),
});

// Returns base64 MP3 audio (caller uploads to Storage)
export const synthesizeSpeech = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Input.parse(i))
  .handler(async ({ data }): Promise<{ audioBase64: string | null; error: string | null }> => {
    const key = process.env.GOOGLE_TTS_API_KEY;
    if (!key) return { audioBase64: null, error: "GOOGLE_TTS_API_KEY not configured" };

    const langCode = data.language === "hi" ? "hi-IN" : data.language === "mr" ? "mr-IN" : "en-US";
    const defaultVoice = data.language === "hi" ? "hi-IN-Neural2-A" : data.language === "mr" ? "mr-IN-Standard-A" : "en-US-Neural2-D";
    // Ignore a saved voice that doesn't match the requested language (Google TTS rejects mismatches).
    const voiceName = data.voice && data.voice.startsWith(langCode) ? data.voice : defaultVoice;

    try {
      const r = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: { text: data.text },
          voice: { languageCode: langCode, name: voiceName },
          audioConfig: { audioEncoding: "MP3", speakingRate: data.speed },
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!r.ok) return { audioBase64: null, error: `TTS error ${r.status}: ${await r.text()}` };
      const j = await r.json();
      return { audioBase64: j.audioContent ?? null, error: null };
    } catch (e) {
      return { audioBase64: null, error: (e as Error).message };
    }
  });
