import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import { UploadCloud, Loader2, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { analyzeDashboard, type Insights } from "@/lib/analyze.functions";
import { synthesizeSpeech } from "@/lib/tts.functions";
import { ReportView } from "@/components/ReportView";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

const ALLOWED = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024;

async function compress(file: File): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image(); i.onload = () => res(i); i.onerror = rej;
    i.src = URL.createObjectURL(file);
  });
  const max = 1600;
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  c.getContext("2d")!.drawImage(img, 0, 0, w, h);
  return await new Promise<Blob>((res) => c.toBlob((b) => res(b!), "image/jpeg", 0.85)!);
}
function blobToBase64(b: Blob): Promise<string> {
  return new Promise((res) => { const r = new FileReader(); r.onloadend = () => res(r.result as string); r.readAsDataURL(b); });
}

function DashboardPage() {
  const { user } = useAuth();
  const analyze = useServerFn(analyzeDashboard);
  const tts = useServerFn(synthesizeSpeech);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<string>("");
  const [report, setReport] = useState<{
    insights: Insights; imageUrl: string; audioUrl: string | null; language: string; createdAt: string; autoPlay: boolean;
  } | null>(null);
  const [language, setLanguage] = useState<"en" | "hi" | "mr">("en");
  const [prefs, setPrefs] = useState<{ voice?: string; speed: number; autoPlay: boolean; autoDownload: boolean }>({ speed: 1, autoPlay: true, autoDownload: false });

  useEffect(() => {
    if (!user) return;
    supabase.from("settings").select("*").eq("user_id", user.id).maybeSingle().then(({ data }) => {
      if (!data) return;
      setLanguage((data.language as "en" | "hi" | "mr") ?? "en");
      const ap = (data as { auto_play?: boolean }).auto_play;
      setPrefs({
        voice: data.voice, speed: Number(data.speed) || 1,
        autoPlay: typeof ap === "boolean" ? ap : true,
        autoDownload: !!data.auto_download,
      });
    });
  }, [user]);

  const onFile = (f: File | null) => {
    if (!f) return;
    if (!ALLOWED.includes(f.type)) return toast.error("Use PNG, JPG, or WEBP.");
    if (f.size > MAX_BYTES) return toast.error("Max 10MB.");
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setReport(null);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); onFile(e.dataTransfer.files?.[0] ?? null);
  }, []);

  const run = async () => {
    if (!file || !user) return;
    setBusy(true);
    try {
      setStage("Compressing image…");
      const compressed = await compress(file);
      const b64 = await blobToBase64(compressed);

      setStage("Uploading…");
      const path = `${user.id}/${Date.now()}.jpg`;
      const up = await supabase.storage.from("dashboards").upload(path, compressed, { contentType: "image/jpeg" });
      if (up.error) throw up.error;
      const { data: signed } = await supabase.storage.from("dashboards").createSignedUrl(path, 60 * 60 * 24 * 7);
      const imageUrl = signed?.signedUrl ?? "";

      setStage("Analyzing dashboard with Python + Gemini…");
      const { insights, error } = await analyze({ data: { imageUrl, imageBase64: b64, language } });
      if (error || !insights) throw new Error(error || "Analysis failed");

      setStage("Generating voice narration…");
      let audioUrl: string | null = null;
      let audioMeta: { voice?: string; speed: number; durationSec?: number; sizeBytes?: number; mimeType?: string } = {
        voice: prefs.voice, speed: prefs.speed, mimeType: "audio/mpeg",
      };
      try {
        const { audioBase64, error: ttsErr } = await tts({
          data: { text: insights.voiceScript, language, speed: prefs.speed, voice: prefs.voice },
        });
        if (audioBase64) {
          const bin = Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0));
          audioMeta.sizeBytes = bin.byteLength;
          // Probe duration from the in-memory blob before upload
          try {
            const blobUrl = URL.createObjectURL(new Blob([bin], { type: "audio/mpeg" }));
            const dur = await new Promise<number>((resolve) => {
              const el = document.createElement("audio");
              el.preload = "metadata"; el.src = blobUrl;
              el.onloadedmetadata = () => resolve(isFinite(el.duration) ? el.duration : 0);
              el.onerror = () => resolve(0);
              setTimeout(() => resolve(0), 4000);
            });
            URL.revokeObjectURL(blobUrl);
            if (dur > 0) audioMeta.durationSec = Math.round(dur * 10) / 10;
          } catch { /* ignore */ }
          const audioPath = `${user.id}/${Date.now()}.mp3`;
          const upA = await supabase.storage.from("dashboards").upload(audioPath, bin, { contentType: "audio/mpeg" });
          if (!upA.error) {
            const { data: a } = await supabase.storage.from("dashboards").createSignedUrl(audioPath, 60 * 60 * 24 * 7);
            audioUrl = a?.signedUrl ?? null;
          }
        } else if (ttsErr) {
          toast.warning("Narration unavailable", { description: ttsErr });
        }
      } catch (e) { toast.warning("Narration failed", { description: (e as Error).message }); }

      setStage("Saving report…");
      const { error: insErr } = await supabase.from("reports").insert({
        user_id: user.id,
        image_url: imageUrl,
        insights: insights as never,
        audio_url: audioUrl,
        language,
        metadata: { fileName: file.name, size: file.size, voice: audioMeta },
      });
      if (insErr) console.warn(insErr);

      if (prefs.autoDownload && audioUrl) {
        const a = document.createElement("a"); a.href = audioUrl; a.download = `voice-commentary-${Date.now()}.mp3`; a.click();
      }

      setReport({ insights, imageUrl, audioUrl, language, createdAt: new Date().toISOString(), autoPlay: prefs.autoPlay });
      toast.success("Report ready");
    } catch (e) {
      toast.error("Failed", { description: (e as Error).message });
    } finally {
      setBusy(false); setStage("");
    }
  };

  if (report) {
    return (
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Analysis Report</h1>
          <Button variant="secondary" onClick={() => { setReport(null); setFile(null); setPreviewUrl(null); }}>
            New analysis
          </Button>
        </div>
        <ReportView {...report} userEmail={user?.email ?? ""} />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold">Upload a dashboard</h1>
        <p className="text-muted-foreground mt-1">PNG, JPG, or WEBP up to 10MB.</p>
      </motion.div>

      <Card
        className="mt-6 p-8 glass border-dashed border-2"
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        {previewUrl ? (
          <div className="space-y-4">
            <img src={previewUrl} alt="preview" className="max-h-80 mx-auto rounded-lg" />
            <p className="text-center text-sm text-muted-foreground">{file?.name}</p>
          </div>
        ) : (
          <label className="flex flex-col items-center justify-center py-12 cursor-pointer">
            <div className="h-14 w-14 rounded-full bg-gradient-primary/20 grid place-items-center">
              <UploadCloud className="h-7 w-7 text-primary" />
            </div>
            <p className="mt-4 font-medium">Drop your dashboard screenshot here</p>
            <p className="text-sm text-muted-foreground">or click to browse</p>
            <input type="file" accept={ALLOWED.join(",")} className="hidden"
              onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
          </label>
        )}
      </Card>

      <div className="mt-6 flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Narration language:</span>
          <select value={language} onChange={(e) => setLanguage(e.target.value as "en" | "hi" | "mr")}
            className="bg-secondary text-sm rounded px-3 py-1.5 border border-border">
            <option value="en">English</option>
            <option value="hi">Hindi</option>
            <option value="mr">Marathi</option>
          </select>
        </div>
        <div className="flex gap-2">
          {previewUrl && (
            <Button variant="secondary" onClick={() => { setFile(null); setPreviewUrl(null); }}>
              <ImageIcon className="h-4 w-4 mr-1" />Change
            </Button>
          )}
          <Button onClick={run} disabled={!file || busy}
            className="bg-gradient-primary text-primary-foreground shadow-glow">
            {busy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{stage || "Working…"}</> : "Analyze"}
          </Button>
        </div>
      </div>
    </div>
  );
}
