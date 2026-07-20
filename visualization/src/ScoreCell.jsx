import { formatPercentile, formatRank } from "./formatters";

export function ScoreCell({ cutoffPercentile, cutoffRank, scoreMode, userPercentile, userRank }) {
  if (scoreMode === "rank") {
    const difference = rankDifference(userRank, cutoffRank);
    return (
      <td>
        <div className="percentile-cell">
          <span>{formatRank(cutoffRank)}</span>
          <span className={`percentile-difference ${rankDifferenceTone(difference)}`} title="Cutoff rank minus your rank (positive means your rank is better than cutoff)">
            {formatRankDifference(difference)}
          </span>
        </div>
        <small>{cutoffPercentile != null ? `${formatPercentile(cutoffPercentile)}%` : "—"}</small>
      </td>
    );
  }

  const difference = percentileDifference(userPercentile, cutoffPercentile);
  return (
    <td>
      <div className="percentile-cell">
        <span>{formatPercentile(cutoffPercentile)}</span>
        <span className={`percentile-difference ${differenceTone(difference)}`} title="Your percentile minus the cutoff">
          {formatDifference(difference)}
        </span>
      </div>
      <small>rank {formatRank(cutoffRank)}</small>
    </td>
  );
}

function percentileDifference(score, cutoff) {
  if (score == null || score === "" || cutoff == null || cutoff === "") return null;
  const difference = Number(score) - Number(cutoff);
  return Number.isFinite(difference) ? difference : null;
}

function differenceTone(difference) {
  if (difference == null) return "difference-missing";
  if (difference < -1) return "difference-negative";
  if (difference <= 1) return "difference-neutral";
  return "difference-positive";
}

function formatDifference(difference) {
  return difference == null ? "—" : `${difference >= 0 ? "+" : ""}${difference.toFixed(2)}%`;
}

function rankDifference(scoreRank, cutoffRank) {
  if (scoreRank == null || scoreRank === "" || cutoffRank == null || cutoffRank === "") return null;
  const difference = Number(cutoffRank) - Number(scoreRank);
  return Number.isFinite(difference) ? difference : null;
}

function rankDifferenceTone(difference) {
  if (difference == null) return "difference-missing";
  if (difference < -500) return "difference-negative";
  if (difference <= 500) return "difference-neutral";
  return "difference-positive";
}

function formatRankDifference(difference) {
  return difference == null ? "—" : `${difference >= 0 ? "+" : ""}${Math.round(difference)}`;
}
