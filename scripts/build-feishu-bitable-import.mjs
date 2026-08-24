import fs from 'node:fs/promises'
import path from 'node:path'
import { SpreadsheetFile, Workbook } from '@oai/artifact-tool'

const workspace = process.cwd()
const outputDir = path.join(workspace, 'outputs', 'feishu-bitable-books-movies')
const booksPath = path.join(workspace, 'public', 'data-packs', 'pocket-earth-books', '1.0.0', 'bundle.json')
const moviesPath = path.join(workspace, 'public', 'data-packs', 'pocket-earth-movies', '1.0.0', 'bundle.json')
const outputPath = path.join(outputDir, 'Pocket Earth 飞书书籍电影多维表格导入包.xlsx')

const columns = [
  'Pocket ID',
  '标题',
  '作者 / 主创',
  '国家 / 地区',
  '类型',
  '年份',
  '评分',
  '日期',
  '简介',
  '审核状态',
  '来源',
  'Schema',
  '数据 JSON',
  '更新时间',
]

const bookBundle = JSON.parse(await fs.readFile(booksPath, 'utf8'))
const movieBundle = JSON.parse(await fs.readFile(moviesPath, 'utf8'))

function assertBundle(bundle, schema, expectedCount) {
  if (bundle?.schema?.name !== schema) throw new Error(`Unexpected schema: ${bundle?.schema?.name}`)
  if (!Array.isArray(bundle.records)) throw new Error(`${schema} records missing`)
  if (bundle.records.length !== expectedCount) throw new Error(`${schema} expected ${expectedCount}, got ${bundle.records.length}`)
  const ids = new Set(bundle.records.map((record) => record.id))
  if (ids.size !== bundle.records.length || ids.has(undefined) || ids.has('')) throw new Error(`${schema} contains missing or duplicate IDs`)
}

assertBundle(bookBundle, 'pocket.books/v1', 1055)
assertBundle(movieBundle, 'pocket.movies/v1', 2124)

const generatedAt = new Date()

function rowFor(record, domain) {
  const isBook = domain === 'books'
  const payload = JSON.stringify(record)
  if (payload.length > 32767) throw new Error(`${record.id} JSON exceeds Excel cell limit`)
  return [
    record.id,
    record.title,
    isBook ? record.author : record.director,
    record.country,
    record.type,
    Number.isFinite(record.year) ? record.year : null,
    Number.isFinite(record.rating) ? record.rating : null,
    record.date ? new Date(`${record.date}T00:00:00Z`) : null,
    record.synopsis || '',
    '已确认',
    'Pocket Earth 内置数据包',
    isBook ? 'pocket.books/v1' : 'pocket.movies/v1',
    payload,
    generatedAt,
  ]
}

const workbook = Workbook.create()

function addDomainSheet(name, tableName, records, domain) {
  const sheet = workbook.worksheets.add(name)
  const rows = [columns, ...records.map((record) => rowFor(record, domain))]
  const lastRow = rows.length
  const dataRange = sheet.getRange(`A1:N${lastRow}`)
  dataRange.values = rows
  sheet.showGridLines = false
  sheet.freezePanes.freezeRows(1)
  sheet.freezePanes.freezeColumns(2)

  sheet.getRange('A1:N1').format = {
    fill: '#1456F0',
    font: { bold: true, color: '#FFFFFF' },
    rowHeight: 26,
    verticalAlignment: 'center',
  }
  sheet.getRange(`A2:N${lastRow}`).format = {
    font: { color: '#1F2329' },
    verticalAlignment: 'center',
  }
  sheet.getRange(`F2:F${lastRow}`).format.numberFormat = '0'
  sheet.getRange(`G2:G${lastRow}`).format.numberFormat = '0.0'
  sheet.getRange(`H2:H${lastRow}`).format.numberFormat = 'yyyy-mm-dd'
  sheet.getRange(`A2:A${lastRow}`).format.numberFormat = '@'
  sheet.getRange(`L2:M${lastRow}`).format.numberFormat = '@'
  sheet.getRange(`N2:N${lastRow}`).format.numberFormat = 'yyyy-mm-dd hh:mm:ss'
  sheet.getRange(`A1:N${Math.min(lastRow, 14)}`).format.borders = {
    insideHorizontal: { style: 'thin', color: '#E5E6EB' },
    bottom: { style: 'thin', color: '#D0D3D8' },
  }

  const widths = [18, 28, 24, 16, 15, 10, 10, 17, 48, 14, 26, 20, 64, 26]
  widths.forEach((width, index) => {
    sheet.getRangeByIndexes(0, index, lastRow, 1).format.columnWidth = width
  })
  sheet.getRange(`I2:I${lastRow}`).format.wrapText = false
  sheet.getRange(`M2:M${lastRow}`).format.wrapText = false

  const table = sheet.tables.add(`A1:N${lastRow}`, true, tableName)
  table.style = 'TableStyleMedium2'
  table.showBandedRows = true
  table.showFilterButton = true
  return sheet
}

addDomainSheet('书籍', 'PocketEarthBooks', bookBundle.records, 'books')
addDomainSheet('电影', 'PocketEarthMovies', movieBundle.records, 'movies')

await fs.mkdir(outputDir, { recursive: true })

for (const sheetName of ['书籍', '电影']) {
  const preview = await workbook.render({
    sheetName,
    range: 'A1:N12',
    scale: 1,
    format: 'png',
  })
  await fs.writeFile(path.join(outputDir, `${sheetName}-预览.png`), new Uint8Array(await preview.arrayBuffer()))
}

const inspection = await workbook.inspect({
  kind: 'table',
  maxChars: 5000,
  tableMaxRows: 4,
  tableMaxCols: 14,
})
await fs.writeFile(path.join(outputDir, 'inspect.ndjson'), inspection.ndjson, 'utf8')

const formulaErrors = await workbook.inspect({
  kind: 'match',
  searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A',
  options: { useRegex: true, maxResults: 50 },
  summary: 'final formula error scan',
})
if (/"matchCount"\s*:\s*[1-9]/.test(formulaErrors.ndjson)) throw new Error(`Formula errors found: ${formulaErrors.ndjson}`)

const exported = await SpreadsheetFile.exportXlsx(workbook)
await exported.save(outputPath)

console.log(JSON.stringify({
  outputPath,
  books: bookBundle.records.length,
  movies: movieBundle.records.length,
  sheets: ['书籍', '电影'],
  generatedAt: generatedAt.toISOString(),
}, null, 2))
