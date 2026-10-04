"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

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

function EmptyChart({ text }: { text: string }) {
  return <p className="grid h-40 place-items-center border border-dashed border-[var(--ink)]/30 text-sm text-[var(--muted)]">{text}</p>;
}
