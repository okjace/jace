"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MarkdownContent } from "@/components/forums/MarkdownContent";
import { Logo } from "@/components/site/Logo";

export type LegalDoc = { id: "terms" | "privacy"; label: string; body: string };

/**
 * Site footer. Its Terms and Privacy buttons open the document in a popup
 * window, the same style as the READ ME popup. It only opens for the person
 * who clicked and doesn't change anything, unlike the READ ME popup.
 */
export function SiteFooter({ docs }: { docs: LegalDoc[] }) {
  const [openId, setOpenId] = useState<LegalDoc["id"] | null>(null);
  const open = docs.find((d) => d.id === openId) ?? null;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenId(null);
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open]);

  return (
    <footer className="mt-16 border-t border-line">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Logo size={24} />
          <div>
            <p className="text-sm font-semibold">Jace</p>
            <p className="text-xs text-muted">A company that makes stuff.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link href="/projects" className="rounded-full px-3 py-1.5 text-muted transition-colors hover:bg-foreground/[.05] hover:text-foreground">
            Projects
          </Link>
          <Link href="/developers" className="rounded-full px-3 py-1.5 text-muted transition-colors hover:bg-foreground/[.05] hover:text-foreground">
            Developers
          </Link>
          <a
            href="https://github.com/okjace/jace"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full px-3 py-1.5 text-muted transition-colors hover:bg-foreground/[.05] hover:text-foreground"
          >
            GitHub
          </a>
          {docs.map((doc) => (
            <button
              key={doc.id}
              type="button"
              onClick={() => setOpenId(doc.id)}
              className="rounded-full border border-line px-3 py-1.5 font-medium transition-colors hover:bg-foreground/[.05]"
            >
              {doc.label}
            </button>
          ))}
        </div>
      </div>
      <p className="pb-8 text-center text-xs text-muted">© {new Date().getFullYear()} Jace</p>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setOpenId(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={open.label}
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl"
          >
            <div className="flex items-center justify-between gap-4 border-b border-line px-6 py-4">
              <h2 className="text-lg font-semibold">{open.label}</h2>
              <button
                type="button"
                onClick={() => setOpenId(null)}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-foreground/[.08] hover:text-foreground"
              >
                ✕
              </button>
            </div>
            <div className="overflow-y-auto px-6 py-5">
              <MarkdownContent>{open.body}</MarkdownContent>
            </div>
            <div className="flex justify-end border-t border-line px-6 py-3">
              <button
                type="button"
                onClick={() => setOpenId(null)}
                className="h-9 rounded-full bg-accent px-5 text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </footer>
  );
}
