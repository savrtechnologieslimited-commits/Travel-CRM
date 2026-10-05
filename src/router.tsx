import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

function RouterPending() {
  return (
    <main
      role="status"
      aria-live="polite"
      className="grid min-h-screen place-items-center bg-background px-4 text-sm text-muted-foreground"
    >
      <div className="text-center">
        <p>Loading page…</p>
      </div>
    </main>
  );
}

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        gcTime: 30 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        retry: 1,
      },
    },
  });


  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPendingComponent: RouterPending,
    defaultPendingMs: 1_000,
    defaultPendingMinMs: 300,
    defaultPreload: "intent",
    defaultPreloadDelay: 50,
    defaultPreloadStaleTime: 0,
  });


  return router;
};
