import sqlite3InitModule from '@sqlite.org/sqlite-wasm'

// This module is the browser-side replacement for the former Flask routes.
// Every exported function preserves an old API response shape, which keeps the
// React components focused on rendering rather than on database mechanics.

const MAX_PREDICTION_RESULTS = 500
let databasePromise

const RULE_COLUMNS = {
  category: 'cc24.Category',
  homeUniversity: 'bi.Home_University',
  status: 'bi.Status',
  branch: 'bi.Branch_Name',
  college: 'ci.College_Name',
  collegeCode: 'ci.College_Code',
  branchCode: 'bi.Branch_Code',
}

const COLLEGE_RULE_COLUMNS = {
  category: 'cc.Category',
  homeUniversity: 'bi.Home_University',
  status: 'bi.Status',
  branch: 'bi.Branch_Name',
  college: 'ci.College_Name',
  collegeCode: 'ci.College_Code',
  branchCode: 'bi.Branch_Code',
}

const SORT_COLUMNS = {
  collegeName: 'ci.College_Name',
  branchName: 'bi.Branch_Name',
  category: 'cc24.Category',
  cet2024: 'cc24.Percentile',
  jee2024: 'jee2024',
  cetChange: 'cc24.Percentile - cc22.Percentile',
  jeeChange: 'jee2024 - jee2022',
}

const JEE_SORT_COLUMNS = {
  collegeName: 'ci.College_Name',
  branchName: 'bi.Branch_Name',
  category: 'MAX(ai24.Percentile)',
  cet2024: 'MAX(ai24.Percentile)',
  jee2024: 'MAX(ai24.Percentile)',
  cetChange: 'MAX(ai24.Percentile) - MAX(ai22.Percentile)',
  jeeChange: 'MAX(ai24.Percentile) - MAX(ai22.Percentile)',
}

const RANK_SORT_COLUMNS = {
  collegeName: 'ci.College_Name',
  branchName: 'bi.Branch_Name',
  category: 'cc24.Category',
  cet2024: 'cc24.Merit_Rank',
  jee2024: 'jeeRank2024',
  cetChange: 'cc22.Merit_Rank - cc24.Merit_Rank',
  jeeChange: 'jeeRank2022 - jeeRank2024',
}

const JEE_RANK_SORT_COLUMNS = {
  collegeName: 'ci.College_Name',
  branchName: 'bi.Branch_Name',
  category: 'MIN(ai24.Merit_Rank)',
  cet2024: 'MIN(ai24.Merit_Rank)',
  jee2024: 'MIN(ai24.Merit_Rank)',
  cetChange: 'MIN(ai22.Merit_Rank) - MIN(ai24.Merit_Rank)',
  jeeChange: 'MIN(ai22.Merit_Rank) - MIN(ai24.Merit_Rank)',
}

function databaseUrl() {
  // A leading slash would point at tshrwbl.github.io instead of this repository
  // when the app is deployed below /CatRoundHelper/ on GitHub Pages.
  return `${import.meta.env.BASE_URL}data.sqlite`
}

async function initializeDatabase() {
  const [sqlite3, response] = await Promise.all([
    sqlite3InitModule(),
    fetch(databaseUrl()),
  ])
  if (!response.ok) {
    throw new Error(`Could not download the cutoff database (HTTP ${response.status}).`)
  }

  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength === 0) {
    throw new Error('The downloaded cutoff database is empty.')
  }

  const db = new sqlite3.oo1.DB(':memory:', 'ct')
  try {
    // sqlite3_deserialize takes ownership of this WASM allocation and releases
    // it when db.close() runs. The original fetch buffer can then be collected.
    const pointer = sqlite3.wasm.allocFromTypedArray(bytes)
    const result = sqlite3.capi.sqlite3_deserialize(
      db.pointer,
      'main',
      pointer,
      bytes.byteLength,
      bytes.byteLength,
      sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE,
    )
    db.checkRc(result)
    db.exec('PRAGMA query_only = ON')
    return db
  } catch (error) {
    db.close()
    throw error
  }
}

async function database() {
  // React can request metadata and the first explorer page at the same time.
  // One shared promise guarantees that the database is fetched and opened once.
  databasePromise ??= initializeDatabase()
  return databasePromise
}

function selectRows(db, sql, bind = []) {
  return db.exec({ sql, bind, rowMode: 'object', returnValue: 'resultRows' })
}

function selectScalar(db, sql, bind = []) {
  const [row] = selectRows(db, sql, bind)
  return row ? Object.values(row)[0] : null
}

function ruleValues(value) {
  if (Array.isArray(value)) {
    return value.map(String).map((item) => item.trim()).filter(Boolean)
  }
  return String(value ?? '').split(',').map((item) => item.trim()).filter(Boolean)
}

function buildRule(rule, columns = RULE_COLUMNS) {
  const column = columns[rule?.field]
  const oldOperator = rule?.operator
  const matcher = rule?.matcher ?? {
    equals: 'is',
    contains: 'contains',
    in: 'in',
    notIn: 'in',
  }[oldOperator]
  const mode = rule?.mode ?? (oldOperator === 'notIn' ? 'exclude' : 'include')
  const values = [...new Set([
    ...ruleValues(rule?.value),
    ...ruleValues(rule?.listValue),
  ])]

  if (!column || !values.length || !['is', 'contains', 'in'].includes(matcher) || !['include', 'exclude'].includes(mode)) {
    return null
  }
  if (matcher === 'contains') {
    return [
      `${column} ${mode === 'exclude' ? 'NOT LIKE' : 'LIKE'} ?`,
      [`%${values[0]}%`],
    ]
  }
  if (matcher === 'is') {
    return [
      `${column} ${mode === 'exclude' ? '<>' : '='} ?`,
      [values[0]],
    ]
  }

  const placeholders = values.map(() => '?').join(', ')
  return [
    `${column} ${mode === 'exclude' ? 'NOT IN' : 'IN'} (${placeholders})`,
    values,
  ]
}

function queryParts(filters = {}) {
  const exam = filters.exam === 'JEE' ? 'JEE' : 'CET'
  const isJee = exam === 'JEE'
  const isRankMode = filters.scoreMode === 'rank'
  const anchor = isJee ? 'ai24' : 'cc24'
  const conditions = [`${anchor}.Year = 2024`]
  const parameters = []
  let combinedRule = null
  const ruleParameters = []

  for (const rule of filters.rules ?? []) {
    if (!rule || typeof rule !== 'object' || (isJee && rule.field === 'category')) continue
    const built = buildRule(rule)
    if (!built) continue
    const [predicate, values] = built
    combinedRule = combinedRule === null
      ? predicate
      : `(${combinedRule} ${rule.join === 'OR' ? 'OR' : 'AND'} ${predicate})`
    ruleParameters.push(...values)
  }
  if (combinedRule) {
    conditions.push(combinedRule)
    parameters.push(...ruleParameters)
  }

  const cutoffColumn = isJee
    ? (isRankMode ? 'ai24.Merit_Rank' : 'ai24.Percentile')
    : (isRankMode ? 'cc24.Merit_Rank' : 'cc24.Percentile')

  const minVal = isRankMode ? filters.minRank : filters.minPercentile
  const maxVal = isRankMode ? filters.maxRank : filters.maxPercentile
  const minimum = Number(minVal)
  const maximum = Number(maxVal)
  if (minVal !== '' && minVal != null && Number.isFinite(minimum)) {
    conditions.push(`${cutoffColumn} >= ?`)
    parameters.push(minimum)
  }
  if (maxVal !== '' && maxVal != null && Number.isFinite(maximum)) {
    conditions.push(`${cutoffColumn} <= ?`)
    parameters.push(maximum)
  }

  const fromWhere = isJee
    ? `
      FROM all_india_cutoffs ai24
      INNER JOIN branch_info bi ON bi.Branch_Code = ai24.Choice_Code
      INNER JOIN (
        SELECT DISTINCT College_Code, Branch_Code FROM cap_cutoffs
      ) cc_map ON cc_map.Branch_Code = ai24.Choice_Code
      INNER JOIN college_info ci ON ci.College_Code = cc_map.College_Code
      LEFT JOIN all_india_cutoffs ai23 ON ai23.Choice_Code = ai24.Choice_Code
        AND ai23.CAP_Round = ai24.CAP_Round AND ai23.Year = 2023
      LEFT JOIN all_india_cutoffs ai22 ON ai22.Choice_Code = ai24.Choice_Code
        AND ai22.CAP_Round = ai24.CAP_Round AND ai22.Year = 2022
      WHERE ${conditions.join(' AND ')}
    `
    : `
      FROM cap_cutoffs cc24
      INNER JOIN college_info ci ON ci.College_Code = cc24.College_Code
      INNER JOIN branch_info bi ON bi.Branch_Code = cc24.Branch_Code
      LEFT JOIN cap_cutoffs cc23 ON cc23.College_Code = cc24.College_Code
        AND cc23.Branch_Code = cc24.Branch_Code AND cc23.Category = cc24.Category
        AND cc23.CAP_Round = cc24.CAP_Round AND cc23.Year = 2023
      LEFT JOIN cap_cutoffs cc22 ON cc22.College_Code = cc24.College_Code
        AND cc22.Branch_Code = cc24.Branch_Code AND cc22.Category = cc24.Category
        AND cc22.CAP_Round = cc24.CAP_Round AND cc22.Year = 2022
      WHERE ${conditions.join(' AND ')}
    `

  const sortMap = isJee
    ? (isRankMode ? JEE_RANK_SORT_COLUMNS : JEE_SORT_COLUMNS)
    : (isRankMode ? RANK_SORT_COLUMNS : SORT_COLUMNS)
  const sortColumn = sortMap[filters.sortBy] ?? cutoffColumn
  const defaultDir = isRankMode && (filters.sortBy === 'cet2024' || filters.sortBy === 'jee2024' || !filters.sortBy) ? 'ASC' : 'DESC'
  const direction = filters.sortDirection ? String(filters.sortDirection).toUpperCase() : defaultDir
  const orderBy = `ORDER BY ${sortColumn} ${direction}, ci.College_Name, bi.Branch_Name`
  return { exam, isJee, fromWhere, parameters, orderBy }
}

function selectColumns(exam) {
  if (exam === 'JEE') {
    return `
      ci.College_Code AS collegeCode, ci.College_Name AS collegeName,
      bi.Branch_Code AS branchCode, bi.Branch_Name AS branchName,
      bi.Home_University AS homeUniversity, bi.Status AS status,
      NULL AS category, ai24.CAP_Round AS capRound,
      NULL AS cet2024, NULL AS cetRank2024,
      NULL AS cet2023, NULL AS cetRank2023,
      NULL AS cet2022, NULL AS cetRank2022,
      MAX(ai24.Percentile) AS jee2024, MIN(ai24.Merit_Rank) AS jeeRank2024,
      MAX(ai23.Percentile) AS jee2023, MIN(ai23.Merit_Rank) AS jeeRank2023,
      MAX(ai22.Percentile) AS jee2022, MIN(ai22.Merit_Rank) AS jeeRank2022
    `
  }
  return `
    ci.College_Code AS collegeCode, ci.College_Name AS collegeName,
    bi.Branch_Code AS branchCode, bi.Branch_Name AS branchName,
    bi.Home_University AS homeUniversity, bi.Status AS status,
    cc24.Category AS category, cc24.CAP_Round AS capRound,
    cc24.Percentile AS cet2024, cc24.Merit_Rank AS cetRank2024,
    cc23.Percentile AS cet2023, cc23.Merit_Rank AS cetRank2023,
    cc22.Percentile AS cet2022, cc22.Merit_Rank AS cetRank2022,
    (
      SELECT ai.Percentile FROM all_india_cutoffs ai
      WHERE ai.Choice_Code = bi.Branch_Code AND ai.CAP_Round = cc24.CAP_Round AND ai.Year = 2024
      ORDER BY ai.Percentile DESC, ai.Merit_Rank LIMIT 1
    ) AS jee2024,
    (
      SELECT ai.Merit_Rank FROM all_india_cutoffs ai
      WHERE ai.Choice_Code = bi.Branch_Code AND ai.CAP_Round = cc24.CAP_Round AND ai.Year = 2024
      ORDER BY ai.Percentile DESC, ai.Merit_Rank LIMIT 1
    ) AS jeeRank2024,
    (
      SELECT ai.Percentile FROM all_india_cutoffs ai
      WHERE ai.Choice_Code = bi.Branch_Code AND ai.CAP_Round = cc24.CAP_Round AND ai.Year = 2023
      ORDER BY ai.Percentile DESC, ai.Merit_Rank LIMIT 1
    ) AS jee2023,
    (
      SELECT ai.Merit_Rank FROM all_india_cutoffs ai
      WHERE ai.Choice_Code = bi.Branch_Code AND ai.CAP_Round = cc24.CAP_Round AND ai.Year = 2023
      ORDER BY ai.Percentile DESC, ai.Merit_Rank LIMIT 1
    ) AS jeeRank2023,
    (
      SELECT ai.Percentile FROM all_india_cutoffs ai
      WHERE ai.Choice_Code = bi.Branch_Code AND ai.CAP_Round = cc24.CAP_Round AND ai.Year = 2022
      ORDER BY ai.Percentile DESC, ai.Merit_Rank LIMIT 1
    ) AS jee2022,
    (
      SELECT ai.Merit_Rank FROM all_india_cutoffs ai
      WHERE ai.Choice_Code = bi.Branch_Code AND ai.CAP_Round = cc24.CAP_Round AND ai.Year = 2022
      ORDER BY ai.Percentile DESC, ai.Merit_Rank LIMIT 1
    ) AS jeeRank2022
  `
}

export async function getMetadata() {
  const db = await database()
  const values = (sql) => selectRows(db, sql)
    .map((row) => Object.values(row)[0])
    .filter((value) => value != null)
    .map(String)
  return {
    categories: values('SELECT DISTINCT Category FROM cap_cutoffs ORDER BY Category'),
    homeUniversities: values('SELECT DISTINCT Home_University FROM branch_info WHERE Home_University IS NOT NULL ORDER BY Home_University'),
    branches: values('SELECT DISTINCT Branch_Name FROM branch_info WHERE Branch_Name IS NOT NULL ORDER BY Branch_Name'),
    branchCodes: values('SELECT DISTINCT Branch_Code FROM branch_info ORDER BY Branch_Code'),
    colleges: values('SELECT DISTINCT College_Name FROM college_info WHERE College_Name IS NOT NULL ORDER BY College_Name'),
    collegeOptions: selectRows(db, `
      SELECT College_Code AS code, College_Name AS name
      FROM college_info WHERE College_Name IS NOT NULL
      ORDER BY College_Name, College_Code
    `),
    collegeCodes: values('SELECT CAST(College_Code AS TEXT) FROM college_info ORDER BY College_Code'),
    statuses: values('SELECT DISTINCT Status FROM branch_info WHERE Status IS NOT NULL ORDER BY Status'),
  }
}

export async function getExplorerResults(filters = {}) {
  const db = await database()
  const page = Math.max(1, Number.parseInt(filters.page, 10) || 1)
  const pageSize = Math.min(100, Math.max(10, Number.parseInt(filters.pageSize, 10) || 25))
  const { exam, isJee, fromWhere, parameters, orderBy } = queryParts(filters)
  const groupBy = isJee
    ? 'GROUP BY ci.College_Code, ci.College_Name, bi.Branch_Code, bi.Branch_Name, bi.Home_University, bi.Status, ai24.CAP_Round'
    : ''
  const countSql = isJee
    ? `SELECT COUNT(*) AS total FROM (SELECT 1 ${fromWhere} ${groupBy})`
    : `SELECT COUNT(*) AS total ${fromWhere}`
  const total = Number(selectScalar(db, countSql, parameters) ?? 0)
  const offset = (page - 1) * pageSize
  const rows = selectRows(
    db,
    `SELECT ${selectColumns(exam)} ${fromWhere} ${groupBy} ${orderBy} LIMIT ? OFFSET ?`,
    [...parameters, pageSize, offset],
  )
  return { rows, total, page, pageSize }
}

export async function getCollegeDetails(collegeCode, payload = {}) {
  const db = await database()
  const exam = String(payload.exam).toUpperCase() === 'JEE' ? 'JEE' : 'CET'
  const isRankMode = payload.scoreMode === 'rank'
  const rawScore = payload.score ?? (isRankMode ? payload.rank : payload.percentile)
  const numericScore = rawScore == null || rawScore === '' ? null : Number(rawScore)
  if (numericScore != null && !Number.isFinite(numericScore)) {
    throw new Error(`${isRankMode ? 'Rank' : 'Percentile'} must be a number.`)
  }

  const allowedFields = new Set(['category', 'branch', 'branchCode', 'status'])
  const conditions = [`${exam === 'JEE' ? 'ci' : 'cc'}.College_Code = ?`, `${exam === 'JEE' ? 'ai' : 'cc'}.Year BETWEEN 2022 AND 2024`]
  const parameters = [Number(collegeCode)]
  let combinedRule = null
  const ruleParameters = []
  if (payload.applyActiveFilters !== false) {
    for (const rule of payload.rules ?? []) {
      if (!rule || !allowedFields.has(rule.field) || (exam === 'JEE' && rule.field === 'category')) continue
      const built = buildRule(rule, COLLEGE_RULE_COLUMNS)
      if (!built) continue
      const [predicate, values] = built
      combinedRule = combinedRule === null
        ? predicate
        : `(${combinedRule} ${rule.join === 'OR' ? 'OR' : 'AND'} ${predicate})`
      ruleParameters.push(...values)
    }
  }
  if (combinedRule) {
    conditions.push(combinedRule)
    parameters.push(...ruleParameters)
  }

  const sql = exam === 'JEE'
    ? `
      SELECT ci.College_Code AS collegeCode, ci.College_Name AS collegeName,
        ai.Year AS year, ai.CAP_Round AS capRound, bi.Branch_Code AS branchCode,
        bi.Branch_Name AS branchName, bi.Status AS branchStatus,
        bi.Home_University AS homeUniversity, NULL AS category,
        NULL AS cetPercentile, NULL AS cetRank,
        MAX(ai.Percentile) AS jeePercentile, MIN(ai.Merit_Rank) AS jeeRank
      FROM all_india_cutoffs ai
      INNER JOIN branch_info bi ON bi.Branch_Code = ai.Choice_Code
      INNER JOIN (SELECT DISTINCT College_Code, Branch_Code FROM cap_cutoffs) cc_map
        ON cc_map.Branch_Code = ai.Choice_Code
      INNER JOIN college_info ci ON ci.College_Code = cc_map.College_Code
      WHERE ${conditions.join(' AND ')}
      GROUP BY ci.College_Code, ci.College_Name, ai.Year, ai.CAP_Round,
        bi.Branch_Code, bi.Branch_Name, bi.Status, bi.Home_University
      ORDER BY bi.Branch_Name, ai.Year DESC
    `
    : `
      SELECT ci.College_Code AS collegeCode, ci.College_Name AS collegeName,
        cc.Year AS year, cc.CAP_Round AS capRound, bi.Branch_Code AS branchCode,
        bi.Branch_Name AS branchName, bi.Status AS branchStatus,
        bi.Home_University AS homeUniversity, cc.Category AS category,
        cc.Percentile AS cetPercentile, cc.Merit_Rank AS cetRank,
        (
          SELECT ai.Percentile FROM all_india_cutoffs ai
          WHERE ai.Choice_Code = cc.Branch_Code AND ai.CAP_Round = cc.CAP_Round AND ai.Year = cc.Year
          ORDER BY ai.Percentile DESC, ai.Merit_Rank LIMIT 1
        ) AS jeePercentile,
        (
          SELECT ai.Merit_Rank FROM all_india_cutoffs ai
          WHERE ai.Choice_Code = cc.Branch_Code AND ai.CAP_Round = cc.CAP_Round AND ai.Year = cc.Year
          ORDER BY ai.Percentile DESC, ai.Merit_Rank LIMIT 1
        ) AS jeeRank
      FROM cap_cutoffs cc
      INNER JOIN college_info ci ON ci.College_Code = cc.College_Code
      INNER JOIN branch_info bi ON bi.Branch_Code = cc.Branch_Code
      WHERE ${conditions.join(' AND ')}
      ORDER BY bi.Branch_Name, cc.Category, cc.Year DESC
    `
  const rows = selectRows(db, sql, parameters)
  if (!rows.length) {
    throw new Error('No cutoff data found for this college and active filters.')
  }
  const cutoffKey = isRankMode
    ? (exam === 'JEE' ? 'jeeRank' : 'cetRank')
    : (exam === 'JEE' ? 'jeePercentile' : 'cetPercentile')

  for (const row of rows) {
    if (numericScore != null && row[cutoffKey] != null) {
      row.fitDifference = isRankMode
        ? Number(row[cutoffKey] - numericScore)
        : Number((numericScore - row[cutoffKey]).toFixed(2))
    } else {
      row.fitDifference = null
    }
  }
  return {
    college: { code: rows[0].collegeCode, name: rows[0].collegeName },
    exam,
    scoreMode: isRankMode ? 'rank' : 'percentile',
    score: numericScore,
    rows,
  }
}

export async function getTrends({ collegeCode, branchCode, category = 'GOPENS', capRound }) {
  if (!collegeCode || !branchCode || !capRound) {
    throw new Error('collegeCode, branchCode, and capRound are required.')
  }
  const db = await database()
  const cet = selectRows(db, `
    SELECT Year AS year, Percentile AS percentile, Merit_Rank AS meritRank
    FROM cap_cutoffs
    WHERE College_Code = ? AND Branch_Code = ? AND Category = ? AND CAP_Round = ?
    ORDER BY Year
  `, [Number(collegeCode), branchCode, category, Number(capRound)])
  const jee = selectRows(db, `
    SELECT Year AS year, MAX(Percentile) AS percentile, MIN(Merit_Rank) AS meritRank
    FROM all_india_cutoffs
    WHERE Choice_Code = ? AND CAP_Round = ?
    GROUP BY Year ORDER BY Year
  `, [branchCode, Number(capRound)])
  return { cet, jee }
}

export async function getPredictions(profile = {}) {
  const exam = String(profile.exam).toUpperCase()
  const isRankMode = profile.scoreMode === 'rank'
  const rawScore = isRankMode ? profile.rank : profile.percentile
  const score = Number(rawScore)
  if (!['CET', 'JEE'].includes(exam) || rawScore == null || rawScore === '' || !Number.isFinite(score)) {
    throw new Error(`A CET/JEE exam and ${isRankMode ? 'rank' : 'percentile'} are required.`)
  }
  if (!isRankMode && (score < 0 || score > 100)) {
    throw new Error('Percentile must be between 0 and 100.')
  }
  if (isRankMode && score < 1) {
    throw new Error('Rank must be 1 or greater.')
  }

  const db = await database()
  const filters = isRankMode
    ? {
        ...profile,
        exam,
        scoreMode: 'rank',
        minRank: Math.max(1, score - 3000),
        maxRank: score + 5000,
      }
    : {
        ...profile,
        exam,
        scoreMode: 'percentile',
        minPercentile: score - 10,
        maxPercentile: score + 5,
      }

  const { isJee, fromWhere, parameters, orderBy } = queryParts(filters)
  const groupBy = isJee
    ? 'GROUP BY ci.College_Code, ci.College_Name, bi.Branch_Code, bi.Branch_Name, bi.Home_University, bi.Status, ai24.CAP_Round'
    : ''
  const rows = selectRows(
    db,
    `SELECT ${selectColumns(exam)} ${fromWhere} ${groupBy} ${orderBy} LIMIT ?`,
    [...parameters, MAX_PREDICTION_RESULTS],
  )

  const cutoffKey = isRankMode
    ? (exam === 'JEE' ? 'jeeRank2024' : 'cetRank2024')
    : (exam === 'JEE' ? 'jee2024' : 'cet2024')

  const groups = { safe: [], target: [], reach: [] }
  for (const row of rows) {
    if (row[cutoffKey] == null) continue
    if (isRankMode) {
      const difference = row[cutoffKey] - score
      row.difference = Math.round(difference)
      if (difference > 1000) groups.safe.push(row)
      else if (difference >= -1000 && difference <= 1000) groups.target.push(row)
      else if (difference >= -3000 && difference < -1000) groups.reach.push(row)
    } else {
      const difference = score - row[cutoffKey]
      row.difference = Number(difference.toFixed(2))
      if (difference > 2) groups.safe.push(row)
      else if (difference >= -1.5 && difference < 0) groups.reach.push(row)
      else if (difference >= -2) groups.target.push(row)
    }
  }
  return { exam, scoreMode: isRankMode ? 'rank' : 'percentile', score, groups }
}
