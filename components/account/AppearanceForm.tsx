"use client";

import { useActionState, useState } from "react";
import { updateAppearanceAction } from "@/app/account/actions";
import { supabasePublicUrl, uploadToSignedUrl } from "@/lib/clientUpload";
import { MAX_BACKGROUND_IMAGE_BYTES, MAX_CUSTOM_CSS_LENGTH, THEME_COLORS } from "@/lib/constants";
import type { CustomBackground, ThemeColor, ThemePreference } from "@/lib/types";

const THEMES: { value: ThemePreference; label: string; hint: string }[] = [
  { value: "system", label: "System", hint: "Match your device's light or dark setting" },
  { value: "light", label: "Light", hint: "Always light" },
  { value: "dark", label: "Dark", hint: "Always dark" },
];

const BACKGROUND_TYPES: { value: CustomBackground["type"]; label: string }[] = [
  { value: "none", label: "Theme color" },
  { value: "color", label: "Solid color" },
  { value: "image", label: "Image" },
];

const CSS_PLACEHOLDER = `/* Applies to every page while you're signed in. Examples: */
:root[data-theme="dark"] { --background: #101820; }
header a { color: hotpink; }`;

const INPUT_CLASS =
  "rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/15 dark:focus:border-white/40";

type ActionState = { error?: string; success?: string };

/** Uploads straight to storage (see /api/uploads/token) so big images skip the server-action body limit. */
async function uploadBackgroundImage(file: File): Promise<string> {
  const res = await fetch("/api/uploads/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pathname: `backgrounds/${crypto.randomUUID()}-${file.name}` }),
  });
  if (!res.ok) throw new Error("Could not start upload.");
  const { path, signedUrl } = (await res.json()) as { path: string; signedUrl: string };
  await uploadToSignedUrl(signedUrl, file);
  return supabasePublicUrl(path);
}

export function AppearanceForm({
  theme,
  themeColor,
  background,
  customCss,
}: {
  theme: ThemePreference;
  themeColor: ThemeColor;
  background: CustomBackground;
  customCss: string;
}) {
  const [backgroundType, setBackgroundType] = useState(background.type);
  const [color, setColor] = useState(background.type === "color" ? background.color : "#1e3a8a");
  const [imageUrl, setImageUrl] = useState(background.type === "image" ? background.imageUrl : "");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const [state, formAction, pending] = useActionState(
    async (prev: ActionState, formData: FormData): Promise<ActionState> => {
      if (formData.get("backgroundType") === "image" && file) {
        if (!file.type.startsWith("image/")) return { error: "Background must be an image." };
        if (file.size > MAX_BACKGROUND_IMAGE_BYTES) {
          return { error: "Background images must be 10MB or smaller." };
        }
        try {
          const url = await uploadBackgroundImage(file);
          formData.set("backgroundImageUrl", url);
          setImageUrl(url);
          setFile(null);
        } catch (err) {
          return { error: err instanceof Error ? err.message : "Upload failed." };
        }
      }
      return updateAppearanceAction(prev, formData);
    },
    {},
  );

  const shownImage = preview ?? (imageUrl || null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold">Appearance</h2>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-xs font-medium">Mode</legend>
        {THEMES.map((opt) => (
          <label key={opt.value} className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="theme"
              value={opt.value}
              defaultChecked={theme === opt.value}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">{opt.label}</span>
              <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                {opt.hint}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-xs font-medium">Color theme</legend>
        <div className="flex flex-wrap gap-2">
          {[{ id: "default", label: "Default", light: "#f4f5f7", dark: "#111317" }, ...THEME_COLORS].map(
            (c) => (
              <label key={c.id} title={c.label} className="cursor-pointer">
                <input
                  type="radio"
                  name="themeColor"
                  value={c.id}
                  defaultChecked={themeColor === c.id}
                  className="peer sr-only"
                />
                <span
                  aria-label={c.label}
                  className="flex h-8 w-8 overflow-hidden rounded-full border border-black/15 ring-offset-2 ring-offset-background peer-checked:ring-2 peer-checked:ring-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-foreground/50 dark:border-white/20"
                >
                  <span className="h-full w-1/2" style={{ background: c.light }} />
                  <span className="h-full w-1/2" style={{ background: c.dark }} />
                </span>
              </label>
            ),
          )}
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Tints the page: the left half of each swatch is light mode, the right half dark mode.
        </p>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-xs font-medium">Background</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {BACKGROUND_TYPES.map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="backgroundType"
                value={opt.value}
                checked={backgroundType === opt.value}
                onChange={() => setBackgroundType(opt.value)}
              />
              {opt.label}
            </label>
          ))}
        </div>

        {backgroundType === "color" && (
          <div className="flex items-center gap-2">
            <input
              type="color"
              name="backgroundColor"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-9 w-14 cursor-pointer rounded border border-black/10 bg-transparent dark:border-white/15"
            />
            <span className="font-mono text-xs">{color}</span>
          </div>
        )}

        {backgroundType === "image" && (
          <div className="flex flex-col gap-2">
            {shownImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shownImage} alt="" className="h-24 w-full rounded-md object-cover" />
            )}
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const chosen = e.target.files?.[0] ?? null;
                setFile(chosen);
                setPreview(chosen ? URL.createObjectURL(chosen) : null);
              }}
              className="text-xs"
            />
            <input
              name="backgroundImageUrl"
              value={file ? "" : imageUrl}
              onChange={(e) => {
                setImageUrl(e.target.value);
                setPreview(null);
              }}
              disabled={!!file}
              placeholder="Or paste an image URL"
              className={`${INPUT_CLASS} disabled:opacity-50`}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="backgroundFade"
                defaultChecked={background.type === "image" ? background.fade : true}
              />
              Fade the image so text stays readable
            </label>
          </div>
        )}
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Replaces the color theme&apos;s background. Pick colors that suit your mode so text stays readable.
        </p>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="customCss" className="text-xs font-medium">
          Custom CSS
        </label>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Your own styles, applied across Jace only for you. The page colors
          are the <code>--background</code> and <code>--foreground</code>{" "}
          variables, and <code>&lt;html&gt;</code> has{" "}
          <code>data-theme=&quot;light&quot;</code> or{" "}
          <code>&quot;dark&quot;</code>. If your CSS breaks a page, add{" "}
          <code>?nocss</code> to the address to load it without your styles.
        </p>
        <textarea
          id="customCss"
          name="customCss"
          defaultValue={customCss}
          maxLength={MAX_CUSTOM_CSS_LENGTH}
          rows={8}
          spellCheck={false}
          placeholder={CSS_PLACEHOLDER}
          className={`${INPUT_CLASS} font-mono text-xs`}
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="h-9 w-fit rounded-full bg-accent px-4 text-xs font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save"}
      </button>
      {state.error && <p className="text-sm text-red-500">{state.error}</p>}
      {state.success && (
        <p className="text-sm text-green-600 dark:text-green-500">{state.success}</p>
      )}
    </form>
  );
}
