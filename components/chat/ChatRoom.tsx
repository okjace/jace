"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/types";
import { Avatar } from "@/components/Avatar";
import { AttachmentButton } from "@/components/AttachmentButton";
import { AttachmentPreview } from "@/components/AttachmentPreview";
import { EmojiPicker } from "@/components/EmojiPicker";
import { ReportButton } from "@/components/reports/ReportButton";
import { PostAsSelect } from "@/components/forums/PostAsSelect";
import { uploadAttachment, type Attachment } from "@/lib/clientUpload";

export function ChatRoom({
  initialMessages,
  currentUserId,
  currentUserName,
  currentUserImageUrl,
  canModerate,
  orgs = [],
}: {
  initialMessages: ChatMessage[];
  currentUserId: string | null;
  currentUserName: string | null;
  currentUserImageUrl?: string;
  /** Whether the signed-in user is an admin (root or granted) — computed server-side. */
  canModerate: boolean;
  /** Orgs the signed-in user can chat as (owner or org admin). */
  orgs?: { id: string; name: string; imageUrl?: string }[];
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [postAsOrgId, setPostAsOrgId] = useState("");
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const pendingRef = useRef<ChatMessage[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/chat", { cache: "no-store" });
        if (!res.ok) return;
        const { messages: fresh } = (await res.json()) as {
          messages: ChatMessage[];
        };
        const freshIds = new Set(fresh.map((m) => m.id));
        pendingRef.current = pendingRef.current.filter((m) => !freshIds.has(m.id));
        setMessages([...fresh, ...pendingRef.current]);
      } catch {
        // Skip this tick; the next poll will try again.
      }
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function handleDelete(messageId: string) {
    setDeletingId(messageId);
    try {
      const res = await fetch(`/api/chat/${messageId}`, { method: "DELETE" });
      if (res.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
      }
    } finally {
      setDeletingId(null);
    }
  }

  async function handleAttach(file: File) {
    setUploading(true);
    try {
      setAttachment(await uploadAttachment("chat/attachments", file));
    } catch {
      // Best-effort: leave the composer as-is so the user can retry.
    } finally {
      setUploading(false);
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if ((!trimmed && !attachment) || !currentUserId) return;
    setInput("");
    const sentAttachment = attachment;
    setAttachment(null);
    setSending(true);

    const asOrg = orgs.find((o) => o.id === postAsOrgId);
    const optimistic: ChatMessage = {
      id: `pending-${crypto.randomUUID()}`,
      userId: asOrg?.id ?? currentUserId,
      userType: asOrg ? "org" : "user",
      userName: asOrg?.name ?? currentUserName ?? "Anonymous",
      userImageUrl: asOrg ? asOrg.imageUrl : currentUserImageUrl,
      body: trimmed,
      attachment: sentAttachment ?? undefined,
      createdAt: new Date().toISOString(),
    };
    pendingRef.current = [...pendingRef.current, optimistic];
    setMessages((prev) => [...prev, optimistic]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: trimmed,
          attachment: sentAttachment,
          postAsOrgId: postAsOrgId || undefined,
        }),
      });
      if (res.ok) {
        const { message } = (await res.json()) as { message: ChatMessage };
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
        {messages.map((m) => {
          const isPending = m.id.startsWith("pending-");
          const canDelete =
            !isPending &&
            (m.userId === currentUserId || orgs.some((o) => o.id === m.userId) || canModerate);
          return (
            <div key={m.id} className="flex items-start gap-2">
              <Avatar name={m.userName} imageUrl={m.userImageUrl} size={28} />
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold">{m.userName}</span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {new Date(m.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  {!isPending && !canDelete && m.userId !== currentUserId && (
                    <ReportButton targetType="chat_message" targetId={m.id} />
                  )}
                  {canDelete && (
                    <button
                      onClick={() => handleDelete(m.id)}
                      disabled={deletingId === m.id}
                      className="text-xs text-red-500 underline underline-offset-2 disabled:opacity-50"
                    >
                      {deletingId === m.id ? "Deleting…" : "Delete"}
                    </button>
                  )}
                </div>
                {m.body && (
                  <p className="whitespace-pre-wrap break-words text-sm">{m.body}</p>
                )}
                {m.attachment && <AttachmentPreview attachment={m.attachment} />}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {currentUserId ? (
        <form onSubmit={handleSend} className="flex flex-col gap-2">
          <PostAsSelect orgs={orgs} value={postAsOrgId} onChange={setPostAsOrgId} />
          {attachment && (
            <div className="flex w-fit items-center gap-2 rounded-md border border-black/10 px-2 py-1 text-xs dark:border-white/15">
              📎 {attachment.name}
              <button
                type="button"
                onClick={() => setAttachment(null)}
                className="text-red-500"
                aria-label="Remove attachment"
              >
                ✕
              </button>
            </div>
          )}
          <div className="flex gap-2">
            <EmojiPicker onSelect={(emoji) => setInput((v) => v + emoji)} />
            <AttachmentButton onFileSelected={handleAttach} disabled={uploading} />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Message..."
              maxLength={1000}
              className="flex-1 rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/15 dark:focus:border-white/40"
            />
            <button
              type="submit"
              disabled={sending || uploading || (!input.trim() && !attachment)}
              className="h-10 rounded-full bg-accent px-5 text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </form>
      ) : (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Sign in to chat.
        </p>
      )}
    </div>
  );
}
