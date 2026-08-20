import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { evaluateFeishuDeployment } from '../server/feishu/preflight.mjs'

const envPath = path.resolve(process.cwd(), '.env')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (!match || match[2].startsWith('#') || process.env[match[1]] !== undefined) continue
    let value = match[2]
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    process.env[match[1]] = value
  }
}

const result = evaluateFeishuDeployment(process.env, process.cwd())
const icons = { pass: '✓', warn: '!', fail: '✗' }
for (const check of result.checks) console.log(`${icons[check.status]} [${check.status.toUpperCase()}] ${check.message}`)
console.log(`\n飞书部署预检：${result.summary.pass} 通过 / ${result.summary.warn} 警告 / ${result.summary.fail} 失败`)
if (!result.ok) process.exitCode = 1
