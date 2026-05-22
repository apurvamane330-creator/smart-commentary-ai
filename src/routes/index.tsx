import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { motion } from "framer-motion";
import { Mic, Sparkles, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";


export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
  },
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();

  // After OAuth redirect back to "/", Supabase processes the URL hash
  // asynchronously. Listen for the session and forward to the dashboard.
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted && data.session) navigate({ to: "/dashboard", replace: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) navigate({ to: "/dashboard", replace: true });
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, [navigate]);

  return (
    <div className="min-h-screen">
      <header className="container mx-auto flex items-center justify-between py-6 px-4">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-gradient-primary shadow-glow grid place-items-center">
            <Mic className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-bold text-lg">VoiceDash AI</span>
        </div>
        <Link to="/login"><Button variant="secondary">Sign in</Button></Link>
      </header>

      <main className="container mx-auto px-4 py-20 text-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <span className="inline-flex items-center gap-2 rounded-full glass px-4 py-1.5 text-xs">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Powered by Gemini + your Python analysis service
          </span>
          <h1 className="mt-6 text-5xl md:text-7xl font-bold tracking-tight">
            <span className="gradient-text">AI Voice Commentary</span>
            <br /> for any Dashboard
          </h1>
          <p className="mt-6 max-w-2xl mx-auto text-lg text-muted-foreground">
            Drop a dashboard screenshot. We extract KPIs, detect trends, and narrate the story —
            with downloadable voice commentary.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link to="/login">
              <Button size="lg" className="bg-gradient-primary text-primary-foreground shadow-glow">
                Get started
              </Button>
            </Link>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="mt-20 grid md:grid-cols-3 gap-4 max-w-4xl mx-auto"
        >
          {[
            { icon: BarChart3, title: "Chart & KPI extraction", desc: "Python OCR + Gemini Vision read your charts with high accuracy." },
            { icon: Sparkles, title: "Executive summary", desc: "Trends, anomalies and recommendations in plain English." },
            { icon: Mic, title: "Downloadable narration", desc: "Google Neural voices in English & Hindi, exportable as MP3." },
          ].map((f, i) => (
            <div key={i} className="glass rounded-2xl p-6 text-left">
              <f.icon className="h-6 w-6 text-primary mb-3" />
              <h3 className="font-semibold">{f.title}</h3>
              <p className="text-sm text-muted-foreground mt-1">{f.desc}</p>
            </div>
          ))}
        </motion.div>
      </main>
    </div>
  );
}
