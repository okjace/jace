import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import bcrypt from "bcryptjs";
import {
  checkEmailSignInToken,
  consumeEmailSignInToken,
  getStoredUserById,
  getUserByEmail,
  getUserByUsername,
  resolveGithubUserId,
} from "@/lib/store";
import { hashToken } from "@/lib/tokens";
import { verifyTotpCode } from "@/lib/totp";
import type { StoredUser } from "@/lib/types";
import { usernameProblem } from "@/lib/automod";

export class TotpRequiredError extends CredentialsSignin {
  code = "totp_required";
}

export class TotpInvalidError extends CredentialsSignin {
  code = "totp_invalid";
}

/** Throws TotpRequiredError/TotpInvalidError as needed; returns silently if the account has no 2FA. */
function requireTotpIfEnabled(user: StoredUser, code: unknown): void {
  if (!user.totpEnabled || !user.totpSecret) return;
  if (typeof code !== "string" || !code.trim()) {
    throw new TotpRequiredError();
  }
  if (!verifyTotpCode(user.totpSecret, code)) {
    throw new TotpInvalidError();
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/sign-in" },
  providers: [
    Credentials({
      credentials: {
        username: { label: "Username" },
        password: { label: "Password", type: "password" },
        code: { label: "Authenticator code" },
        magicToken: { label: "Sign-in link token" },
      },
      authorize: async (credentials) => {
        const code = credentials?.code;
        const magicToken = credentials?.magicToken;

        if (typeof magicToken === "string" && magicToken) {
          const userId = await checkEmailSignInToken(hashToken(magicToken));
          if (!userId) return null;
          const user = await getStoredUserById(userId);
          if (!user) return null;

          requireTotpIfEnabled(user, code);
          // Only consume the token once the sign-in has fully succeeded
          // (including any 2FA step) — see checkEmailSignInToken's docs.
          await consumeEmailSignInToken(user.id);
          return { id: user.id, name: user.username };
        }

        const username = credentials?.username;
        const password = credentials?.password;
        if (typeof username !== "string" || typeof password !== "string") {
          return null;
        }

        // The "username" field also accepts a verified email address —
        // getUserByEmail only ever matches the `email` column, which is
        // never set until the address has been verified, so this can't be
        // used to probe for an unverified/pending address.
        const user = username.includes("@")
          ? (await getUserByEmail(username)) ?? (await getUserByUsername(username))
          : (await getUserByUsername(username)) ?? (await getUserByEmail(username));
        if (!user?.passwordHash) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        requireTotpIfEnabled(user, code);
        return { id: user.id, name: user.username };
      },
    }),
    GitHub,
  ],
  callbacks: {
    async jwt({ token, user, account, session, trigger }) {
      if (user?.id) {
        if (account?.provider === "github" && account.providerAccountId) {
          // A GitHub name auto moderation doesn't allow becomes plain "user" (+ a number).
          const githubName = user.name ?? "user";
          const allowed = !(await usernameProblem(githubName.replace(/\s+/g, "_")));
          token.id = await resolveGithubUserId(
            account.providerAccountId,
            user.email ?? undefined,
            allowed ? githubName : "user",
          );
        } else {
          token.id = user.id;
        }
      }
      if (trigger === "update" && session?.name) {
        token.name = session.name;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        if (token.name) session.user.name = token.name as string;
      }
      return session;
    },
  },
});
