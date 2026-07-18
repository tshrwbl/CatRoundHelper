import { useEffect, useMemo, useState } from 'react'
import { BarChart3, Building2, Compass, LineChart, LoaderCircle, Plus, Search, SlidersHorizontal, Sparkles, X } from 'lucide-react'
import {
  Bar, BarChart as RechartsBarChart, CartesianGrid, Legend, Line, LineChart as RechartsLineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts'

const initialFilters = { exam: 'CET', minPercentile: 80, maxPercentile: 100, rules: [] }
const initialPercentiles = { CET: 90, JEE: 90 }
const filtersCacheKey = 'cap-compass-filters'
const percentilesCacheKey = 'cap-compass-percentiles'

function loadCachedFilters() {
  try {
    const cached = JSON.parse(localStorage.getItem(filtersCacheKey) || '{}')
    return { ...initialFilters, ...cached, rules: Array.isArray(cached.rules) ? cached.rules : [] }
  } catch { return initialFilters }
}

function loadCachedPercentiles() {
  try {
    const cached = JSON.parse(localStorage.getItem(percentilesCacheKey) || '{}')
    return { ...initialPercentiles, ...cached }
  } catch { return initialPercentiles }
}
const ruleFields = [
  ['category', 'Category', 'categories'], ['homeUniversity', 'Home university', 'homeUniversities'],
  ['status', 'Branch status', 'statuses'], ['branch', 'Branch name', 'branches'], ['college', 'College name', 'colleges'],
  ['collegeCode', 'College code', 'collegeCodes'], ['branchCode', 'Branch code', 'branchCodes'],
]
const matchers = [['contains', 'Contains text'], ['is', 'Is'], ['in', 'In list']]

function requestJson(url, options) {
  return fetch(url, options).then(async (response) => {
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.error || 'The request failed.')
    return payload
  })
}

function formatPercentile(value) { return value == null ? '—' : Number(value).toFixed(2) }

function Pagination({ page, pageSize, total, onPage, onPageSize }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const visible = Array.from({ length: Math.min(pages, 7) }, (_, index) => {
    if (pages <= 7) return index + 1
    if (index === 0) return 1
    if (index === 6) return pages
    return Math.min(Math.max(page - 3 + index, 2), pages - 1)
  })
  return <footer className="pagination">
    <span>Showing {total ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, total)} of {total} results</span>
    <label>Rows per page<select value={pageSize} onChange={(event) => onPageSize(Number(event.target.value))}>{[10, 25, 50, 100].map((size) => <option key={size}>{size}</option>)}</select></label>
    <div className="page-buttons"><button disabled={page === 1} onClick={() => onPage(page - 1)}>Previous</button>{visible.map((number) => <button key={number} className={number === page ? 'current' : ''} onClick={() => onPage(number)}>{number}</button>)}<button disabled={page === pages} onClick={() => onPage(page + 1)}>Next</button></div>
  </footer>
}

function Explorer({ rows, loading, onSelectTrend, onOpenCollege, pagination, sort, onSort }) {
  if (loading) return <div className="empty"><LoaderCircle className="spin" /> Updating cutoff matches…</div>
  if (!rows.length) return <div className="empty">No records match the current filters.</div>
  const heading = (label, key) => <th><button className="sort-heading" onClick={() => onSort(key)}>{label} {sort.by === key ? (sort.direction === 'ASC' ? '↑' : '↓') : '↕'}</button></th>
  return <><div className="table-wrap"><table>
    <thead><tr>{heading('College / branch', 'collegeName')}{heading('Category', 'category')}{heading('CET 2024', 'cet2024')}{heading('JEE 2024', 'jee2024')}{heading('3-year CET change', 'cetChange')}<th /></tr></thead>
    <tbody>{rows.map((row, index) => {
      const change = row.cet2024 != null && row.cet2022 != null ? row.cet2024 - row.cet2022 : null
      return <tr key={`${row.collegeCode}-${row.branchCode}-${row.category}-${row.capRound}-${index}`}>
        <td><strong>{row.collegeName}</strong><span>{row.branchName}</span></td><td><span className="tag">{row.category}</span></td>
        <td>{formatPercentile(row.cet2024)}<small> rank {row.cetRank2024 ?? '—'}</small></td><td>{formatPercentile(row.jee2024)}<small> rank {row.jeeRank2024 ?? '—'}</small></td>
        <td className={change >= 0 ? 'positive' : 'negative'}>{change == null ? '—' : `${change >= 0 ? '+' : ''}${change.toFixed(2)} pts`}</td><td><button className="text-button" onClick={() => onSelectTrend(row)}>Trend</button><button className="text-button" onClick={() => onOpenCollege(row)}>College</button></td>
      </tr>
    })}</tbody>
  </table></div><Pagination {...pagination} /></>
}

function Trends({ selected, data, loading }) {
  if (!selected) return <div className="empty">Choose <em>Trend</em> on an explorer row to inspect its history.</div>
  const chartData = [2022, 2023, 2024].map((year) => ({
    year, cet: data.cet.find((point) => point.year === year)?.percentile ?? null,
    jee: data.jee.find((point) => point.year === year)?.percentile ?? null,
  }))
  return <section className="trend-view"><div><p className="eyebrow">Selected option</p><h2>{selected.collegeName}</h2><p>{selected.branchName} · {selected.category}</p></div>
    {loading ? <div className="empty"><LoaderCircle className="spin" /> Loading history…</div> : <div className="chart"><div className="chart-key"><span className="cet-key">CET percentile</span><span className="jee-key">JEE percentile</span></div><ResponsiveContainer width="100%" height={310}><RechartsLineChart data={chartData} margin={{ top: 10, right: 24, left: -12, bottom: 0 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="#334155" /><XAxis dataKey="year" stroke="#94a3b8" /><YAxis domain={['auto', 'auto']} stroke="#94a3b8" />
      <Tooltip contentStyle={{ background: '#111b36', border: '1px solid #475569', borderRadius: 12 }} /><Line type="monotone" dataKey="cet" name="CET percentile" stroke="#a78bfa" strokeWidth={3} dot={{ r: 5 }} connectNulls /><Line type="monotone" dataKey="jee" name="JEE percentile" stroke="#2dd4bf" strokeWidth={3} dot={{ r: 5 }} connectNulls />
    </RechartsLineChart></ResponsiveContainer></div>}
  </section>
}

function CollegePage({ college, data, loading, applyActiveFilters, setApplyActiveFilters, percentile, exam }) {
  if (!college) return <div className="empty">Open <em>College</em> from an explorer row to see its branches, category cutoffs, and score fit.</div>
  if (loading) return <div className="empty"><LoaderCircle className="spin" /> Loading college overview…</div>
  const latest = data.rows.filter((row) => row.year === 2024)
  const cutoffKey = exam === 'JEE' ? 'jeePercentile' : 'cetPercentile'
  const chartData = Object.values(latest.reduce((groups, row) => {
    const cutoff = row[cutoffKey]
    if (cutoff != null && (!groups[row.branchName] || cutoff > groups[row.branchName].cutoff)) groups[row.branchName] = { branch: row.branchName, cutoff: Number(cutoff) }
    return groups
  }, {})).sort((a, b) => b.cutoff - a.cutoff).slice(0, 12)
  const historyData = [2022, 2023, 2024].map((year) => {
    const yearRows = data.rows.filter((row) => row.year === year)
    const average = (key) => { const values = yearRows.map((row) => row[key]).filter((value) => value != null); return values.length ? Number((values.reduce((sum, value) => sum + Number(value), 0) / values.length).toFixed(2)) : null }
    return { year, cet: average('cetPercentile'), jee: average('jeePercentile') }
  })
  const fitLabel = (difference) => difference == null ? '—' : difference > 2 ? 'Safe' : difference >= -1.5 ? 'Target / reach' : 'Reach'
  return <section className="college-page"><div className="college-header"><div><p className="eyebrow">College intelligence</p><h2>{college.name}</h2><p>Code {college.code} · 2024 category-wise cutoff overview</p></div><div className="college-controls"><label className="switch-label"><input type="checkbox" checked={applyActiveFilters} onChange={(event) => setApplyActiveFilters(event.target.checked)} /><span /> Apply active category / branch filters</label><p>Your {exam} percentile: <strong>{percentile || '—'}%</strong><small>Change it in the global sidebar.</small></p></div></div><div className="college-metrics"><article><span>Branches shown</span><strong>{new Set(latest.map((row) => row.branchCode)).size}</strong></article><article><span>Category cutoffs</span><strong>{latest.length}</strong></article><article><span>Your score</span><strong>{percentile || '—'}%</strong></article></div><div className="college-chart"><div><h3>Most competitive branches</h3><p>Highest 2024 {exam} cutoff across each branch’s categories.</p></div>{chartData.length ? <ResponsiveContainer width="100%" height={290}><RechartsBarChart data={chartData} layout="vertical" margin={{ left: 14, right: 30 }}><CartesianGrid strokeDasharray="3 3" stroke="#334155" /><XAxis type="number" stroke="#94a3b8" domain={['auto', 'auto']} /><YAxis type="category" dataKey="branch" width={185} stroke="#cbd5e1" tick={{ fontSize: 11 }} /><Tooltip contentStyle={{ background: '#111b36', border: '1px solid #475569', borderRadius: 12 }} /><Bar dataKey="cutoff" name={`${exam} percentile`} fill="#8b7cf6" radius={[0, 5, 5, 0]} /></RechartsBarChart></ResponsiveContainer> : <div className="empty compact">No 2024 cutoff data for this exam and filter set.</div>}</div><div className="college-chart"><div><h3>College cutoff movement</h3><p>Average category-wise percentile across the selected branches.</p></div><ResponsiveContainer width="100%" height={260}><RechartsLineChart data={historyData} margin={{ top: 10, right: 24, left: -12 }}><CartesianGrid strokeDasharray="3 3" stroke="#334155" /><XAxis dataKey="year" stroke="#94a3b8" /><YAxis domain={['auto', 'auto']} stroke="#94a3b8" /><Tooltip contentStyle={{ background: '#111b36', border: '1px solid #475569', borderRadius: 12 }} /><Legend /><Line type="monotone" dataKey="cet" name="CET average" stroke="#a78bfa" strokeWidth={3} connectNulls /><Line type="monotone" dataKey="jee" name="JEE average" stroke="#2dd4bf" strokeWidth={3} connectNulls /></RechartsLineChart></ResponsiveContainer></div><div className="college-table"><h3>All 2024 category-wise cutoffs</h3><div className="table-wrap"><table><thead><tr><th>Branch</th><th>Branch status</th><th>Category</th><th>CET</th><th>JEE</th><th>Fit for you</th></tr></thead><tbody>{latest.map((row, index) => <tr key={`${row.branchCode}-${row.category}-${row.capRound}-${index}`}><td><strong>{row.branchName}</strong><span>{row.branchCode}</span></td><td>{row.branchStatus || '—'}</td><td><span className="tag">{row.category}</span></td><td>{formatPercentile(row.cetPercentile)}</td><td>{formatPercentile(row.jeePercentile)}</td><td className={row.fitDifference >= 0 ? 'positive' : 'negative'}>{fitLabel(row.fitDifference)}{row.fitDifference != null && <small> {row.fitDifference >= 0 ? '+' : ''}{row.fitDifference} pts</small>}</td></tr>)}</tbody></table></div></div></section>
}

function Predictor({ filters, percentile }) {
  const [result, setResult] = useState(null); const [loading, setLoading] = useState(false); const [error, setError] = useState('')
  const runPrediction = async (event) => { event.preventDefault(); setLoading(true); setError(''); try { setResult(await requestJson('/api/predict', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...filters, percentile }) })) } catch (requestError) { setError(requestError.message) } finally { setLoading(false) } }
  const columns = [['safe', 'Safe', 'More than 2 points below your percentile'], ['target', 'Target', 'Within 2 points'], ['reach', 'Reach', 'Up to 1.5 points above your percentile']]
  return <section className="predictor"><form className="profile-card" onSubmit={runPrediction}><div><p className="eyebrow">What-if calculator</p><h2>Find your likely options</h2><p>We compare your saved {filters.exam} percentile ({percentile || '—'}%) with the 2024 closing cutoff.</p></div><button className="primary" disabled={loading || percentile === ''}>{loading ? 'Matching…' : 'Build recommendations'} <Sparkles size={16} /></button>{error && <p className="error">{error}</p>}</form>
    {result && <div className="prediction-grid">{columns.map(([key, title, description]) => <article className={`prediction-card ${key}`} key={key}><h3>{title}</h3><p>{description}</p><strong>{result.groups[key].length} matches</strong><ul>{result.groups[key].slice(0, 8).map((row, index) => <li key={`${row.branchCode}-${index}`}><b>{row.collegeName}</b><span>{row.branchName} · {formatPercentile(row[filters.exam === 'JEE' ? 'jee2024' : 'cet2024'])}% cutoff</span></li>)}</ul></article>)}</div>}
  </section>
}

function FilterRule({ rule, index, metadata, onChange, onRemove }) {
  const field = ruleFields.find(([value]) => value === rule.field) || ruleFields[0]
  const options = metadata[field[2]] || []
  const selected = Array.isArray(rule.value) ? rule.value : []
  const matcher = rule.matcher || 'contains'
  return <article className="modal-rule">
    <div className="rule-heading"><span>Filter {index + 1}</span>{index > 0 && <select className="join" value={rule.join || 'AND'} onChange={(event) => onChange({ ...rule, join: event.target.value })}><option>AND</option><option>OR</option></select>}<button className="remove-rule" title="Remove filter" onClick={onRemove}><X size={15} /></button></div>
    <div className="rule-inputs"><label>Field<select value={rule.field} onChange={(event) => onChange({ ...rule, field: event.target.value, value: [], listValue: '' })}>{ruleFields.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Match<select value={matcher} onChange={(event) => onChange({ ...rule, matcher: event.target.value, value: event.target.value === 'in' ? [] : '', listValue: '' })}>{matchers.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Condition<select value={rule.mode || 'include'} onChange={(event) => onChange({ ...rule, mode: event.target.value })}><option value="include">Include matches</option><option value="exclude">Exclude matches</option></select></label></div>
    {matcher === 'contains' && <label className="rule-value">Text to find<input value={typeof rule.value === 'string' ? rule.value : ''} placeholder="Matches like %this text%" onChange={(event) => onChange({ ...rule, value: event.target.value })} /></label>}
    {matcher === 'is' && <label className="rule-value">Select one value<select value={typeof rule.value === 'string' ? rule.value : ''} onChange={(event) => onChange({ ...rule, value: event.target.value })}><option value="">Choose a value…</option>{options.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>}
    {matcher === 'in' && <div className="list-values"><label>Pick multiple values<select multiple value={selected} onChange={(event) => onChange({ ...rule, value: Array.from(event.target.selectedOptions, (option) => option.value) })}>{options.map((item) => <option value={item} key={item}>{item}</option>)}</select><small>Hold Ctrl/Cmd to select several values.</small></label><label>Or paste a comma-separated list<input value={rule.listValue || ''} placeholder="abc, cbd, 1234" onChange={(event) => onChange({ ...rule, listValue: event.target.value })} /><small>Typed values and selections are combined.</small></label></div>}
  </article>
}

function FilterModal({ rules, metadata, templates, onApply, onClose, onSaveTemplate, onLoadTemplate }) {
  const [draft, setDraft] = useState(rules); const [name, setName] = useState('')
  const update = (index, next) => setDraft((current) => current.map((rule, ruleIndex) => ruleIndex === index ? next : rule))
  const add = () => setDraft((current) => [...current, { field: 'category', matcher: 'in', mode: 'include', value: [], listValue: '', join: 'AND' }])
  const remove = (index) => setDraft((current) => current.filter((_, ruleIndex) => ruleIndex !== index))
  return <div className="modal-backdrop" role="presentation"><section className="filter-modal" role="dialog" aria-modal="true" aria-label="Advanced filter builder"><header><div><p className="eyebrow">Advanced query builder</p><h2>Build your exact shortlist</h2><p>Each filter can include or exclude matching records. Filters run left to right with AND/OR.</p></div><button className="close-modal" onClick={onClose}><X /> Close</button></header><div className="template-strip"><label>Saved templates<select defaultValue="" onChange={(event) => { const template = templates.find((item) => item.id === event.target.value); if (template) setDraft(template.rules) }}><option value="">Load a saved template…</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label><div><input value={name} placeholder="Template name" onChange={(event) => setName(event.target.value)} /><button className="add-rule" disabled={!name.trim()} onClick={() => { onSaveTemplate(name.trim(), draft); setName('') }}>Save template</button></div></div><div className="modal-rules">{draft.length ? draft.map((rule, index) => <FilterRule key={index} rule={rule} index={index} metadata={metadata} onChange={(next) => update(index, next)} onRemove={() => remove(index)} />) : <div className="empty compact">No filters yet. Add one to narrow or exclude results.</div>}</div><footer><button className="add-rule" onClick={add}><Plus size={16} /> Add filter</button><div><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" onClick={() => { onApply(draft); onClose() }}>Apply filters</button></div></footer></section></div>
}

export default function App() {
  const [filters, setFilters] = useState(loadCachedFilters); const [candidatePercentiles, setCandidatePercentiles] = useState(loadCachedPercentiles); const [metadata, setMetadata] = useState({ categories: [], homeUniversities: [], statuses: [], branches: [], branchCodes: [], colleges: [], collegeCodes: [] }); const [rows, setRows] = useState([]); const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(25); const [total, setTotal] = useState(0); const [sort, setSort] = useState({ by: 'cet2024', direction: 'DESC' })
  const [tab, setTab] = useState('explorer'); const [selected, setSelected] = useState(null); const [trendData, setTrendData] = useState({ cet: [], jee: [] }); const [loading, setLoading] = useState(true); const [trendLoading, setTrendLoading] = useState(false); const [error, setError] = useState(''); const [filterModalOpen, setFilterModalOpen] = useState(false); const [college, setCollege] = useState(null); const [collegeData, setCollegeData] = useState({ rows: [] }); const [collegeLoading, setCollegeLoading] = useState(false); const [applyCollegeFilters, setApplyCollegeFilters] = useState(true)
  const [templates, setTemplates] = useState(() => { try { return JSON.parse(localStorage.getItem('cap-compass-filter-templates') || '[]') } catch { return [] } })
  useEffect(() => { requestJson('/api/metadata').then(setMetadata).catch((e) => setError(e.message)) }, [])
  useEffect(() => { localStorage.setItem(filtersCacheKey, JSON.stringify(filters)) }, [filters])
  useEffect(() => { localStorage.setItem(percentilesCacheKey, JSON.stringify(candidatePercentiles)) }, [candidatePercentiles])
  useEffect(() => { const controller = new AbortController(); setLoading(true); setError(''); const timer = setTimeout(() => requestJson('/api/query', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...filters, page, pageSize, sortBy: sort.by, sortDirection: sort.direction }), signal: controller.signal }).then((payload) => { setRows(payload.rows); setTotal(payload.total) }).catch((e) => { if (e.name !== 'AbortError') setError(e.message) }).finally(() => setLoading(false)), 250); return () => { controller.abort(); clearTimeout(timer) } }, [filters, page, pageSize, sort])
  useEffect(() => { if (!college) return; const controller = new AbortController(); setCollegeLoading(true); requestJson(`/api/college/${college.collegeCode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...filters, exam: filters.exam, percentile: candidatePercentiles[filters.exam], applyActiveFilters: applyCollegeFilters }), signal: controller.signal }).then(setCollegeData).catch((e) => { if (e.name !== 'AbortError') setError(e.message) }).finally(() => setCollegeLoading(false)); return () => controller.abort() }, [college, filters, applyCollegeFilters, candidatePercentiles])
  const update = (key, value) => { setPage(1); setFilters((current) => ({ ...current, [key]: value })) }
  const updatePercentile = (exam, value) => setCandidatePercentiles((current) => ({ ...current, [exam]: value }))
  const applyRules = (rules) => update('rules', rules)
  const saveTemplate = (name, rules) => setTemplates((current) => { const next = [...current, { id: `${Date.now()}-${name}`, name, rules }]; localStorage.setItem('cap-compass-filter-templates', JSON.stringify(next)); return next })
  const changeSort = (by) => { setPage(1); setSort((current) => current.by === by ? { by, direction: current.direction === 'ASC' ? 'DESC' : 'ASC' } : { by, direction: 'ASC' }) }
  const openCollege = (row) => { setCollege(row); setTab('college') }
  const selectTrend = async (row) => { setSelected(row); setTab('trends'); setTrendLoading(true); try { setTrendData(await requestJson(`/api/trends?collegeCode=${row.collegeCode}&branchCode=${encodeURIComponent(row.branchCode)}&category=${encodeURIComponent(row.category)}&capRound=${row.capRound}`)) } catch (e) { setError(e.message); setTrendData({ cet: [], jee: [] }) } finally { setTrendLoading(false) } }
  const summary = useMemo(() => `${total.toLocaleString()} matching options`, [total])
  return <main className="app-shell"><aside className="sidebar"><div className="brand"><Compass /><span>CAP <b>Compass</b></span></div><p className="sidebar-copy">Maharashtra engineering cutoff intelligence, 2022–24.</p><section className="score-controls"><label>Your percentiles</label><div className="range-inputs"><label>CET<input type="number" min="0" max="100" step="0.01" value={candidatePercentiles.CET} onChange={(event) => updatePercentile('CET', event.target.value)} /></label><label>JEE<input type="number" min="0" max="100" step="0.01" value={candidatePercentiles.JEE} onChange={(event) => updatePercentile('JEE', event.target.value)} /></label></div></section><div className="filter-group"><label>Exam</label><div className="segmented">{['CET', 'JEE'].map((exam) => <button key={exam} onClick={() => update('exam', exam)} className={filters.exam === exam ? 'active' : ''}>{exam}</button>)}</div></div><label>Percentile range <span>{filters.minPercentile}–{filters.maxPercentile}</span><div className="range-inputs"><input type="number" min="0" max="100" value={filters.minPercentile} onChange={(e) => update('minPercentile', e.target.value)} /><input type="number" min="0" max="100" value={filters.maxPercentile} onChange={(e) => update('maxPercentile', e.target.value)} /></div></label><section className="advanced-filters"><label>Advanced filters</label><p>{filters.rules.length ? `${filters.rules.length} active filter${filters.rules.length === 1 ? '' : 's'}` : 'No active filters'}</p><button className="open-filter-builder" onClick={() => setFilterModalOpen(true)}><SlidersHorizontal size={16} /> Open filter builder</button></section></aside>
    <section className="content"><header><div><p className="eyebrow">Admission decision workspace</p><h1>Cutoff, made clear.</h1></div><div className="data-note"><BarChart3 size={17} /> {summary}</div></header><nav className="tabs">{[['explorer', 'Explorer', Search], ['trends', 'Trends', LineChart], ['college', 'College', Building2], ['predictor', 'Predictor', Sparkles]].map(([id, name, Icon]) => <button key={id} onClick={() => setTab(id)} className={tab === id ? 'active' : ''}><Icon size={16} /> {name}</button>)}</nav>{error && <div className="error banner">{error}</div>}<div className="panel">{tab === 'explorer' && <Explorer rows={rows} loading={loading} onSelectTrend={selectTrend} onOpenCollege={openCollege} sort={sort} onSort={changeSort} pagination={{ page, pageSize, total, onPage: setPage, onPageSize: (size) => { setPageSize(size); setPage(1) } }} />}{tab === 'trends' && <Trends selected={selected} data={trendData} loading={trendLoading} />}{tab === 'college' && <CollegePage college={college} data={collegeData} loading={collegeLoading} applyActiveFilters={applyCollegeFilters} setApplyActiveFilters={setApplyCollegeFilters} percentile={candidatePercentiles[filters.exam]} exam={filters.exam} />}{tab === 'predictor' && <Predictor filters={filters} percentile={candidatePercentiles[filters.exam]} />}</div></section>
    {filterModalOpen && <FilterModal rules={filters.rules} metadata={metadata} templates={templates} onApply={applyRules} onClose={() => setFilterModalOpen(false)} onSaveTemplate={saveTemplate} />}</main>
}
