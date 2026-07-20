import { Building2, LineChart, LoaderCircle } from "lucide-react";
import { Pagination } from "./Pagination";
import { ScoreCell } from "./ScoreCell";

export function Explorer({ rows, loading, onSelectTrend, onOpenCollege, pagination, sort, onSort, percentiles, ranks, exam, scoreMode }) {
  if (loading)
    return (
      <div className="empty">
        <LoaderCircle className="spin" /> Updating cutoff matches…
      </div>
    );
  if (!rows.length) return <div className="empty">No records match the current filters.</div>;
  const heading = (label, key) => (
    <th>
      <button className="sort-heading" onClick={() => onSort(key)}>
        {label} {sort.by === key ? (sort.direction === "ASC" ? "↑" : "↓") : "↕"}
      </button>
    </th>
  );
  const changeKey = exam === "JEE" ? "jeeChange" : "cetChange";
  const isRankMode = scoreMode === "rank";
  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {heading("College / branch", "collegeName")}
              {exam !== "JEE" && heading("Category", "category")}
              {exam !== "JEE" && heading("CET 2024", "cet2024")}
              {heading("JEE 2024", "jee2024")}
              {heading(`3-year ${exam} ${isRankMode ? "rank" : "percentile"} change`, changeKey)}
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              let change = null;
              if (isRankMode) {
                const currentRank = exam === "JEE" ? row.jeeRank2024 : row.cetRank2024;
                const historicalRank = exam === "JEE" ? row.jeeRank2022 : row.cetRank2022;
                if (currentRank != null && historicalRank != null) change = historicalRank - currentRank;
              } else {
                const currentCutoff = exam === "JEE" ? row.jee2024 : row.cet2024;
                const historicalCutoff = exam === "JEE" ? row.jee2022 : row.cet2022;
                if (currentCutoff != null && historicalCutoff != null) change = currentCutoff - historicalCutoff;
              }
              return (
                <tr key={`${row.collegeCode}-${row.branchCode}-${row.category || ""}-${row.capRound}-${index}`}>
                  <td>
                    <strong>{row.collegeName}</strong>
                    <span>{row.branchName}</span>
                  </td>
                  {exam !== "JEE" && (
                    <td>
                      <span className="tag">{row.category}</span>
                    </td>
                  )}
                  {exam !== "JEE" && <ScoreCell cutoffPercentile={row.cet2024} cutoffRank={row.cetRank2024} scoreMode={scoreMode} userPercentile={percentiles.CET} userRank={ranks.CET} />}
                  <ScoreCell cutoffPercentile={row.jee2024} cutoffRank={row.jeeRank2024} scoreMode={scoreMode} userPercentile={percentiles.JEE} userRank={ranks.JEE} />
                  <td className={change >= 0 ? "positive" : "negative"}>
                    {change == null ? "—" : `${change >= 0 ? "+" : ""}${isRankMode ? Math.round(change) : change.toFixed(2)}${isRankMode ? " ranks" : " pts"}`}
                  </td>
                  <td className="row-actions">
                    <button className="icon-button" title="View trend" aria-label="View trend" onClick={() => onSelectTrend(row)}>
                      <LineChart size={16} />
                    </button>
                    <button className="icon-button" title="Open college data" aria-label="Open college data" onClick={() => onOpenCollege(row)}>
                      <Building2 size={16} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination {...pagination} />
    </>
  );
}
