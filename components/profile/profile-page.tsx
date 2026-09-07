'use client';
import { useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { CalendarClock, MessageSquare, MessagesSquare, UserRound } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useRouter } from '@/lib/navigation';

type ProfilePageProps = {
  locale: string;
  role: string;
  defaultTab?: string;
  canTimes: boolean;
  canMessages: boolean;
  canCommunication: boolean;
  account: { name: string; email: string; role: string; locale: string };
  timesSlot: React.ReactNode;
  messagesSlot: React.ReactNode;
  communicationSlot: React.ReactNode;
};

/**
 * The per-user Profile page. Shows the config tabs that apply to the current
 * role:
 *   - Times (schedule) — dentists + admins
 *   - Messages (own WhatsApp templates) — dentists
 *   - Communication (clinic-wide + per-dentist WhatsApp) — admins + receptionists
 *   - Account — everyone
 * Tab is driven by the `?tab=` query param so it's linkable/refreshable.
 */
export function ProfilePage({
  defaultTab,
  canTimes,
  canMessages,
  canCommunication,
  account,
  timesSlot,
  messagesSlot,
  communicationSlot,
}: ProfilePageProps) {
  const t = useTranslations('profile');
  const locale = useLocale();
  const router = useRouter();

  const tabs = [
    { id: 'times', label: t('times'), icon: CalendarClock, visible: canTimes, node: timesSlot },
    { id: 'messages', label: t('messages'), icon: MessageSquare, visible: canMessages, node: messagesSlot },
    { id: 'communication', label: t('communication'), icon: MessagesSquare, visible: canCommunication, node: communicationSlot },
    { id: 'account', label: t('account'), icon: UserRound, visible: true, node: <AccountTab account={account} /> },
  ].filter((tab) => tab.visible);

  const firstTab = tabs[0]?.id ?? 'account';
  const validDefault = tabs.some((tab) => tab.id === defaultTab);
  const [active, setActive] = useState<string>(
    validDefault ? (defaultTab as string) : firstTab,
  );

  // Keep local state in sync when the query param changes (nav clicks / reload).
  useEffect(() => {
    const next = validDefault ? (defaultTab as string) : firstTab;
    setActive((prev) => (prev === next ? prev : next));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultTab, firstTab]);

  function selectTab(id: string) {
    setActive(id);
    // Update the URL so the tab is linkable and survives refresh.
    const url = `/${locale}/profile?tab=${id}`;
    window.history.replaceState(null, '', url);
    router.refresh();
  }

  return (
    <Tabs value={active} onValueChange={selectTab} data-testid="profile-tabs">
      <TabsList>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              data-testid={`profile-tab-${tab.id}`}
            >
              <Icon className="mr-1.5 h-4 w-4" />
              {tab.label}
            </TabsTrigger>
          );
        })}
      </TabsList>
      {tabs.map((tab) => (
        <TabsContent key={tab.id} value={tab.id}>
          {tab.node}
        </TabsContent>
      ))}
    </Tabs>
  );
}

function AccountTab({ account }: { account: { name: string; email: string; role: string; locale: string } }) {
  const t = useTranslations('profile');
  const rows = [
    { label: t('name'), value: account.name },
    { label: t('email'), value: account.email },
    { label: t('role'), value: account.role },
    { label: t('locale'), value: account.locale },
  ];
  return (
    <div className="rounded-xl border p-4" data-testid="profile-account">
      <p className="text-sm text-muted-foreground mb-3">{t('accountHint')}</p>
      <dl className="space-y-2 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">{r.label}</dt>
            <dd className="font-medium">{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}