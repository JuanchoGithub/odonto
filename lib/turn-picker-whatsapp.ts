import { waMeUrl } from '@/lib/whatsapp';

/**
 * Shared WhatsApp sender for turn-picker links (pending rows, new-turn link
 * result, generate-link dialog). Opens a direct chat with the patient when
 * the phone is known, otherwise falls back to a generic wa.me share picker.
 */
export function openTurnPickerWhatsapp({
  phone,
  message,
  countryCode,
}: {
  phone: string | null | undefined;
  message: string;
  countryCode: string;
}): void {
  const direct = waMeUrl(phone, message, countryCode);
  if (direct) {
    window.open(direct, '_blank');
    return;
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
}
