'use client';
import { useState } from 'react';
import { Link, usePathname, useRouter } from '@/lib/navigation';
import { useTranslations } from 'next-intl';
import { signOutAndClear } from '@/lib/store/session';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  Plus,
  MoreHorizontal,
  X,
  Stethoscope,
  CreditCard,
  Shield,
  BarChart3,
  Settings,
  Clock,
  LogOut,
} from 'lucide-react';
import type { Role } from '@/lib/schemas/common';
import { AddAppointmentDialog } from '@/components/appointments/add-appointment-dialog';

const PRIMARY: {
  href: string;
  key: 'dashboard' | 'appointments' | 'patients';
  icon: React.ComponentType<{ className?: string }>;
  roles: Role[];
}[] = [
  { href: '/dashboard', key: 'dashboard', icon: LayoutDashboard, roles: ['admin', 'dentist', 'receptionist'] },
  { href: '/appointments', key: 'appointments', icon: CalendarDays, roles: ['admin', 'dentist', 'receptionist'] },
  { href: '/patients', key: 'patients', icon: Users, roles: ['admin', 'dentist', 'receptionist'] },
];

const MORE: {
  href: string;
  key: 'treatments' | 'billing' | 'insurers' | 'schedules' | 'reports' | 'settings' | 'profile';
  icon: React.ComponentType<{ className?: string }>;
  roles: Role[];
}[] = [
  { href: '/treatments', key: 'treatments', icon: Stethoscope, roles: ['admin', 'dentist'] },
  { href: '/billing', key: 'billing', icon: CreditCard, roles: ['admin', 'receptionist'] },
  { href: '/insurers', key: 'insurers', icon: Shield, roles: ['admin', 'dentist', 'receptionist'] },
  { href: '/reports', key: 'reports', icon: BarChart3, roles: ['admin', 'dentist', 'receptionist'] },
  { href: '/profile', key: 'profile', icon: Clock, roles: ['admin', 'dentist', 'receptionist'] },
  { href: '/settings', key: 'settings', icon: Settings, roles: ['admin'] },
];

export function BottomNav({
  role,
  currentUserId,
  dentists,
  clinicDefaultDuration,
}: {
  role: Role;
  currentUserId?: string;
  dentists?: { id: string; name: string; slot_minutes?: number | null }[] | null;
  clinicDefaultDuration?: number;
}) {
  const t = useTranslations('nav');
  const tc = useTranslations('common');
  const td = useTranslations('dashboard');
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const primary = PRIMARY.filter((l) => l.roles.includes(role));
  const more = MORE.filter((l) => l.roles.includes(role));
  const moreActive = more.some((l) => pathname.startsWith(l.href));
  // Admins keep the legacy new-patient shortcut; dentist/receptionist get
  // the same add-turn flow as the dashboard panels.
  const addTurnMode = role !== 'admin';

  return (
    <>
      {moreOpen ? (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setMoreOpen(false)}
          aria-hidden
        />
      ) : null}
      {moreOpen ? (
        <div className="fixed inset-x-0 bottom-0 z-50 md:hidden">
          <div className="mx-2 mb-2 rounded-2xl border bg-background p-2 pb-safe shadow-xl max-h-[60dvh] overflow-y-auto">
            <div className="flex items-center justify-between px-2 py-1">
              <span className="text-sm font-medium text-muted-foreground">{t('more')}</span>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setMoreOpen(false)}
                className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-accent"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {more.map((l) => {
              const Icon = l.icon;
              const active = pathname.startsWith(l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  prefetch={false}
                  onClick={() => setMoreOpen(false)}
                  className={cn(
                    'flex min-h-[48px] items-center gap-3 rounded-xl px-3 py-2 text-base font-medium hover:bg-accent',
                    active && 'bg-accent',
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {t(l.key)}
                </Link>
              );
            })}
            <button
              type="button"
              onClick={() => void signOutAndClear()}
              className="flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3 py-2 text-base font-medium text-destructive hover:bg-accent"
            >
              <LogOut className="h-5 w-5" />
              {tc('logout')}
            </button>
          </div>
        </div>
      ) : null}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden"
      >
        <div className="grid grid-cols-5 pb-safe">
          <TabLink
            href={primary[0]?.href ?? '/dashboard'}
            active={primary[0] ? pathname.startsWith(primary[0].href) : false}
            icon={primary[0]?.icon ?? LayoutDashboard}
            label={primary[0] ? t(primary[0].key) : ''}
          />
          <TabLink
            href={primary[1]?.href ?? '/appointments'}
            active={primary[1] ? pathname.startsWith(primary[1].href) : false}
            icon={primary[1]?.icon ?? CalendarDays}
            label={primary[1] ? t(primary[1].key) : ''}
          />
          <div className="flex items-stretch justify-center py-1">
            {addTurnMode ? (
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                aria-label={td('addTurn')}
                data-testid="bottomnav-add-turn"
                className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg active:scale-95"
              >
                <Plus className="h-6 w-6" />
              </button>
            ) : (
              <Link
                href="/patients/new"
                prefetch={false}
                aria-label="New"
                className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg active:scale-95"
              >
                <Plus className="h-6 w-6" />
              </Link>
            )}
          </div>
          <TabLink
            href={primary[2]?.href ?? '/patients'}
            active={primary[2] ? pathname.startsWith(primary[2].href) : false}
            icon={primary[2]?.icon ?? Users}
            label={primary[2] ? t(primary[2].key) : ''}
          />
          <button
            type="button"
            aria-label="More"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((o) => !o)}
            className={cn(
              'flex min-h-[64px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium',
              moreActive || moreOpen ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            <MoreHorizontal className="h-6 w-6" />
            <span className="max-w-full truncate px-1">{t('more')}</span>
          </button>
        </div>
      </nav>
      {addTurnMode && dentists ? (
        <AddAppointmentDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          defaultStart={null}
          dentists={dentists}
          onCreated={() => router.refresh()}
          currentUserId={currentUserId}
          viewerRole={role}
          clinicDefaultDuration={clinicDefaultDuration}
        />
      ) : null}
    </>
  );
}

function TabLink({
  href,
  active,
  icon: Icon,
  label,
}: {
  href: string;
  active: boolean;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex min-h-[64px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium',
        active ? 'text-primary' : 'text-muted-foreground',
      )}
    >
      <Icon className="h-6 w-6" />
      <span className="max-w-full truncate px-1">{label}</span>
    </Link>
  );
}
