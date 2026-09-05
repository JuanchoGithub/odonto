import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/rbac';
import { query, queryOne } from '@/lib/db';
import { getClinicTimezone, wallClockInTz } from '@/lib/availability';

// Temporary debug endpoint: GET ?dentist_id=…&start=ISO&end=ISO
export async function GET(req: NextRequest) {
  await requireRole(['admin']);
  const p = req.nextUrl.searchParams;
  const dentistId = p.get('dentist_id')!;
  const start = p.get('start')!;
  const end = p.get('end')!;

  const tz = await getClinicTimezone();
  const sw = wallClockInTz(start, tz);
  const ew = wallClockInTz(end, tz);
  const clinicEx = await queryOne(`SELECT * FROM clinic_exceptions WHERE date = ?`, [sw.date]);
  const dentistEx = await queryOne(
    `SELECT * FROM dentist_exceptions WHERE dentist_id = ? AND date = ?`,
    [dentistId, sw.date],
  );
  const hasSchedule = await queryOne(
    `SELECT COUNT(*) as n FROM dentist_schedules WHERE dentist_id = ?`,
    [dentistId],
  );
  const schedRows = await query(
    `SELECT * FROM dentist_schedules WHERE dentist_id = ? AND day_of_week = ?
       AND (effective_from IS NULL OR effective_from <= ?)
       AND (effective_to IS NULL OR effective_to >= ?)`,
    [dentistId, sw.dayOfWeek, sw.date, sw.date],
  );
  const allRows = await query(
    `SELECT day_of_week, start_time, end_time, effective_from, effective_to FROM dentist_schedules WHERE dentist_id = ?`,
    [dentistId],
  );
  const bizRows = await query(
    `SELECT day_of_week, start_time, end_time FROM clinic_business_hours`,
  );
  return NextResponse.json({
    tz,
    wall: { sw, ew },
    clinicEx,
    dentistEx,
    hasSchedule,
    schedRows,
    allRows,
    bizRows,
  });
}
