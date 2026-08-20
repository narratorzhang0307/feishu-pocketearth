// 天气展示层：WMO weather_code → 中文/emoji，行程卡每天一句真实天气 + 雨天建议。
// 数据来自 Open-Meteo（经 /api/travel-mcp 代理，CC-BY 4.0），纯映射无副作用，node 可测。
export interface DailyWeather { date: string; code: number; tmax: number; tmin: number; rain: number }

const WMO: [number[], string, string][] = [
  [[0], '晴', '☀️'],
  [[1, 2], '多云', '⛅'],
  [[3], '阴', '☁️'],
  [[45, 48], '雾', '🌫️'],
  [[51, 53, 55, 56, 57], '毛毛雨', '🌦️'],
  [[61, 63, 65, 66, 67], '雨', '🌧️'],
  [[71, 73, 75, 77, 85, 86], '雪', '🌨️'],
  [[80, 81, 82], '阵雨', '🌦️'],
  [[95, 96, 99], '雷暴', '⛈️'],
];

export function wmoText(code: number): { label: string; emoji: string } {
  for (const [codes, label, emoji] of WMO) if (codes.includes(code)) return { label, emoji };
  return { label: '未知', emoji: '🌡️' };
}

export function weatherLine(d: DailyWeather): string {
  const { label, emoji } = wmoText(d.code);
  const range = isFinite(d.tmin) && isFinite(d.tmax) ? ` ${Math.round(d.tmin)}~${Math.round(d.tmax)}°C` : '';
  const rain = isFinite(d.rain) && d.rain >= 30 ? ` · 降水 ${Math.round(d.rain)}%` : '';
  return `${emoji} ${label}${range}${rain}`;
}

// 任一天降水概率 ≥60% → 给一句可执行的建议（哪天、备伞、室内景点前置）
export function rainAdvice(list: DailyWeather[]): string | null {
  const wet = list.map((d, i) => ({ d, i })).filter((x) => isFinite(x.d.rain) && x.d.rain >= 60);
  if (!wet.length) return null;
  const days = wet.map((x) => `第${x.i + 1}天`).join('、');
  return `${days}降水概率高（${wet.map((x) => Math.round(x.d.rain) + '%').join('、')}），备伞；博物馆/美术馆类排到那天更稳。`;
}
