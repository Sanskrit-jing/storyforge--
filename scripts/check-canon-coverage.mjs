/* global console, process */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const mapFile = path.join(root, 'docs', 'CONSISTENCY-COVERAGE-MAP.md')
const testsDir = path.join(root, 'tests', 'canon')
const failures = []

const read = (file) => {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {
    failures.push(`missing file: ${path.relative(root, file)}`)
    return ''
  }
}

const coverageMap = read(mapFile)
const rows = new Map()
for (const line of coverageMap.split('\n')) {
  if (!line.includes('`R-CANON-')) continue
  const cells = line.split('|').slice(1, -1).map(cell => cell.trim())
  const id = cells[0]?.match(/`(R-CANON-[^`]+)`/)?.[1]
  if (!id || cells.length < 4) continue
  if (rows.has(id)) failures.push(`duplicate coverage-map row: ${id}`)
  rows.set(id, {
    scenario: cells[1],
    mechanism: cells[2],
    status: cells[3],
  })
}

if (!fs.existsSync(testsDir)) {
  failures.push('missing tests/canon directory')
}

const testFiles = fs.existsSync(testsDir)
  ? fs.readdirSync(testsDir)
    .filter(file => file.endsWith('.test.ts') || file.endsWith('.test.tsx'))
    .map(file => path.join(testsDir, file))
  : []
const declarations = new Map()

for (const file of testFiles) {
  const source = read(file)
  for (const line of source.split('\n')) {
    const match = line.match(
      /^\s*(?:it|test)(?:\.(todo|skip))?\(\s*['"`](R-CANON-[^'"` ·]+)/,
    )
    if (!match) continue
    const [, mode = 'active', id] = match
    const values = declarations.get(id) ?? []
    values.push({ mode, file: path.relative(root, file), source })
    declarations.set(id, values)
  }
}

for (const [id, row] of rows) {
  const matches = declarations.get(id) ?? []
  if (matches.length !== 1) {
    failures.push(`${id} must have exactly one tests/canon declaration; found ${matches.length}`)
    continue
  }

  const declaration = matches[0]
  if (row.status.includes('🟢')) {
    if (declaration.mode !== 'active') {
      failures.push(`${id} is green in the map but its canon test is ${declaration.mode}`)
    }
  } else if (row.status.includes('🔴')) {
    if (declaration.mode !== 'todo') {
      failures.push(`${id} is red in the map and must remain an explicit todo`)
    }
  } else {
    failures.push(`${id} has unsupported coverage status: ${row.status}`)
  }
}

for (const id of declarations.keys()) {
  if (!rows.has(id)) failures.push(`canon test has no coverage-map row: ${id}`)
}

const mechanisms = {
  'R-CANON-item-1': 'checkHeldItemAcquisition',
  'R-CANON-world-iso-1': 'retrieveChunks',
  'R-CANON-omniscient-1': 'checkCognitionBoundary',
  'R-CANON-setting-clash-1': 'confirmFactCandidate',
  'R-CANON-setting-clash-2': 'checkSettingAssertionClashes',
  'R-CANON-timeline-1': 'checkCharacterLifecycleBoundary',
}
for (const [id, symbol] of Object.entries(mechanisms)) {
  const declaration = declarations.get(id)?.[0]
  if (declaration && !declaration.source.includes(symbol)) {
    failures.push(`${id} active test must exercise ${symbol}`)
  }
}

if (!coverageMap.includes('硬检测 ≠ 硬处置')) {
  failures.push('coverage map must preserve the hard-detection versus disposition distinction')
}
if (!coverageMap.includes('不许说"这块一致了"')) {
  failures.push('coverage map must preserve the evidence-backed claim rule')
}

if (failures.length) {
  console.error('canon coverage check failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

const active = [...declarations.values()].filter(entries => entries[0]?.mode === 'active').length
const todos = [...declarations.values()].filter(entries => entries[0]?.mode === 'todo').length
console.log(
  `canon coverage check passed: ${rows.size} scenarios, ${active} executable, ${todos} explicit todo`,
)
