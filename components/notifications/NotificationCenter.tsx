"use client";

import { useEffect, useRef, useState } from "react";
import type { AppNotification, NotificationType, PendingCallInvite } from "@/lib/types";

const POLL_MS = 3000;
const AUTO_DISMISS_MS = 30000;

type Toast = {
  id: string;
  icon: string;
  title: string;
  subtitle?: string;
  url: string;
  external: boolean;
  createdAt: string;
};

const ICON_BY_TYPE: Record<NotificationType, string> = {
  message: "💬",
  video_comment: "💭",
  forum_reply: "📝",
};

function callInviteToToast(invite: PendingCallInvite): Toast {
  return {
    id: `call-${invite.id}`,
    icon: "📞",
    title: `${invite.fromName} is calling`,
    subtitle: invite.context.type === "dm" ? "Direct message" : invite.context.groupName,
    url: invite.callUrl,
    external: true,
    createdAt: invite.createdAt,
  };
}

function notificationToToast(n: AppNotification): Toast {
  return {
    id: `notif-${n.id}`,
    icon: ICON_BY_TYPE[n.type],
    title: n.title,
    subtitle: n.body,
    url: n.linkUrl,
    external: false,
    createdAt: n.createdAt,
  };
}

export function NotificationCenter({ currentUserId }: { currentUserId: string }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const sinceCallRef = useRef(new Date().toISOString());
  const sinceNotifRef = useRef(new Date().toISOString());
  const shownIdsRef = useRef(new Set<string>());

  function dismiss(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const [callRes, notifRes] = await Promise.all([
          fetch(`/api/call-invites?since=${encodeURIComponent(sinceCallRef.current)}`, {
            cache: "no-store",
          }),
          fetch(`/api/notifications?since=${encodeURIComponent(sinceNotifRef.current)}`, {
            cache: "no-store",
          }),
        ]);

        const fresh: Toast[] = [];

        if (callRes.ok) {
          const { invites } = (await callRes.json()) as { invites: PendingCallInvite[] };
          if (invites.length > 0) {
            sinceCallRef.current = invites[invites.length - 1].createdAt;
            fresh.push(...invites.map(callInviteToToast));
          }
        }

        if (notifRes.ok) {
          const { notifications } = (await notifRes.json()) as {
            notifications: AppNotification[];
          };
          if (notifications.length > 0) {
            sinceNotifRef.current = notifications[notifications.length - 1].createdAt;
            fresh.push(...notifications.map(notificationToToast));
          }
        }

        const newOnes = fresh.filter((t) => !shownIdsRef.current.has(t.id));
        if (newOnes.length === 0) return;

        newOnes.forEach((t) => shownIdsRef.current.add(t.id));
        newOnes.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
        setToasts((prev) => [...prev, ...newOnes]);
        newOnes.forEach((t) => {
          setTimeout(() => dismiss(t.id), AUTO_DISMISS_MS);
        });
      } catch {
        // Try again next tick.
      }
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [currentUserId]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="flex items-center gap-3 rounded-lg border border-black/10 bg-background p-3 shadow-lg dark:border-white/15"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {t.icon} {t.title}
            </p>
            {t.subtitle && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">{t.subtitle}</p>
            )}
          </div>
          <a
            href={t.url}
            {...(t.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            onClick={() => dismiss(t.id)}
            className="h-8 shrink-0 rounded-full bg-accent px-3 text-xs font-medium leading-8 text-on-accent transition-colors hover:bg-accent-hover"
          >
            {t.external ? "Join" : "View"}
          </a>
          <button
            onClick={() => dismiss(t.id)}
            aria-label="Dismiss"
            className="shrink-0 text-zinc-500 hover:text-foreground dark:text-zinc-400"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
