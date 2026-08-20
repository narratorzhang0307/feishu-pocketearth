// Frost Harness · 领域数据入口
// 真实城市/曲目库由 data/radio 从当前装备的 pocket.music/v1 Data Pack 加载。
// 这里统一再导出，保持各内部处理器 / validator / llmRoute 的旧 import 路径不变。
// 未安装音乐数据包时 RADIO_CITIES 为空数组，agent 自动走规则 fallback。
export * from '../data/radio';
