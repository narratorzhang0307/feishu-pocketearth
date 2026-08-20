import { useEffect, useMemo, useReducer } from 'react';
import AgentTabsPage from './AgentTabsPage';
import MoviesRunPage from './MoviesRunPage';
import { movieRecords, movieTotal, ensureMovieData, subscribeMovieData } from '../data/movies';
import { seenBefore } from '../lib/movie';

// 观影 agent：左「片库·我的观影」(电影票根) + 右「对话·观影」(懂你豆瓣口味的观影 agent)。

export default function MoviesAgentPage({ onBack }: { onBack: () => void }) {
  const [dataVersion, render] = useReducer((value) => value + 1, 0);
  useEffect(() => {
    const unsubscribe = subscribeMovieData(render);
    void ensureMovieData().catch(() => {});
    return unsubscribe;
  }, []);
  const movieContext = useMemo(() => {
    const countryCount: Record<string, number> = {};
    for (const movie of movieRecords) if (movie.country) countryCount[movie.country] = (countryCount[movie.country] || 0) + 1;
    const topCountries = Object.entries(countryCount).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([country, count]) => `${country}(${count})`).join('、');
    const topRated = [...movieRecords]
      .filter((movie) => movie.rating != null)
      .sort((a, b) => (b.rating! - a.rating!) || (b.date || '').localeCompare(a.date || ''))
      .slice(0, 20)
      .map((movie) => `《${movie.title}》${movie.director || ''}${movie.year ? '·' + movie.year : ''}·${movie.rating}★`)
      .join('；');
    return `当前电影 Data Pack 有 ${movieTotal} 部电影。常看 ${topCountries || '尚未形成国别偏好'}。\n口味样本：${topRated || '暂无'}\n推荐时排除已看记录，并优先匹配当前数据包体现出的口味。`;
  }, [dataVersion]);
  return (
    <AgentTabsPage
      onBack={onBack}
      title="MOVIES-SKILL"
      leftLabel="片库"
      rightLabel="Frost_Movie"
      left={<MoviesRunPage onBack={onBack} embedded />}
      chat={{
        accent: '#ffb000',
        persona: '你是 Frost Agent 已装备的「观影」Skill，熟悉影史、能读懂当前 Data Pack 呈现的观影口味，据此推荐与讨论电影。',
        context: () => movieContext,
        placeholder: '聊电影 / 想看什么…',
        suggestions: ['根据我的口味推荐三部', '我看过的高分片里最像《路边野餐》的', '推荐周末适合看的'],
        intentLabels: ['推荐', '讨论', '找片', '其他'],
        checkSeen: (t) => { const r = seenBefore(t); return r ? (r.date ? r.date.slice(0, 4) + ' 看过' : '看过') : null; },
      }}
    />
  );
}
