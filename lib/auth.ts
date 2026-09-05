import NextAuth, { type DefaultSession } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { queryOne } from './db';
import type { Role, AppLocale } from './schemas/common';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: Role;
      locale: AppLocale;
    } & DefaultSession['user'];
  }
  interface User {
    role: Role;
    locale: AppLocale;
  }
}

const CredsSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(6).max(255),
});

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  role: Role;
  locale: AppLocale;
};

const VALID_ROLES: Role[] = ['admin', 'dentist', 'receptionist'];

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: 'jwt', maxAge: 12 * 60 * 60, updateAge: 60 * 60 },
  pages: { signIn: '/login' },
  trustHost: true,
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(raw) {
        const parsed = CredsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
        const row = await queryOne<UserRow>(
          'SELECT id, email, password_hash, name, role, locale FROM users WHERE lower(email) = lower(?) LIMIT 1',
          [email],
        );
        if (!row) return null;
        const ok = await bcrypt.compare(password, row.password_hash);
        if (!ok) return null;
        return {
          id: row.id,
          email: row.email,
          name: row.name,
          role: row.role,
          locale: row.locale,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = (user as { id?: string }).id ?? token.sub ?? '';
        token.role = (user as { role: Role }).role;
        token.locale = (user as { locale: AppLocale }).locale;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = (token.userId as string) ?? (token.sub as string);
        const role = token.role as Role;
        // Allowlist: never trust a forged/legacy JWT role value.
        session.user.role = VALID_ROLES.includes(role) ? role : 'receptionist';
        session.user.locale = (token.locale as AppLocale) ?? 'es';
      }
      return session;
    },
  },
});
