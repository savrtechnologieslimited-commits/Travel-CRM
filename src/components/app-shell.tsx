import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  UserRound,
  MessageSquareText,
  CalendarClock,
  FileText,
  Plane,
  Wallet,
  Menu,
  LogOut,
  Globe2,
  Building2,
  Package,
  UsersRound,
  MessageCircle,
  PanelLeftClose,
  Mail,
  ClipboardList,
  Settings,
  BarChart3,
  Activity,
  UserCog,
  Receipt,
  FileSpreadsheet,
  Truck,
  PiggyBank,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NotificationBell } from "@/components/notification-bell";
import { CurrencyConverterDialog, CurrencyRatesProvider } from "@/components/currency-converter";
import { useFollowUpReminders } from "@/lib/followup-data";
import { useCurrentUserTabPermissions } from "@/lib/admin-data";

export const NAVIGATION_GROUPS = [
  {
    id: "pipeline",
    label: "Pipeline",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/leads", label: "Leads", icon: Users },
      { to: "/customers", label: "Customers", icon: UserRound },
    ],
  },
  {
    id: "customers",
    label: "Customers",
    items: [],
  },
  {
    id: "itineraries",
    label: "Itinerary Creation Module",
    items: [
      { to: "/itinerary-proposals", label: "Create Itinerary/Proposal", icon: ClipboardList },
      { to: "/itinerary-library", label: "Itinerary Library", icon: FileText },
    ],
  },
  {
    id: "sales",
    label: "Sales",
    items: [
      { to: "/quotations", label: "Quotations", icon: FileText },
      { to: "/bookings", label: "Bookings", icon: Plane },
      { to: "/payments", label: "Payments", icon: Wallet },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    items: [
      { to: "/suppliers", label: "Suppliers", icon: Building2 },
      { to: "/packages", label: "Packages", icon: Package },
      { to: "/groups", label: "Travel Groups", icon: UsersRound },
    ],
  },
  {
    id: "more",
    label: "More",
    items: [
      { to: "/wacrm", label: "WhatsApp", icon: MessageCircle },
      { to: "/gmail", label: "Mail Accounts", icon: Mail },
      { to: "/operations", label: "Operations Board", icon: Truck },
      { to: "/team-tasks", label: "Team Tasks", icon: ClipboardList },
      { to: "/reports", label: "Reports", icon: BarChart3 },
      { to: "/activity", label: "Activity Log", icon: Activity },
      { to: "/team", label: "Team & Permissions", icon: UserCog },
      { to: "/settings", label: "Settings", icon: Settings },
      { to: "/payables", label: "Payables & Expenses", icon: Receipt },
      { to: "/invoices", label: "Invoices & Vouchers", icon: FileSpreadsheet },
      { to: "/finance", label: "Finance Dashboard", icon: PiggyBank },
    ],
  },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isWacrmWorkspace = pathname === "/wacrm" || pathname === "/messaging";
  const { data: allowedTabs, isError: tabAccessError } = useCurrentUserTabPermissions();
  useFollowUpReminders();
  const assignedTabs = new Set<string>(allowedTabs ?? []);
  const visibleGroups = NAVIGATION_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => assignedTabs.has(item.to)),
  })).filter((group) => group.items.length > 0);

  const currentTabIsAllowed = allowedTabs?.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
  const fallbackPath = allowedTabs?.find((path) => path !== "/team") ?? allowedTabs?.[0];

  useEffect(() => {
    if (allowedTabs && !currentTabIsAllowed && fallbackPath) {
      void navigate({ to: fallbackPath });
    }
  }, [allowedTabs, currentTabIsAllowed, fallbackPath, navigate]);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  return (
    <CurrencyRatesProvider>
      <div
        className={cn(
          "flex bg-background",
          isWacrmWorkspace ? "h-dvh overflow-hidden" : "min-h-screen",
        )}
      >
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-sidebar text-sidebar-foreground transition-transform",
            mobileSidebarOpen ? "translate-x-0" : "-translate-x-full",
            desktopSidebarOpen ? "lg:translate-x-0" : "lg:-translate-x-full",
          )}
        >
          <div className="flex items-center gap-3 px-5 py-5">
            <div className="grid size-10 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
              <Globe2 className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-display text-base leading-tight font-semibold">SAVR Travels</p>
              <p className="text-xs text-sidebar-foreground/60">Travel Operations OS</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              onClick={() => {
                if (window.matchMedia("(min-width: 1024px)").matches) {
                  setDesktopSidebarOpen(false);
                } else {
                  setMobileSidebarOpen(false);
                }
              }}
              aria-label="Close sidebar"
              title="Close sidebar"
            >
              <PanelLeftClose className="size-5" />
            </Button>
          </div>

          <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-6">
            {visibleGroups.map((group) => (
              <div key={group.id}>
                <p className="px-3 pb-2 text-[11px] tracking-wider text-sidebar-foreground/50 uppercase">
                  {group.label}
                </p>
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const active = pathname.startsWith(item.to);
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        onClick={() => setMobileSidebarOpen(false)}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                          active
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                        )}
                      >
                        <item.icon className="size-4" />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="border-t border-sidebar-border p-3">
            <button
              onClick={signOut}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
            >
              <LogOut className="size-4" /> Sign out
            </button>
          </div>
        </aside>

        {mobileSidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/40 lg:hidden"
            onClick={() => setMobileSidebarOpen(false)}
            aria-hidden
          />
        )}

        <div
          className={cn("flex min-h-0 min-w-0 flex-1 flex-col", desktopSidebarOpen && "lg:pl-64")}
        >
          <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-background/85 px-4 py-3 backdrop-blur lg:px-8">
            <Button
              variant="ghost"
              size="icon"
              className={cn(desktopSidebarOpen && "lg:hidden")}
              onClick={() => {
                if (window.matchMedia("(min-width: 1024px)").matches) {
                  setDesktopSidebarOpen(true);
                } else {
                  setMobileSidebarOpen((isOpen) => !isOpen);
                }
              }}
              aria-label="Open navigation"
              title="Open navigation"
            >
              <Menu className="size-5" />
            </Button>
            <Badge variant="secondary" className="hidden sm:inline-flex">
              Domestic + International
            </Badge>
            <div className="flex-1" />
            <CurrencyConverterDialog />
            <NotificationBell />
            <p className="text-xs text-muted-foreground">
              {new Date().toLocaleDateString("en-IN", {
                weekday: "short",
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </p>
          </header>
          <main
            className={cn(
              "min-w-0 flex-1 px-4 py-6 lg:px-8",
              isWacrmWorkspace && "flex min-h-0 flex-col overflow-hidden px-0 py-0",
            )}
          >
            {tabAccessError ? (
              <p className="text-sm text-destructive">
                Unable to load your tab access. Please refresh or contact an administrator.
              </p>
            ) : !allowedTabs ? (
              <p className="text-sm text-muted-foreground">Loading your tab access…</p>
            ) : currentTabIsAllowed ? (
              children
            ) : allowedTabs.length === 0 ? (
              <p className="text-sm text-destructive">
                No CRM tabs are assigned to your account. Contact an administrator.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Redirecting to an allowed tab…</p>
            )}
          </main>
        </div>
      </div>
    </CurrencyRatesProvider>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-semibold text-foreground">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
