'use client';
import * as React from 'react';
import type { WhatsappTemplate } from '@/lib/whatsapp';

type WhatsappContextValue = {
  countryCode: string;
  templates: WhatsappTemplate[];
};

const WhatsappContext = React.createContext<WhatsappContextValue>({
  countryCode: '+54',
  templates: [],
});

/**
 * Provider that ships the clinic's WhatsApp configuration to every client
 * component. Populated from the locale layout (server-side fetch) so the
 * hot path (panel cards, AttendSheet) never has to refetch.
 */
export function WhatsappProvider({
  value,
  children,
}: {
  value: WhatsappContextValue;
  children: React.ReactNode;
}) {
  return (
    <WhatsappContext.Provider value={value}>{children}</WhatsappContext.Provider>
  );
}

export function useWhatsapp(): WhatsappContextValue {
  return React.useContext(WhatsappContext);
}
