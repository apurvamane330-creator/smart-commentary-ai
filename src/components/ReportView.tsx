import { useEffect, useRef, useState } from "react";
import type { Insights } from "@/lib/analyze.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { motion } from "framer-motion";
import { Play, Pause, Square, Download, Copy, FileDown, Sparkles, TrendingUp, AlertTriangle, Lightbulb, RotateCcw, Volume2, VolumeX, MessageSquareQuote } from "lucide-react";
import { toast } from "sonner";
import { jsPDF } from "jspdf";

export function ReportView({
  insights, imageUrl, audioUrl, language, createdAt, userEmail, autoPlay = false,
}: {
  insights: Insights;
  imageUrl: string;
  audioUrl: string | null;
  language: string;
  createdAt: string;
  userEmail: string;
  autoPlay?: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    if (!autoPlay || !audioUrl) return;
    const a = audioRef.current; if (!a) return;
    const t = setTimeout(() => { a.play().then(() => setPlaying(true)).catch(() => {}); }, 300);
    return () => clearTimeout(t);
  }, [autoPlay, audioUrl]);

  const togglePlay = () => {
    const a = audioRef.current; if (!a) return;
    if (a.paused) { a.play(); setPlaying(true); } else { a.pause(); setPlaying(false); }
  };
  const stop = () => { const a = audioRef.current; if (!a) return; a.pause(); a.currentTime = 0; setPlaying(false); setProgress(0); setCurrentTime(0); };
  const replay = () => { const a = audioRef.current; if (!a) return; a.currentTime = 0; a.play(); setPlaying(true); };
  const seek = (pct: number) => { const a = audioRef.current; if (!a || !a.duration) return; a.currentTime = (pct / 100) * a.duration; };
  const fmt = (s: number) => { if (!isFinite(s)) return "0:00"; const m = Math.floor(s / 60); const r = Math.floor(s % 60); return `${m}:${r.toString().padStart(2, "0")}`; };
  const toggleMute = () => { const a = audioRef.current; if (!a) return; a.muted = !a.muted; setMuted(a.muted); };

  const copyReport = async () => {
    const text = [
      `Executive Summary:\n${insights.summary}`,
      `\nKey Insights:\n${insights.keyInsights.map(i => `• ${i}`).join("\n")}`,
      `\nTrends:\n${insights.trends.map(i => `• ${i}`).join("\n")}`,
      `\nAnomalies:\n${insights.anomalies.map(i => `• ${i}`).join("\n")}`,
      `\nRecommendations:\n${insights.recommendations.map(i => `• ${i}`).join("\n")}`,
    ].join("\n");
    await navigator.clipboard.writeText(text);
    toast.success("Report copied");
  };

  const downloadPdf = async () => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    const margin = 40;
    let y = margin;

    doc.setFont("helvetica", "bold"); doc.setFontSize(20);
    doc.text("AI Voice Commentary Report", margin, y); y += 24;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(120);
    doc.text(`${userEmail} · ${new Date(createdAt).toLocaleString()} · ${language.toUpperCase()}`, margin, y);
    y += 20; doc.setTextColor(0);

    try {
      const img = await fetch(imageUrl).then(r => r.blob()).then(b => new Promise<string>((res) => { const r = new FileReader(); r.onloadend = () => res(r.result as string); r.readAsDataURL(b); }));
      const props = doc.getImageProperties(img);
      const imgW = W - margin * 2;
      const imgH = (props.height * imgW) / props.width;
      doc.addImage(img, "PNG", margin, y, imgW, Math.min(imgH, 280));
      y += Math.min(imgH, 280) + 16;
    } catch { /* ignore */ }

    const section = (title: string, content: string | string[]) => {
      if (y > 720) { doc.addPage(); y = margin; }
      doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.text(title, margin, y); y += 16;
      doc.setFont("helvetica", "normal"); doc.setFontSize(10);
      const lines = Array.isArray(content) ? content.map(c => `• ${c}`) : [content];
      for (const line of lines) {
        const wrapped = doc.splitTextToSize(line, W - margin * 2);
        for (const w of wrapped) {
          if (y > 770) { doc.addPage(); y = margin; }
          doc.text(w, margin, y); y += 14;
        }
      }
      y += 6;
    };
    section("Executive Summary", insights.summary);
    section("Key Insights", insights.keyInsights);
    section("Trends", insights.trends);
    section("Anomalies", insights.anomalies);
    section("Recommendations", insights.recommendations);

    doc.save(`voicedash-report-${Date.now()}.pdf`);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex flex-wrap gap-2 justify-end">
        <Button variant="secondary" size="sm" onClick={copyReport}><Copy className="h-4 w-4 mr-1" />Copy</Button>
        <Button variant="secondary" size="sm" onClick={downloadPdf}><FileDown className="h-4 w-4 mr-1" />PDF</Button>
        {audioUrl && (
          <Button variant="secondary" size="sm" asChild>
            <a href={audioUrl} download={`narration.mp3`}><Download className="h-4 w-4 mr-1" />Audio</a>
          </Button>
        )}
      </div>

      <Card className="p-4 glass overflow-hidden">
        <img src={imageUrl} alt="Uploaded dashboard" className="w-full rounded-lg" />
      </Card>

      <Card className="p-5 glass">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-8 w-8 rounded-lg bg-gradient-primary/20 grid place-items-center">
            <MessageSquareQuote className="h-4 w-4 text-primary" />
          </div>
          <h3 className="font-semibold">Voice Commentary</h3>
          <span className="text-xs text-muted-foreground ml-auto uppercase">{language}</span>
        </div>
        <p className="text-sm leading-relaxed whitespace-pre-line">{insights.voiceScript}</p>

        {audioUrl ? (
          <div className="mt-4 space-y-3 pt-4 border-t border-border">
            <div className="flex items-center gap-2 flex-wrap">
              <Button onClick={togglePlay} size="icon" className="bg-gradient-primary text-primary-foreground shadow-glow">
                {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
              <Button onClick={stop} size="icon" variant="secondary" title="Stop"><Square className="h-4 w-4" /></Button>
              <Button onClick={replay} size="icon" variant="secondary" title="Replay"><RotateCcw className="h-4 w-4" /></Button>
              <span className="text-xs tabular-nums text-muted-foreground min-w-[80px]">
                {fmt(currentTime)} / {fmt(duration)}
              </span>
              <select
                value={speed}
                onChange={(e) => { const s = parseFloat(e.target.value); setSpeed(s); if (audioRef.current) audioRef.current.playbackRate = s; }}
                className="bg-secondary text-sm rounded px-2 py-1 border border-border"
                title="Playback speed"
              >
                {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map(s => <option key={s} value={s}>{s}x</option>)}
              </select>
              <div className="flex items-center gap-1">
                <Button onClick={toggleMute} size="icon" variant="ghost" title="Mute">
                  {muted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </Button>
                <input
                  type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume}
                  onChange={(e) => { const v = parseFloat(e.target.value); setVolume(v); setMuted(v === 0); if (audioRef.current) { audioRef.current.volume = v; audioRef.current.muted = v === 0; } }}
                  className="w-20 accent-primary"
                />
              </div>
              <Button asChild size="sm" variant="secondary" className="ml-auto">
                <a href={audioUrl} download={`voice-commentary-${Date.now()}.mp3`}><Download className="h-4 w-4 mr-1" />Download</a>
              </Button>
            </div>
            <input
              type="range" min={0} max={100} step={0.1} value={progress}
              onChange={(e) => { const p = parseFloat(e.target.value); setProgress(p); seek(p); }}
              className="w-full accent-primary"
            />
            <audio
              ref={audioRef} src={audioUrl} preload="metadata"
              onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
              onTimeUpdate={(e) => { const a = e.currentTarget; setCurrentTime(a.currentTime); setProgress((a.currentTime / (a.duration || 1)) * 100); }}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => { setPlaying(false); setProgress(0); setCurrentTime(0); }}
            />
            {playing && (
              <div className="flex items-end gap-1 h-8 justify-center">
                {Array.from({ length: 24 }).map((_, i) => (
                  <motion.div key={i} className="w-1 bg-gradient-primary rounded-full"
                    animate={{ height: ["20%", "100%", "30%"] }}
                    transition={{ duration: 0.8 + (i % 5) * 0.1, repeat: Infinity, delay: i * 0.04 }}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <BrowserVoicePlayer text={insights.voiceScript} language={language} autoPlay={autoPlay} />
        )}
      </Card>

      <Section icon={Sparkles} title="Executive Summary">
        <p className="text-sm leading-relaxed">{insights.summary}</p>
      </Section>
      <Grid>
        <Section icon={Lightbulb} title="Key Insights" items={insights.keyInsights} />
        <Section icon={TrendingUp} title="Trends" items={insights.trends} />
        <Section icon={AlertTriangle} title="Anomalies" items={insights.anomalies} />
        <Section icon={Sparkles} title="Recommendations" items={insights.recommendations} />
      </Grid>
    </motion.div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid md:grid-cols-2 gap-4">{children}</div>;
}

function Section({
  icon: Icon, title, items, children,
}: { icon: React.ElementType; title: string; items?: string[]; children?: React.ReactNode }) {
  return (
    <Card className="p-5 glass">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-8 w-8 rounded-lg bg-gradient-primary/20 grid place-items-center">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <h3 className="font-semibold">{title}</h3>
      </div>
      {children}
      {items && (
        <ul className="space-y-2">
          {items.length === 0 && <li className="text-sm text-muted-foreground">None detected.</li>}
          {items.map((it, i) => (
            <li key={i} className="text-sm flex gap-2">
              <span className="text-primary mt-1">•</span><span className="flex-1">{it}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function BrowserVoicePlayer({ text, language, autoPlay }: { text: string; language: string; autoPlay?: boolean }) {
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) { setSupported(false); return; }
    return () => { try { window.speechSynthesis.cancel(); } catch { /* */ } };
  }, []);

  const speak = () => {
    if (!supported) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const targetLang = language === "hi" ? "hi-IN" : language === "mr" ? "mr-IN" : "en-US";
      u.lang = targetLang;
      const voices = window.speechSynthesis.getVoices();
      // Prefer exact lang match; for Marathi fall back to Hindi voice if mr-IN isn't installed.
      const match = voices.find(v => v.lang === targetLang)
        || (language === "mr" ? voices.find(v => v.lang === "hi-IN" || v.lang.startsWith("hi")) : undefined)
        || voices.find(v => v.lang.startsWith(targetLang.split("-")[0]));
      if (match) u.voice = match;
      u.rate = 1; u.pitch = 1;
      u.onend = () => { setPlaying(false); setPaused(false); };
      u.onerror = () => { setPlaying(false); setPaused(false); };
      window.speechSynthesis.speak(u);
      setPlaying(true); setPaused(false);
    } catch { toast.error("Unable to play voice"); }
  };
  const pause = () => { window.speechSynthesis.pause(); setPaused(true); };
  const resume = () => { window.speechSynthesis.resume(); setPaused(false); };
  const stop = () => { window.speechSynthesis.cancel(); setPlaying(false); setPaused(false); };

  useEffect(() => {
    if (!autoPlay || !supported || !text) return;
    const t = setTimeout(speak, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlay, supported, text]);

  if (!supported) {
    return <p className="mt-3 text-xs text-muted-foreground">Audio narration unavailable for this report.</p>;
  }
  return (
    <div className="mt-4 pt-4 border-t border-border space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        {!playing ? (
          <Button onClick={speak} size="sm" className="bg-gradient-primary text-primary-foreground shadow-glow">
            <Play className="h-4 w-4 mr-1" />Play voice
          </Button>
        ) : paused ? (
          <Button onClick={resume} size="sm" className="bg-gradient-primary text-primary-foreground shadow-glow">
            <Play className="h-4 w-4 mr-1" />Resume
          </Button>
        ) : (
          <Button onClick={pause} size="sm" variant="secondary">
            <Pause className="h-4 w-4 mr-1" />Pause
          </Button>
        )}
        <Button onClick={stop} size="sm" variant="secondary" disabled={!playing}>
          <Square className="h-4 w-4 mr-1" />Stop
        </Button>
        <span className="text-xs text-muted-foreground">Browser voice (downloadable MP3 unavailable)</span>
      </div>
      {playing && !paused && (
        <div className="flex items-end gap-1 h-6">
          {Array.from({ length: 18 }).map((_, i) => (
            <motion.div key={i} className="w-1 bg-gradient-primary rounded-full"
              animate={{ height: ["20%", "100%", "30%"] }}
              transition={{ duration: 0.8 + (i % 5) * 0.1, repeat: Infinity, delay: i * 0.04 }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
