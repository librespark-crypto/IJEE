"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const tip = { background: "#fffaf3", border: "2px solid #1c1712", borderRadius: 0, fontSize: 12 };

export function TrendChart({ data, label }: { data: { name: string; value: number }[]; label: string }) {
  if (!data.length) return <EmptyChart text="No submitted attempts yet." />;
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid stroke="#eadfce" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip contentStyle={tip} />
          <Line type="monotone" dataKey="value" name={label} stroke="#c73e2a" strokeWidth={2.4} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BarBlock({ data, label }: { data: { name: string; value: number }[]; label: string }) {
  if (!data.length) return <EmptyChart text="Nothing to chart." />;
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid stroke="#eadfce" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-18} height={52} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip contentStyle={tip} />
          <Bar dataKey="value" name={label} fill="#1e3a5f" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Clustered bar chart with multiple data keys.
 */
export function ClusteredBarChart({
  data,
  bars,
}: {
  data: Record<string, string | number>[];
  bars: { key: string; name: string; color: string }[];
}) {
  if (!data.length) return <EmptyChart text="Nothing to chart." />;
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid stroke="#eadfce" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-12} height={48} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip contentStyle={tip} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {bars.map((bar) => (
            <Bar key={bar.key} dataKey={bar.key} name={bar.name} fill={bar.color} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Subject-wise time bar chart with color coding.
 */
const SUBJECT_COLORS: Record<string, string> = {
  Physics: "#1e3a5f",
  Chemistry: "#c73e2a",
  Mathematics: "#21543c",
};

export function SubjectTimeBar({ data }: { data: { name: string; value: number }[] }) {
  if (!data.length) return <EmptyChart text="Nothing to chart." />;
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid stroke="#eadfce" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} />
          <YAxis tick={{ fontSize: 11 }} label={{ value: "Minutes", angle: -90, position: "insideLeft", style: { fontSize: 11 } }} />
          <Tooltip contentStyle={tip} />
          <Bar dataKey="value" name="Minutes">
            {data.map((entry, index) => (
              <Cell key={index} fill={SUBJECT_COLORS[entry.name] ?? "#a67c3d"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Segmented progress bar for time quality.
 */
export function SegmentedBar({
  segments,
}: {
  segments: { label: string; pct: number; color: string; textColor?: string }[];
}) {
  const total = segments.reduce((sum, s) => sum + s.pct, 0) || 1;
  return (
    <div>
      <div className="flex h-8 w-full overflow-hidden border-2 border-black">
        {segments.map((seg, i) => (
          <div
            key={i}
            className="flex items-center justify-center text-xs font-bold transition-all"
            style={{
              width: `${(seg.pct / total) * 100}%`,
              backgroundColor: seg.color,
              color: seg.textColor ?? "white",
              minWidth: seg.pct > 5 ? undefined : 0,
            }}
            title={`${seg.label}: ${seg.pct.toFixed(1)}%`}
          >
            {seg.pct > 8 ? `${seg.pct.toFixed(0)}%` : ""}
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-xs">
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 border border-black" style={{ backgroundColor: seg.color }} />
            <span>{seg.label}: {seg.pct.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Attempt quality comparison bar chart.
 */
export function AttemptQualityChart({
  data,
}: {
  data: { name: string; Perfect: number; Wasted: number; Overtime: number; Confused: number }[];
}) {
  if (!data.length) return <EmptyChart text="No attempt quality data." />;
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid stroke="#eadfce" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip contentStyle={tip} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="Perfect" fill="#21543c" />
          <Bar dataKey="Wasted" fill="#c73e2a" />
          <Bar dataKey="Overtime" fill="#a67c3d" />
          <Bar dataKey="Confused" fill="#6f675e" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function EmptyChart({ text }: { text: string }) {
  return <p className="grid h-40 place-items-center border-2 border-dashed border-[var(--ink)]/30 text-sm text-[var(--muted)]">{text}</p>;
}
