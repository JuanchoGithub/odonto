import { test, expect } from '@playwright/test';
import {
  agendaEndDate,
  autoAnchorFor,
  endOfFirstFullWeekMonSun,
  isFarWindow,
} from '@/lib/agenda-horizon';

// Pure agenda-horizon table. Weeks are Mon–Sun; October 2026 opens Thu 1 –
// Sun 4 (partial), so the first FULL week is Mon 5 – Sun 11 → anchor Oct 11.
test('first full Mon–Sun week anchors', async () => {
  expect(endOfFirstFullWeekMonSun(2026, 10)).toBe('2026-10-11');
  // Month opening on Monday → anchor is the 7th.
  expect(endOfFirstFullWeekMonSun(2026, 6)).toBe('2026-06-07');
  // Month opening on Sunday → first full week Mon 2 – Sun 8.
  expect(endOfFirstFullWeekMonSun(2026, 2)).toBe('2026-02-08');
  // Tuesday opening → latest anchor (13th).
  expect(endOfFirstFullWeekMonSun(2026, 9)).toBe('2026-09-13');
  // Year boundary: Dec 2026 → Jan 2027 (Jan 1 is a Friday → Sun Jan 10).
  expect(endOfFirstFullWeekMonSun(2027, 1)).toBe('2027-01-10');
});

test('September 2026 rolling horizon (sticky, then 14-day)', async () => {
  expect(autoAnchorFor('2026-09-14')).toBeNull();
  expect(autoAnchorFor('2026-09-15')).toBe('2026-10-11');
  // Before the 15th: plain 14 days.
  expect(agendaEndDate('2026-09-01', null)).toBe('2026-09-15');
  expect(agendaEndDate('2026-09-14', null)).toBe('2026-09-28');
  // Sticky anchor while today + 14 falls short of it.
  expect(agendaEndDate('2026-09-15', null)).toBe('2026-10-11');
  expect(agendaEndDate('2026-09-25', null)).toBe('2026-10-11');
  expect(agendaEndDate('2026-09-26', null)).toBe('2026-10-11');
  // Handoff, then back to the 14-day rule (never overextends).
  expect(agendaEndDate('2026-09-27', null)).toBe('2026-10-11');
  expect(agendaEndDate('2026-09-28', null)).toBe('2026-10-12');
  expect(agendaEndDate('2026-09-29', null)).toBe('2026-10-13');
});

test('manual opening folds back like the auto rule', async () => {
  // Manual anchor ahead of everything wins…
  expect(agendaEndDate('2026-09-20', '2026-10-20')).toBe('2026-10-20');
  // …but a manual date inside the base/auto window changes nothing…
  expect(agendaEndDate('2026-09-20', '2026-09-25')).toBe('2026-10-11');
  // …and once time catches up, the window folds back to 14 days.
  expect(agendaEndDate('2026-10-07', '2026-10-20')).toBe('2026-10-21');
  // Past/invalid manual dates are ignored.
  expect(agendaEndDate('2026-09-20', '2026-09-01')).toBe('2026-10-11');
  expect(agendaEndDate('2026-09-20', 'not-a-date')).toBe('2026-10-11');
  // Absolute clamp at today + 62.
  expect(agendaEndDate('2026-09-20', '2027-06-01')).toBe('2026-11-21');
});

test('far-window threshold is > 30 days', async () => {
  expect(isFarWindow('2026-09-15', '2026-10-11')).toBe(false); // 26 days
  expect(isFarWindow('2026-09-15', '2026-10-16')).toBe(true); // 31 days
});
