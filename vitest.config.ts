import { defineConfig } from 'vitest/config';

// 独立测试配置：不继承 vite.config.ts 的 dev 插件（frostLlm/frostEdge 等只在 serve/build 用），
// 只跑纯确定性逻辑单测（node 环境，无 DOM）。补上「AI 审 AI 无 ground truth」的短板。
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'frost-agent/**/*.test.ts', 'server/**/*.test.ts'],
    environment: 'node',
  },
});
