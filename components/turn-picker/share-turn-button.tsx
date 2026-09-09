'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GenerateTurnLinkDialog } from '@/components/turn-picker/generate-link-dialog';
import type { Role } from '@/lib/schemas/common';

export function ShareTurnButton({
  patientId,
  patientName,
  patientPhone,
  dentists,
  currentUserId,
  role,
  clinicDefaultDuration,
}: {
  patientId: string;
  patientName?: string;
  patientPhone?: string | null;
  dentists: { id: string; name: string; slot_minutes?: number | null }[];
  currentUserId: string;
  role: Role;
  /** Clinic fallback for `slot_minutes` when the selected dentist has none. */
  clinicDefaultDuration?: number;
}) {
  const t = useTranslations('turnPicker');
  const [open, setOpen] = useState(false);

  // Dentists preselect themselves; admin/receptionist get the first dentist.
  const preselect =
    role === 'dentist' && dentists.some((d) => d.id === currentUserId)
      ? currentUserId
      : undefined;

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Share2 className="h-4 w-4" />
        {t('shareButton')}
      </Button>
      <GenerateTurnLinkDialog
        open={open}
        onOpenChange={setOpen}
        patientId={patientId}
        patientName={patientName}
        patientPhone={patientPhone}
        dentists={dentists}
        defaultDentistId={preselect}
        currentUserId={currentUserId}
        viewerRole={role}
        clinicDefaultDuration={clinicDefaultDuration}
      />
    </>
  );
}
