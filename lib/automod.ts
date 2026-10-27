import "server-only";
import { randomUUID } from "crypto";
import { sql } from "./db";
import { isAdmin, muteUser } from "./store";

/**
 * Auto moderation: checks text people post before it's saved. Admins manage
 * it under Manage account → Moderation (components/account/AutomodPanel.tsx):
 *
 * - Blocked words and phrases, matched case-insensitively as whole words,
 *   also through common disguises (l33t letters, s.p.a.c.i.n.g, repeated
 *   letters), so "B4D" or "b a d" still match "bad".
 * - A limit on links per post (0 = no limit), against link spam.
 * - Optional auto-mute: after N blocked posts within 24 hours, the account
 *   is muted for a while (appealable). Jace admins are never auto-muted.
 *
 * Every blocked post is logged (automod_log) for admins to review. Settings
 * are one row in automod_settings; see lib/schema.sql.
 */

export type AutomodSettings = {
  enabled: boolean;
  blockedTerms: string[];
  maxLinks: number;
  autoMuteAfter: number;
  autoMuteMinutes: number;
};

export type AutomodLogEntry = {
  id: string;
  userId: string;
  username?: string;
  area: string;
  matched: string;
  excerpt: string;
  createdAt: string;
};

const DEFAULTS: AutomodSettings = {
  enabled: true,
  blockedTerms: [],
  maxLinks: 0,
  autoMuteAfter: 0,
  autoMuteMinutes: 24 * 60,
};

export const MAX_TERMS = 500;
export const MAX_TERM_LENGTH = 60;

let cache: { at: number; value: AutomodSettings } | null = null;

export async function getAutomodSettings(fresh = false): Promise<AutomodSettings> {
  if (!fresh && cache && Date.now() - cache.at < 30_000) return cache.value;
  const rows = await sql`SELECT * FROM automod_settings WHERE id = 1`;
  const r = rows[0];
  const value: AutomodSettings = r
    ? {
        enabled: r.enabled !== false,
        blockedTerms: Array.isArray(r.blocked_terms) ? (r.blocked_terms as string[]) : [],
        maxLinks: Number(r.max_links ?? 0),
        autoMuteAfter: Number(r.auto_mute_after ?? 0),
        autoMuteMinutes: Number(r.auto_mute_minutes ?? DEFAULTS.autoMuteMinutes),
      }
    : DEFAULTS;
  cache = { at: Date.now(), value };
  return value;
}

export async function saveAutomodSettings(settings: AutomodSettings, updatedBy: string): Promise<void> {
  await sql`
    INSERT INTO automod_settings (id, enabled, blocked_terms, max_links, auto_mute_after, auto_mute_minutes, updated_by, updated_at)
    VALUES (1, ${settings.enabled}, ${JSON.stringify(settings.blockedTerms)}::jsonb, ${settings.maxLinks},
      ${settings.autoMuteAfter}, ${settings.autoMuteMinutes}, ${updatedBy}, ${new Date().toISOString()})
    ON CONFLICT (id) DO UPDATE SET enabled = EXCLUDED.enabled, blocked_terms = EXCLUDED.blocked_terms,
      max_links = EXCLUDED.max_links, auto_mute_after = EXCLUDED.auto_mute_after,
      auto_mute_minutes = EXCLUDED.auto_mute_minutes, updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at
  `;
  cache = null;
}

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "@": "a", "$": "s", "!": "i", "|": "i" };

/** Lowercase, accents stripped, l33t letters mapped, everything else turned into single spaces. */
function normalize(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[0134578@$!|]/g, (c) => LEET[c] ?? c)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Runs of three or more of the same letter count as one ("baaaad" → "bad"). */
function squeezeRepeats(text: string): string {
  return text.replace(/(\p{L})\1{2,}/gu, "$1");
}

/**
 * Words written one letter at a time ("b a d", "b.a.d") joined back up, so
 * they can be checked without matching inside ordinary words ("hell" must
 * not match "shell").
 */
function spacedOutRuns(normalizedText: string): string[] {
  const runs: string[] = [];
  let run = "";
  for (const token of normalizedText.split(" ")) {
    if ([...token].length === 1) run += token;
    else {
      if (run.length > 1) runs.push(run);
      run = "";
    }
  }
  if (run.length > 1) runs.push(run);
  return runs;
}

/** Whether `term` appears in `text` as whole words, plainly or disguised. */
function matchesTerm(normalizedText: string, runs: string[], term: string): boolean {
  const t = normalize(term);
  if (!t) return false;
  if (` ${normalizedText} `.includes(` ${t} `)) return true;
  if (` ${squeezeRepeats(normalizedText)} `.includes(` ${t} `)) return true;
  const squashed = t.replace(/ /g, "");
  return runs.some((run) => run === squashed || squeezeRepeats(run) === squashed || run.includes(squashed) && squashed.length >= 4);
}

function countLinks(text: string): number {
  return (text.match(/\bhttps?:\/\/|\bwww\.[^\s]/gi) ?? []).length;
}

/** Checks text against the current settings. Returns the problem, or null if it's fine. */
export async function findAutomodProblem(text: string): Promise<{ matched: string; message: string } | null> {
  const settings = await getAutomodSettings();
  if (!settings.enabled || !text) return null;
  if (settings.maxLinks > 0 && countLinks(text) > settings.maxLinks) {
    return {
      matched: `more than ${settings.maxLinks} link${settings.maxLinks === 1 ? "" : "s"}`,
      message: `That has too many links (at most ${settings.maxLinks}).`,
    };
  }
  if (settings.blockedTerms.length === 0) return null;
  const normalized = normalize(text);
  const runs = spacedOutRuns(normalized);
  for (const term of settings.blockedTerms) {
    if (matchesTerm(normalized, runs, term)) {
      return { matched: term, message: "That contains words that aren't allowed on Jace." };
    }
  }
  return null;
}

/**
 * Call before saving anything a person wrote. Returns null if it's allowed,
 * or the message to show them. Blocked posts are logged, and may mute the
 * account (see the auto-mute setting).
 */
export async function checkAutomod(userId: string, area: string, ...texts: (string | null | undefined)[]): Promise<string | null> {
  const text = texts.filter(Boolean).join("\n");
  const problem = await findAutomodProblem(text);
  if (!problem) return null;

  await sql`
    INSERT INTO automod_log (id, user_id, area, matched, excerpt, created_at)
    VALUES (${randomUUID()}, ${userId}, ${area}, ${problem.matched}, ${text.slice(0, 300)}, ${new Date().toISOString()})
  `;

  const settings = await getAutomodSettings();
  if (settings.autoMuteAfter > 0 && !(await isAdmin(userId))) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM automod_log WHERE user_id = ${userId} AND created_at > ${since}`;
    if (n >= settings.autoMuteAfter) {
      await muteUser(userId, `Automatic: ${n} blocked posts in 24 hours`, {
        durationMinutes: settings.autoMuteMinutes || null,
        appealable: true,
      });
      return `${problem.message} Your account has been muted automatically for repeatedly posting things that aren't allowed.`;
    }
  }
  return problem.message;
}

export async function listAutomodLog(limit = 50): Promise<AutomodLogEntry[]> {
  const rows = await sql`
    SELECT l.*, u.username FROM automod_log l LEFT JOIN users u ON u.id = l.user_id
    ORDER BY l.created_at DESC LIMIT ${limit}
  `;
  return rows.map((r) => ({
    id: r.id as string,
    userId: r.user_id as string,
    username: (r.username as string) ?? undefined,
    area: r.area as string,
    matched: r.matched as string,
    excerpt: r.excerpt as string,
    createdAt: r.created_at as string,
  }));
}
