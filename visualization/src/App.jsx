import { useEffect, useMemo, useState } from "react";
import { BarChart3, Building2, Compass, LineChart, Search, SlidersHorizontal, Sparkles, Sun, Moon, X, Menu } from "lucide-react";
import { getCollegeDetails, getExplorerResults, getMetadata, getTrends } from "./db";
import { activatePendingUpdate } from "./pwa";

import obcMaleCsItRules from "./presets/OBC_Male_CS_IT.json";
import { Explorer } from "./Explorer";
import { Trends } from "./Trends";
import { CollegePage } from "./CollegePage";
import { Predictor } from "./Predictor";
import { FilterModal } from "./FilterModal";

export const DEFAULT_PRESETS = [
  {
    id: "preset-obc-male-cs-it",
    name: "OBC Male CS/IT",
    rules: obcMaleCsItRules,
  },
];

const initialFilters = {
  exam: "CET",
  scoreMode: "percentile",
  minPercentile: 80,
  maxPercentile: 100,
  minRank: 1,
  maxRank: 50000,
  rules: [],
};
const initialPercentiles = { CET: 90, JEE: 90 };
const initialRanks = { CET: 5000, JEE: 5000 };
const filtersCacheKey = "cap-compass-filters";
const percentilesCacheKey = "cap-compass-percentiles";
const ranksCacheKey = "cap-compass-ranks";

function loadCachedFilters() {
  try {
    const cached = JSON.parse(localStorage.getItem(filtersCacheKey) || "{}");
    return { ...initialFilters, ...cached, rules: Array.isArray(cached.rules) ? cached.rules : [] };
  } catch {
    return initialFilters;
  }
}

function loadCachedPercentiles() {
  try {
    const cached = JSON.parse(localStorage.getItem(percentilesCacheKey) || "{}");
    return { ...initialPercentiles, ...cached };
  } catch {
    return initialPercentiles;
  }
}

function loadCachedRanks() {
  try {
    const cached = JSON.parse(localStorage.getItem(ranksCacheKey) || "{}");
    return { ...initialRanks, ...cached };
  } catch {
    return initialRanks;
  }
}

export const ruleFields = [
  ["category", "Category", "categories"],
  ["homeUniversity", "Home university", "homeUniversities"],
  ["status", "Branch status", "statuses"],
  ["branch", "Branch name", "branches"],
  ["college", "College name", "colleges"],
  ["collegeCode", "College code", "collegeCodes"],
  ["branchCode", "Branch code", "branchCodes"],
];
const collegeRuleFields = ruleFields.filter(([value]) => ["category", "status", "branch", "branchCode"].includes(value));
export const matchers = [
  ["contains", "Contains text"],
  ["is", "Is"],
  ["in", "In list"],
];

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem("cap-compass-theme") || "dark");
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
  const toggleTheme = () => {
    setTheme((curr) => {
      const next = curr === "dark" ? "light" : "dark";
      localStorage.setItem("cap-compass-theme", next);
      return next;
    });
  };
  const [filters, setFilters] = useState(loadCachedFilters);
  const [candidatePercentiles, setCandidatePercentiles] = useState(loadCachedPercentiles);
  const [candidateRanks, setCandidateRanks] = useState(loadCachedRanks);
  const [metadata, setMetadata] = useState({
    categories: [],
    homeUniversities: [],
    statuses: [],
    branches: [],
    branchCodes: [],
    colleges: [],
    collegeCodes: [],
    collegeOptions: [],
  });
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [sort, setSort] = useState({ by: "cet2024", direction: "DESC" });
  const [tab, setTab] = useState("explorer");
  const [selected, setSelected] = useState(null);
  const [trendData, setTrendData] = useState({ cet: [], jee: [] });
  const [loading, setLoading] = useState(true);
  const [trendLoading, setTrendLoading] = useState(false);
  const [error, setError] = useState("");
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [collegeFilterModalOpen, setCollegeFilterModalOpen] = useState(false);
  const [college, setCollege] = useState(null);
  const [collegeRules, setCollegeRules] = useState([]);
  const [collegeData, setCollegeData] = useState({ rows: [] });
  const [collegeLoading, setCollegeLoading] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [templates, setTemplates] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("cap-compass-filter-templates") || "[]");
    } catch {
      return [];
    }
  });
  const [updateAvailable, setUpdateAvailable] = useState(false);
  useEffect(() => {
    getMetadata()
      .then(setMetadata)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    const showUpdate = () => setUpdateAvailable(true);
    window.addEventListener("cap-compass-update-ready", showUpdate);
    return () => window.removeEventListener("cap-compass-update-ready", showUpdate);
  }, []);
  useEffect(() => {
    localStorage.setItem(filtersCacheKey, JSON.stringify(filters));
  }, [filters]);
  useEffect(() => {
    localStorage.setItem(percentilesCacheKey, JSON.stringify(candidatePercentiles));
  }, [candidatePercentiles]);
  useEffect(() => {
    localStorage.setItem(ranksCacheKey, JSON.stringify(candidateRanks));
  }, [candidateRanks]);
  useEffect(() => {
    let ignored = false;
    setLoading(true);
    setError("");
    const timer = setTimeout(
      () =>
        getExplorerResults({
          ...filters,
          page,
          pageSize,
          sortBy: sort.by,
          sortDirection: sort.direction,
        })
          .then((payload) => {
            if (!ignored) {
              setRows(payload.rows);
              setTotal(payload.total);
            }
          })
          .catch((e) => {
            if (!ignored) setError(e.message);
          })
          .finally(() => {
            if (!ignored) setLoading(false);
          }),
      250
    );
    return () => {
      ignored = true;
      clearTimeout(timer);
    };
  }, [filters, page, pageSize, sort]);
  useEffect(() => {
    if (!college) return undefined;
    let ignored = false;
    setCollegeLoading(true);
    getCollegeDetails(college.collegeCode, {
      rules: collegeRules,
      exam: filters.exam,
      scoreMode: filters.scoreMode,
      score: filters.scoreMode === "rank" ? candidateRanks[filters.exam] : candidatePercentiles[filters.exam],
      applyActiveFilters: true,
    })
      .then((payload) => {
        if (!ignored) setCollegeData(payload);
      })
      .catch((e) => {
        if (!ignored) setError(e.message);
      })
      .finally(() => {
        if (!ignored) setCollegeLoading(false);
      });
    return () => {
      ignored = true;
    };
  }, [college, collegeRules, filters.exam, filters.scoreMode, candidatePercentiles, candidateRanks]);
  const update = (key, value) => {
    setPage(1);
    setFilters((current) => ({ ...current, [key]: value }));
  };
  const updatePercentile = (exam, value) => setCandidatePercentiles((current) => ({ ...current, [exam]: value }));
  const updateRank = (exam, value) => setCandidateRanks((current) => ({ ...current, [exam]: value }));
  const applyRules = (rules) => update("rules", rules);
  const saveTemplate = (name, rules) =>
    setTemplates((current) => {
      const next = [...current, { id: `${Date.now()}-${name}`, name, rules }];
      localStorage.setItem("cap-compass-filter-templates", JSON.stringify(next));
      return next;
    });
  const changeSort = (by) => {
    setPage(1);
    setSort((current) => (current.by === by ? { by, direction: current.direction === "ASC" ? "DESC" : "ASC" } : { by, direction: filters.scoreMode === "rank" ? "ASC" : "DESC" }));
  };
  const openCollege = (row) => {
    setCollege(row);
    setTab("college");
  };
  const selectCollege = (nextCollege) => {
    setCollege(nextCollege);
    setCollegeRules([]);
    setCollegeData({ rows: [] });
    setTab("college");
  };
  const selectTrend = async (row) => {
    setSelected(row);
    setTab("trends");
    setTrendLoading(true);
    try {
      setTrendData(
        await getTrends({
          collegeCode: row.collegeCode,
          branchCode: row.branchCode,
          category: row.category || "GOPENS",
          capRound: row.capRound,
        })
      );
    } catch (e) {
      setError(e.message);
      setTrendData({ cet: [], jee: [] });
    } finally {
      setTrendLoading(false);
    }
  };
  const summary = useMemo(() => `${total.toLocaleString()} matching options`, [total]);
  const activePresetId = useMemo(() => {
    const allOptions = [...DEFAULT_PRESETS, ...templates];
    const currentJson = JSON.stringify(filters.rules);
    const match = allOptions.find((opt) => JSON.stringify(opt.rules) === currentJson);
    return match ? match.id : "";
  }, [filters.rules, templates]);

  const handlePresetSelect = (presetId) => {
    if (presetId === "__clear__") {
      applyRules([]);
      return;
    }
    const allOptions = [...DEFAULT_PRESETS, ...templates];
    const found = allOptions.find((item) => item.id === presetId);
    if (found) {
      applyRules(found.rules);
    }
  };

  return (
    <main className={`app-shell ${mobileMenuOpen ? "sidebar-open" : ""}`}>
      <div className="mobile-header">
        <button className="menu-btn" onClick={() => setMobileMenuOpen(true)}>
          <Menu size={20} />
        </button>
        <div className="brand">
          <Compass />
          <span>
            CAP <b>Compass</b>
          </span>
        </div>
        <button className="theme-toggle" onClick={toggleTheme} title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} aria-label="Toggle theme">
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>
      <div className="sidebar-overlay" onClick={() => setMobileMenuOpen(false)} />
      <aside className={`sidebar ${mobileMenuOpen ? "open" : ""}`}>
        <div className="sidebar-top">
          <div className="brand">
            <Compass />
            <span>
              CAP <b>Compass</b>
            </span>
            <button className="theme-toggle desktop-theme-toggle" onClick={toggleTheme} title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} aria-label="Toggle theme">
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
          <button className="close-sidebar-btn" onClick={() => setMobileMenuOpen(false)}>
            <X size={20} />
          </button>
        </div>
        <p className="sidebar-copy">Maharashtra engineering cutoff intelligence, 2022–24.</p>
        <div className="filter-group">
          <label>Exam</label>
          <div className="segmented">
            {["CET", "JEE"].map((exam) => (
              <button key={exam} onClick={() => update("exam", exam)} className={filters.exam === exam ? "active" : ""}>
                {exam}
              </button>
            ))}
          </div>
        </div>
        <div className="filter-group">
          <label>Mode</label>
          <div className="segmented">
            <button onClick={() => update("scoreMode", "percentile")} className={filters.scoreMode !== "rank" ? "active" : ""}>
              Percentile
            </button>
            <button onClick={() => update("scoreMode", "rank")} className={filters.scoreMode === "rank" ? "active" : ""}>
              Rank
            </button>
          </div>
        </div>
        {filters.scoreMode === "rank" ? (
          <>
            <label>
              CET rank
              <input type="number" min="1" step="1" value={candidateRanks.CET} onChange={(event) => updateRank("CET", event.target.value)} />
            </label>
            <label>
              JEE rank
              <input type="number" min="1" step="1" value={candidateRanks.JEE} onChange={(event) => updateRank("JEE", event.target.value)} />
            </label>
            <label>
              Rank range{" "}
              <span>
                {filters.minRank || 1}–{filters.maxRank || 50000}
              </span>
              <div className="range-inputs">
                <input type="number" min="1" value={filters.minRank ?? 1} onChange={(e) => update("minRank", e.target.value)} />
                <input type="number" min="1" value={filters.maxRank ?? 50000} onChange={(e) => update("maxRank", e.target.value)} />
              </div>
            </label>
          </>
        ) : (
          <>
            <label>
              CET percentile
              <input type="number" min="0" max="100" step="0.01" value={candidatePercentiles.CET} onChange={(event) => updatePercentile("CET", event.target.value)} />
            </label>
            <label>
              JEE percentile
              <input type="number" min="0" max="100" step="0.01" value={candidatePercentiles.JEE} onChange={(event) => updatePercentile("JEE", event.target.value)} />
            </label>
            <label>
              Percentile range{" "}
              <span>
                {filters.minPercentile}–{filters.maxPercentile}
              </span>
              <div className="range-inputs">
                <input type="number" min="0" max="100" value={filters.minPercentile} onChange={(e) => update("minPercentile", e.target.value)} />
                <input type="number" min="0" max="100" value={filters.maxPercentile} onChange={(e) => update("maxPercentile", e.target.value)} />
              </div>
            </label>
          </>
        )}
        <div className="filter-group">
          <label htmlFor="sidebar-preset-select">Preset filter</label>
          <select id="sidebar-preset-select" className="preset-select" value={activePresetId} onChange={(event) => handlePresetSelect(event.target.value)}>
            <option value="">Select preset filter…</option>
            {DEFAULT_PRESETS.length > 0 && (
              <optgroup label="Default Presets">
                {DEFAULT_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </optgroup>
            )}
            {templates.length > 0 && (
              <optgroup label="Saved Templates">
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </optgroup>
            )}
            {filters.rules.length > 0 && <option value="__clear__">Clear active filters</option>}
          </select>
        </div>
        <section className="advanced-filters">
          <label>Advanced filters</label>
          <p>{filters.rules.length ? `${filters.rules.length} active filter${filters.rules.length === 1 ? "" : "s"}` : "No active filters"}</p>
          <button
            className="open-filter-builder"
            onClick={() => {
              setFilterModalOpen(true);
              setMobileMenuOpen(false);
            }}
          >
            <SlidersHorizontal size={16} /> Open filter builder
          </button>
        </section>
      </aside>
      <section className="content">
        <div className="tabs-container">
          <nav className="tabs">
            {[
              ["explorer", "Explorer", Search],
              ["trends", "Trends", LineChart],
              ["college", "College", Building2],
              ["predictor", "Predictor", Sparkles],
            ].map(([id, name, Icon]) => (
              <button key={id} onClick={() => setTab(id)} className={tab === id ? "active" : ""}>
                <Icon size={16} /> {name}
              </button>
            ))}
          </nav>
          <div className="data-note">
            <BarChart3 size={17} /> {summary}
          </div>
        </div>
        {updateAvailable && (
          <div className="update banner">
            A newer offline database is ready. <button onClick={() => activatePendingUpdate()}>Reload now</button>
          </div>
        )}
        {error && <div className="error banner">{error}</div>}
        <div className="panel">
          {tab === "explorer" && (
            <Explorer
              rows={rows}
              loading={loading}
              onSelectTrend={selectTrend}
              onOpenCollege={openCollege}
              sort={sort}
              onSort={changeSort}
              percentiles={candidatePercentiles}
              ranks={candidateRanks}
              exam={filters.exam}
              scoreMode={filters.scoreMode}
              pagination={{
                page,
                pageSize,
                total,
                onPage: setPage,
                onPageSize: (size) => {
                  setPageSize(size);
                  setPage(1);
                },
              }}
            />
          )}
          {tab === "trends" && <Trends selected={selected} data={trendData} loading={trendLoading} scoreMode={filters.scoreMode} />}
          {tab === "college" && (
            <CollegePage
              college={college}
              data={collegeData}
              collegeRules={collegeRules}
              onEditFilters={() => setCollegeFilterModalOpen(true)}
              percentile={candidatePercentiles[filters.exam]}
              percentiles={candidatePercentiles}
              rank={candidateRanks[filters.exam]}
              ranks={candidateRanks}
              exam={filters.exam}
              scoreMode={filters.scoreMode}
              collegeOptions={metadata.collegeOptions || []}
              onSelectCollege={selectCollege}
            />
          )}
          {tab === "predictor" && <Predictor filters={filters} percentiles={candidatePercentiles} ranks={candidateRanks} onOpenFilterBuilder={() => setFilterModalOpen(true)} />}
        </div>
      </section>
      {filterModalOpen && <FilterModal rules={filters.rules} metadata={metadata} templates={templates} onApply={applyRules} onClose={() => setFilterModalOpen(false)} onSaveTemplate={saveTemplate} />}
      {collegeFilterModalOpen && (
        <FilterModal
          rules={collegeRules}
          metadata={metadata}
          templates={templates}
          fields={collegeRuleFields}
          title="Filter this college"
          description="Only branch name, branch code, branch status, and category can filter a college overview."
          onApply={setCollegeRules}
          onClose={() => setCollegeFilterModalOpen(false)}
          onSaveTemplate={saveTemplate}
        />
      )}
    </main>
  );
}
