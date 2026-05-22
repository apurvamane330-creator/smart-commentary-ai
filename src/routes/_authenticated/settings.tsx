import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

const VOICES_EN = ["en-US-Neural2-D", "en-US-Neural2-F", "en-US-Neural2-A", "en-GB-Neural2-B"];
const VOICES_HI = ["hi-IN-Neural2-A", "hi-IN-Neural2-B", "hi-IN-Neural2-C", "hi-IN-Neural2-D"];
const VOICES_MR = ["mr-IN-Standard-A", "mr-IN-Standard-B", "mr-IN-Standard-C", "mr-IN-Wavenet-A"];
const defaultVoiceFor = (lang: string) => lang === "hi" ? VOICES_HI[0] : lang === "mr" ? VOICES_MR[0] : VOICES_EN[0];

function SettingsPage() {
  const { user } = useAuth();
  const [language, setLanguage] = useState("en");
  const [voice, setVoice] = useState("en-US-Neural2-D");
  const [speed, setSpeed] = useState(1);
  const [autoDownload, setAutoDownload] = useState(false);
  const [autoPlay, setAutoPlay] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("settings").select("*").eq("user_id", user.id).maybeSingle().then(({ data }) => {
      if (!data) return;
      setLanguage(data.language); setVoice(data.voice);
      setSpeed(Number(data.speed)); setAutoDownload(data.auto_download);
      const ap = (data as { auto_play?: boolean }).auto_play;
      if (typeof ap === "boolean") setAutoPlay(ap);
    });
  }, [user]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("settings").upsert({
      user_id: user.id, language, voice, speed, auto_download: autoDownload, auto_play: autoPlay, theme: "dark",
    } as never);
    setSaving(false);
    if (error) toast.error(error.message); else toast.success("Settings saved");
  };

  const voices = language === "hi" ? VOICES_HI : language === "mr" ? VOICES_MR : VOICES_EN;

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold">Settings</h1>
      <Card className="mt-6 p-6 glass space-y-6">
        <Field label="Default language">
          <select value={language} onChange={(e) => { setLanguage(e.target.value); setVoice(defaultVoiceFor(e.target.value)); }}
            className="bg-secondary text-sm rounded px-3 py-2 border border-border w-full">
            <option value="en">English</option>
            <option value="hi">Hindi</option>
            <option value="mr">Marathi</option>
          </select>
        </Field>
        <Field label="Voice">
          <select value={voice} onChange={(e) => setVoice(e.target.value)}
            className="bg-secondary text-sm rounded px-3 py-2 border border-border w-full">
            {voices.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </Field>
        <Field label={`Default playback speed (${speed.toFixed(2)}x)`}>
          <input type="range" min={0.5} max={2} step={0.05} value={speed}
            onChange={(e) => setSpeed(parseFloat(e.target.value))} className="w-full" />
        </Field>
        <div className="flex items-center justify-between">
          <Label htmlFor="ap">Auto-play voice commentary after analysis</Label>
          <Switch id="ap" checked={autoPlay} onCheckedChange={setAutoPlay} />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="ad">Auto-download audio after analysis</Label>
          <Switch id="ad" checked={autoDownload} onCheckedChange={setAutoDownload} />
        </div>
        <Button onClick={save} disabled={saving} className="bg-gradient-primary text-primary-foreground shadow-glow">
          {saving ? "Saving…" : "Save settings"}
        </Button>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
