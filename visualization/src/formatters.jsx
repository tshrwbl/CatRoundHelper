
export function formatPercentile(value) {
    return value == null ? "—" : Number(value).toFixed(2);
}

export function formatRank(value) {
    return value == null ? "—" : Number(value).toLocaleString();
}