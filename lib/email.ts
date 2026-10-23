/**
 * Where email goes out, first one configured wins:
 *
 * 1. A Make.com scenario (MAKE_EMAIL_WEBHOOK_URL): Jace POSTs
 *    { to, subject, html, text } to its Custom webhook, and the scenario
 *    sends it from a connected mailbox (e.g. Microsoft 365 Email / Outlook).
 *    If the webhook has an API key, put it in MAKE_EMAIL_WEBHOOK_KEY (sent as
 *    x-make-apikey). The scenario should end with a Webhook response (200),
 *    so a failed send shows up here instead of Make answering "Accepted".
 * 2. Resend (RESEND_API_KEY + EMAIL_FROM on a domain verified in Resend).
 * 3. Mailjet (MAILJET_API_KEY/MAILJET_API_SECRET + EMAIL_FROM).
 */
const MAKE_WEBHOOK_URL = process.env.MAKE_EMAIL_WEBHOOK_URL;
const MAKE_WEBHOOK_KEY = process.env.MAKE_EMAIL_WEBHOOK_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

const API_KEY = process.env.MAILJET_API_KEY;
const API_SECRET = process.env.MAILJET_API_SECRET;

// Should match a sender verified in Mailjet's dashboard (Account Settings ->
// Sender addresses and domains) — Mailjet rejects sends from an address it
// hasn't verified.
const FROM_EMAIL = process.env.EMAIL_FROM;

/** Splits "Name <email@x.com>" into Mailjet's `{ Email, Name }` shape; plain "email@x.com" is fine too. */
function parseFromAddress(value: string): { Email: string; Name?: string } {
  const match = value.match(/^(.*?)<(.+)>$/);
  if (match) {
    return { Name: match[1].trim() || undefined, Email: match[2].trim() };
  }
  return { Email: value.trim() };
}

export function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

export function isEmailConfigured(): boolean {
  return !!MAKE_WEBHOOK_URL || (!!RESEND_API_KEY && !!FROM_EMAIL) || (!!API_KEY && !!API_SECRET && !!FROM_EMAIL);
}

async function sendViaMake(options: { to: string; subject: string; html: string; text: string }): Promise<void> {
  const res = await fetch(MAKE_WEBHOOK_URL!, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(MAKE_WEBHOOK_KEY ? { "x-make-apikey": MAKE_WEBHOOK_KEY } : {}),
    },
    body: JSON.stringify(options),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 200);
    console.error(`[email] Make rejected "${options.subject}" to ${options.to}: HTTP ${res.status} ${detail}`);
    throw new Error(`Failed to send email (HTTP ${res.status}).`);
  }
}

async function sendViaResend(options: { to: string; subject: string; html: string; text: string }): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [options.to],
      subject: options.subject,
      html: options.html,
      text: options.text,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string; name?: string } | null;
    console.error(`[email] Resend rejected "${options.subject}" to ${options.to}:`, body ?? res.statusText);
    throw new Error(body?.message || `Failed to send email (HTTP ${res.status}).`);
  }
}

async function sendEmail(options: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  if (MAKE_WEBHOOK_URL) return sendViaMake(options);
  if (RESEND_API_KEY && FROM_EMAIL) return sendViaResend(options);
  if (!API_KEY || !API_SECRET || !FROM_EMAIL) {
    console.warn(
      `[email] no email provider set (MAKE_EMAIL_WEBHOOK_URL, RESEND_API_KEY, or MAILJET_*) — skipping "${options.subject}" to ${options.to}`,
    );
    return;
  }

  const res = await fetch("https://api.mailjet.com/v3.1/send", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${API_KEY}:${API_SECRET}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      Messages: [
        {
          From: parseFromAddress(FROM_EMAIL),
          To: [{ Email: options.to }],
          Subject: options.subject,
          TextPart: options.text,
          HTMLPart: options.html,
        },
      ],
    }),
  });

  const body = await res.json().catch(() => null);
  const messageResult = (
    body as { Messages?: { Status: string; Errors?: { ErrorMessage: string }[] }[] } | null
  )?.Messages?.[0];

  if (!res.ok || messageResult?.Status === "error") {
    const detail = messageResult?.Errors?.map((e) => e.ErrorMessage).join("; ");
    console.error(`[email] Mailjet rejected "${options.subject}" to ${options.to}:`, body ?? res.statusText);
    throw new Error(detail || `Failed to send email (HTTP ${res.status}).`);
  }
}

const FONT_STACK =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/**
 * The site's dark theme, which is Jace Social's palette (see app/globals.css):
 * page #111317, card #1c1f26, border #2a2f38, text #e6e8eb, muted #8b919c,
 * and the green accent #3ddc84 with #0c1410 text on it. Colors are written
 * out because email apps don't support CSS variables.
 */
const EMAIL = {
  page: "#111317",
  card: "#1c1f26",
  line: "#2a2f38",
  text: "#e6e8eb",
  muted: "#8b919c",
  faint: "#6b717c",
  accent: "#3ddc84",
  onAccent: "#0c1410",
};

/**
 * Every Jace email: the logo and name, then a card with a small label, a
 * heading, the message, one pill-shaped button (green, or red for
 * destructive actions), the link spelled out, and an optional note. The
 * logo is a PNG (public/logo-email.png) because many email apps don't show
 * SVG; "Jace" is also written beside it for apps that hide images.
 */
function wrapHtml(options: {
  preheader: string;
  eyebrow: string;
  heading: string;
  bodyHtml: string;
  buttonLabel: string;
  buttonUrl: string;
  buttonColor?: "accent" | "red";
  noteHtml?: string;
}): string {
  const {
    preheader,
    eyebrow,
    heading,
    bodyHtml,
    buttonLabel,
    buttonUrl,
    buttonColor = "accent",
    noteHtml,
  } = options;

  const button =
    buttonColor === "red"
      ? { bg: "#e0605a", fg: "#ffffff" }
      : { bg: EMAIL.accent, fg: EMAIL.onAccent };
  const base = getBaseUrl();

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark" />
    <meta name="supported-color-schemes" content="dark" />
    <title>${heading}</title>
  </head>
  <body style="margin:0;padding:0;background:${EMAIL.page};font-family:${FONT_STACK};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
      ${preheader}
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${EMAIL.page};">
      <tr>
        <td align="center" style="padding:40px 20px;">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:480px;max-width:100%;">
            <tr>
              <td style="padding:0 4px 24px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding-right:10px;vertical-align:middle;">
                      <a href="${base}" style="text-decoration:none;">
                        <img src="${base}/logo-email.png" width="32" height="32" alt="Jace" style="display:block;width:32px;height:32px;border:0;border-radius:9px;" />
                      </a>
                    </td>
                    <td style="vertical-align:middle;">
                      <a href="${base}" style="font-size:18px;font-weight:700;letter-spacing:-0.02em;color:${EMAIL.text};text-decoration:none;">Jace</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="background:${EMAIL.card};border:1px solid ${EMAIL.line};border-radius:16px;padding:36px 32px;">
                <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:${EMAIL.accent};">
                  ${eyebrow}
                </p>
                <h1 style="margin:0 0 18px;font-size:22px;line-height:1.3;font-weight:700;letter-spacing:-0.01em;color:${EMAIL.text};">
                  ${heading}
                </h1>
                <div style="font-size:14px;line-height:1.65;color:${EMAIL.muted};">
                  ${bodyHtml}
                </div>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 6px;">
                  <tr>
                    <td style="border-radius:999px;background:${button.bg};">
                      <a href="${buttonUrl}" style="display:inline-block;padding:12px 26px;font-size:14px;font-weight:600;color:${button.fg};text-decoration:none;border-radius:999px;">
                        ${buttonLabel}
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:18px 0 0;font-size:12px;line-height:1.6;color:${EMAIL.faint};">
                  Or paste this link into your browser:<br />
                  <a href="${buttonUrl}" style="color:${EMAIL.muted};word-break:break-all;">${buttonUrl}</a>
                </p>
                ${
                  noteHtml
                    ? `<p style="margin:22px 0 0;padding-top:18px;border-top:1px solid ${EMAIL.line};font-size:12px;line-height:1.6;color:${EMAIL.faint};">${noteHtml}</p>`
                    : ""
                }
              </td>
            </tr>
            <tr>
              <td style="padding:22px 4px 0;">
                <p style="margin:0;font-size:12px;line-height:1.6;color:${EMAIL.faint};">
                  Jace &middot; A company that makes stuff &middot; <a href="${base}" style="color:${EMAIL.muted};">${base.replace(/^https?:\/\//, "")}</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export async function sendVerificationEmail(
  to: string,
  username: string,
  token: string,
): Promise<void> {
  const url = `${getBaseUrl()}/verify-email/${token}`;
  await sendEmail({
    to,
    subject: "Verify your email for Jace",
    html: wrapHtml({
      preheader: `Confirm ${to} to finish setting up your Jace account.`,
      eyebrow: "Verify email",
      heading: `Hi ${username}, confirm this address`,
      bodyHtml: `<p style="margin:0 0 12px;">You added <strong style="color:#e6e8eb;">${to}</strong> as the email for your Jace account. Confirm it's yours to finish setting it up.</p>`,
      buttonLabel: "Verify email",
      buttonUrl: url,
      noteHtml: "This link expires in 24 hours. If you didn't request this, you can safely ignore this email.",
    }),
    text: `Hi ${username},\n\nConfirm this email address for your Jace account:\n${url}\n\nThis link expires in 24 hours. If you didn't request this, you can ignore it.`,
  });
}

export async function sendPasswordResetEmail(
  to: string,
  username: string,
  token: string,
): Promise<void> {
  const url = `${getBaseUrl()}/reset-password/${token}`;
  await sendEmail({
    to,
    subject: "Reset your Jace password",
    html: wrapHtml({
      preheader: "Set a new password for your Jace account.",
      eyebrow: "Password reset",
      heading: `Hi ${username}, reset your password`,
      bodyHtml: `<p style="margin:0 0 12px;">Someone requested a password reset for your Jace account. If this was you, choose a new password below.</p>`,
      buttonLabel: "Reset password",
      buttonUrl: url,
      noteHtml: "This link expires in 1 hour. If you didn't request this, you can ignore it — your password won't change.",
    }),
    text: `Hi ${username},\n\nSomeone requested a password reset for your Jace account. If this was you:\n${url}\n\nThis link expires in 1 hour. If you didn't request this, you can ignore it.`,
  });
}

export async function sendSignInEmail(
  to: string,
  username: string,
  token: string,
): Promise<void> {
  const url = `${getBaseUrl()}/sign-in/email/${token}`;
  await sendEmail({
    to,
    subject: "Sign in to Jace",
    html: wrapHtml({
      preheader: "Use this link to sign in to your Jace account.",
      eyebrow: "Email sign-in",
      heading: `Hi ${username}, sign in to Jace`,
      bodyHtml: `<p style="margin:0;">Click below to sign in to your Jace account. No password needed.</p>`,
      buttonLabel: "Sign in",
      buttonUrl: url,
      noteHtml: "This link expires in 20 minutes and works once. If you didn't request this, you can ignore it.",
    }),
    text: `Hi ${username},\n\nUse this link to sign in to your Jace account:\n${url}\n\nThis link expires in 20 minutes and works once. If you didn't request this, you can ignore it.`,
  });
}

export async function sendAccountDeletionEmail(
  to: string,
  username: string,
  token: string,
): Promise<void> {
  const url = `${getBaseUrl()}/delete-account/${token}`;
  await sendEmail({
    to,
    subject: "Confirm account deletion on Jace",
    html: wrapHtml({
      preheader: "Confirm you want to permanently delete your Jace account.",
      eyebrow: "Delete account",
      heading: `Hi ${username}, confirm account deletion`,
      bodyHtml: `<p style="margin:0 0 12px;">You (or someone with access to your account) requested to permanently delete your Jace account, including your videos, projects, and profile.</p><p style="margin:0;">This can't be undone.</p>`,
      buttonLabel: "Confirm deletion",
      buttonUrl: url,
      buttonColor: "red",
      noteHtml: "This link expires in 1 hour. If you didn't request this, ignore this email and your account will stay exactly as it is.",
    }),
    text: `Hi ${username},\n\nYou (or someone with access to your account) requested to permanently delete your Jace account.\n\nConfirm here: ${url}\n\nThis link expires in 1 hour. If you didn't request this, ignore this email.`,
  });
}
