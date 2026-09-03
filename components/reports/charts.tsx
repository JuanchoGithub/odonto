'use client';
import { formatMoney } from '@/lib/format';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AppLocale, Currency } from '@/lib/schemas/common';

const COLORS = ['#0ea5e9', '#22c55e', '#a855f7', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];

export function RevenueChart({
  data,
  currency,
  locale,
}: {
  data: { month: string; total: number }[];
  currency: Currency;
  locale: AppLocale;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="month" />
        <YAxis />
        <Tooltip formatter={(v: any) => formatMoney(Number(v) * 100, currency, locale)} />
        <Bar dataKey="total" fill="#0ea5e9" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TopTreatmentsChart({
  data,
}: {
  data: { description: string; count: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} dataKey="count" nameKey="description" outerRadius={100} label>
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip />
      </PieChart>
    </ResponsiveContainer>
  );
}
