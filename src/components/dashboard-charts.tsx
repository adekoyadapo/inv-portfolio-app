"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import { monthLabel } from "@/lib/utils";

const CHART_COLORS = ["#2563eb", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#64748b", "#ec4899"];

type TimelinePoint = {
  month: string;
  invested: number;
  currentValue: number;
};

type BreakdownPoint = {
  name: string;
  currentValue: number;
  invested: number;
};

type MomPoint = {
  month: string;
  momDelta: number;
};

type AccountPoint = {
  name: string;
  currentValue: number;
  invested: number;
};

type SparklinePoint = {
  value: number;
};

export function PortfolioTimelineChart({ data }: { data: TimelinePoint[] }) {
  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="portfolio-invested-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#64748b" stopOpacity={0.28} />
              <stop offset="95%" stopColor="#64748b" stopOpacity={0.04} />
            </linearGradient>
            <linearGradient id="portfolio-current-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22c55e" stopOpacity={0.34} />
              <stop offset="95%" stopColor="#22c55e" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="month" tickFormatter={monthLabel} tickLine={false} axisLine={false} />
          <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => `$${Number(value) / 1000}k`} />
          <Tooltip
            formatter={(value) => [`$${Number(value || 0).toLocaleString()}`, ""]}
            labelFormatter={(label) => monthLabel(String(label))}
            contentStyle={{ borderRadius: 8, background: "hsl(var(--popover) / 0.96)", borderColor: "hsl(var(--border))" }}
          />
          <Legend />
          <Area
            type="monotone"
            dataKey="invested"
            name="Invested"
            stroke="#64748b"
            strokeWidth={2}
            fill="url(#portfolio-invested-gradient)"
            fillOpacity={1}
            dot={false}
            activeDot={{ r: 3 }}
          />
          <Area
            type="monotone"
            dataKey="currentValue"
            name="Current value"
            stroke="#22c55e"
            strokeWidth={2}
            fill="url(#portfolio-current-gradient)"
            fillOpacity={1}
            dot={false}
            activeDot={{ r: 3 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function InstitutionBreakdownChart({ data }: { data: BreakdownPoint[] }) {
  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="name" tickLine={false} axisLine={false} />
          <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => `$${Number(value) / 1000}k`} />
          <Tooltip formatter={(value) => [`$${Number(value || 0).toLocaleString()}`, ""]} contentStyle={{ borderRadius: 8 }} />
          <Legend />
          <Bar dataKey="invested" name="Invested" fill="#94a3b8" radius={[4, 4, 0, 0]} />
          <Bar dataKey="currentValue" name="Current value" fill="#22c55e" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AllocationDonutChart({
  data,
  nameKey = "name"
}: {
  data: Array<{ name?: string; type?: string; currentValue: number }>;
  nameKey?: "name" | "type";
}) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip formatter={(value) => [`$${Number(value || 0).toLocaleString()}`, "Current value"]} contentStyle={{ borderRadius: 8 }} />
          <Legend />
          <Pie
            data={data}
            dataKey="currentValue"
            nameKey={nameKey}
            innerRadius={58}
            outerRadius={92}
            paddingAngle={3}
          >
            {data.map((entry, index) => (
              <Cell key={`${entry[nameKey] || "allocation"}-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MomDeltaBarChart({ data }: { data: MomPoint[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="month" tickFormatter={monthLabel} tickLine={false} axisLine={false} />
          <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => `$${Number(value) / 1000}k`} />
          <Tooltip
            formatter={(value) => [`$${Number(value || 0).toLocaleString()}`, "MoM change"]}
            labelFormatter={(label) => monthLabel(String(label))}
            contentStyle={{ borderRadius: 8 }}
          />
          <Bar dataKey="momDelta" name="MoM change" fill="#2563eb" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AccountValueBarChart({ data }: { data: AccountPoint[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="name" tickLine={false} axisLine={false} />
          <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => `$${Number(value) / 1000}k`} />
          <Tooltip formatter={(value) => [`$${Number(value || 0).toLocaleString()}`, ""]} contentStyle={{ borderRadius: 8 }} />
          <Legend />
          <Bar dataKey="invested" name="Invested" fill="#94a3b8" radius={[4, 4, 0, 0]} />
          <Bar dataKey="currentValue" name="Current value" fill="#2563eb" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MetricSparkline({ data, stroke, fill }: { data: SparklinePoint[]; stroke: string; fill: string }) {
  return (
    <div className="h-12 w-28">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`sparkline-${stroke.replace(/[^a-z0-9]/gi, "")}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={fill} stopOpacity={0.45} />
              <stop offset="95%" stopColor={fill} stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke={stroke}
            fill={`url(#sparkline-${stroke.replace(/[^a-z0-9]/gi, "")})`}
            strokeWidth={2}
            dot={false}
            activeDot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
