import { ExternalLink, Youtube } from 'lucide-react';
import type { MusicPlaybackRef } from '../../lib/dataPack';
import { youtubeEmbedUrl, youtubeWatchUrl } from '../../lib/music/playback';

interface Props {
  playback: MusicPlaybackRef;
  playing: boolean;
  title: string;
  className?: string;
}

export default function YouTubePlaybackFrame({ playback, playing, title, className = '' }: Props) {
  const embedUrl = youtubeEmbedUrl(playback, playing);
  const watchUrl = youtubeWatchUrl(playback);
  return (
    <div className={`relative overflow-hidden bg-black text-white ${className}`}>
      {playing && embedUrl ? (
        <iframe
          key={embedUrl}
          src={embedUrl}
          title={`${title} · YouTube 原曲`}
          className="absolute inset-0 h-full w-full border-0"
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black px-3 text-center">
          <Youtube className="h-6 w-6 text-[#ff3d3d]" strokeWidth={2.4} />
          <span className="text-[10px] font-bold">{embedUrl ? '点击播放 YouTube 原曲' : 'YouTube 来源缺少有效视频 ID'}</span>
        </div>
      )}
      {watchUrl && (
        <a href={watchUrl} target="_blank" rel="noreferrer" className="absolute right-1.5 top-1.5 z-10 flex items-center gap-1 border border-white/35 bg-black/75 px-1.5 py-1 text-[7px] text-white">
          来源<ExternalLink className="h-2.5 w-2.5" strokeWidth={2.5} />
        </a>
      )}
    </div>
  );
}
