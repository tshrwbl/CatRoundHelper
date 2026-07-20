import { LoaderCircle, SlidersHorizontal } from "lucide-react";
import { useState, useEffect } from "react";
import { Bar, BarChart as RechartsBarChart, CartesianGrid, Legend, Line, LineChart as RechartsLineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatRank } from "./formatters";
import { CollegePicker } from "./CollegePicker";
import { ScoreCell } from "./ScoreCell";

export function CollegePage({ college, data, loading, collegeRules, onEditFilters, percentile, percentiles, rank, ranks, exam, scoreMode, collegeOptions, onSelectCollege }) {
  const [tableSort, setTableSort] = useState({ by: null, direction: "DESC" });
  useEffect(() => setTableSort({ by: null, direction: "DESC" }), [college?.collegeCode]);
  if (!college)
    return (
      <section className="college-page college-empty">
        <CollegePicker options={collegeOptions} college={college} onSelect={onSelectCollege} />
        <div className="empty">Search for a college to see its branches, category cutoffs, and score fit.</div>
      </section>
    );
  if (loading)
    return (
      <div className="empty">
        <LoaderCircle className="spin" /> Loading college overview…
      </div>
    );
  const latest = data.rows.filter((row) => row.year === 2024);
  const isRankMode = scoreMode === "rank";
  const cutoffKey = isRankMode ? (exam === "JEE" ? "jeeRank" : "cetRank") : exam === "JEE" ? "jeePercentile" : "cetPercentile";

  const chartData = Object.values(
    latest.reduce((groups, row) => {
      const cutoff = row[cutoffKey];
      if (cutoff != null) {
        if (!groups[row.branchName]) {
          groups[row.branchName] = { branch: row.branchName, cutoff: Number(cutoff) };
        } else {
          const isBetter = isRankMode ? Number(cutoff) < groups[row.branchName].cutoff : Number(cutoff) > groups[row.branchName].cutoff;
          if (isBetter) groups[row.branchName] = { branch: row.branchName, cutoff: Number(cutoff) };
        }
      }
      return groups;
    }, {})
  )
    .sort((a, b) => (isRankMode ? a.cutoff - b.cutoff : b.cutoff - a.cutoff))
    .slice(0, 12);

  const historyData = [2022, 2023, 2024].map((year) => {
    const yearRows = data.rows.filter((row) => row.year === year);
    const average = (key) => {
      const values = yearRows.map((row) => row[key]).filter((value) => value != null);
      return values.length ? Number((values.reduce((sum, value) => sum + Number(value), 0) / values.length).toFixed(isRankMode ? 0 : 2)) : null;
    };
    return {
      year,
      cet: average(isRankMode ? "cetRank" : "cetPercentile"),
      jee: average(isRankMode ? "jeeRank" : "jeePercentile"),
    };
  });
  const sortedLatest = [...latest].sort((left, right) => {
    if (!tableSort.by) return 0;
    const leftValue = left[tableSort.by];
    const rightValue = right[tableSort.by];
    if (leftValue == null && rightValue == null) return 0;
    if (leftValue == null) return 1;
    if (rightValue == null) return -1;
    const comparison = Number(leftValue) - Number(rightValue);
    return (tableSort.direction === "ASC" ? 1 : -1) * comparison;
  });
  const changeCollegeSort = (by) => setTableSort((current) => (current.by === by ? { by, direction: current.direction === "ASC" ? "DESC" : "ASC" } : { by, direction: "DESC" }));
  const collegeHeading = (label, key) => (
    <th>
      <button className="sort-heading" onClick={() => changeCollegeSort(key)}>
        {label} {tableSort.by === key ? (tableSort.direction === "ASC" ? "↑" : "↓") : "↕"}
      </button>
    </th>
  );
  const userScoreDisplay = isRankMode ? (rank ? formatRank(rank) : "—") : percentile ? `${percentile}%` : "—";

  return (
    <section className="college-page">
      <div className="college-header">
        <div>
          <p className="eyebrow">College intelligence</p>
          <h2>{college.collegeName}</h2>
          <p>
            Code {college.collegeCode} · 2024 {exam === "JEE" ? "branch" : "category-wise"} cutoff overview
          </p>
        </div>
        <div className="college-controls">
          <CollegePicker options={collegeOptions} college={college} onSelect={onSelectCollege} />
          <button className="open-filter-builder" onClick={onEditFilters}>
            <SlidersHorizontal size={16} /> College filters
            {collegeRules.length ? ` (${collegeRules.length})` : ""}
          </button>
          <p>
            Your {exam} {isRankMode ? "rank" : "percentile"}: <strong>{userScoreDisplay}</strong>
          </p>
        </div>
      </div>
      <div className="college-metrics">
        <article>
          <span>Branches shown</span>
          <strong>{new Set(latest.map((row) => row.branchCode)).size}</strong>
        </article>
        <article>
          <span>{exam === "JEE" ? "Branch cutoffs" : "Category cutoffs"}</span>
          <strong>{latest.length}</strong>
        </article>
        <article>
          <span>Your score</span>
          <strong>{userScoreDisplay}</strong>
        </article>
      </div>
      <div className="college-chart">
        <div>
          <h3>Most competitive branches</h3>
          <p>
            {isRankMode ? "Lowest" : "Highest"} 2024 {exam} cutoff across each branch’s categories.
          </p>
        </div>
        {chartData.length ? (
          <ResponsiveContainer width="100%" height={290}>
            <RechartsBarChart data={chartData} layout="vertical" margin={{ left: 14, right: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis type="number" stroke="var(--chart-axis)" domain={["auto", "auto"]} reversed={isRankMode} />
              <YAxis type="category" dataKey="branch" width={185} stroke="var(--text-color)" tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  background: "var(--tooltip-bg)",
                  border: "1px solid var(--tooltip-border)",
                  borderRadius: 12,
                }}
                labelStyle={{ color: "var(--text-color)" }}
                itemStyle={{ color: "var(--text-color)" }}
              />
              <Bar dataKey="cutoff" name={`${exam} ${isRankMode ? "rank" : "percentile"}`} fill="#8b7cf6" radius={[0, 5, 5, 0]} />
            </RechartsBarChart>
          </ResponsiveContainer>
        ) : (
          <div className="empty compact">No 2024 cutoff data for this exam and filter set.</div>
        )}
      </div>
      <div className="college-chart">
        <div>
          <h3>College cutoff movement</h3>
          <p>Average category-wise {isRankMode ? "rank" : "percentile"} across the selected branches.</p>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <RechartsLineChart data={historyData} margin={{ top: 10, right: 24, left: -12 }}>
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
            <Legend />
            <Line type="monotone" dataKey="cet" name="CET average" stroke="#a78bfa" strokeWidth={3} connectNulls />
            <Line type="monotone" dataKey="jee" name="JEE average" stroke="#2dd4bf" strokeWidth={3} connectNulls />
          </RechartsLineChart>
        </ResponsiveContainer>
      </div>
      <div className="college-table">
        <h3>{exam === "JEE" ? "All 2024 branch cutoffs" : "All 2024 category-wise cutoffs"}</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Branch</th>
                <th>Branch status</th>
                {exam !== "JEE" && <th>Category</th>}
                {exam !== "JEE" && collegeHeading("CET", isRankMode ? "cetRank" : "cetPercentile")}
                {collegeHeading("JEE", isRankMode ? "jeeRank" : "jeePercentile")}
              </tr>
            </thead>
            <tbody>
              {sortedLatest.map((row, index) => (
                <tr key={`${row.branchCode}-${row.category || ""}-${row.capRound}-${index}`}>
                  <td>
                    <strong>{row.branchName}</strong>
                    <span>{row.branchCode}</span>
                  </td>
                  <td>{row.branchStatus || "—"}</td>
                  {exam !== "JEE" && (
                    <td>
                      <span className="tag">{row.category}</span>
                    </td>
                  )}
                  {exam !== "JEE" && <ScoreCell cutoffPercentile={row.cetPercentile} cutoffRank={row.cetRank} scoreMode={scoreMode} userPercentile={percentiles.CET} userRank={ranks.CET} />}
                  <ScoreCell cutoffPercentile={row.jeePercentile} cutoffRank={row.jeeRank} scoreMode={scoreMode} userPercentile={percentiles.JEE} userRank={ranks.JEE} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
