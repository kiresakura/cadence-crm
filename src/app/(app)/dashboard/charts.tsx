"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatMoney } from "@/lib/format";

const compact = (currency: string) => (value: number) =>
  formatMoney(value, currency, { compact: true });

export function PipelineByStageChart({
  data,
  currency,
}: {
  data: Array<{ name: string; amount: number; weighted: number; count: number }>;
  currency: string;
}) {
  return (
    <div className="h-72" role="img" aria-label="Open pipeline value by stage">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
          <YAxis
            tickFormatter={compact(currency)}
            tickLine={false}
            axisLine={false}
            fontSize={12}
            width={64}
          />
          <Tooltip
            formatter={(value) => formatMoney(Number(value), currency)}
            cursor={{ fill: "var(--muted)" }}
            contentStyle={{ borderRadius: 8, fontSize: 12 }}
          />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="amount" name="Total value" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="weighted" name="Weighted" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function WonByMonthChart({
  data,
  currency,
}: {
  data: Array<{ month: string; amount: number }>;
  currency: string;
}) {
  const labelled = data.map((point) => ({
    ...point,
    label: new Date(`${point.month}-01T00:00:00Z`).toLocaleString("en-US", {
      month: "short",
      timeZone: "UTC",
    }),
  }));
  return (
    <div className="h-72" role="img" aria-label="Won revenue over the last six months">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={labelled} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
          <YAxis
            tickFormatter={compact(currency)}
            tickLine={false}
            axisLine={false}
            fontSize={12}
            width={64}
          />
          <Tooltip
            formatter={(value) => formatMoney(Number(value), currency)}
            cursor={{ fill: "var(--muted)" }}
            contentStyle={{ borderRadius: 8, fontSize: 12 }}
          />
          <Bar dataKey="amount" name="Won" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
