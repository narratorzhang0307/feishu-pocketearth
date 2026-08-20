// 票务/住宿：带真实线路与日期的深链（「永不 404 的兜底层」）。红线：只跳查询页，绝不代订/代付。
// 三个模板均已实测可达（2026-07-05 curl 200/202）：携程机票城市三字码 / 携程火车票中文站名 / Booking 城市名+日期。
// 真 API（12306 余票 / Amadeus 参考价）属下一层增强，可用性以深链兜底为前提再叠加。
const CITY_CODE: Record<string, string> = {
  北京: 'bjs', 上海: 'sha', 广州: 'can', 深圳: 'szx', 杭州: 'hgh', 成都: 'ctu', 西安: 'sia', 重庆: 'ckg',
  昆明: 'kmg', 南京: 'nkg', 武汉: 'wuh', 长沙: 'csx', 厦门: 'xmn', 青岛: 'tao', 大连: 'dlc', 三亚: 'syx',
  香港: 'hkg', 澳门: 'mfm', 台北: 'tpe',
  东京: 'tyo', 大阪: 'osa', 京都: 'osa', 首尔: 'sel', 曼谷: 'bkk', 新加坡: 'sin', 吉隆坡: 'kul',
  巴黎: 'par', 伦敦: 'lon', 罗马: 'rom', 巴塞罗那: 'bcn', 阿姆斯特丹: 'ams', 布拉格: 'prg', 维也纳: 'vie',
  威尼斯: 'vce', 雅典: 'ath', 伊斯坦布尔: 'ist', 迪拜: 'dxb', 开罗: 'cai',
  纽约: 'nyc', 旧金山: 'sfo', 悉尼: 'syd', 里约热内卢: 'rio',
};

export function cityCode(city: string): string | null {
  return CITY_CODE[(city || '').trim()] || null;
}

// 机票：两端都有城市码 → 携程精确航线页（exact）；否则退到 Trip.com 机票首页（仍可手动搜）
export function flightLink(from: string, to: string, date: string): { url: string; exact: boolean } {
  const f = cityCode(from), t = cityCode(to);
  if (f && t && date) return { url: `https://flights.ctrip.com/online/list/oneway-${f}-${t}?depdate=${date}`, exact: true };
  return { url: 'https://www.trip.com/flights/', exact: false };
}

// 火车票：携程火车票 H5 接受中文站名直传（大陆铁路）
export function trainLink(from: string, to: string, date: string): string {
  const qs = new URLSearchParams({ dStation: (from || '').trim(), aStation: (to || '').trim(), dDate: date, ticketType: '0' });
  return `https://trains.ctrip.com/webapp/train/list?${qs.toString()}`;
}

// 酒店：Booking 城市名+入住/退房（国际通用；大陆访问偶有波动，仍是免 key 里最稳的模板）
export function hotelLink(city: string, checkin: string, checkout: string): string {
  const qs = new URLSearchParams({ ss: (city || '').trim(), checkin, checkout, group_adults: '2' });
  return `https://www.booking.com/searchresults.zh-cn.html?${qs.toString()}`;
}

// YYYY-MM-DD + n 天（UTC 算术，避开时区回拨）
export function addDays(date: string, n: number): string {
  const t = new Date(`${date}T00:00:00Z`);
  if (isNaN(+t)) return date;
  return new Date(+t + n * 86400e3).toISOString().slice(0, 10);
}

// 12306 座席摘要：只报「有戏」的席别（有/数字），全无票时如实说「无票/候补」。顺序=大众常买优先。
const SEAT_ORDER = ['二等', '一等', '硬卧', '软卧', '硬座', '商务', '无座'];
export function seatSummary(seats: Record<string, string>): string {
  const avail = SEAT_ORDER.filter((k) => seats[k] && seats[k] !== '无').map((k) => `${k}${seats[k] === '有' ? '·有' : ' ' + seats[k]}`);
  return avail.length ? avail.slice(0, 3).join(' · ') : '无票/候补';
}
