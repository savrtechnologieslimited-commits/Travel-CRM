import { Bell } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useMarkNotifications, useNotifications } from "@/lib/data";
import { formatDateTime, titleize } from "@/lib/crm";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function NotificationBell() {
  const notifications = useNotifications();
  const mark = useMarkNotifications();
  const items = notifications.data ?? [];
  const unread = items.filter((n) => !n.is_read);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="size-5" />
          {unread.length > 0 && (
            <span className="absolute top-1 right-1 grid size-4 place-items-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
              {unread.length > 9 ? "9+" : unread.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <p className="text-sm font-medium">Notifications</p>
          {unread.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => mark.mutate(unread.map((n) => n.id))}
            >
              Mark all read
            </Button>
          )}
        </div>
        <div className="max-h-80 divide-y divide-border overflow-y-auto">
          {items.map((n) => {
            const body = (
              <div className="px-3 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <p className={n.is_read ? "text-sm" : "text-sm font-medium"}>{n.title}</p>
                  <Badge variant="outline" className="text-[10px]">
                    {titleize(n.category)}
                  </Badge>
                </div>
                {n.body && <p className="mt-1 text-xs text-muted-foreground">{n.body}</p>}
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {formatDateTime(n.created_at)}
                </p>
              </div>
            );
            return n.link ? (
              <Link key={n.id} to={n.link} className="block hover:bg-muted/60">
                {body}
              </Link>
            ) : (
              <div key={n.id} className="hover:bg-muted/60">
                {body}
              </div>
            );
          })}
          {items.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              You're all caught up.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
