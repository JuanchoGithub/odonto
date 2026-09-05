'use client';
import { useState } from 'react';
import { Link, usePathname, useRouter } from '@/lib/navigation';
import { useTranslations } from 'next-intl';
import { signOut } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Activity,
  CalendarDays,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Settings,
  Shield,
  Stethoscope,
  Users,
  BarChart3,
  Menu,
  X,
  Clock,
} from 'lucide-react';
import type { Role } from '@/lib/schemas/common';

const links: {
  href: string;
  key:
    | 'dashboard'
    | 'patients'
    | 'appointments'
    | 'treatments'
    | 'billing'
    | 'reports'
    | 'settings'
    | 'insurers'
    | 'schedules';
  icon: React.ComponentType<{ className?: string }>;
  roles: Role[];
}[] = [
  { href: '/dashboard', key: 'dashboard', icon: LayoutDashboard, roles: ['admin', 'dentist', 'receptionist'] },
  { href: '/patients', key: 'patients', icon: Users, roles: ['admin', 'dentist', 'receptionist'] },
  { href: '/appointments', key: 'appointments', icon: CalendarDays, roles: ['admin', 'dentist', 'receptionist'] },
  { href: '/treatments', key: 'treatments', icon: Stethoscope, roles: ['admin', 'dentist'] },
  { href: '/billing', key: 'billing', icon: CreditCard, roles: ['admin', 'receptionist'] },
  { href: '/insurers', key: 'insurers', icon: Shield, roles: ['admin', 'dentist', 'receptionist'] },
  { href: '/settings/schedules', key: 'schedules', icon: Clock, roles: ['admin', 'dentist'] },
  { href: '/reports', key: 'reports', icon: BarChart3, roles: ['admin', 'dentist', 'receptionist'] },
  { href: '/settings', key: 'settings', icon: Settings, roles: ['admin'] },
];

export function TopNav({
  user,
  clinicName,
  currency,
}: {
  user: { name: string; email: string; role: Role };
  clinicName: string | null;
  currency: string | null;
}) {
  const t = useTranslations('nav');
  const tc = useTranslations('common');
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 sticky top-0 z-30 pt-safe">
      <div className="container flex h-16 items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
            <Activity className="h-5 w-5 text-primary" />
            <span>{tc('appName')}</span>
            {clinicName ? (
              <span className="text-muted-foreground font-normal text-sm hidden sm:inline">
                · {clinicName}
              </span>
            ) : null}
          </Link>
        </div>
        <nav className="hidden lg:flex items-center gap-1" aria-label="Primary">
          {links
            .filter((l) => l.roles.includes(user.role))
            .map((l) => {
              const Icon = l.icon;
              const active = pathname.startsWith(l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground',
                    active && 'bg-accent text-accent-foreground',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {t(l.key)}
                </Link>
              );
            })}
        </nav>
        <div className="flex items-center gap-2">
          {currency ? (
            <span className="hidden sm:inline text-xs text-muted-foreground">{currency}</span>
          ) : null}
          <span className="hidden sm:inline text-sm text-muted-foreground">{user.name}</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => signOut({ callbackUrl: '/login' })}
            title={tc('logout')}
          >
            <LogOut className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label="Menu"
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </Button>
        </div>
      </div>
      {open ? (
        <div className="lg:hidden border-t" id="mobile-nav">
          <nav aria-label="Mobile" className="container py-2 flex flex-col gap-1">

            {links
              .filter((l) => l.roles.includes(user.role))
              .map((l) => {
                const Icon = l.icon;
                const active = pathname.startsWith(l.href);
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex min-h-[48px] items-center gap-2 rounded-md px-3 py-2 text-base font-medium hover:bg-accent',
                      active && 'bg-accent',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {t(l.key)}
                  </Link>
                );
              })}
          </nav>
        </div>
      ) : null}
    </header>
  );
}
