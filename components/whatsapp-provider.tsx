'use client';
import * as React from 'react';
import type { WhatsappTemplate } from '@/lib/whatsapp';

export type ResolvedWhatsapp = {
  countryCode: string;
  templates: WhatsappTemplate[];
};

type WhatsappContextValue = {
  /** Clinic-wide defaults. */
  countryCode: string;
  templates: WhatsappTemplate[];
  /** Resolve the effective config for a specific user (override > clinic default). */
  forUser: (userId?: string | null) => ResolvedWhatsapp;
};

/** Fallback used before the provider is mounted / when no clinic config exists. */
const DEFAULT_RESOLVED: ResolvedWhatsapp = { countryCode: '+54', templates: [] };

const WhatsappContext = React.createContext<WhatsappContextValue>({
  countryCode: '+54',
  templates: [],
  forUser: () => DEFAULT_RESOLVED,
});

/**
 * Provider that ships the clinic's WhatsApp configuration — and every
 * user's per-user override — to client components. Populated from the
 * locale layout (server-side fetch) so the hot path (panel cards,
 * AttendSheet) never refetches. `forUser(userId)` returns the effective
 * templates + country code for a dentist (their override, or the clinic
 * default if they have none).
 */
export function WhatsappProvider({
  clinic,
  byUser,
  children,
}: {
  clinic: { countryCode: string; templates: WhatsappTemplate[] };
  byUser?: Record<string, ResolvedWhatsapp>;
  children: React.ReactNode;
}) {
  const value = React.useMemo<WhatsappContextValue>(() => {
    const map = byUser ?? {};
    return {
      countryCode: clinic.countryCode,
      templates: clinic.templates,
      forUser: (userId) =>
        userId && map[userId] ? map[userId] : { ...clinic },
    };
  }, [clinic, byUser]);
  return (
    <WhatsappContext.Provider value={value}>{children}</WhatsappContext.Provider>
  );
}

export function useWhatsapp(): WhatsappContextValue {
  return React.useContext(WhatsappContext);
}