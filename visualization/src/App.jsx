import { useEffect, useMemo, useState } from 'react'
import { BarChart3, Compass, LineChart, LoaderCircle, Search, Sparkles } from 'lucide-react'
import {
  CartesianGrid, Line, LineChart as RechartsLineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts'

const initialFilters = {
  exam: 'CET', category: '', homeUniversity: '', status: '', branchSearch: '',
  collegeSearch: '', minPercentile: 80, maxPercentile: 100,
}

function requestJson(url, options) {
  return fetch(url, options).then(async (response) => {
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.error || 'The request failed.')
    return payload
  })
}

function formatPercentile(value) {
  return value == null ? '—' : Number(value).toFixed(2)
}

function Explorer({ rows, loading, onSelectTrend }) {
  if (loading) return <div className="empty"><LoaderCircle className="spin" /> Updating cutoff matches…</div>
  if (!rows.length) return <div className="empty">No records match the current filters.</div>
  return <div className="table-wrap">
    <table>
      <thead><tr><th>College / branch</th><th>Category</th><th>CET 2024</th><th>JEE 2024</th><th>3-year CET change</th><th /></tr></thead>
      <tbody>{rows.map((row, index) => {
        const change = row.cet2024 != null && row.cet2022 != null ? row.cet2024 - row.cet2022 : null
        return <tr key={`${row.collegeCode}-${row.branchCode}-${row.category}-${index}`}>
          <td><strong>{row.collegeName}</strong><span>{row.branchName}</span></td>
          <td><span className="tag">{row.category}</span></td>
          <td>{formatPercentile(row.cet2024)}<small> rank {row.cetRank2024 ?? '—'}</small></td>
          <td>{formatPercentile(row.jee2024)}<small> rank {row.jeeRank2024 ?? '—'}</small></td>
          <td className={change >= 0 ? 'positive' : 'negative'}>{change == null ? '—' : `${change >= 0 ? '+' : ''}${change.toFixed(2)} pts`}</td>
          <td><button className="text-button" onClick={() => onSelectTrend(row)}>Trend</button></td>
        </tr>
      })}</tbody>
    </table>
  </div>
}

function Trends({ selected, points, loading }) {
  if (!selected) return <div className="empty">Choose <em>Trend</em> on an explorer row to inspect its history.</div>
  const chartData = [2022, 2023, 2024].map((year) => ({
    year,
    percentile: points.find((point) => point.year === year)?.percentile ?? null,
  }))
  return <section className="trend-view">
    <div><p className="eyebrow">Selected option</p><h2>{selected.collegeName}</h2><p>{selected.branchName} · {selected.category}</p></div>
    {loading ? <div className="empty"><LoaderCircle className="spin" /> Loading history…</div> :
      <div className="chart"><ResponsiveContainer width="100%" height={310}>
        <RechartsLineChart data={chartData} margin={{ top: 10, right: 24, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="year" stroke="#94a3b8" /><YAxis domain={['auto', 'auto']} stroke="#94a3b8" />
          <Tooltip contentStyle={{ background: '#111b36', border: '1px solid #475569', borderRadius: 12 }} />
          <Line type="monotone" dataKey="percentile" name="Percentile" stroke="#a78bfa" strokeWidth={3} dot={{ r: 5 }} connectNulls />
        </RechartsLineChart>
      </ResponsiveContainer></div>}
  </section>
}

function Predictor({ filters }) {
  const [percentile, setPercentile] = useState(90)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const runPrediction = async (event) => {
    event.preventDefault(); setLoading(true); setError('')
    try {
      const payload = await requestJson('/api/predict', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...filters, percentile }) })
      setResult(payload)
    } catch (requestError) { setError(requestError.message) } finally { setLoading(false) }
  }
  const columns = [['safe', 'Safe', 'More than 2 points below your percentile'], ['target', 'Target', 'Within 2 points'], ['reach', 'Reach', 'Up to 1.5 points above your percentile']]
  return <section className="predictor">
    <form className="profile-card" onSubmit={runPrediction}>
      <div><p className="eyebrow">What-if calculator</p><h2>Find your likely options</h2><p>We compare your score with the 2024 closing cutoff.</p></div>
      <label>Your {filters.exam} percentile<input type="number" min="0" max="100" step="0.01" value={percentile} onChange={(event) => setPercentile(event.target.value)} required /></label>
      <button className="primary" disabled={loading}>{loading ? 'Matching…' : 'Build recommendations'} <Sparkles size={16} /></button>
      {error && <p className="error">{error}</p>}
    </form>
    {result && <div className="prediction-grid">{columns.map(([key, title, description]) => <article className={`prediction-card ${key}`} key={key}>
      <h3>{title}</h3><p>{description}</p><strong>{result.groups[key].length} matches</strong>
      <ul>{result.groups[key].slice(0, 8).map((row, index) => <li key={`${row.branchCode}-${index}`}><b>{row.collegeName}</b><span>{row.branchName} · {formatPercentile(row[filters.exam === 'JEE' ? 'jee2024' : 'cet2024'])}% cutoff</span></li>)}</ul>
    </article>)}</div>}
  </section>
}

export default function App() {
  const [filters, setFilters] = useState(initialFilters)
  const [metadata, setMetadata] = useState({ categories: [], homeUniversities: [], statuses: [] })
  const [rows, setRows] = useState([])
  const [tab, setTab] = useState('explorer')
  const [selected, setSelected] = useState(null)
  const [points, setPoints] = useState([])
  const [loading, setLoading] = useState(true)
  const [trendLoading, setTrendLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { requestJson('/api/metadata').then(setMetadata).catch((e) => setError(e.message)) }, [])
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('')
    const timer = setTimeout(() => requestJson('/api/query', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(filters), signal: controller.signal })
      .then((payload) => setRows(payload.rows)).catch((e) => { if (e.name !== 'AbortError') setError(e.message) }).finally(() => setLoading(false)), 250)
    return () => { controller.abort(); clearTimeout(timer) }
  }, [filters])

  const selectTrend = async (row) => {
    setSelected(row); setTab('trends'); setTrendLoading(true)
    try { const payload = await requestJson(`/api/trends?collegeCode=${row.collegeCode}&branchCode=${encodeURIComponent(row.branchCode)}&category=${encodeURIComponent(row.category)}&exam=${filters.exam}`); setPoints(payload.points) }
    catch (e) { setError(e.message); setPoints([]) } finally { setTrendLoading(false) }
  }
  const summary = useMemo(() => `${rows.length} of up to 500 matching options`, [rows])
  const update = (key, value) => setFilters((current) => ({ ...current, [key]: value }))

  return <main className="app-shell">
    <aside className="sidebar"><div className="brand"><Compass /><span>CAP <b>Compass</b></span></div><p className="sidebar-copy">Maharashtra engineering cutoff intelligence, 2022–24.</p>
      <div className="filter-group"><label>Exam</label><div className="segmented">{['CET', 'JEE'].map((exam) => <button key={exam} onClick={() => update('exam', exam)} className={filters.exam === exam ? 'active' : ''}>{exam}</button>)}</div></div>
      <label>Percentile range <span>{filters.minPercentile}–{filters.maxPercentile}</span><div className="range-inputs"><input type="number" min="0" max="100" value={filters.minPercentile} onChange={(e) => update('minPercentile', e.target.value)} /><input type="number" min="0" max="100" value={filters.maxPercentile} onChange={(e) => update('maxPercentile', e.target.value)} /></div></label>
      <label>Category<select value={filters.category} onChange={(e) => update('category', e.target.value)}><option value="">All categories</option>{metadata.categories.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>Home university<select value={filters.homeUniversity} onChange={(e) => update('homeUniversity', e.target.value)}><option value="">All universities</option>{metadata.homeUniversities.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>College status<select value={filters.status} onChange={(e) => update('status', e.target.value)}><option value="">All statuses</option>{metadata.statuses.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>Branch contains<div className="search-box"><Search size={15} /><input value={filters.branchSearch} placeholder="Computer, AI…" onChange={(e) => update('branchSearch', e.target.value)} /></div></label>
    </aside>
    <section className="content"><header><div><p className="eyebrow">Admission decision workspace</p><h1>Cutoff, made clear.</h1></div><div className="data-note"><BarChart3 size={17} /> {summary}</div></header>
      <nav className="tabs">{[['explorer', 'Explorer', Search], ['trends', 'Trends', LineChart], ['predictor', 'Predictor', Sparkles]].map(([id, name, Icon]) => <button key={id} onClick={() => setTab(id)} className={tab === id ? 'active' : ''}><Icon size={16} /> {name}</button>)}</nav>
      {error && <div className="error banner">{error}</div>}
      <div className="panel">{tab === 'explorer' && <Explorer rows={rows} loading={loading} onSelectTrend={selectTrend} />}{tab === 'trends' && <Trends selected={selected} points={points} loading={trendLoading} />}{tab === 'predictor' && <Predictor filters={filters} />}</div>
    </section>
  </main>
}
