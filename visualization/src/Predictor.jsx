import { LoaderCircle, SlidersHorizontal, Sparkles } from "lucide-react";
import { useState, useEffect } from "react";
import { formatPercentile, formatRank } from "./formatters";
import { getPredictions, PREDICTOR_CONFIG } from "./db";

export function Predictor({ filters, percentiles, ranks, onOpenFilterBuilder }) {
  const isRankMode = filters.scoreMode === "rank";
  const score = isRankMode ? ranks[filters.exam] : percentiles[filters.exam];
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState({ safe: false, target: false, reach: false });

  const toggleExpand = (key) => {
    setExpanded((curr) => ({ ...curr, [key]: !curr[key] }));
  };

  const fetchPrediction = async () => {
    if (score === "" || score == null || !Number.isFinite(Number(score))) return;
    setLoading(true);
    setError("");
    try {
      setResult(await getPredictions({ ...filters, [isRankMode ? "rank" : "percentile"]: score }));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let ignored = false;
    if (score === "" || score == null || !Number.isFinite(Number(score))) {
      setResult(null);
      return;
    }
    setLoading(true);
    setError("");
    const timer = setTimeout(() => {
      getPredictions({ ...filters, [isRankMode ? "rank" : "percentile"]: score })
        .then((data) => {
          if (!ignored) setResult(data);
        })
        .catch((err) => {
          if (!ignored) setError(err.message);
        })
        .finally(() => {
          if (!ignored) setLoading(false);
        });
    }, 250);

    return () => {
      ignored = true;
      clearTimeout(timer);
    };
  }, [filters, percentiles, ranks, score, isRankMode]);

  const runPrediction = (event) => {
    event.preventDefault();
    fetchPrediction();
  };

  const cfg = isRankMode ? PREDICTOR_CONFIG.rank : PREDICTOR_CONFIG.percentile;

  const columns = isRankMode
    ? [
        ["safe", "Safe", `Cutoff rank is > ${cfg.targetDelta} ranks worse than your rank`],
        ["target", "Target", `Cutoff rank is within ±${cfg.targetDelta} ranks of your rank`],
        ["reach", "Reach", `Cutoff rank is ${cfg.targetDelta} to ${cfg.reachMaxDelta} ranks better than your rank`],
      ]
    : [
        ["safe", "Safe", `Cutoff percentile is > ${cfg.targetDelta}% lower than your score`],
        ["target", "Target", `Cutoff percentile is within ±${cfg.targetDelta}% of your score`],
        ["reach", "Reach", `Cutoff percentile is ${cfg.targetDelta}% to ${cfg.reachMaxDelta}% higher than your score`],
      ];

  return (
    <section className="predictor">
      <form className="profile-card" onSubmit={runPrediction}>
        <div className="profile-copy">
          <p className="eyebrow">What-if calculator</p>
          <h2>Find your likely options</h2>
          <p>
            Matching uses your {filters.exam} {isRankMode ? "rank" : "score"} ({isRankMode ? formatRank(score) : score ? `${score}%` : "—"}) against the 2024 closing cutoff.
          </p>
        </div>
        <div className="predictor-actions">
          {onOpenFilterBuilder && (
            <button type="button" className="open-filter-builder" onClick={onOpenFilterBuilder} title="Apply filters to prediction results">
              <SlidersHorizontal size={16} /> Filter results
              {filters.rules.length ? ` (${filters.rules.length})` : ""}
            </button>
          )}
          <button className="primary" disabled={loading || score === "" || score == null}>
            {loading ? "Matching…" : "Build recommendations"} <Sparkles size={16} />
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </form>
      {loading && !result && (
        <div className="empty" style={{ marginTop: "20px" }}>
          <LoaderCircle className="spin" /> Building recommendations…
        </div>
      )}
      {result && (
        <div className="prediction-grid">
          {columns.map(([key, title, description]) => {
            const matches = result.groups[key] || [];
            const isExpanded = expanded[key];
            const visibleRows = isExpanded ? matches.slice(0, 100) : matches.slice(0, 10);
            const hasMore = matches.length > 10;

            return (
              <article className={`prediction-card ${key}`} key={key}>
                <h3>{title}</h3>
                <p>{description}</p>
                <strong>{matches.length} matches</strong>
                <ul>
                  {visibleRows.map((row, index) => (
                    <li key={`${row.branchCode}-${row.category || ""}-${index}`}>
                      <b>{row.collegeName}</b>
                      <span>
                        {row.branchName} ·{" "}
                        {isRankMode
                          ? `Rank ${formatRank(row[filters.exam === "JEE" ? "jeeRank2024" : "cetRank2024"])} cutoff`
                          : `${formatPercentile(row[filters.exam === "JEE" ? "jee2024" : "cet2024"])}% cutoff`}
                      </span>
                    </li>
                  ))}
                </ul>
                {hasMore && (
                  <div className="prediction-card-footer">
                    <button type="button" className="show-more-btn" onClick={() => toggleExpand(key)}>
                      {isExpanded ? "Show less" : `Show ${matches.length - 10} more`}
                    </button>
                    <small className="match-counter">
                      Showing {visibleRows.length} of {matches.length} matches
                    </small>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
