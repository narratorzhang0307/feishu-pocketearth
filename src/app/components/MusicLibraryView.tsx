import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Play, Pause, ChevronDown, Music2, Maximize2, MapPin } from 'lucide-react';
import { ensureMusicCatalog, groupSongs, songs, songTotal, subscribeMusicCatalog, GROUP_LABELS, type GroupKey, type Song } from '../data/musicCatalog';
import { RADIO_CITIES, resolveTracksByIds, type ResolvedTrack } from '../../../frost-agent/data/radio';
import { addUserMark, getUserMarksByKind, spreadCoord } from '../data/userMarks';
import { recordSignals } from '../../../frost-agent/harness/profile';
import { recordPlay } from '../lib/music/plays';
import { RadioStage } from './radio/RadioStage';
import DataPackManager from './DataPackManager';
import YouTubePlaybackFrame from './music/YouTubePlaybackFrame';
import { canPlayMusicSource, directAudioUrl, musicSourceLabel, youtubeVideoId } from '../lib/music/playback';
import { requestMapFocus } from '../data/mapFocus';

// 音乐 Skill 的「曲库」视图：数据包声明 OSS/外部直链时用 audio，声明 YouTube 时用官方嵌入播放。
// 音源失效时明确报错，绝不替换成与曲目无关的演示音频。

const slug = (s: string) => (s || '').replace(/[\s·\-—:：,，.。!！?？'"'']/g, '').slice(0, 16);

export default function MusicLibraryView() {
  const [, refreshCatalog] = useReducer((value) => value + 1, 0);
  const [by, setBy] = useState<GroupKey>('region');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [curId, setCurId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [stageTrackId, setStageTrackId] = useState<string | null>(null); // 进入沉浸式电台（音乐形态）
  const audioRef = useRef<HTMLAudioElement>(null);
  const playingRef = useRef(false);
  useEffect(() => { playingRef.current = playing; }, [playing]);
  useEffect(() => {
    void ensureMusicCatalog();
    return subscribeMusicCatalog(refreshCatalog);
  }, []);

  const groups = useMemo(() => groupSongs(by), [by, songTotal]);
  const artistFlat = useMemo(() => [...songs].sort((a, b) => a.artist.localeCompare(b.artist, 'zh') || a.title.localeCompare(b.title, 'zh')), [songTotal]);
  const recentFeishuSongs = useMemo(
    () => songs.filter((song) => song.id.includes(':feishu-ai:')).slice(-3).reverse(),
    [songTotal],
  );

  // 切分组维度时，默认展开第一组
  useEffect(() => { setOpen(new Set(groups[0] ? [groups[0].key] : [])); }, [by, groups]);

  const cur = useMemo(() => (curId ? resolveTracksByIds([curId])[0] : null) as ResolvedTrack | undefined, [curId, songTotal]);

  // 切歌：只把 OSS/外部音频直链交给 audio；YouTube 由下方 iframe 播放。
  useEffect(() => {
    const a = audioRef.current;
    if (!a || !cur) return;
    const directUrl = directAudioUrl(cur.playback);
    setSourceError(null);
    a.pause();
    a.removeAttribute('src');
    if (!directUrl) {
      a.load();
      if (!youtubeVideoId(cur.playback)) {
        setSourceError('音源不可用');
        setPlaying(false);
      }
      return;
    }
    a.src = directUrl;
    a.load();
    const fail = () => {
      setSourceError('原曲音源暂不可用');
      setPlaying(false);
    };
    if (playingRef.current) a.play().catch(fail);
    a.addEventListener('error', fail);
    const t = window.setTimeout(() => { if (a.readyState < 2) fail(); }, 7000);
    return () => { window.clearTimeout(t); a.removeEventListener('error', fail); };
  }, [curId, cur]);
  useEffect(() => {
    const a = audioRef.current;
    if (!a || !cur || youtubeVideoId(cur.playback)) return;
    if (playing) a.play().catch(() => { setSourceError('原曲音源暂不可用'); setPlaying(false); });
    else a.pause();
  }, [playing, cur]);

  const [pinMsg, setPinMsg] = useState<string | null>(null);

  const playSong = (id: string) => {
    if (id === curId) { setPlaying((p) => !p); return; }
    const resolved = resolveTracksByIds([id])[0];
    setCurId(id);
    setPlaying(canPlayMusicSource(resolved?.playback));
    setSourceError(canPlayMusicSource(resolved?.playback) ? null : '这条数据没有可用的原曲来源');
    const s = songs.find((x) => x.id === id);   // 记一次收听 → 听歌记忆库 + 回流口味画像（含 genre/city）
    if (s) {
      recordPlay({ id: s.id, title: s.title, artist: s.artist, genre: s.genre, city: s.city });
      const city = RADIO_CITIES.find((item) => item.cityNameZh === s.city || item.cityName === s.city);
      if (Number.isFinite(city?.lng) && Number.isFinite(city?.lat)) requestMapFocus(city!.lng!, city!.lat!, 7.8);
    }
  };

  // 把当前歌曲钉到它所属城市（稳定 id 幂等去重 + 喂长期画像）。城市无坐标则提示。
  const pinTrack = () => {
    if (!cur) return;
    const city = RADIO_CITIES.find((item) => item.cityNameZh === cur.cityNameZh);
    const ll = Number.isFinite(city?.lat) && Number.isFinite(city?.lng) ? [city!.lng as number, city!.lat as number] as [number, number] : undefined;
    if (!ll) { setPinMsg('这首歌的城市暂无坐标'); window.setTimeout(() => setPinMsg(null), 1800); return; }
    const id = `umu-${slug(cur.artist)}-${slug(cur.title)}`;
    if (getUserMarksByKind('music').some((m) => m.id === id)) { setPinMsg(`已在地球上 · ${cur.cityNameZh}`); window.setTimeout(() => setPinMsg(null), 1800); return; }
    const [lng, lat] = spreadCoord(id, ll[0], ll[1], 0.6);
    addUserMark({ id, kind: 'music', lng, lat, label: cur.title, meta: { track: cur.title, artist: cur.artist, city: cur.cityNameZh } });
    recordSignals('music', { cities: [cur.cityNameZh || ''], artists: [cur.artist] });
    setPinMsg(`已钉到地球 · ${cur.cityNameZh}`); window.setTimeout(() => setPinMsg(null), 1800);
  };
  const toggle = (k: string) => setOpen((prev) => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const Row = (s: Song, showArtistFirst = false) => {
    const active = s.id === curId;
    return (
      <button key={s.id} onClick={() => playSong(s.id)}
        className={`w-full text-left flex items-center gap-2.5 px-2.5 py-2 border-b border-black/10 transition-colors ${active ? 'bg-[#00ff88]/15' : 'hover:bg-[#00ff88]/8 active:bg-[#00ff88]/20'}`}>
        <div className="w-7 h-7 shrink-0 bg-black flex items-center justify-center border border-black shadow-[1px_1px_0_#00ff88]">
          {active && playing ? <Pause className="w-3.5 h-3.5 text-[#00ff88]" fill="currentColor" strokeWidth={0} /> : <Play className="w-3.5 h-3.5 text-[#00ff88] ml-0.5" fill="currentColor" strokeWidth={0} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-bold truncate leading-tight">{showArtistFirst ? s.artist : s.title}</div>
          <div className="text-[10px] text-black/50 truncate">{showArtistFirst ? s.title : s.artist}</div>
        </div>
        <div className="shrink-0 flex items-center gap-1">
          <span className="font-pixel text-[6px] text-black/40 border border-black/20 px-1 py-0.5">{s.genre}</span>
          <span className="font-pixel text-[6px] text-black/35 w-12 text-right truncate">{s.city}</span>
        </div>
      </button>
    );
  };

  return (
    <div className="min-h-full bg-[#EAEAEA] relative">
      <div className="px-3 py-2.5 border-b-2 border-black bg-[#F5F2E9] text-[#168654] shrink-0">
        <div className="font-pixel text-[7px] flex justify-between items-center tracking-wider">
          <span>知识条目 {RADIO_CITIES.length}</span><span className="text-black/20">|</span>
          <span>曲目 {songTotal}</span><span className="text-black/20">|</span>
          <span>Skill 可换数据</span>
        </div>
        <div className="mt-2">
          <DataPackManager domain="music" accent="#7CFF6B" compactLabel="音乐数据包" mapPlacementCount={songTotal} />
        </div>
      </div>
      {/* 分组维度切换 */}
      <div className="px-3 py-2 border-b-2 border-black bg-white shrink-0 flex items-center gap-2">
        <Music2 className="w-3.5 h-3.5 text-black/45 shrink-0" strokeWidth={2.5} />
        <div className="flex border-2 border-black bg-[#EAEAEA] p-0.5 flex-1">
          {GROUP_LABELS.map((g) => (
            <button key={g.key} onClick={() => setBy(g.key)}
              className={`flex-1 py-1 text-[10px] font-bold ${by === g.key ? 'bg-black text-[#7CFF6B]' : 'text-black hover:bg-black/5'}`}>{g.label}</button>
          ))}
        </div>
        <span className="font-pixel text-[7px] text-black/40 shrink-0">{songTotal}</span>
      </div>

      {/* 列表 */}
      <div>
        {recentFeishuSongs.length > 0 && (
          <div className="border-b-2 border-black bg-[#F5F2E9]">
            <div className="px-3 pt-2 font-pixel text-[8px] tracking-wider text-[#168654]">飞书确认音乐标记</div>
            <div className="mt-1 border-t border-black/15 bg-white">{recentFeishuSongs.map((song) => Row(song))}</div>
            <div className="px-3 py-1.5 text-[9px] text-black/45">点击条目会播放原曲并定位到中间地球的对应城市。</div>
          </div>
        )}
        {songTotal === 0 ? (
          <div className="m-3 border-2 border-black bg-white px-4 py-5 text-center shadow-[2px_2px_0_rgba(0,0,0,0.85)]">
            <div className="text-[12px] font-bold">示例音乐库已卸载</div>
            <div className="mt-1 text-[10px] leading-relaxed text-black/45">点击上方“加载示例库”，城市与曲目会重新出现；音乐 Skill 仍然可以使用。</div>
          </div>
        ) : by === 'artist' ? (
          <div className="bg-white">{artistFlat.map((s) => Row(s, true))}</div>
        ) : (
          groups.map((grp) => {
            const isOpen = open.has(grp.key);
            return (
              <div key={grp.key} className="border-b-2 border-black/15">
                <button onClick={() => toggle(grp.key)} className="w-full flex items-center gap-2 px-3 py-2 bg-white active:bg-black/5">
                  <div className="w-2.5 h-2.5 bg-[#00ff88] border border-black shrink-0" />
                  <span className="font-pixel text-[10px] tracking-wide flex-1 text-left truncate">{grp.key}</span>
                  <span className="font-pixel text-[7px] text-black/40">{grp.songs.length}</span>
                  <ChevronDown className={`w-3.5 h-3.5 text-black/50 transition-transform ${isOpen ? 'rotate-180' : ''}`} strokeWidth={2.5} />
                </button>
                {isOpen && <div className="bg-white">{grp.songs.map((s) => Row(s))}</div>}
              </div>
            );
          })
        )}
        <div className="text-center text-[8px] font-pixel text-black/30 py-3 tracking-widest">{songTotal} 首 · 按 {GROUP_LABELS.find((g) => g.key === by)?.label} 归类 · 点条目播放</div>
      </div>

      {/* 迷你播放条 */}
      {cur && (
        <div className="border-t-2 border-black bg-black text-[#7CFF6B] shrink-0">
          {youtubeVideoId(cur.playback) && (
            <YouTubePlaybackFrame playback={cur.playback} playing={playing} title={cur.title} className="h-36 w-full border-b border-[#7CFF6B]/35" />
          )}
          <div className="px-3 py-2 flex items-center gap-2.5">
          <div className="w-9 h-9 shrink-0 border border-[#7CFF6B]/50 bg-[#0a0a0a] overflow-hidden">{cur.cover && <img src={cur.cover} alt="" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.opacity = '0'; }} />}</div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] text-white truncate">{cur.title}<span className="text-white/45"> · {cur.artist}</span></div>
            <div className={`font-pixel text-[6px] tracking-wider truncate mt-0.5 ${sourceError ? 'text-[#ff8a76]' : 'text-[#7CFF6B]/70'}`}>{sourceError || `${cur.cityNameZh} · ${musicSourceLabel(cur.playback)}`}</div>
          </div>
          <button onClick={() => setPlaying((p) => !p)} disabled={!canPlayMusicSource(cur.playback)} className="w-9 h-9 border-2 border-[#7CFF6B] flex items-center justify-center active:scale-95 disabled:opacity-30">{playing ? <Pause className="w-4 h-4" fill="currentColor" strokeWidth={0} /> : <Play className="w-4 h-4 ml-0.5" fill="currentColor" strokeWidth={0} />}</button>
          {/* 把这首歌钉到它的城市（让地球长出「我的音乐」点） */}
          <button onClick={pinTrack} title="把这首歌钉到地球" className="w-9 h-9 border-2 border-[#7CFF6B] flex items-center justify-center active:scale-95"><MapPin className="w-4 h-4" strokeWidth={2.5} /></button>
          {/* 进入沉浸式电台（城市封面 + DJ 开关 + 与 frost 对话） */}
          <button onClick={() => { setPlaying(false); setStageTrackId(curId); }} title="进入电台（沉浸播放）" className="w-9 h-9 border-2 border-[#7CFF6B] flex items-center justify-center active:scale-95"><Maximize2 className="w-4 h-4" strokeWidth={2.5} /></button>
          </div>
        </div>
      )}
      {pinMsg && <div className="absolute left-1/2 -translate-x-1/2 bottom-20 z-50 border-2 border-black bg-black text-[#7CFF6B] text-[11px] px-3 py-1.5 shadow-[2px_2px_0_#000]">{pinMsg}</div>}
      <audio ref={audioRef} onEnded={() => setPlaying(false)} />

      {/* 沉浸式电台播放台（音乐形态进入；可切 DJ 开/关、音乐/播客） */}
      <RadioStage isOpen={!!stageTrackId} onClose={() => setStageTrackId(null)} startTrackId={stageTrackId ?? undefined} startMode="music" />
    </div>
  );
}
