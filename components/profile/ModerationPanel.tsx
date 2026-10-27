"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  banUserAction,
  muteUserAction,
  unbanUserAction,
  unmuteUserAction,
} from "@/app/profile/[userId]/actions";
import type { ModerationStatus, RestrictionOptions } from "@/lib/types";

const DURATIONS: { label: string; minutes: number | null }[] = [
  { label: "1 hour", minutes: 60 },
  { label: "1 day", minutes: 24 * 60 },
  { label: "3 days", minutes: 3 * 24 * 60 },
  { label: "1 week", minutes: 7 * 24 * 60 },
  { label: "30 days", minutes: 30 * 24 * 60 },
  { label: "Permanent", minutes: null },
];
const UNITS = { minutes: 1, hours: 60, days: 24 * 60 } as const;

const INPUT =
  "rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

function formatUntil(until?: string): string {
  return until ? `until ${new Date(until).toLocaleString()}` : "permanently";
}

/** Reason, how long, and the options for a new ban or mute. */
function RestrictForm({
  kind,
  busy,
  onSubmit,
}: {
  kind: "ban" | "mute";
  busy: boolean;
  onSubmit: (options: RestrictionOptions) => Promise<boolean>;
}) {
  const [reason, setReason] = useState("");
  const [preset, setPreset] = useState(kind === "ban" ? "Permanent" : "1 day");
  const [customAmount, setCustomAmount] = useState(2);
  const [customUnit, setCustomUnit] = useState<keyof typeof UNITS>("hours");
  const [appealable, setAppealable] = useState(true);
  const [canSignOut, setCanSignOut] = useState(true);

  const custom = preset === "Custom";
  const minutes = custom
    ? Math.round(customAmount * UNITS[customUnit])
    : (DURATIONS.find((d) => d.label === preset)?.minutes ?? null);
  const label = kind === "ban" ? "Ban" : "Mute";

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await onSubmit({
          reason,
          durationMinutes: minutes,
          appealable,
          ...(kind === "ban" ? { canSignOut } : {}),
        });
        if (ok) setReason("");
      }}
      className="flex flex-col gap-3"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${kind}Reason`} className="text-xs font-medium">
          {label} reason
        </label>
        <input
          id={`${kind}Reason`}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={`Why are you ${kind === "ban" ? "banning" : "muting"} this account?`}
          maxLength={500}
          className={INPUT}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium">How long</span>
        <div className="flex flex-wrap gap-1.5">
          {[...DURATIONS.map((d) => d.label), "Custom"].map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setPreset(option)}
              aria-pressed={preset === option}
              className={`h-8 rounded-full border px-3 text-xs font-medium transition-colors ${
                preset === option
                  ? "border-accent bg-accent/15 text-foreground"
                  : "border-line text-muted hover:bg-foreground/[.05]"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
        {custom && (
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              value={customAmount}
              onChange={(e) => setCustomAmount(Number(e.target.value))}
              className={`w-24 ${INPUT}`}
            />
            <select
              value={customUnit}
              onChange={(e) => setCustomUnit(e.target.value as keyof typeof UNITS)}
              className={INPUT}
            >
              <option value="minutes">minutes</option>
              <option value="hours">hours</option>
              <option value="days">days</option>
            </select>
          </div>
        )}
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={appealable} onChange={(e) => setAppealable(e.target.checked)} className="mt-0.5" />
        <span>
          Can appeal
          <span className="block text-xs text-muted">They can message Jace Official to ask for it to be lifted.</span>
        </span>
      </label>
      {kind === "ban" && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={canSignOut} onChange={(e) => setCanSignOut(e.target.checked)} className="mt-0.5" />
          <span>
            Can sign out
            <span className="block text-xs text-muted">
              Shows a Sign out button on their ban screen. When off, the button is hidden, which makes
              it harder to switch to another account (they could still clear their cookies).
            </span>
          </span>
        </label>
      )}

      <button
        type="submit"
        disabled={busy || !reason.trim() || (custom && !(minutes && minutes > 0))}
        className={`h-9 w-fit rounded-full px-4 text-xs font-medium disabled:opacity-50 ${
          kind === "ban" ? "bg-red-500 text-white" : "border border-line"
        }`}
      >
        {busy ? "Working…" : `${label} ${minutes ? (custom ? `for ${customAmount} ${customUnit}` : `for ${preset}`) : "permanently"}`}
      </button>
    </form>
  );
}

export function ModerationPanel({
  userId,
  status,
}: {
  userId: string;
  status: ModerationStatus;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await action();
      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-red-500/30 bg-panel p-5">
      <h2 className="text-sm font-semibold">Moderation</h2>

      <div className="flex flex-col gap-2">
        {status.banned ? (
          <>
            <p className="text-sm text-red-500">
              Banned {formatUntil(status.banUntil)}
              {status.banReason ? `: ${status.banReason}` : "."}
            </p>
            <p className="text-xs text-muted">
              Appeals {status.banAppealable ? "on" : "off"} · Sign out button {status.banCanSignOut ? "shown" : "hidden"}
            </p>
            <button
              onClick={() => run(() => unbanUserAction(userId))}
              disabled={busy}
              className="h-9 w-fit rounded-full border border-line px-4 text-xs font-medium disabled:opacity-50"
            >
              {busy ? "Working…" : "Unban"}
            </button>
          </>
        ) : (
          <RestrictForm kind="ban" busy={busy} onSubmit={(options) => run(() => banUserAction(userId, options))} />
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-line pt-4">
        {status.muted ? (
          <>
            <p className="text-sm text-amber-600 dark:text-amber-500">
              Muted {formatUntil(status.muteUntil)}
              {status.muteReason ? `: ${status.muteReason}` : "."}
            </p>
            <p className="text-xs text-muted">Appeals {status.muteAppealable ? "on" : "off"}</p>
            <button
              onClick={() => run(() => unmuteUserAction(userId))}
              disabled={busy}
              className="h-9 w-fit rounded-full border border-line px-4 text-xs font-medium disabled:opacity-50"
            >
              {busy ? "Working…" : "Unmute"}
            </button>
          </>
        ) : (
          <RestrictForm kind="mute" busy={busy} onSubmit={(options) => run(() => muteUserAction(userId, options))} />
        )}
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}
