"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function AnalyticsTrendChart({
  data,
}: {
  data: { date: string; activeUsers: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <XAxis
          dataKey="date"
          tickFormatter={(value: string) => value.slice(5)}
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          minTickGap={24}
        />
        <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={32} allowDecimals={false} />
        <Tooltip
          contentStyle={{
            backgroundColor: "var(--card)",
            borderColor: "var(--border)",
            borderRadius: "var(--radius-md)",
            fontSize: 12,
          }}
          labelStyle={{ color: "var(--foreground)" }}
        />
        <Line
          type="monotone"
          dataKey="activeUsers"
          name="Active users"
          stroke="#4C9997"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
