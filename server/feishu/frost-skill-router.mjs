const FEISHU_SKILL_ADAPTERS = Object.freeze([
  Object.freeze({
    id: 'pocket.book-to-earth',
    name: 'Book-to-Earth',
    target: 'agent-forge',
    description: '识读飞书中的书籍和资料，保留原文证据，经人工确址后生成知识地球 Mapping。',
    outputSchema: 'pocket.mapping/v1',
    adapterVersion: 'feishu-docx-v1',
    requiresConfirmation: true,
  }),
])

export function listFeishuSkillAdapters() {
  return FEISHU_SKILL_ADAPTERS.map((skill) => ({ ...skill }))
}

/**
 * 飞书只是输入/输出适配器；Frost 仍负责把任务交给已登记的 Pocket Earth Skill。
 * 首个垂直切片只开放 Book-to-Earth，后续 Skill 必须先声明自己的输入与输出适配契约。
 */
export function planFeishuSkillTask({ requestedSkillId = '', objective = '' } = {}) {
  const skillId = String(requestedSkillId || FEISHU_SKILL_ADAPTERS[0].id).trim()
  const skill = FEISHU_SKILL_ADAPTERS.find((candidate) => candidate.id === skillId)
  if (!skill) throw new Error('feishu_skill_not_supported')
  return {
    engine: 'frost',
    mode: 'single',
    source: requestedSkillId ? 'explicit' : 'local-rule',
    summary: `Frost 将飞书文档交给 ${skill.name} Skill。`,
    objective: String(objective || '从飞书文档原文提取有证据的地点，经用户确认后写入 Pocket Earth 并回写飞书').trim().slice(0, 240),
    skillId: skill.id,
    skillName: skill.name,
    target: skill.target,
    outputSchema: skill.outputSchema,
    adapterVersion: skill.adapterVersion,
    requiresConfirmation: skill.requiresConfirmation,
  }
}

export function extractionPromptForSkill(orchestration) {
  if (orchestration?.skillId !== 'pocket.book-to-earth') return null
  return {
    system: '你正在执行 Frost 已路由的 Pocket Earth「Book-to-Earth」Skill。任务是把书籍或资料中的地点转换为 pocket.mapping/v1 候选点。必须保留可逐字核验的原文证据；不确定的坐标填 null；用户确认前不得写入地球或飞书。只输出 JSON。',
    instruction: '从下列飞书文档原文抽取对理解书籍或资料有意义的地点。confidence 必须根据原文明确程度填写 0 到 1 之间的真实判断值，禁止照抄示例占位值；能够可靠对应到现实地点时填写其现代坐标，虚构地点或无法可靠确址时经纬度填 null。返回 {"locations":[{"nameAsWritten":"原文地点名","modernName":"现代规范名","description":"该地点与材料的关系","page":1,"evidence":"页面中的连续原文证据","latitude":10.5918,"longitude":-74.1898,"confidence":0.95}]}。没有地点则返回 {"locations":[]}。',
  }
}
