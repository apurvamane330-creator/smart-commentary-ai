import { useState, useRef } from "react";
import type { Insights } from "@/lib/analyze.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { motion } from "framer-motion";
import { Play, Pause, Square, Download, Copy, FileDown, Sparkles, TrendingUp, AlertTriangle, Lightbulb } from "lucide-react";
import { toast } from "sonner";
import { jsPDF } from "jspdf";

export function ReportView({
  insights, imageUrl, audioUrl, language, createdAt, userEmail,
}: {
  insights: Insights;
  imageUrl: string;
  audioUrl: string | null;
  language: string;
  createdAt: string;
  userEmail: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(1);

  const togglePlay = () => {
    const a = audioRef.current; if (!a) return;
    if (a.paused) { a.play(); setPlaying(true); } else { a.pause(); setPlaying(false); }
  };
  const stop = () => { const a = audioRef.current; if (!a) return; a.pause(); a.currentTime = 0; setPlaying(false); setProgress(0); };

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

      {audioUrl && (
        <Card className="p-4 glass">
          <div className="flex items-center gap-3">
            <Button onClick={togglePlay} size="icon" className="bg-gradient-primary text-primary-foreground shadow-glow">
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
            <Button onClick={stop} size="icon" variant="secondary"><Square className="h-4 w-4" /></Button>
            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-gradient-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
            <select
              value={speed}
              onChange={(e) => { const s = parseFloat(e.target.value); setSpeed(s); if (audioRef.current) audioRef.current.playbackRate = s; }}
              className="bg-secondary text-sm rounded px-2 py-1 border border-border"
            >
              {[0.5, 0.75, 1, 1.25, 1.5, 2].map(s => <option key={s} value={s}>{s}x</option>)}
            </select>
          </div>
          <audio
            ref={audioRef} src={audioUrl} preload="metadata"
            onTimeUpdate={(e) => { const a = e.currentTarget; setProgress((a.currentTime / (a.duration || 1)) * 100); }}
            onEnded={() => { setPlaying(false); setProgress(0); }}
          />
          {playing && (
            <div className="mt-3 flex items-end gap-1 h-8 justify-center">
              {Array.from({ length: 24 }).map((_, i) => (
                <motion.div key={i} className="w-1 bg-gradient-primary rounded-full"
                  animate={{ height: ["20%", "100%", "30%"] }}
                  transition={{ duration: 0.8 + (i % 5) * 0.1, repeat: Infinity, delay: i * 0.04 }}
                />
              ))}
            </div>
          )}
        </Card>
      )}

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
