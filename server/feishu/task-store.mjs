import { createHash, randomUUID } from 'node:crypto'
import { appendFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

function sourceDigest(source) {
  const hash = createHash('sha256')
  hash.update(String(source.mimeType || ''))
  hash.update('\0')
  hash.update(String(source.sourceBase64 || ''))
  if (Array.isArray(source.pages)) hash.update(JSON.stringify(source.pages))
  return hash.digest('hex')
}

function publicTask(task) {
  if (!task) return null
  const { _private, ...safe } = task
  return structuredClone(safe)
}

export class FeishuTaskStore {
  constructor({ dataDir, workflowVersion, now = () => new Date().toISOString() }) {
    this.dataDir = dataDir
    this.workflowVersion = workflowVersion
    this.now = now
    this.tasks = new Map()
    this.idempotency = new Map()
  }

  async init() {
    await mkdir(this.dataDir, { recursive: true })
  }

  async audit(event, task, extra = {}) {
    const record = {
      at: this.now(), event, taskId: task?.taskId || '', status: task?.status || '',
      tenantId: task?.tenantId || '', openId: task?.openId || '', ...extra,
    }
    await appendFile(path.join(this.dataDir, 'audit.jsonl'), `${JSON.stringify(record)}\n`, { encoding: 'utf8', mode: 0o600 })
  }

  async create({ identity, source, userAccessToken = '' }) {
    const sha256 = sourceDigest(source)
    const key = `${identity.tenantKey}\0${sha256}\0${this.workflowVersion}`
    const existingId = this.idempotency.get(key)
    if (existingId) return { task: this.get(existingId), reused: true }

    const createdAt = this.now()
    const task = {
      taskId: randomUUID(),
      tenantId: identity.tenantKey,
      openId: identity.openId,
      createdByName: identity.name,
      sourceType: source.mimeType === 'application/pdf' ? 'pdf' : 'image',
      fileName: String(source.fileName || '未命名资料').slice(0, 300),
      mimeType: source.mimeType,
      sha256,
      workflowVersion: this.workflowVersion,
      createdAt,
      updatedAt: createdAt,
      status: 'queued',
      progress: { current: 0, total: 4, label: '任务已进入飞书工作流' },
      locations: [],
      outputs: {},
      error: null,
      attempt: 0,
      _private: { source, userAccessToken },
    }
    this.tasks.set(task.taskId, task)
    this.idempotency.set(key, task.taskId)
    await this.audit('task_created', task, { sha256, workflowVersion: this.workflowVersion })
    return { task: publicTask(task), reused: false }
  }

  get(taskId) { return publicTask(this.tasks.get(String(taskId || ''))) }
  getInternal(taskId) { return this.tasks.get(String(taskId || '')) || null }

  getOwned(taskId, identity) {
    const task = this.tasks.get(String(taskId || ''))
    if (!task || task.tenantId !== identity.tenantKey || task.openId !== identity.openId) return null
    return publicTask(task)
  }

  async update(taskId, patch, event = 'task_updated') {
    const task = this.tasks.get(String(taskId || ''))
    if (!task) throw new Error('task_not_found')
    Object.assign(task, patch, { updatedAt: this.now() })
    await this.audit(event, task, patch.error ? { error: String(patch.error).slice(0, 500) } : {})
    return publicTask(task)
  }
}
