import { textBlock } from './client.mjs'

const displayCoordinate = (location) => (
  Number.isFinite(location.latitude) && Number.isFinite(location.longitude)
    ? `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`
    : '待补充'
)

export function buildResultCard(task, config, phase = 'review') {
  const count = task.locations?.length || 0
  const mapUrl = `${config.webBaseUrl}/feishu?taskId=${encodeURIComponent(task.taskId)}`
  const completed = phase === 'completed'
  return {
    config: { wide_screen_mode: true },
    header: {
      template: completed ? 'green' : 'turquoise',
      title: { tag: 'plain_text', content: completed ? 'Pocket Earth 已写回飞书' : 'Pocket Earth 等待人工确认' },
    },
    elements: [
      { tag: 'div', text: { tag: 'lark_md', content: `**${task.fileName}**\nQwen 已从真实 OCR 结果中找到 **${count}** 个地点。${completed ? '飞书文档已生成。' : '请核对原文证据和坐标后再写回。'}` } },
      { tag: 'hr' },
      { tag: 'div', text: { tag: 'lark_md', content: `任务 ID：\`${task.taskId}\`\n工作流：${task.workflowVersion}` } },
      { tag: 'action', actions: [{ tag: 'button', type: 'primary', text: { tag: 'plain_text', content: completed ? '查看知识地球' : '打开审核台' }, url: mapUrl }] },
    ],
  }
}

function documentBlocks(task, locations) {
  const blocks = [
    textBlock('Pocket Earth · 飞书地理知识提取报告', 3),
    textBlock(`来源文件：${task.fileName}`),
    textBlock(`任务 ID：${task.taskId}`),
    textBlock(`证据哈希：${task.sha256}`),
    textBlock(`抽取地点：${locations.length} 个`, 4),
  ]
  for (const [index, location] of locations.entries()) {
    blocks.push(
      textBlock(`${index + 1}. ${location.modernName || location.nameAsWritten}`, 4),
      textBlock(`原文名称：${location.nameAsWritten}`),
      textBlock(`页码：第 ${location.page} 页｜置信度：${Math.round(location.confidence * 100)}%｜坐标：${displayCoordinate(location)}`),
      textBlock(`原文证据：${location.evidence}`),
      textBlock(`说明：${location.description || '—'}`),
    )
  }
  return blocks
}

export function createFeishuWriteback({ client, config }) {
  return {
    async notifyReview(task) {
      return client.sendInteractiveCard(task.openId, buildResultCard(task, config, 'review'))
    },

    async write(task, locations) {
      const document = await client.createDocument(
        `Pocket Earth｜${task.fileName}｜${new Date(task.createdAt).toLocaleDateString('zh-CN')}`,
        task._private?.userAccessToken || '',
      )
      await client.appendDocumentBlocks(document.documentId, documentBlocks(task, locations), task._private?.userAccessToken || '')
      const bitable = await client.createBitableRecords(locations.map((location) => ({
        '任务 ID': task.taskId,
        '来源文件': task.fileName,
        '原文地点': location.nameAsWritten,
        '现代地名': location.modernName,
        '页码': location.page,
        '原文证据': location.evidence,
        '纬度': location.latitude,
        '经度': location.longitude,
        '置信度': location.confidence,
        '审核状态': location.reviewStatus,
      })))
      const outputs = { document, bitable, notification: null }
      try {
        outputs.notification = await client.sendInteractiveCard(task.openId, buildResultCard({ ...task, locations, outputs }, config, 'completed'))
      } catch (error) {
        // 文档与表格已经成功写入时，消息通知失败不能把核心成果回滚成“失败”。
        // 错误仍随任务结果返回，运维可据此单独补发卡片。
        outputs.notification = { skipped: true, reason: String(error?.message || error).slice(0, 500) }
      }
      return outputs
    },
  }
}
