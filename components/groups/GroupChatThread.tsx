"use client";

import { useEffect, useRef, useState } from "react";
import type { GroupChatMessage } from "@/lib/types";
import { Avatar } from "@/components/Avatar";

export function GroupChatThread({
  groupId,
  initialMessages,
  currentUserId,
  currentUserName,
  memberImageUrls,
}: {
  groupId: string;
  initialMessages: GroupChatMessage[];
  currentUserId: string;
  currentUserName: string;
  memberImageUrls: Record<string, string | undefined>;
}) {
  const [messages, setMessages] = useState<GroupChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const pendingRef = useRef<GroupChatMessage[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/groups/${groupId}`, { cache: "no-store" });
        if (!res.ok) return;
        const { messages: fresh } = (await res.json()) as {
          messages: GroupChatMessage[];
        };
        const freshIds = new Set(fresh.map((m) => m.id));
        pendingRef.current = pendingRef.current.filter((m) => !freshIds.has(m.id));
        setMessages([...fresh, ...pendingRef.current]);
      } catch {
        // Skip this tick; the next poll will try again.
      }
    }, 2500);
    return () => clearInterval(interval);
  }, [groupId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    setInput("");
    setSending(true);

    const optimistic: GroupChatMessage = {
      id: `pending-${crypto.randomUUID()}`,
      groupId,
      fromId: currentUserId,
      fromName: currentUserName,
      body: trimmed,
      createdAt: new Date().toISOString(),
    };
    pendingRef.current = [...pendingRef.current, optimistic];
    setMessages((prev) => [...prev, optimistic]);

    try {
      const res = await fetch(`/api/groups/${groupId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: trimmed }),
      });
      if (res.ok) {
        const { message } = (await res.json()) as { message: GroupChatMessage };
        pendingRef.current = pendingRef.current.map((m) =>
          m.id === optimistic.id ? message : m,
        );
        setMessages((prev) =>
          prev.map((m) => (m.id === optimistic.id ? message : m)),
        );
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex h-[60vh] flex-col gap-3 overflow-y-auto rounded-lg border border-black/10 p-4 dark:border-white/15">
        {messages.length === 0 && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No messages yet. Say hello!
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className="flex items-start gap-2">
            <Avatar name={m.fromName} imageUrl={memberImageUrls[m.fromId]} size={28} />
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-semibold">{m.fromName}</span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {new Date(m.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <p className="whitespace-pre-wrap break-words text-sm">{m.body}</p>
              {m.kind === "call_invite" && m.callUrl && (
                <a
                  href={m.callUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block rounded-full bg-accent px-3 py-1 text-xs font-medium text-on-accent transition-colors hover:bg-accent-hover"
                >
                  Join call
                </a>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSend} className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Message..."
          maxLength={2000}
          className="flex-1 rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/15 dark:focus:border-white/40"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="h-10 rounded-full bg-accent px-5 text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
