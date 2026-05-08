import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Trash2, Search, FileText, Eye } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { ReportView } from "@/components/ReportView";
import type { Insights } from "@/lib/analyze.functions";

export const Route = createFileRoute("/_authenticated/history")({
  component: HistoryPage,
});

type Row = {
  id: string; image_url: string; audio_url: string | null;
  language: string; created_at: string; insights: Insights;
};

function HistoryPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Row | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("reports").select("*").order("created_at", { ascending: false }).limit(100);
    if (error) toast.error(error.message);
    setRows((data ?? []) as never);
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const remove = async (id: string) => {
    const { error } = await supabase.from("reports").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setRows((r) => r.filter((x) => x.id !== id));
    toast.success("Deleted");
  };

  const filtered = rows.filter((r) =>
    !q || (r.insights?.summary ?? "").toLowerCase().includes(q.toLowerCase())
  );

  if (open) {
    return (
      <div className="max-w-5xl mx-auto space-y-4">
        <Button variant="secondary" onClick={() => setOpen(null)}>← Back to history</Button>
        <ReportView
          insights={open.insights}
          imageUrl={open.image_url}
          audioUrl={open.audio_url}
          language={open.language}
          createdAt={open.created_at}
          userEmail={user?.email ?? ""}
        />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">History</h1>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search insights…" className="pl-9 w-72" />
        </div>
      </div>

      {loading ? (
        <div className="grid md:grid-cols-2 gap-4 mt-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="h-44 glass animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="mt-6 p-12 glass text-center">
          <FileText className="h-10 w-10 mx-auto text-muted-foreground" />
          <p className="mt-3 font-medium">No reports yet</p>
          <p className="text-sm text-muted-foreground">Upload a dashboard to generate your first report.</p>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4 mt-6">
          {filtered.map((r, i) => (
            <motion.div key={r.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
              <Card className="glass overflow-hidden">
                <img src={r.image_url} alt="" className="h-36 w-full object-cover" />
                <div className="p-4 space-y-3">
                  <p className="text-sm line-clamp-2">{r.insights?.summary || "—"}</p>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{new Date(r.created_at).toLocaleString()}</span>
                    <span className="uppercase">{r.language}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" className="flex-1" onClick={() => setOpen(r)}>
                      <Eye className="h-4 w-4 mr-1" />View
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(r.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
