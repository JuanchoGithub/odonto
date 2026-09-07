import { setRequestLocale, getTranslations } from 'next-intl/server';
import { requireUser } from '@/lib/rbac';
import { getSchedulePageData } from '@/server/actions/dentist-schedules';
import { getWhatsappContextData, getUserWhatsappOverride } from '@/server/actions/whatsapp';
import { ProfilePage } from '@/components/profile/profile-page';
import { SchedulesClient } from '@/components/schedules/schedules-client';
import { MessagesTab } from '@/components/profile/messages-tab';
import { CommunicationTab, type CommUser } from '@/components/profile/communication-tab';

export default async function ProfileRoute({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tab?: string; dentist?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser();
  const role = user.role;
  const sp = await searchParams;

  // Load the clinic + every user's WhatsApp override once, reused across tabs.
  const wa = await getWhatsappContextData();
  const clinic = { countryCode: wa.countryCode, templates: wa.templates };

  // Times tab (dentists + admins). Admins can browse any dentist via
  // ?dentist=; dentists only their own.
  const canTimes = role === 'dentist' || role === 'admin';
  const canMessages = role === 'dentist';
  const canCommunication = role === 'admin' || role === 'receptionist';

  const schedule =
    canTimes && (role === 'admin' || role === 'dentist')
      ? await getSchedulePageData(role === 'admin' ? sp.dentist : undefined)
      : null;

  // Messages tab data (doctor's own override).
  const myOverride = canMessages
    ? await getUserWhatsappOverride(user.id)
    : null;

  // Communication tab data: every user's override resolved against clinic.
  const commUsers: CommUser[] = wa.users.map((u) => ({
    id: u.id,
    name: u.name,
    countryCode: u.whatsapp_default_country_code,
    templates: u.whatsapp_templates,
  }));

  const t = await getTranslations('profile');

  return (
    <div className="container py-4 md:py-8 space-y-4 md:space-y-6 max-w-4xl">
      <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
        {user.name ?? ''} · {t('title')}
      </h1>
      <ProfilePage
        locale={locale}
        role={role}
        defaultTab={sp.tab}
        canTimes={canTimes}
        canMessages={canMessages}
        canCommunication={canCommunication}
        account={{
          name: user.name ?? '',
          email: user.email ?? '',
          role,
          locale,
        }}
        timesSlot={
          canTimes && schedule ? (
            <SchedulesClient
              targetDentistId={schedule.targetId}
              isAdmin={role === 'admin'}
              weekly={schedule.weekly}
              exceptions={schedule.exceptions}
              businessHours={schedule.businessHours}
              clinicExceptions={schedule.clinicExceptions}
              dentists={schedule.dentists}
              defaultDuration={schedule.defaultDuration}
              clinicDefaultDuration={schedule.clinicDefaultDuration}
            />
          ) : null
        }
        messagesSlot={
          canMessages && myOverride ? (
            <MessagesTab
              targetUserId={user.id}
              clinic={clinic}
              override={{
                countryCode: myOverride.countryCode,
                templates: myOverride.templates,
              }}
            />
          ) : null
        }
        communicationSlot={
          canCommunication ? (
            <CommunicationTab clinic={clinic} users={commUsers} />
          ) : null
        }
      />
    </div>
  );
}