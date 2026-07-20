import { LoaderCircle } from "lucide-react";
import { CartesianGrid, Line, LineChart as RechartsLineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function Trends({ selected, data, loading, scoreMode }) {
  if (!selected) return <div className="empty"> Choose trend on an explorer row to inspect its history.</div>;
  const isRankMode = scoreMode === "rank";
  const chartData = [2022, 2023, 2024].map((year) => ({
    year,
    cet: data.cet.find((point) => point.year === year)?.[isRankMode ? "meritRank" : "percentile"] ?? null,
    jee: data.jee.find((point) => point.year === year)?.[isRankMode ? "meritRank" : "percentile"] ?? null,
  }));
  return (
    <section className="trend-view">
      <div>
        <p className="eyebrow">Selected option</p>
        <h2>{selected.collegeName}</h2>
        <p>
          {selected.branchName}
          {selected.category ? ` · ${selected.category}` : ""}
        </p>
      </div>
      {loading ? (
        <div className="empty">
          <LoaderCircle className="spin" /> Loading history…
        </div>
      ) : (
        <div className="chart">
          <div className="chart-key">
            <span className="cet-key">CET {isRankMode ? "rank" : "percentile"}</span>
            <span className="jee-key">JEE {isRankMode ? "rank" : "percentile"}</span>
          </div>
          <ResponsiveContainer width="100%" height={310}>
            <RechartsLineChart data={chartData} margin={{ top: 10, right: 24, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis dataKey="year" stroke="var(--chart-axis)" />
              <YAxis domain={["auto", "auto"]} stroke="var(--chart-axis)" reversed={isRankMode} />
              <Tooltip
                contentStyle={{
                  background: "var(--tooltip-bg)",
                  border: "1px solid var(--tooltip-border)",
                  borderRadius: 12,
                }}
                labelStyle={{ color: "var(--text-color)" }}
                itemStyle={{ color: "var(--text-color)" }}
              />
              <Line type="monotone" dataKey="cet" name={`CET ${isRankMode ? "rank" : "percentile"}`} stroke="#a78bfa" strokeWidth={3} dot={{ r: 5 }} connectNulls />
              <Line type="monotone" dataKey="jee" name={`JEE ${isRankMode ? "rank" : "percentile"}`} stroke="#2dd4bf" strokeWidth={3} dot={{ r: 5 }} connectNulls />
            </RechartsLineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
