"use client";

import { useEffect, useRef, useState } from "react";
import type { DirectMessage } from "@/lib/types";
import { Avatar } from "@/components/Avatar";
import { AttachmentButton } from "@/components/AttachmentButton";
import { AttachmentPreview } from "@/components/AttachmentPreview";
import { EmojiPicker } from "@/components/EmojiPicker";
import { uploadAttachment, type Attachment } from "@/lib/clientUpload";

export function DmThread({
  otherId,
  otherName,
  otherImageUrl,
  initialMessages,
  currentUserId,
  currentUserName,
  currentUserImageUrl,
  asOrgId,
}: {
  otherId: string;
  otherName: string;
  otherImageUrl?: string;
  initialMessages: DirectMessage[];
  currentUserId: string;
  currentUserName: string;
  currentUserImageUrl?: string;
  /** Set when an org admin is messaging on behalf of an org. */
  asOrgId?: string;
}) {
  const asQuery = asOrgId ? `?as=${asOrgId}` : "";
  const [messages, setMessages] = useState<DirectMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const pendingRef = useRef<DirectMessage[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/dms/${otherId}${asQuery}`, { cache: "no-store" });
        if (!res.ok) return;
        const { messages: fresh } = (await res.json()) as {
          messages: DirectMessage[];
        };
        const freshIds = new Set(fresh.map((m) => m.id));
        pendingRef.current = pendingRef.current.filter((m) => !freshIds.has(m.id));
        setMessages([...fresh, ...pendingRef.current]);
      } catch {
        // Skip this tick; the next poll will try again.
      }
    }, 2500);
    return () => clearInterval(interval);
  }, [otherId, asQuery]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function handleDelete(messageId: string) {
    setDeletingId(messageId);
    try {
      const res = await fetch(`/api/dms/${otherId}/${messageId}`, {
        method: "DELETE",
      });
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
      setAttachment(await uploadAttachment(`dms/${otherId}/attachments`, file));
    } catch {
      // Best-effort: leave the composer as-is so the user can retry.
    } finally {
      setUploading(false);
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed && !attachment) return;
    setInput("");
    const sentAttachment = attachment;
    setAttachment(null);
    setSending(true);

    const optimistic: DirectMessage = {
      id: `pending-${crypto.randomUUID()}`,
      conversationId: "",
      fromId: currentUserId,
      fromName: currentUserName,
      toId: otherId,
      toName: otherName,
      body: trimmed,
      attachment: sentAttachment ?? undefined,
      createdAt: new Date().toISOString(),
    };
    pendingRef.current = [...pendingRef.current, optimistic];
    setMessages((prev) => [...prev, optimistic]);

    try {
      const res = await fetch(`/api/dms/${otherId}${asQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: trimmed, attachment: sentAttachment }),
      });
      if (res.ok) {
        const { message } = (await res.json()) as { message: DirectMessage };
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
      <div className="flex h-[60vh] flex-col gap-3 overflow-y-auto rounded-2xl border border-line bg-panel p-5">
        {messages.length === 0 && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No messages yet. Say hello to {otherName}!
          </p>
        )}
        {messages.map((m) => {
          const mine = m.fromId === currentUserId;
          const isPending = m.id.startsWith("pending-");
          return (
            <div
              key={m.id}
              className={`flex items-end gap-2 ${mine ? "flex-row-reverse" : ""}`}
            >
              <Avatar
                name={mine ? currentUserName : otherName}
                imageUrl={mine ? currentUserImageUrl : otherImageUrl}
                size={28}
              />
              <div className={`flex max-w-[75%] flex-col gap-0.5 ${mine ? "items-end" : "items-start"}`}>
                {m.body && (
                  <div
                    className={`whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${
                      mine
                        ? "bg-accent text-on-accent"
                        : "border border-line"
                    }`}
                  >
                    {m.body}
                  </div>
                )}
                {m.attachment && <AttachmentPreview attachment={m.attachment} />}
                {m.kind === "call_invite" && m.callUrl && (
                  <a
                    href={m.callUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-on-accent transition-colors hover:bg-accent-hover"
                  >
                    Join call
                  </a>
                )}
                <div className="flex items-center gap-2 px-1">
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {new Date(m.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  {mine && !isPending && (
                    <button
                      onClick={() => handleDelete(m.id)}
                      disabled={deletingId === m.id}
                      className="text-xs text-red-500 underline underline-offset-2 disabled:opacity-50"
                    >
                      {deletingId === m.id ? "Deleting…" : "Delete"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSend} className="flex flex-col gap-2">
        {attachment && (
          <div className="flex w-fit items-center gap-2 rounded-md border border-line px-2 py-1 text-xs">
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
            placeholder={`Message ${otherName}...`}
            maxLength={2000}
            className="flex-1 rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
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
    </div>
  );
}
