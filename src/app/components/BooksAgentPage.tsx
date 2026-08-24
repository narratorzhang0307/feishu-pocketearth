import { useEffect, useReducer } from 'react';
import AgentTabsPage from './AgentTabsPage';
import BooksRunPage from './BooksRunPage';
import { bookTotal, ensureBookData, subscribeBookData } from '../data/books';
import { seenBefore } from '../lib/book';
import { getUserMarksByKind } from '../data/userMarks';
import { useFrostTaskHandoff } from './FrostTaskHandoffFrame';
import { frostSubmissionFromText } from '../feishu/frostSubmission';

// 读书 agent：左「书架·我的书」(藏书票名录) + 右「对话·读书」。
// 推荐去重：已读全集(douban 1000+ 本)当「排除集 + 口味源」、不当推荐池——
// context 只声明已读规模（不再喂具体书名种子诱导复述），口味画像由记忆中枢(memoryRouter)注入；
// checkSeen 做确定性兜底，把云脑误推的已读书当场标出来。

export default function BooksAgentPage({ onBack }: { onBack: () => void }) {
  const handoffObjective = useFrostTaskHandoff()?.objective || '';
  const [, render] = useReducer((value) => value + 1, 0);
  useEffect(() => {
    const unsubscribe = subscribeBookData(render);
    void ensureBookData().catch(() => {});
    return unsubscribe;
  }, []);
  return (
    <AgentTabsPage
      onBack={onBack}
      title="BOOKS-SKILL"
      leftLabel="书架"
      rightLabel="Frost_Book"
      left={<BooksRunPage onBack={onBack} embedded />}
      chat={{
        accent: '#b388ff',
        persona: '你是 Frost Agent 已装备的「读书」Skill，懂文学、了解当前 Data Pack 中的读书口味，按口味推荐用户没读过的好书、把读过的书串成主题、聊作者与故事之地。',
        context: () => {
          const user = getUserMarksByKind('book').map((m) => `《${m.label}》`).join('、');
          return `我读过 ${bookTotal} 本书（覆盖很广，名著经典多半读过了）。${user ? `最近记录：${user}。` : ''}\n要推荐就只推我大概率没读过的冷门 / 小众，别推名著——我多半读过了。`;
        },
        placeholder: '聊聊书 / 想读什么…',
        initialInput: handoffObjective,
        suggestions: ['推荐三本我没读过但对味的', '我读过的书里哪些讲孤独？', '推荐适合雨夜读的冷门书'],
        intentLabels: ['推荐', '讨论', '找书', '其他'],
        checkSeen: (t) => { const r = seenBefore(t); return r ? (r.date ? r.date.slice(0, 4) + ' 读过' : '读过') : null; },
        feishuSubmission: typeof window !== 'undefined' && window.location.pathname.startsWith('/feishu')
          ? { createDraft: (text) => frostSubmissionFromText('books', text) }
          : undefined,
      }}
    />
  );
}
