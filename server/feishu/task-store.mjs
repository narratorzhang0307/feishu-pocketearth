import { createHash, randomUUID } from 'node:crypto'
import { appendFile, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
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
    this.tasksDir = path.join(dataDir, 'tasks')
    this.tasks = new Map()
    this.idempotency = new Map()
  }

  async init() {
    await mkdir(this.tasksDir, { recursive: true, mode: 0o700 })
    const entries = await readdir(this.tasksDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue
      try {
        const task = JSON.parse(await readFile(path.join(this.tasksDir, entry.name), 'utf8'))
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(task?.taskId || '')) continue
        if (!task?.tenantId || !task?.openId || !task?.sha256 || !task?.workflowVersion) continue
        task._private = { source: null, userAccessToken: '' }
        let changed = false
        if (['queued', 'ocr_running', 'qwen_running'].includes(task.status)) {
          task.status = 'failed'
          task.error = 'source_reupload_required'
          task.retryStage = 'analysis'
          task.sourceRequired = true
          task.progress = { current: 0, total: 4, label: '服务已重启，请重新上传原文件以恢复任务' }
          changed = true
        } else if (task.status === 'writing_back') {
          task.status = 'failed'
          task.error = 'writeback_interrupted_by_restart'
          task.retryStage = 'writeback'
          task.sourceRequired = false
          task.progress = { current: 3, total: 4, label: '写回被服务重启中断，可从人工确认阶段继续' }
          changed = true
        } else if (task.status === 'failed' && task.retryStage !== 'writeback') {
          task.error = 'source_reupload_required'
          task.retryStage = 'analysis'
          task.sourceRequired = true
          changed = true
        }
        this.tasks.set(task.taskId, task)
        this.idempotency.set(`${task.tenantId}\0${task.sha256}\0${task.workflowVersion}`, task.taskId)
        if (changed) await this.persist(task)
      } catch {
        // 单个损坏快照不应阻止服务启动；文件保留给运维排查，且不会当成有效任务。
      }
    }
  }

  async persist(task) {
    const target = path.join(this.tasksDir, `${task.taskId}.json`)
    const temporary = path.join(this.tasksDir, `.${task.taskId}.${process.pid}.${randomUUID()}.tmp`)
    await writeFile(temporary, `${JSON.stringify(publicTask(task), null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    await rename(temporary, target)
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
    if (existingId) {
      const existing = this.tasks.get(existingId)
      const resumed = existing.sourceRequired === true
      if (resumed) {
        existing._private = { source, userAccessToken }
        Object.assign(existing, {
          status: 'queued', error: null, retryStage: 'analysis', sourceRequired: false,
          progress: { current: 0, total: 4, label: '原文件已重新关联，任务恢复执行' },
          updatedAt: this.now(),
        })
        await this.persist(existing)
        await this.audit('task_source_reattached', existing)
      } else if (existing.status !== 'completed') {
        existing._private.userAccessToken = userAccessToken
      }
      return { task: this.get(existingId), reused: true, resumed }
    }

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
      retryStage: null,
      sourceRequired: false,
      _private: { source, userAccessToken },
    }
    this.tasks.set(task.taskId, task)
    this.idempotency.set(key, task.taskId)
    await this.persist(task)
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
    await this.persist(task)
    await this.audit(event, task, patch.error ? { error: String(patch.error).slice(0, 500) } : {})
    return publicTask(task)
  }
}
