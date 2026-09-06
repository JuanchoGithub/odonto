'use client';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatDateTime } from '@/lib/format';
import type { AppLocale } from '@/lib/schemas/common';
import {
  WholeConditionSymbol,
  CONDITION_BG,
} from './tooth-svg';
import { Odontogram } from './odontogram';
import type {
  OdontogramHistoryRow,
  OdontogramMode,
  ToothRow,
} from '@/server/actions/odontogram';

const WHOLE = new Set([
  'missing',
  'crown',
  'to_extract',
  'perno',
  'sealant',
  'conduct_todo',
  'conduct_done',
]);
const PER_SURFACE = new Set(['caries', 'restoration']);

export function OdontogramHistory({
  history,
  patientId,
  mode,
  locale,
}: {
  history: OdontogramHistoryRow[];
  patientId: string;
  mode: OdontogramMode;
  locale: string;
}) {
  const t = useTranslations('odontogram');
  const [asOfId, setAsOfId] = useState<string>('');

  const asOf = history.find((h) => h.id === asOfId) ?? null;
  const snapshot = useMemo<ToothRow[] | null>(() => {
    if (!asOf) return null;
    try {
      return JSON.parse(asOf.snapshot) as ToothRow[];
    } catch {
      return null;
    }
  }, [asOf]);

  if (history.length === 0) {
    return (
      <Card data-testid="odontogram-history-empty">
        <CardContent className="pt-6 text-center text-sm text-muted-foreground">
          {t('noHistory')}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4" data-testid="odontogram-history">
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-medium">{t('asOf')}</div>
            <Select value={asOfId} onValueChange={setAsOfId}>
              <SelectTrigger
                className="w-full sm:w-[260px] min-h-[44px]"
                data-testid="history-asof"
              >
                <SelectValue placeholder={t('current')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">{t('current')}</SelectItem>
                {history.map((h) => (
                  <SelectItem key={h.id} value={h.id}>
                    {formatDateTime(h.created_at, locale as AppLocale)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {snapshot && asOf ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span
                  className="text-xs font-medium text-primary"
                  data-testid="history-snapshot-banner"
                >
                  {t('readOnlyNotice')} —{' '}
                  {formatDateTime(asOf.created_at, locale as AppLocale)}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setAsOfId('')}
                  data-testid="history-snapshot-clear"
                >
                  {t('clearAsOf')}
                </Button>
              </div>
              <Odontogram
                key={asOf.id}
                initial={snapshot}
                patientId={patientId}
                locale={locale}
                mode={mode}
                readOnly
              />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 space-y-1">
          <div className="text-sm font-medium mb-2">{t('historyTimeline')}</div>
          {history.map((h) => (
            <TimelineRow key={h.id} h={h} locale={locale as AppLocale} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function TimelineRow({
  h,
  locale,
}: {
  h: OdontogramHistoryRow;
  locale: AppLocale;
}) {
  const t = useTranslations('odontogram');
  const cond = h.condition;
  const isWhole = cond ? WHOLE.has(cond) : false;
  const isPerSurface = cond ? PER_SURFACE.has(cond) : false;
  return (
    <div
      className="flex items-start gap-3 border-b py-3 last:border-0"
      data-testid="history-row"
    >
      <div className="mt-0.5 w-6 shrink-0">
        {isWhole && cond ? <WholeConditionSymbol condition={cond} size={24} /> : null}
        {isPerSurface && cond ? (
          <span
            className={`block h-5 w-5 rounded ${CONDITION_BG[cond] ?? 'bg-muted'}`}
          />
        ) : null}
      </div>
      <div className="flex-1 min-w-0 text-sm">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium">{h.user_name ?? t('unknownUser')}</span>
          <span className="text-muted-foreground">
            {t(`action.${h.action}` as any)}
          </span>
          {h.tooth_number != null ? (
            <span className="text-muted-foreground">
              {t('tooth')} {h.tooth_number}
            </span>
          ) : null}
          {h.surface != null ? (
            <span className="text-muted-foreground">
              {t(`surfaces.${h.surface}` as any)}
            </span>
          ) : null}
          {h.condition != null ? (
            <span className="font-medium">
              {t(`conditions.${h.condition}` as any)}
            </span>
          ) : null}
        </div>
        {h.note ? (
          <div className="text-xs text-muted-foreground">{h.note}</div>
        ) : null}
        <div className="text-xs text-muted-foreground">
          {formatDateTime(h.created_at, locale)}
        </div>
      </div>
    </div>
  );
}