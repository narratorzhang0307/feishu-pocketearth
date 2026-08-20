function reviewedLocations(input, current) {
  if (!Array.isArray(input) || input.length !== current.length) throw new Error('review_locations_incomplete')
  const byId = new Map(current.map((item) => [item.id, item]))
  return input.map((candidate) => {
    const original = byId.get(String(candidate?.id || ''))
    if (!original) throw new Error('review_location_id_invalid')
    const latitude = candidate.latitude === '' || candidate.latitude === null ? null : Number(candidate.latitude)
    const longitude = candidate.longitude === '' || candidate.longitude === null ? null : Number(candidate.longitude)
    if (latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) throw new Error('review_latitude_invalid')
    if (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) throw new Error('review_longitude_invalid')
    return {
      ...original,
      modernName: String(candidate.modernName || original.modernName).trim().slice(0, 300),
      description: String(candidate.description ?? original.description).trim().slice(0, 2000),
      latitude,
      longitude,
      reviewStatus: candidate.approved === false ? 'rejected' : 'approved',
    }
  }).filter((item) => item.reviewStatus === 'approved')
}

export function createFeishuWorkflow({ store, ocr, extractor, writeback }) {
  const safeReviewNotification = async (task) => {
    try { await writeback.notifyReview(task) } catch (error) {
      await store.audit('review_card_failed', task, { error: String(error).slice(0, 500) })
    }
  }

  async function run(taskId) {
    const task = store.getInternal(taskId)
    if (!task || !['queued', 'failed'].includes(task.status)) return
    if (!task._private?.source) {
      await store.update(taskId, {
        status: 'failed', error: 'source_reupload_required', retryStage: 'analysis', sourceRequired: true,
        progress: { current: 0, total: 4, label: '请重新上传原文件以恢复任务' },
      }, 'task_source_required')
      return
    }
    try {
      await store.update(taskId, {
        status: 'ocr_running', attempt: task.attempt + 1,
        progress: { current: 1, total: 4, label: '飞书任务已触发 PaddleOCR / PP-Structure' },
        error: null, retryStage: 'analysis', sourceRequired: false,
      }, 'ocr_started')
      const ocrResult = await ocr.recognize(task._private.source)
      await store.update(taskId, {
        status: 'qwen_running', ocr: { engine: ocrResult.engine, pages: ocrResult.pages.map((page) => ({ page: page.page, confidence: page.confidence, textLength: page.text.length })) },
        progress: { current: 2, total: 4, label: 'Qwen 正在提取地点并核对页码证据' },
      }, 'qwen_started')
      const extracted = await extractor.extract(ocrResult.pages)
      // 原始 Base64 只服务于 OCR。抽取完成后立即从内存释放，审核与写回只保留证据文本。
      const privateData = store.getInternal(taskId)?._private
      if (privateData) privateData.source = null
      const updated = await store.update(taskId, {
        status: 'awaiting_review', locations: extracted.locations,
        inference: { model: extracted.model, grounded: true },
        progress: { current: 3, total: 4, label: '等待飞书用户确认原文证据与坐标' },
      }, 'review_requested')
      await safeReviewNotification(store.getInternal(updated.taskId))
    } catch (error) {
      await store.update(taskId, {
        status: 'failed', error: String(error?.message || error).slice(0, 1000), retryStage: 'analysis', sourceRequired: false,
        progress: { current: 0, total: 4, label: '工作流失败，可修正配置后重试' },
      }, 'task_failed')
    }
  }

  async function createTask(input) {
    const created = await store.create(input)
    if (!created.reused || created.resumed) queueMicrotask(() => { void run(created.task.taskId) })
    return created
  }

  async function confirmAndWrite(taskId, inputLocations) {
    const task = store.getInternal(taskId)
    if (!task) throw new Error('task_not_found')
    if (task.status !== 'awaiting_review') throw new Error('task_not_awaiting_review')
    const locations = reviewedLocations(inputLocations, task.locations)
    if (!locations.length) throw new Error('no_approved_locations')
    await store.update(taskId, {
      status: 'writing_back', locations,
      retryStage: 'writeback', sourceRequired: false,
      progress: { current: 4, total: 4, label: '正在写入飞书文档、多维表格和消息卡片' },
    }, 'writeback_started')
    try {
      const outputs = await writeback.write(store.getInternal(taskId), locations, async (checkpoint) => {
        await store.update(taskId, { outputs: structuredClone(checkpoint) }, 'writeback_checkpoint')
      })
      const privateData = store.getInternal(taskId)?._private
      if (privateData) privateData.userAccessToken = ''
      return await store.update(taskId, {
        status: 'completed', outputs, retryStage: null, sourceRequired: false,
        progress: { current: 4, total: 4, label: '飞书闭环已完成' },
      }, 'task_completed')
    } catch (error) {
      await store.update(taskId, {
        status: 'failed', error: String(error?.message || error).slice(0, 1000), retryStage: 'writeback', sourceRequired: false,
        progress: { current: 3, total: 4, label: '飞书写回失败，可重试' },
      }, 'writeback_failed')
      throw error
    }
  }

  async function retry(taskId) {
    const task = store.getInternal(taskId)
    if (!task) throw new Error('task_not_found')
    if (task.status !== 'failed') throw new Error('task_not_failed')
    if (task.retryStage === 'writeback') {
      return store.update(taskId, {
        status: 'awaiting_review', error: null, sourceRequired: false,
        progress: { current: 3, total: 4, label: '请再次确认后继续飞书写回' },
      }, 'writeback_reopened')
    }
    if (!task._private?.source) throw new Error('source_reupload_required')
    await store.update(taskId, { status: 'queued', error: null }, 'task_requeued')
    queueMicrotask(() => { void run(taskId) })
    return store.get(taskId)
  }

  return { createTask, run, confirmAndWrite, retry }
}

export { reviewedLocations }
