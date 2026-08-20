// 日落巡游导演 · 纯时间逻辑（无 LLM、无后端）
// 算此刻哪座城最临近日落、接下来日落的城市顺序、切城建议。
import { RADIO_CITIES, RadioCity } from '../../harness/domain';
import { AgentResult } from '../../harness/types';

const SUNSET_MIN = 18 * 60 + 30; // 当地 18:30 视为日落

/** 某城当前的当地分钟数 0..1439（IANA 优先，退化到固定偏移）。 */
function localMinutes(city: RadioCity, now: Date): number {
  if (city.ianaTz) {
    try {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: city.ianaTz, hour: '2-digit', minute: '2-digit', hour12: false,
      }).formatToParts(now);
      const h = parseInt(parts.find((p) => p.type === 'hour')!.value, 10);
      const m = parseInt(parts.find((p) => p.type === 'minute')!.value, 10);
      return h * 60 + m;
    } catch { /* fall through */ }
  }
  const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  return ((utcMin + city.tzOffset * 60) % 1440 + 1440) % 1440;
}

const forwardTo = (from: number, to: number) => ((to - from) % 1440 + 1440) % 1440;
const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m) % 60).padStart(2, '0')}`;

export interface SunsetPick {
  slug: string;
  cityNameZh: string;
  cityName: string;
  localTime: string;        // hh:mm 当地
  minutesToSunset: number;  // 距当地 18:30 还有多少分钟（环形，向前）
}

function toPick(city: RadioCity, now: Date): SunsetPick {
  const lm = localMinutes(city, now);
  return { slug: city.slug, cityNameZh: city.cityNameZh, cityName: city.cityName, localTime: fmt(lm), minutesToSunset: forwardTo(lm, SUNSET_MIN) };
}

/** 接下来日落的城市顺序（谁先到 18:30 谁在前）。 */
export function sunsetTour(cities: RadioCity[], now: Date): SunsetPick[] {
  return cities.map((c) => toPick(c, now)).sort((a, b) => a.minutesToSunset - b.minutesToSunset);
}

/** 运行时入口：用 Frost 声音播报当前该巡游到哪座城，并给出切城建议。 */
export function runTourDirector(now: Date = new Date()): AgentResult<{ tour: SunsetPick[] }> {
  const tour = sunsetTour(RADIO_CITIES, now);
  const head = tour[0];
  const reply = head
    ? `此刻最临近日落的是${head.cityNameZh}，当地 ${head.localTime}。要不要我把电台调过去？`
    : '今夜还没有城市临近日落。';
  return {
    agent: 'tour-director',
    reply,
    data: { tour },
    radioActions: head ? [{ type: 'switch_city', slug: head.slug }] : [],
  };
}
