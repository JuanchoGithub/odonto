'use client';
import { useRef, useState } from 'react';
import { format, isToday, type Locale } from 'date-fns';
import { cn } from '@/lib/utils';
import { dentistColor } from '@/lib/colors';
import type { ApptRow } from '@/server/actions/appointments';

export const SLOT_MINUTES = 15;
export const SLOT_PX = 14;
export const DAY_START_HOUR = 8;
export const DAY_END_HOUR = 19; // exclusive — shows 8:00 through 18:45 slots
const DAY_START_MIN = DAY_START_HOUR * 60;
const DAY_END_MIN = DAY_END_HOUR * 60;
const TOTAL_MIN = DAY_END_MIN - DAY_START_MIN;
export const GRID_HEIGHT = (TOTAL_MIN / SLOT_MINUTES) * SLOT_PX;

function minutesOfDay(d: Date) {
  return d.getHours() * 60 + d.getMinutes();
}

type LaidBlock = { appt: ApptRow; col: number; cols: number };

// Side-by-side columns for overlapping appointments within a day.
function layoutDay(dayAppts: ApptRow[]): LaidBlock[] {
  const events = dayAppts
    .map((a) => ({
      a,
      s: new Date(a.starts_at).getTime(),
      e: new Date(a.ends_at).getTime(),
    }))
    .sort((x, y) => x.s - y.s || x.e - y.e || x.a.id.localeCompare(y.a.id));
  const out: LaidBlock[] = [];
  let cluster: typeof events = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    if (!cluster.length) return;
    const colEnds: number[] = [];
    const placed = new Map<string, number>();
    for (const ev of cluster) {
      let c = colEnds.findIndex((endT) => endT <= ev.s);
      if (c === -1) {
        c = colEnds.length;
        colEnds.push(ev.e);
      } else {
        colEnds[c] = ev.e;
      }
      placed.set(ev.a.id, c);
    }
    const cols = Math.max(1, colEnds.length);
    for (const ev of cluster) {
      out.push({ appt: ev.a, col: placed.get(ev.a.id)!, cols });
    }
    cluster = [];
    clusterEnd = -Infinity;
  };
  for (const ev of events) {
    if (cluster.length && ev.s >= clusterEnd) flush();
    cluster.push(ev);
    clusterEnd = Math.max(clusterEnd, ev.e);
  }
  flush();
  return out;
}

export function TimeGrid({
  days,
  appts,
  locale,
  onSlotClick,
  onOpenAppt,
  onMoveAppt,
}: {
  days: Date[];
  appts: ApptRow[];
  locale: Locale;
  onSlotClick: (d: Date) => void;
  onOpenAppt: (a: ApptRow) => void;
  onMoveAppt: (a: ApptRow, start: Date, end: Date) => void;
}) {
  const hourLines = Array.from(
    { length: TOTAL_MIN / SLOT_MINUTES },
    (_, i) => i,
  );

  return (
    <div className="overflow-x-auto">
      <div
        className="grid border rounded-md"
        style={{
          gridTemplateColumns: '52px repeat(7, minmax(130px, 1fr))',
        }}
      >
        <div className="bg-muted/30 border-b border-r" />
        {days.map((d) => (
          <div
            key={d.toISOString()}
            className={cn(
              'bg-muted/30 border-b border-r last:border-r-0 p-2 text-xs font-medium text-center',
              isToday(d) && 'bg-primary/10',
            )}
          >
            <div>{format(d, 'EEE', { locale })}</div>
            <div className="text-base">{format(d, 'd')}</div>
          </div>
        ))}
        {/* hour gutter */}
        <div
          className="relative border-r"
          style={{ height: GRID_HEIGHT }}
        >
          {Array.from(
            { length: DAY_END_HOUR - DAY_START_HOUR + 1 },
            (_, i) => DAY_START_HOUR + i,
          ).map((h, i) => (
            <div
              key={h}
              className="absolute inset-x-0 text-right pr-1 text-[10px] text-muted-foreground"
              style={{ top: i * SLOT_PX * 4 - 6 }}
            >
              {String(h).padStart(2, '0')}:00
            </div>
          ))}
        </div>
        {days.map((d, dayIndex) => (
          <DayColumn
            key={d.toISOString()}
            day={d}
            dayIndex={dayIndex}
            dayCount={days.length}
            appts={appts.filter(
              (a) =>
                new Date(a.starts_at).toDateString() === d.toDateString(),
            )}
            lines={hourLines}
            onSlotClick={onSlotClick}
            onOpenAppt={onOpenAppt}
            onMoveAppt={onMoveAppt}
          />
        ))}
      </div>
    </div>
  );
}

function DayColumn({
  day,
  dayIndex,
  dayCount,
  appts,
  lines,
  onSlotClick,
  onOpenAppt,
  onMoveAppt,
}: {
  day: Date;
  dayIndex: number;
  dayCount: number;
  appts: ApptRow[];
  lines: number[];
  onSlotClick: (d: Date) => void;
  onOpenAppt: (a: ApptRow) => void;
  onMoveAppt: (a: ApptRow, start: Date, end: Date) => void;
}) {
  const laid = layoutDay(appts);
  return (
    <div
      data-testid={`day-col-${dayIndex}`}
      className={cn(
        'relative border-r last:border-r-0 cursor-pointer',
        isToday(day) && 'bg-primary/5',
      )}
      style={{ height: GRID_HEIGHT }}
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const raw = (e.clientY - rect.top) / SLOT_PX;
        const mins =
          Math.min(
            Math.max(Math.floor(raw), 0),
            TOTAL_MIN / SLOT_MINUTES - 1,
          ) * SLOT_MINUTES;
        const d = new Date(day);
        d.setHours(DAY_START_HOUR + Math.floor(mins / 60), mins % 60, 0, 0);
        onSlotClick(d);
      }}
    >
      {lines.map((i) => (
        <div
          key={i}
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-x-0 border-t',
            i % 4 === 0 ? 'border-border/70' : 'border-border/30',
          )}
          style={{ top: i * SLOT_PX }}
        />
      ))}
      {laid.map((b) => (
        <ApptBlock
          key={b.appt.id}
          block={b}
          dayIndex={dayIndex}
          dayCount={dayCount}
          onOpen={onOpenAppt}
          onCommit={onMoveAppt}
        />
      ))}
    </div>
  );
}

type DragPreview =
  | { mode: 'move'; deltaMin: number; dayDelta: number }
  | { mode: 'resize'; durMin: number };

function ApptBlock({
  block,
  dayIndex,
  dayCount,
  onOpen,
  onCommit,
}: {
  block: LaidBlock;
  dayIndex: number;
  dayCount: number;
  onOpen: (a: ApptRow) => void;
  onCommit: (a: ApptRow, start: Date, end: Date) => void;
}) {
  const { appt, col, cols } = block;
  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    mode: 'move' | 'resize';
    startX: number;
    startY: number;
    moved: boolean;
    colWidth: number;
    origStart: number;
    origEnd: number;
  } | null>(null);
  const [preview, setPreview] = useState<DragPreview | null>(null);
  const suppressClickRef = useRef(false);

  const color = dentistColor(appt.dentist_color, appt.dentist_id);
  const origStart = new Date(appt.starts_at).getTime();
  const origEnd = new Date(appt.ends_at).getTime();

  let dispStart = origStart;
  let dispEnd = origEnd;
  let dayShift = 0;
  if (preview?.mode === 'move') {
    dispStart += preview.deltaMin * 60000;
    dispEnd += preview.deltaMin * 60000;
    dayShift = preview.dayDelta;
  } else if (preview?.mode === 'resize') {
    dispEnd = origStart + preview.durMin * 60000;
  }

  const startMin = minutesOfDay(new Date(dispStart));
  const durMin = Math.max(
    SLOT_MINUTES,
    Math.round((dispEnd - dispStart) / 60000),
  );
  const topMin = Math.max(startMin, DAY_START_MIN);
  const botMin = Math.min(startMin + durMin, DAY_END_MIN);
  const top = ((topMin - DAY_START_MIN) / SLOT_MINUTES) * SLOT_PX;
  const height = Math.max(
    SLOT_PX,
    ((botMin - topMin) / SLOT_MINUTES) * SLOT_PX,
  );
  const leftPct = (col / cols) * 100 + dayShift * 100;
  const widthPct = 100 / cols;

  const inactive =
    appt.status === 'cancelled' || appt.status === 'no_show';

  function onPointerDown(e: React.PointerEvent, mode: 'move' | 'resize') {
    if (e.button !== 0) return;
    e.stopPropagation();
    const el = rootRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    dragRef.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      colWidth: el.parentElement?.getBoundingClientRect().width ?? 1,
      origStart,
      origEnd,
    };
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
    d.moved = true;
    const deltaMin = Math.round(dy / SLOT_PX) * SLOT_MINUTES;
    if (d.mode === 'move') {
      const dayDelta = Math.min(
        Math.max(Math.round(dx / d.colWidth), -dayIndex),
        dayCount - 1 - dayIndex,
      );
      // Clamp the drop inside the visible time window.
      const startMin0 = minutesOfDay(new Date(d.origStart));
      const durMin = Math.max(
        SLOT_MINUTES,
        Math.round((d.origEnd - d.origStart) / 60000),
      );
      const clamped = Math.min(
        Math.max(startMin0 + deltaMin, DAY_START_MIN),
        DAY_END_MIN - durMin,
      );
      setPreview({
        mode: 'move',
        deltaMin: clamped - startMin0,
        dayDelta,
      });
    } else {
      const origDurMin = Math.max(
        SLOT_MINUTES,
        Math.round((d.origEnd - d.origStart) / 60000),
      );
      const startMin0 = minutesOfDay(new Date(d.origStart));
      const maxDur = DAY_END_MIN - startMin0;
      setPreview({
        mode: 'resize',
        durMin: Math.min(
          Math.max(origDurMin + deltaMin, SLOT_MINUTES),
          maxDur,
        ),
      });
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    try {
      rootRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    const p = preview;
    setPreview(null);
    if (!d.moved) {
      // Not a drag — let the click handler open the edit dialog.
      return;
    }
    // The click that follows this pointerup must be swallowed.
    suppressClickRef.current = true;
    if (!p) return;
    if (p.mode === 'move') {
      const shift = p.deltaMin * 60000 + p.dayDelta * 86400000;
      onCommit(appt, new Date(d.origStart + shift), new Date(d.origEnd + shift));
    } else {
      onCommit(
        appt,
        new Date(d.origStart),
        new Date(d.origStart + p.durMin * 60000),
      );
    }
  }

  return (
    <div
      ref={rootRef}
      data-testid="appt-badge"
      role="button"
      tabIndex={0}
      aria-label={`${format(new Date(dispStart), 'HH:mm')} ${appt.patient_name}`}
      className={cn(
        'absolute rounded-[4px] border text-white overflow-hidden select-none touch-none',
        'cursor-grab active:cursor-grabbing shadow-sm',
        preview && 'opacity-80 shadow-lg z-20',
        inactive && 'opacity-50',
      )}
      style={{
        top,
        height,
        left: `${leftPct}%`,
        width: `calc(${widthPct}% - 2px)`,
        marginLeft: 1,
        backgroundColor: color,
        borderColor: color,
      }}
      onPointerDown={(e) => onPointerDown(e, 'move')}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        dragRef.current = null;
        setPreview(null);
      }}
      onClick={(e) => {
        // Always swallow so the day column's create-on-click never fires from
        // inside a block. Open the dialog unless this click ended a drag.
        e.stopPropagation();
        if (suppressClickRef.current) {
          suppressClickRef.current = false;
          return;
        }
        onOpen(appt);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          onOpen(appt);
        }
      }}
    >
      <div className="px-1 leading-tight text-[10px]">
        <div className={cn('font-semibold', inactive && 'line-through')}>
          {format(new Date(dispStart), 'HH:mm')}–
          {format(new Date(dispEnd), 'HH:mm')}
        </div>
        {height >= SLOT_PX * 2 ? (
          <div className={cn('truncate', inactive && 'line-through')}>
            {appt.patient_name}
          </div>
        ) : null}
        {height > SLOT_PX * 3 ? (
          <div className="truncate opacity-80">{appt.dentist_name}</div>
        ) : null}
      </div>
      <div
        aria-hidden
        data-testid="appt-resize"
        className="absolute bottom-0 inset-x-0 h-[6px] cursor-ns-resize"
        onPointerDown={(e) => onPointerDown(e, 'resize')}
      />
    </div>
  );
}
