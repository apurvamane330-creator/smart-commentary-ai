import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { supabase } from "@/integrations/supabase/client";

async function waitForSession() {
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session;
  if (typeof window === "undefined") return null;

  return await new Promise<typeof data.session>((resolve) => {
    const timer = window.setTimeout(() => {
      sub.subscription.unsubscribe();
      resolve(null);
    }, 3000);

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) return;
      window.clearTimeout(timer);
      sub.subscription.unsubscribe();
      resolve(session);
    });
  });
}

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    const session = await waitForSession();
    if (!session) throw redirect({ to: "/login" });
  },
  component: Layout,
});

function Layout() {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <header className="h-12 flex items-center border-b border-border/50 px-2 glass sticky top-0 z-10">
            <SidebarTrigger />
          </header>
          <main className="flex-1 p-4 md:p-8">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
