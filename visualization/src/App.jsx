import { useEffect, useMemo, useState, useRef } from 'react'
import { BarChart3, Building2, Compass, LineChart, LoaderCircle, Plus, Search, SlidersHorizontal, Sparkles, Sun, Moon, X, Save, Download, Upload, Check, Menu } from 'lucide-react'
import {
  Bar, BarChart as RechartsBarChart, CartesianGrid, Legend, Line, LineChart as RechartsLineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts'
import { getCollegeDetails, getExplorerResults, getMetadata, getPredictions, getTrends } from './db'
import { activatePendingUpdate } from './pwa'

import obcMaleCsItRules from './presets/OBC_Male_CS_IT.json'

const DEFAULT_PRESETS = [
  {
    id: 'preset-obc-male-cs-it',
    name: 'OBC Male CS/IT',
    rules: obcMaleCsItRules,
  },
]

const initialFilters = { exam: 'CET', scoreMode: 'percentile', minPercentile: 80, maxPercentile: 100, minRank: 1, maxRank: 50000, rules: [] }
const initialPercentiles = { CET: 90, JEE: 90 }
const initialRanks = { CET: 5000, JEE: 5000 }
const filtersCacheKey = 'cap-compass-filters'
const percentilesCacheKey = 'cap-compass-percentiles'
const ranksCacheKey = 'cap-compass-ranks'

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

function loadCachedRanks() {
  try {
    const cached = JSON.parse(localStorage.getItem(ranksCacheKey) || '{}')
    return { ...initialRanks, ...cached }
  } catch { return initialRanks }
}
const ruleFields = [
  ['category', 'Category', 'categories'], ['homeUniversity', 'Home university', 'homeUniversities'],
  ['status', 'Branch status', 'statuses'], ['branch', 'Branch name', 'branches'], ['college', 'College name', 'colleges'],
  ['collegeCode', 'College code', 'collegeCodes'], ['branchCode', 'Branch code', 'branchCodes'],
]
const collegeRuleFields = ruleFields.filter(([value]) => ['category', 'status', 'branch', 'branchCode'].includes(value))
const matchers = [['contains', 'Contains text'], ['is', 'Is'], ['in', 'In list']]

function formatPercentile(value) { return value == null ? '—' : Number(value).toFixed(2) }
function formatRank(value) { return value == null ? '—' : Number(value).toLocaleString() }

function percentileDifference(score, cutoff) {
  if (score == null || score === '' || cutoff == null || cutoff === '') return null
  const difference = Number(score) - Number(cutoff)
  return Number.isFinite(difference) ? difference : null
}

function differenceTone(difference) {
  if (difference == null) return 'difference-missing'
  if (difference < -1) return 'difference-negative'
  if (difference <= 1) return 'difference-neutral'
  return 'difference-positive'
}

function formatDifference(difference) {
  return difference == null ? '—' : `${difference >= 0 ? '+' : ''}${difference.toFixed(2)}%`
}

function rankDifference(scoreRank, cutoffRank) {
  if (scoreRank == null || scoreRank === '' || cutoffRank == null || cutoffRank === '') return null
  const difference = Number(cutoffRank) - Number(scoreRank)
  return Number.isFinite(difference) ? difference : null
}

function rankDifferenceTone(difference) {
  if (difference == null) return 'difference-missing'
  if (difference < -500) return 'difference-negative'
  if (difference <= 500) return 'difference-neutral'
  return 'difference-positive'
}

function formatRankDifference(difference) {
  return difference == null ? '—' : `${difference >= 0 ? '+' : ''}${Math.round(difference)}`
}

function ScoreCell({ cutoffPercentile, cutoffRank, scoreMode, userPercentile, userRank }) {
  if (scoreMode === 'rank') {
    const difference = rankDifference(userRank, cutoffRank)
    return <td><div className="percentile-cell"><span>{formatRank(cutoffRank)}</span><span className={`percentile-difference ${rankDifferenceTone(difference)}`} title="Cutoff rank minus your rank (positive means your rank is better than cutoff)">{formatRankDifference(difference)}</span></div><small>{cutoffPercentile != null ? `${formatPercentile(cutoffPercentile)}%` : '—'}</small></td>
  }

  const difference = percentileDifference(userPercentile, cutoffPercentile)
  return <td><div className="percentile-cell"><span>{formatPercentile(cutoffPercentile)}</span><span className={`percentile-difference ${differenceTone(difference)}`} title="Your percentile minus the cutoff">{formatDifference(difference)}</span></div><small>rank {formatRank(cutoffRank)}</small></td>
}

function Pagination({ page, pageSize, total, onPage, onPageSize }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const visible = (() => {
    if (pages <= 7) {
      return Array.from({ length: pages }, (_, index) => index + 1)
    }
    if (page <= 4) {
      return [1, 2, 3, 4, 5, 6, pages]
    }
    if (page >= pages - 3) {
      return [1, pages - 5, pages - 4, pages - 3, pages - 2, pages - 1, pages]
    }
    return [1, page - 2, page - 1, page, page + 1, page + 2, pages]
  })()
  return <footer className="pagination">
    <span>Showing {total ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, total)} of {total} results</span>
    <label>Rows per page<select value={pageSize} onChange={(event) => onPageSize(Number(event.target.value))}>{[10, 25, 50, 100].map((size) => <option key={size}>{size}</option>)}</select></label>
    <div className="page-buttons"><button disabled={page === 1} onClick={() => onPage(page - 1)}>Previous</button>{visible.map((number) => <button key={number} className={number === page ? 'current' : ''} onClick={() => onPage(number)}>{number}</button>)}<button disabled={page === pages} onClick={() => onPage(page + 1)}>Next</button></div>
  </footer>
}

function Explorer({ rows, loading, onSelectTrend, onOpenCollege, pagination, sort, onSort, percentiles, ranks, exam, scoreMode }) {
  if (loading) return <div className="empty"><LoaderCircle className="spin" /> Updating cutoff matches…</div>
  if (!rows.length) return <div className="empty">No records match the current filters.</div>
  const heading = (label, key) => <th><button className="sort-heading" onClick={() => onSort(key)}>{label} {sort.by === key ? (sort.direction === 'ASC' ? '↑' : '↓') : '↕'}</button></th>
  const changeKey = exam === 'JEE' ? 'jeeChange' : 'cetChange'
  const isRankMode = scoreMode === 'rank'
  return <><div className="table-wrap"><table>
    <thead><tr>{heading('College / branch', 'collegeName')}{exam !== 'JEE' && heading('Category', 'category')}{exam !== 'JEE' && heading('CET 2024', 'cet2024')}{heading('JEE 2024', 'jee2024')}{heading(`3-year ${exam} ${isRankMode ? 'rank' : 'percentile'} change`, changeKey)}<th /></tr></thead>
    <tbody>{rows.map((row, index) => {
      let change = null
      if (isRankMode) {
        const currentRank = exam === 'JEE' ? row.jeeRank2024 : row.cetRank2024
        const historicalRank = exam === 'JEE' ? row.jeeRank2022 : row.cetRank2022
        if (currentRank != null && historicalRank != null) change = historicalRank - currentRank
      } else {
        const currentCutoff = exam === 'JEE' ? row.jee2024 : row.cet2024
        const historicalCutoff = exam === 'JEE' ? row.jee2022 : row.cet2022
        if (currentCutoff != null && historicalCutoff != null) change = currentCutoff - historicalCutoff
      }
      return <tr key={`${row.collegeCode}-${row.branchCode}-${row.category || ''}-${row.capRound}-${index}`}>
        <td><strong>{row.collegeName}</strong><span>{row.branchName}</span></td>{exam !== 'JEE' && <td><span className="tag">{row.category}</span></td>}
        {exam !== 'JEE' && <ScoreCell cutoffPercentile={row.cet2024} cutoffRank={row.cetRank2024} scoreMode={scoreMode} userPercentile={percentiles.CET} userRank={ranks.CET} />}<ScoreCell cutoffPercentile={row.jee2024} cutoffRank={row.jeeRank2024} scoreMode={scoreMode} userPercentile={percentiles.JEE} userRank={ranks.JEE} />
        <td className={change >= 0 ? 'positive' : 'negative'}>{change == null ? '—' : `${change >= 0 ? '+' : ''}${isRankMode ? Math.round(change) : change.toFixed(2)}${isRankMode ? ' ranks' : ' pts'}`}</td><td className="row-actions"><button className="icon-button" title="View trend" aria-label="View trend" onClick={() => onSelectTrend(row)}><LineChart size={16} /></button><button className="icon-button" title="Open college data" aria-label="Open college data" onClick={() => onOpenCollege(row)}><Building2 size={16} /></button></td>
      </tr>
    })}</tbody>
  </table></div><Pagination {...pagination} /></>
}

function Trends({ selected, data, loading, scoreMode }) {
  if (!selected) return <div className="empty"> Choose trend on an explorer row to inspect its history.</div>
  const isRankMode = scoreMode === 'rank'
  const chartData = [2022, 2023, 2024].map((year) => ({
    year,
    cet: data.cet.find((point) => point.year === year)?.[isRankMode ? 'meritRank' : 'percentile'] ?? null,
    jee: data.jee.find((point) => point.year === year)?.[isRankMode ? 'meritRank' : 'percentile'] ?? null,
  }))
  return <section className="trend-view"><div><p className="eyebrow">Selected option</p><h2>{selected.collegeName}</h2><p>{selected.branchName}{selected.category ? ` · ${selected.category}` : ''}</p></div>
    {loading ? <div className="empty"><LoaderCircle className="spin" /> Loading history…</div> : <div className="chart"><div className="chart-key"><span className="cet-key">CET {isRankMode ? 'rank' : 'percentile'}</span><span className="jee-key">JEE {isRankMode ? 'rank' : 'percentile'}</span></div><ResponsiveContainer width="100%" height={310}><RechartsLineChart data={chartData} margin={{ top: 10, right: 24, left: -12, bottom: 0 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" /><XAxis dataKey="year" stroke="var(--chart-axis)" /><YAxis domain={['auto', 'auto']} stroke="var(--chart-axis)" reversed={isRankMode} />
      <Tooltip contentStyle={{ background: 'var(--tooltip-bg)', border: '1px solid var(--tooltip-border)', borderRadius: 12 }} labelStyle={{ color: 'var(--text-color)' }} itemStyle={{ color: 'var(--text-color)' }} /><Line type="monotone" dataKey="cet" name={`CET ${isRankMode ? 'rank' : 'percentile'}`} stroke="#a78bfa" strokeWidth={3} dot={{ r: 5 }} connectNulls /><Line type="monotone" dataKey="jee" name={`JEE ${isRankMode ? 'rank' : 'percentile'}`} stroke="#2dd4bf" strokeWidth={3} dot={{ r: 5 }} connectNulls />
    </RechartsLineChart></ResponsiveContainer></div>}
  </section>
}

function CollegePicker({ options, college, onSelect }) {
  const [query, setQuery] = useState('')
  const normalizedQuery = query.trim().toLowerCase()
  const matches = normalizedQuery ? options.filter((item) => item.name.toLowerCase().includes(normalizedQuery)).slice(0, 8) : []
  const choose = (item) => { onSelect({ collegeCode: Number(item.code), collegeName: item.name }); setQuery('') }
  return <div className="college-picker"><label htmlFor="college-search">Find a college</label><div className="college-search"><Search size={16} /><input id="college-search" value={query} placeholder={college ? college.collegeName : 'Type a college name…'} onChange={(event) => setQuery(event.target.value)} autoComplete="off" />{matches.length > 0 && <ul className="college-suggestions" role="listbox">{matches.map((item) => <li key={item.code}><button type="button" onClick={() => choose(item)}><strong>{item.name}</strong><span>Code {item.code}</span></button></li>)}</ul>}</div></div>
}

function CollegePage({ college, data, loading, collegeRules, onEditFilters, percentile, percentiles, rank, ranks, exam, scoreMode, collegeOptions, onSelectCollege }) {
  const [tableSort, setTableSort] = useState({ by: null, direction: 'DESC' })
  useEffect(() => setTableSort({ by: null, direction: 'DESC' }), [college?.collegeCode])
  if (!college) return <section className="college-page college-empty"><CollegePicker options={collegeOptions} college={college} onSelect={onSelectCollege} /><div className="empty">Search for a college to see its branches, category cutoffs, and score fit.</div></section>
  if (loading) return <div className="empty"><LoaderCircle className="spin" /> Loading college overview…</div>
  const latest = data.rows.filter((row) => row.year === 2024)
  const isRankMode = scoreMode === 'rank'
  const cutoffKey = isRankMode
    ? (exam === 'JEE' ? 'jeeRank' : 'cetRank')
    : (exam === 'JEE' ? 'jeePercentile' : 'cetPercentile')

  const chartData = Object.values(latest.reduce((groups, row) => {
    const cutoff = row[cutoffKey]
    if (cutoff != null) {
      if (!groups[row.branchName]) {
        groups[row.branchName] = { branch: row.branchName, cutoff: Number(cutoff) }
      } else {
        const isBetter = isRankMode ? Number(cutoff) < groups[row.branchName].cutoff : Number(cutoff) > groups[row.branchName].cutoff
        if (isBetter) groups[row.branchName] = { branch: row.branchName, cutoff: Number(cutoff) }
      }
    }
    return groups
  }, {})).sort((a, b) => isRankMode ? a.cutoff - b.cutoff : b.cutoff - a.cutoff).slice(0, 12)

  const historyData = [2022, 2023, 2024].map((year) => {
    const yearRows = data.rows.filter((row) => row.year === year)
    const average = (key) => { const values = yearRows.map((row) => row[key]).filter((value) => value != null); return values.length ? Number((values.reduce((sum, value) => sum + Number(value), 0) / values.length).toFixed(isRankMode ? 0 : 2)) : null }
    return {
      year,
      cet: average(isRankMode ? 'cetRank' : 'cetPercentile'),
      jee: average(isRankMode ? 'jeeRank' : 'jeePercentile'),
    }
  })
  const sortedLatest = [...latest].sort((left, right) => {
    if (!tableSort.by) return 0
    const leftValue = left[tableSort.by]
    const rightValue = right[tableSort.by]
    if (leftValue == null && rightValue == null) return 0
    if (leftValue == null) return 1
    if (rightValue == null) return -1
    const comparison = Number(leftValue) - Number(rightValue)
    return (tableSort.direction === 'ASC' ? 1 : -1) * comparison
  })
  const changeCollegeSort = (by) => setTableSort((current) => current.by === by ? { by, direction: current.direction === 'ASC' ? 'DESC' : 'ASC' } : { by, direction: 'DESC' })
  const collegeHeading = (label, key) => <th><button className="sort-heading" onClick={() => changeCollegeSort(key)}>{label} {tableSort.by === key ? (tableSort.direction === 'ASC' ? '↑' : '↓') : '↕'}</button></th>
  const userScoreDisplay = isRankMode ? (rank ? formatRank(rank) : '—') : (percentile ? `${percentile}%` : '—')

  return <section className="college-page"><div className="college-header"><div><p className="eyebrow">College intelligence</p><h2>{college.collegeName}</h2><p>Code {college.collegeCode} · 2024 {exam === 'JEE' ? 'branch' : 'category-wise'} cutoff overview</p></div><div className="college-controls"><CollegePicker options={collegeOptions} college={college} onSelect={onSelectCollege} /><button className="open-filter-builder" onClick={onEditFilters}><SlidersHorizontal size={16} /> College filters{collegeRules.length ? ` (${collegeRules.length})` : ''}</button><p>Your {exam} {isRankMode ? 'rank' : 'percentile'}: <strong>{userScoreDisplay}</strong></p></div></div><div className="college-metrics"><article><span>Branches shown</span><strong>{new Set(latest.map((row) => row.branchCode)).size}</strong></article><article><span>{exam === 'JEE' ? 'Branch cutoffs' : 'Category cutoffs'}</span><strong>{latest.length}</strong></article><article><span>Your score</span><strong>{userScoreDisplay}</strong></article></div><div className="college-chart"><div><h3>Most competitive branches</h3><p>{isRankMode ? 'Lowest' : 'Highest'} 2024 {exam} cutoff across each branch’s categories.</p></div>{chartData.length ? <ResponsiveContainer width="100%" height={290}><RechartsBarChart data={chartData} layout="vertical" margin={{ left: 14, right: 30 }}><CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" /><XAxis type="number" stroke="var(--chart-axis)" domain={['auto', 'auto']} reversed={isRankMode} /><YAxis type="category" dataKey="branch" width={185} stroke="var(--text-color)" tick={{ fontSize: 11 }} /><Tooltip contentStyle={{ background: 'var(--tooltip-bg)', border: '1px solid var(--tooltip-border)', borderRadius: 12 }} labelStyle={{ color: 'var(--text-color)' }} itemStyle={{ color: 'var(--text-color)' }} /><Bar dataKey="cutoff" name={`${exam} ${isRankMode ? 'rank' : 'percentile'}`} fill="#8b7cf6" radius={[0, 5, 5, 0]} /></RechartsBarChart></ResponsiveContainer> : <div className="empty compact">No 2024 cutoff data for this exam and filter set.</div>}</div><div className="college-chart"><div><h3>College cutoff movement</h3><p>Average category-wise {isRankMode ? 'rank' : 'percentile'} across the selected branches.</p></div><ResponsiveContainer width="100%" height={260}><RechartsLineChart data={historyData} margin={{ top: 10, right: 24, left: -12 }}><CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" /><XAxis dataKey="year" stroke="var(--chart-axis)" /><YAxis domain={['auto', 'auto']} stroke="var(--chart-axis)" reversed={isRankMode} /><Tooltip contentStyle={{ background: 'var(--tooltip-bg)', border: '1px solid var(--tooltip-border)', borderRadius: 12 }} labelStyle={{ color: 'var(--text-color)' }} itemStyle={{ color: 'var(--text-color)' }} /><Legend /><Line type="monotone" dataKey="cet" name="CET average" stroke="#a78bfa" strokeWidth={3} connectNulls /><Line type="monotone" dataKey="jee" name="JEE average" stroke="#2dd4bf" strokeWidth={3} connectNulls /></RechartsLineChart></ResponsiveContainer></div><div className="college-table"><h3>{exam === 'JEE' ? 'All 2024 branch cutoffs' : 'All 2024 category-wise cutoffs'}</h3><div className="table-wrap"><table><thead><tr><th>Branch</th><th>Branch status</th>{exam !== 'JEE' && <th>Category</th>}{exam !== 'JEE' && collegeHeading('CET', isRankMode ? 'cetRank' : 'cetPercentile')}{collegeHeading('JEE', isRankMode ? 'jeeRank' : 'jeePercentile')}</tr></thead><tbody>{sortedLatest.map((row, index) => <tr key={`${row.branchCode}-${row.category || ''}-${row.capRound}-${index}`}><td><strong>{row.branchName}</strong><span>{row.branchCode}</span></td><td>{row.branchStatus || '—'}</td>{exam !== 'JEE' && <td><span className="tag">{row.category}</span></td>}{exam !== 'JEE' && <ScoreCell cutoffPercentile={row.cetPercentile} cutoffRank={row.cetRank} scoreMode={scoreMode} userPercentile={percentiles.CET} userRank={ranks.CET} />}<ScoreCell cutoffPercentile={row.jeePercentile} cutoffRank={row.jeeRank} scoreMode={scoreMode} userPercentile={percentiles.JEE} userRank={ranks.JEE} /></tr>)}</tbody></table></div></div></section>
}

function Predictor({ filters, percentiles, ranks }) {
  const isRankMode = filters.scoreMode === 'rank'
  const score = isRankMode ? ranks[filters.exam] : percentiles[filters.exam]
  const [result, setResult] = useState(null); const [loading, setLoading] = useState(false); const [error, setError] = useState('')
  const runPrediction = async (event) => { event.preventDefault(); setLoading(true); setError(''); try { setResult(await getPredictions({ ...filters, [isRankMode ? 'rank' : 'percentile']: score })) } catch (requestError) { setError(requestError.message) } finally { setLoading(false) } }
  const columns = isRankMode
    ? [
        ['safe', 'Safe', 'Cutoff rank is > 1000 ranks worse than your rank'],
        ['target', 'Target', 'Cutoff rank is within ±1000 ranks of your rank'],
        ['reach', 'Reach', 'Cutoff rank is up to 3000 ranks better than your rank'],
      ]
    : [
        ['safe', 'Safe', 'More than 2 points below your percentile'],
        ['target', 'Target', 'Within 2 points'],
        ['reach', 'Reach', 'Up to 1.5 points above your percentile'],
      ]
  return <section className="predictor"><form className="profile-card" onSubmit={runPrediction}><div className="profile-copy"><p className="eyebrow">What-if calculator</p><h2>Find your likely options</h2><p>Matching uses your {filters.exam} {isRankMode ? 'rank' : 'score'} ({isRankMode ? formatRank(score) : (score ? `${score}%` : '—')}) against the 2024 closing cutoff.</p></div><button className="primary" disabled={loading || score === '' || score == null}>{loading ? 'Matching…' : 'Build recommendations'} <Sparkles size={16} /></button>{error && <p className="error">{error}</p>}</form>
    {result && <div className="prediction-grid">{columns.map(([key, title, description]) => <article className={`prediction-card ${key}`} key={key}><h3>{title}</h3><p>{description}</p><strong>{result.groups[key].length} matches</strong><ul>{result.groups[key].slice(0, 8).map((row, index) => <li key={`${row.branchCode}-${index}`}><b>{row.collegeName}</b><span>{row.branchName} · {isRankMode ? `Rank ${formatRank(row[filters.exam === 'JEE' ? 'jeeRank2024' : 'cetRank2024'])} cutoff` : `${formatPercentile(row[filters.exam === 'JEE' ? 'jee2024' : 'cet2024'])}% cutoff`}</span></li>)}</ul></article>)}</div>}
  </section>
}

function ValueSelectModal({ isOpen, onClose, options, selected, onSelect, fieldName }) {
  const [search, setSearch] = useState('')
  if (!isOpen) return null

  const filteredOptions = options.filter((option) =>
    String(option).toLowerCase().includes(search.toLowerCase())
  )

  const toggleOption = (option) => {
    const isSelected = selected.includes(option)
    const nextSelected = isSelected
      ? selected.filter((item) => item !== option)
      : [...selected, option]
    onSelect(nextSelected)
  }

  return (
    <div className="modal-backdrop sub-modal-backdrop" style={{ zIndex: 30 }} onClick={(e) => e.stopPropagation()}>
      <section className="filter-modal value-select-modal" style={{ maxWidth: '600px', maxHeight: '85vh', height: 'auto', display: 'flex', flexDirection: 'column' }}>
        <header style={{ padding: '20px 24px 14px' }}>
          <div>
            <p className="eyebrow">Multi-value selector</p>
            <h2 style={{ fontSize: '20px', margin: '4px 0' }}>Select {fieldName}</h2>
            <p style={{ margin: 0 }}>Choose values to include/exclude ({selected.length} selected)</p>
          </div>
          <button className="close-modal" type="button" onClick={onClose} style={{ padding: '6px 10px', fontSize: '12px' }}>
            <X size={16} /> Close
          </button>
        </header>

        {selected.length > 0 && (
          <div className="selected-preview-bar">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {selected.map((item) => (
                <span key={item} className="tag" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', fontSize: '11px', margin: '0' }}>
                  {item}
                  <button
                    type="button"
                    onClick={() => toggleOption(item)}
                    style={{ background: 'none', border: 0, padding: 0, display: 'inline-flex', color: 'var(--remove-rule-color)', cursor: 'pointer' }}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="search-box" style={{ padding: '14px 24px 8px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              value={search}
              placeholder={`Search ${filteredOptions.length} of ${options.length} options...`}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: '36px', height: '38px', borderRadius: '8px' }}
            />
          </div>
        </div>

        <div className="modal-rules" style={{ flex: 1, overflowY: 'auto', padding: '8px 24px', display: 'flex', flexDirection: 'column', gap: '6px', minHeight: '200px' }}>
          {filteredOptions.length === 0 ? (
            <div className="empty" style={{ minHeight: '120px' }}>No options match your search.</div>
          ) : (
            filteredOptions.map((option) => {
              const isSelected = selected.includes(option)
              return (
                <div key={option} className={`value-option-row ${isSelected ? 'selected' : ''}`}>
                  <span>{option}</span>
                  <button
                    type="button"
                    onClick={() => toggleOption(option)}
                    className={isSelected ? 'remove-rule' : 'add-rule'}
                    style={{
                      padding: '4px 10px',
                      fontSize: '11px',
                      alignSelf: 'center',
                      width: 'auto',
                      minWidth: '70px',
                      justifyContent: 'center',
                      cursor: 'pointer'
                    }}
                  >
                    {isSelected ? '-' : '+'} {isSelected ? 'Remove' : 'Select'}
                  </button>
                </div>
              )
            })
          )}
        </div>

        <footer style={{ padding: '14px 24px', background: 'var(--modal-footer-bg)', borderTop: '1px solid var(--modal-footer-border)', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="primary" type="button" onClick={onClose} style={{ padding: '8px 16px', fontSize: '13px' }}>Done</button>
        </footer>
      </section>
    </div>
  )
}

function FilterRule({ rule, index, metadata, fields = ruleFields, onChange, onRemove }) {
  const [isSelectModalOpen, setIsSelectModalOpen] = useState(false)
  const field = fields.find(([value]) => value === rule.field) || fields[0]
  const options = metadata[field[2]] || []

  const selected = useMemo(() => {
    if (Array.isArray(rule.value)) return rule.value
    if (typeof rule.value === 'string' && rule.value) return rule.value.split(',').map((s) => s.trim()).filter(Boolean)
    return []
  }, [rule.value])

  const hasInvalidOption = useMemo(() => {
    if (selected.length === 0) return false
    if (options.length === 0) return false
    return selected.some((val) => !options.includes(val))
  }, [selected, options])

  const handleModalSelect = (nextSelected) => {
    onChange({
      ...rule,
      value: nextSelected,
      listValue: nextSelected.join(', ')
    })
  }

  const handleListValueChange = (event) => {
    const nextListValue = event.target.value
    const parsed = nextListValue.split(',').map((val) => val.trim()).filter(Boolean)
    onChange({
      ...rule,
      listValue: nextListValue,
      value: parsed
    })
  }

  const matcher = rule.matcher || 'contains'
  return <article className="modal-rule">
    <div className="rule-heading"><span>Filter {index + 1}</span>{index > 0 && <select className="join" value={rule.join || 'AND'} onChange={(event) => onChange({ ...rule, join: event.target.value })}><option>AND</option><option>OR</option></select>}<button className="remove-rule" title="Remove filter" onClick={onRemove}><X size={15} /></button></div>
    <div className="rule-inputs"><label>Field<select value={field[0]} onChange={(event) => onChange({ ...rule, field: event.target.value, value: [], listValue: '' })}>{fields.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Match<select value={matcher} onChange={(event) => onChange({ ...rule, matcher: event.target.value, value: event.target.value === 'in' ? [] : '', listValue: '' })}>{matchers.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Condition<select value={rule.mode || 'include'} onChange={(event) => onChange({ ...rule, mode: event.target.value })}><option value="include">Include matches</option><option value="exclude">Exclude matches</option></select></label></div>
    {matcher === 'contains' && <label className="rule-value">Text to find<input value={typeof rule.value === 'string' ? rule.value : ''} placeholder="Matches like %this text%" onChange={(event) => onChange({ ...rule, value: event.target.value })} /></label>}
    {matcher === 'is' && <label className="rule-value">Select one value<select value={typeof rule.value === 'string' ? rule.value : ''} onChange={(event) => onChange({ ...rule, value: event.target.value })}><option value="">Choose a value…</option>{options.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>}
    {matcher === 'in' && (
      <div className="list-values">
        <label>
          Pick multiple values
          <button
            type="button"
            className="secondary"
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '9px 10px', height: '40px' }}
            onClick={() => setIsSelectModalOpen(true)}
          >
            <Plus size={16} /> Select values ({selected.length} selected)
          </button>
          <small>Click to open the multi-value selector dialog.</small>
        </label>
        <label>
          Or paste a comma-separated list
          <input
            value={rule.listValue || ''}
            placeholder="abc, cbd, 1234"
            onChange={handleListValueChange}
            className={hasInvalidOption ? 'invalid-input' : ''}
            style={{ height: '40px' }}
          />
          <small style={{ color: hasInvalidOption ? '#ef4444' : 'var(--small-muted-color)', transition: 'color 0.3s' }}>
            {hasInvalidOption
              ? 'Warning: Some typed values do not match any available options.'
              : 'Typed values and selector choices are kept in sync.'}
          </small>
        </label>

        <ValueSelectModal
          isOpen={isSelectModalOpen}
          onClose={() => setIsSelectModalOpen(false)}
          options={options}
          selected={selected}
          onSelect={handleModalSelect}
          fieldName={field[1]}
        />
      </div>
    )}
  </article>
}

function FilterModal({ rules, metadata, templates, defaultPresets = DEFAULT_PRESETS, fields = ruleFields, title = 'Build your exact shortlist', description = 'Each filter can include or exclude matching records. Filters run left to right with AND/OR.', onApply, onClose, onSaveTemplate }) {
  const [draft, setDraft] = useState(rules); const [name, setName] = useState('')
  const fileInputRef = useRef(null)
  const [exportStatus, setExportStatus] = useState('')
  const [templatesOpen, setTemplatesOpen] = useState(false)

  const handleExport = () => {
    const json = JSON.stringify(draft, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'cap-compass-filters.json'
    a.click()
    URL.revokeObjectURL(url)

    if (navigator.clipboard) {
      navigator.clipboard.writeText(json).then(() => {
        setExportStatus('Copied & Downloaded!')
        setTimeout(() => setExportStatus(''), 2000)
      }).catch(() => {
        setExportStatus('Downloaded!')
        setTimeout(() => setExportStatus(''), 2000)
      })
    } else {
      setExportStatus('Downloaded!')
      setTimeout(() => setExportStatus(''), 2000)
    }
  }

  const handleImportFile = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target.result)
        const rulesArray = Array.isArray(imported) ? imported : (imported.rules || [])
        if (!Array.isArray(rulesArray)) {
          alert('Invalid format: filters must be a JSON array of rules, or an object containing a rules array.')
          return
        }
        const validated = rulesArray.filter((r) => r && typeof r === 'object' && r.field)
        if (validated.length === 0 && rulesArray.length > 0) {
          alert('Could not find any valid filter rules in the file.')
          return
        }
        const filtered = validated.filter((r) => fields.some(([val]) => val === r.field))
        setDraft(filtered)
      } catch (err) {
        alert('Failed to parse JSON: ' + err.message)
      }
    }
    reader.readAsText(file)
    event.target.value = ''
  }

  const update = (index, next) => setDraft((current) => current.map((rule, ruleIndex) => ruleIndex === index ? next : rule))
  const add = () => setDraft((current) => [...current, { field: fields[0][0], matcher: 'in', mode: 'include', value: [], listValue: '', join: 'AND' }])
  const remove = (index) => setDraft((current) => current.filter((_, ruleIndex) => ruleIndex !== index))
  return <div className="modal-backdrop" role="presentation"><section className="filter-modal" role="dialog" aria-modal="true" aria-label="Advanced filter builder"><header><div><p className="eyebrow">Advanced query builder</p><h2>{title}</h2><p>{description}</p></div><button className="close-modal" onClick={onClose}><X /> Close</button></header><button className="template-toggle-btn" onClick={() => setTemplatesOpen(!templatesOpen)}>{templatesOpen ? 'Hide templates & sharing' : 'Show templates & sharing'}</button><div className={`template-strip ${templatesOpen ? 'open' : ''}`}><label className="template-field"><span>Saved templates & presets</span><select defaultValue="" onChange={(event) => { const allOptions = [...defaultPresets, ...templates]; const template = allOptions.find((item) => item.id === event.target.value); if (template) setDraft(template.rules.filter((rule) => fields.some(([value]) => value === rule.field))) }}><option value="">Load a saved template or preset…</option>{defaultPresets.length > 0 && <optgroup label="Default Presets">{defaultPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</optgroup>}{templates.length > 0 && <optgroup label="Saved Templates">{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</optgroup>}</select></label><label className="template-field"><span>Save template</span><div className="template-input-group"><input value={name} placeholder="Template name" onChange={(event) => setName(event.target.value)} /><button className="template-btn" disabled={!name.trim()} onClick={() => { onSaveTemplate(name.trim(), draft); setName('') }} title="Save template" aria-label="Save template"><Save size={16} /></button></div></label><label className="template-field template-share-column"><span>Share</span><div className="template-input-group"><button className="template-btn" type="button" onClick={handleExport} title={exportStatus || "Export templates"} aria-label={exportStatus || "Export templates"}>{exportStatus ? <Check size={16} style={{ color: 'var(--diff-positive)' }} /> : <Download size={16} />}</button><button className="template-btn" type="button" onClick={() => fileInputRef.current?.click()} title="Import templates" aria-label="Import templates"><Upload size={16} /></button><input type="file" ref={fileInputRef} accept=".json" onChange={handleImportFile} style={{ display: 'none' }} /></div></label></div><div className="modal-rules">{draft.length ? draft.map((rule, index) => <FilterRule key={index} rule={rule} index={index} metadata={metadata} fields={fields} onChange={(next) => update(index, next)} onRemove={() => remove(index)} />) : <div className="empty compact">No filters yet. Add one to narrow or exclude results.</div>}</div><footer><button className="add-rule" onClick={add}><Plus size={16} /> Add filter</button><div><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" onClick={() => { onApply(draft); onClose() }}>Apply filters</button></div></footer></section></div>
}

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem('cap-compass-theme') || 'dark')
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])
  const toggleTheme = () => {
    setTheme((curr) => {
      const next = curr === 'dark' ? 'light' : 'dark'
      localStorage.setItem('cap-compass-theme', next)
      return next
    })
  }
  const [filters, setFilters] = useState(loadCachedFilters); const [candidatePercentiles, setCandidatePercentiles] = useState(loadCachedPercentiles); const [candidateRanks, setCandidateRanks] = useState(loadCachedRanks); const [metadata, setMetadata] = useState({ categories: [], homeUniversities: [], statuses: [], branches: [], branchCodes: [], colleges: [], collegeCodes: [], collegeOptions: [] }); const [rows, setRows] = useState([]); const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(25); const [total, setTotal] = useState(0); const [sort, setSort] = useState({ by: 'cet2024', direction: 'DESC' })
  const [tab, setTab] = useState('explorer'); const [selected, setSelected] = useState(null); const [trendData, setTrendData] = useState({ cet: [], jee: [] }); const [loading, setLoading] = useState(true); const [trendLoading, setTrendLoading] = useState(false); const [error, setError] = useState(''); const [filterModalOpen, setFilterModalOpen] = useState(false); const [collegeFilterModalOpen, setCollegeFilterModalOpen] = useState(false); const [college, setCollege] = useState(null); const [collegeRules, setCollegeRules] = useState([]); const [collegeData, setCollegeData] = useState({ rows: [] }); const [collegeLoading, setCollegeLoading] = useState(false); const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [templates, setTemplates] = useState(() => { try { return JSON.parse(localStorage.getItem('cap-compass-filter-templates') || '[]') } catch { return [] } })
  const [updateAvailable, setUpdateAvailable] = useState(false)
  useEffect(() => { getMetadata().then(setMetadata).catch((e) => setError(e.message)) }, [])
  useEffect(() => {
    const showUpdate = () => setUpdateAvailable(true)
    window.addEventListener('cap-compass-update-ready', showUpdate)
    return () => window.removeEventListener('cap-compass-update-ready', showUpdate)
  }, [])
  useEffect(() => { localStorage.setItem(filtersCacheKey, JSON.stringify(filters)) }, [filters])
  useEffect(() => { localStorage.setItem(percentilesCacheKey, JSON.stringify(candidatePercentiles)) }, [candidatePercentiles])
  useEffect(() => { localStorage.setItem(ranksCacheKey, JSON.stringify(candidateRanks)) }, [candidateRanks])
  useEffect(() => { let ignored = false; setLoading(true); setError(''); const timer = setTimeout(() => getExplorerResults({ ...filters, page, pageSize, sortBy: sort.by, sortDirection: sort.direction }).then((payload) => { if (!ignored) { setRows(payload.rows); setTotal(payload.total) } }).catch((e) => { if (!ignored) setError(e.message) }).finally(() => { if (!ignored) setLoading(false) }), 250); return () => { ignored = true; clearTimeout(timer) } }, [filters, page, pageSize, sort])
  useEffect(() => { if (!college) return undefined; let ignored = false; setCollegeLoading(true); getCollegeDetails(college.collegeCode, { rules: collegeRules, exam: filters.exam, scoreMode: filters.scoreMode, score: filters.scoreMode === 'rank' ? candidateRanks[filters.exam] : candidatePercentiles[filters.exam], applyActiveFilters: true }).then((payload) => { if (!ignored) setCollegeData(payload) }).catch((e) => { if (!ignored) setError(e.message) }).finally(() => { if (!ignored) setCollegeLoading(false) }); return () => { ignored = true } }, [college, collegeRules, filters.exam, filters.scoreMode, candidatePercentiles, candidateRanks])
  const update = (key, value) => { setPage(1); setFilters((current) => ({ ...current, [key]: value })) }
  const updatePercentile = (exam, value) => setCandidatePercentiles((current) => ({ ...current, [exam]: value }))
  const updateRank = (exam, value) => setCandidateRanks((current) => ({ ...current, [exam]: value }))
  const applyRules = (rules) => update('rules', rules)
  const saveTemplate = (name, rules) => setTemplates((current) => { const next = [...current, { id: `${Date.now()}-${name}`, name, rules }]; localStorage.setItem('cap-compass-filter-templates', JSON.stringify(next)); return next })
  const changeSort = (by) => { setPage(1); setSort((current) => current.by === by ? { by, direction: current.direction === 'ASC' ? 'DESC' : 'ASC' } : { by, direction: filters.scoreMode === 'rank' ? 'ASC' : 'DESC' }) }
  const openCollege = (row) => { setCollege(row); setTab('college') }
  const selectCollege = (nextCollege) => { setCollege(nextCollege); setCollegeRules([]); setCollegeData({ rows: [] }); setTab('college') }
  const selectTrend = async (row) => { setSelected(row); setTab('trends'); setTrendLoading(true); try { setTrendData(await getTrends({ collegeCode: row.collegeCode, branchCode: row.branchCode, category: row.category || 'GOPENS', capRound: row.capRound })) } catch (e) { setError(e.message); setTrendData({ cet: [], jee: [] }) } finally { setTrendLoading(false) } }
  const summary = useMemo(() => `${total.toLocaleString()} matching options`, [total])
  const activePresetId = useMemo(() => {
    const allOptions = [...DEFAULT_PRESETS, ...templates]
    const currentJson = JSON.stringify(filters.rules)
    const match = allOptions.find((opt) => JSON.stringify(opt.rules) === currentJson)
    return match ? match.id : ''
  }, [filters.rules, templates])

  const handlePresetSelect = (presetId) => {
    if (presetId === '__clear__') {
      applyRules([])
      return
    }
    const allOptions = [...DEFAULT_PRESETS, ...templates]
    const found = allOptions.find((item) => item.id === presetId)
    if (found) {
      applyRules(found.rules)
    }
  }

  return <main className={`app-shell ${mobileMenuOpen ? 'sidebar-open' : ''}`}>
    <div className="mobile-header">
      <button className="menu-btn" onClick={() => setMobileMenuOpen(true)}><Menu size={20} /></button>
      <div className="brand"><Compass /><span>CAP <b>Compass</b></span></div>
      <button className="theme-toggle" onClick={toggleTheme} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} aria-label="Toggle theme">{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button>
    </div>
    <div className="sidebar-overlay" onClick={() => setMobileMenuOpen(false)} />
    <aside className={`sidebar ${mobileMenuOpen ? 'open' : ''}`}>
      <div className="sidebar-top">
        <div className="brand"><Compass /><span>CAP <b>Compass</b></span><button className="theme-toggle desktop-theme-toggle" onClick={toggleTheme} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} aria-label="Toggle theme">{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button></div>
        <button className="close-sidebar-btn" onClick={() => setMobileMenuOpen(false)}><X size={20} /></button>
      </div>
      <p className="sidebar-copy">Maharashtra engineering cutoff intelligence, 2022–24.</p>
      <div className="filter-group"><label>Exam</label><div className="segmented">{['CET', 'JEE'].map((exam) => <button key={exam} onClick={() => update('exam', exam)} className={filters.exam === exam ? 'active' : ''}>{exam}</button>)}</div></div>
      <div className="filter-group"><label>Mode</label><div className="segmented"><button onClick={() => update('scoreMode', 'percentile')} className={filters.scoreMode !== 'rank' ? 'active' : ''}>Percentile</button><button onClick={() => update('scoreMode', 'rank')} className={filters.scoreMode === 'rank' ? 'active' : ''}>Rank</button></div></div>
      {filters.scoreMode === 'rank' ? (
        <>
          <label>CET rank<input type="number" min="1" step="1" value={candidateRanks.CET} onChange={(event) => updateRank('CET', event.target.value)} /></label>
          <label>JEE rank<input type="number" min="1" step="1" value={candidateRanks.JEE} onChange={(event) => updateRank('JEE', event.target.value)} /></label>
          <label>Rank range <span>{filters.minRank || 1}–{filters.maxRank || 50000}</span><div className="range-inputs"><input type="number" min="1" value={filters.minRank ?? 1} onChange={(e) => update('minRank', e.target.value)} /><input type="number" min="1" value={filters.maxRank ?? 50000} onChange={(e) => update('maxRank', e.target.value)} /></div></label>
        </>
      ) : (
        <>
          <label>CET percentile<input type="number" min="0" max="100" step="0.01" value={candidatePercentiles.CET} onChange={(event) => updatePercentile('CET', event.target.value)} /></label>
          <label>JEE percentile<input type="number" min="0" max="100" step="0.01" value={candidatePercentiles.JEE} onChange={(event) => updatePercentile('JEE', event.target.value)} /></label>
          <label>Percentile range <span>{filters.minPercentile}–{filters.maxPercentile}</span><div className="range-inputs"><input type="number" min="0" max="100" value={filters.minPercentile} onChange={(e) => update('minPercentile', e.target.value)} /><input type="number" min="0" max="100" value={filters.maxPercentile} onChange={(e) => update('maxPercentile', e.target.value)} /></div></label>
        </>
      )}
      <div className="filter-group">
        <label htmlFor="sidebar-preset-select">Preset filter</label>
        <select
          id="sidebar-preset-select"
          className="preset-select"
          value={activePresetId}
          onChange={(event) => handlePresetSelect(event.target.value)}
        >
          <option value="">Select preset filter…</option>
          {DEFAULT_PRESETS.length > 0 && (
            <optgroup label="Default Presets">
              {DEFAULT_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>{preset.name}</option>
              ))}
            </optgroup>
          )}
          {templates.length > 0 && (
            <optgroup label="Saved Templates">
              {templates.map((template) => (
                <option key={template.id} value={template.id}>{template.name}</option>
              ))}
            </optgroup>
          )}
          {filters.rules.length > 0 && <option value="__clear__">Clear active filters</option>}
        </select>
      </div>
      <section className="advanced-filters"><label>Advanced filters</label><p>{filters.rules.length ? `${filters.rules.length} active filter${filters.rules.length === 1 ? '' : 's'}` : 'No active filters'}</p><button className="open-filter-builder" onClick={() => { setFilterModalOpen(true); setMobileMenuOpen(false); }}><SlidersHorizontal size={16} /> Open filter builder</button></section>
    </aside>
    <section className="content"><div className="tabs-container"><nav className="tabs">{[['explorer', 'Explorer', Search], ['trends', 'Trends', LineChart], ['college', 'College', Building2], ['predictor', 'Predictor', Sparkles]].map(([id, name, Icon]) => <button key={id} onClick={() => setTab(id)} className={tab === id ? 'active' : ''}><Icon size={16} /> {name}</button>)}</nav><div className="data-note"><BarChart3 size={17} /> {summary}</div></div>{updateAvailable && <div className="update banner">A newer offline database is ready. <button onClick={() => activatePendingUpdate()}>Reload now</button></div>}{error && <div className="error banner">{error}</div>}<div className="panel">{tab === 'explorer' && <Explorer rows={rows} loading={loading} onSelectTrend={selectTrend} onOpenCollege={openCollege} sort={sort} onSort={changeSort} percentiles={candidatePercentiles} ranks={candidateRanks} exam={filters.exam} scoreMode={filters.scoreMode} pagination={{ page, pageSize, total, onPage: setPage, onPageSize: (size) => { setPageSize(size); setPage(1) } }} />}{tab === 'trends' && <Trends selected={selected} data={trendData} loading={trendLoading} scoreMode={filters.scoreMode} />}{tab === 'college' && <CollegePage college={college} data={collegeData} collegeRules={collegeRules} onEditFilters={() => setCollegeFilterModalOpen(true)} percentile={candidatePercentiles[filters.exam]} percentiles={candidatePercentiles} rank={candidateRanks[filters.exam]} ranks={candidateRanks} exam={filters.exam} scoreMode={filters.scoreMode} collegeOptions={metadata.collegeOptions || []} onSelectCollege={selectCollege} />}{tab === 'predictor' && <Predictor filters={filters} percentiles={candidatePercentiles} ranks={candidateRanks} />}</div></section>
    {filterModalOpen && <FilterModal rules={filters.rules} metadata={metadata} templates={templates} onApply={applyRules} onClose={() => setFilterModalOpen(false)} onSaveTemplate={saveTemplate} />}
    {collegeFilterModalOpen && <FilterModal rules={collegeRules} metadata={metadata} templates={templates} fields={collegeRuleFields} title="Filter this college" description="Only branch name, branch code, branch status, and category can filter a college overview." onApply={setCollegeRules} onClose={() => setCollegeFilterModalOpen(false)} onSaveTemplate={saveTemplate} />}</main>
}
