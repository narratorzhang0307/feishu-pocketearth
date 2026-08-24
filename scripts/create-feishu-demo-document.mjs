import { readFeishuConfig } from '../server/feishu/config.mjs'
import { createFeishuClient, textBlock } from '../server/feishu/client.mjs'

const config = readFeishuConfig(process.env, process.cwd())
const client = createFeishuClient(config)

const created = await client.createDocument('口袋地球 · 飞书真实链路演示｜百年孤独')
await client.appendDocumentBlocks(created.documentId, [
  textBlock('口袋地球 · 飞书真实链路演示', 3),
  textBlock('阅读记录：《百年孤独》'),
  textBlock('马孔多是《百年孤独》的故事地点。这个虚构小镇承载了布恩迪亚家族的兴衰，也保存着战争、失眠症和反复回返的时间。'),
  textBlock('马孔多的灵感来自哥伦比亚加勒比地区。加西亚·马尔克斯把童年记忆、热带气候、香蕉公司历史与民间传说揉进了这片文学地理。'),
  textBlock('现实中的阿拉卡塔卡位于哥伦比亚马格达莱纳省，是马尔克斯的故乡，也常被读者视作理解马孔多的重要入口。'),
  textBlock('请从以上原文中提取地点，保留逐字可核验的证据，给出现代地名、置信度和建议坐标；人工确认后再进入知识地球并写回飞书。'),
])

process.stdout.write(JSON.stringify(created))
