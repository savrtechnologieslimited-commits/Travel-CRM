import {
  createFileRoute,
  Outlet,
  redirect,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { useCurrentUserTabPermissions } from "@/lib/admin-data";

let bootstrappedUserId: string | null = null;

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let sessionResult: Awaited<ReturnType<typeof supabase.auth.getSession>> | null;
    try {
      sessionResult = await Promise.race([
        supabase.auth.getSession(),
        new Promise<null>((resolve) => {
          timeout = setTimeout(() => resolve(null), 5_000);
        }),
      ]);
    } catch (sessionError) {
      console.error("Could not check the signed-in session:", sessionError);
      throw redirect({ to: "/auth" });
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
    }

    if (!sessionResult) {
      console.error("Session check timed out; returning to sign-in.");
      throw redirect({ to: "/auth" });
    }

    const { data, error } = sessionResult;
    if (error || !data.session?.user) throw redirect({ to: "/auth" });
    // Profile bootstrap is session-scoped; avoid repeating the RPC on every child-route navigation.
    if (bootstrappedUserId !== data.session.user.id) {
      bootstrappedUserId = data.session.user.id;
      void Promise.resolve(supabase.rpc("bootstrap_current_user"))
        .then(({ error: bootstrapError }) => {
          if (bootstrapError) {
            bootstrappedUserId = null;
            console.error("Could not bootstrap the signed-in user's profile:", bootstrapError);
          }
        })
        .catch((bootstrapError: unknown) => {
          bootstrappedUserId = null;
          console.error("Could not bootstrap the signed-in user's profile:", bootstrapError);
        });
    }
    return { user: data.session.user };
  },

  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  if (pathname === "/itinerary-builder") return <ItineraryBuilderAccess />;

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

function ItineraryBuilderAccess() {
  const navigate = useNavigate();
  const { data: allowedTabs, isError } = useCurrentUserTabPermissions();
  const canAccessBuilder = allowedTabs?.includes("/itinerary-proposals") ?? false;

  useEffect(() => {
    if (allowedTabs && !canAccessBuilder) {
      const fallback = allowedTabs.find((path) => path !== "/team") ?? allowedTabs[0];
      if (fallback) void navigate({ to: fallback });
    }
  }, [allowedTabs, canAccessBuilder, navigate]);

  if (isError) {
    return (
      <p className="p-6 text-sm text-destructive">
        Unable to verify your tab access. Please refresh or contact an administrator.
      </p>
    );
  }
  if (!allowedTabs) {
    return <p className="p-6 text-sm text-muted-foreground">Loading your tab access…</p>;
  }
  if (!canAccessBuilder) {
    return allowedTabs.length === 0 ? (
      <p className="p-6 text-sm text-destructive">
        No CRM tabs are assigned to your account. Contact an administrator.
      </p>
    ) : (
      <p className="p-6 text-sm text-muted-foreground">Redirecting to an allowed tab…</p>
    );
  }

  return <Outlet />;
}
