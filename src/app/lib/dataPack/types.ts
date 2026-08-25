export const DATA_PACK_PROTOCOL = 'pocket-data/v1' as const;
export const DATA_PACK_RUNTIME_VERSION = '1.0.0';

export const DATA_PACK_ADAPTERS = {
  books: { domain: 'books', skillId: 'pocket.books', schemaName: 'pocket.books/v1', schemaVersion: '1.0.0' },
  movies: { domain: 'movies', skillId: 'pocket.movies', schemaName: 'pocket.movies/v1', schemaVersion: '1.0.0' },
  music: { domain: 'music', skillId: 'pocket.music', schemaName: 'pocket.music/v1', schemaVersion: '1.0.0' },
  photos: { domain: 'photos', skillId: 'pocket.photos', schemaName: 'pocket.photos/v1', schemaVersion: '1.0.0' },
  mapping: { domain: 'mapping', skillId: 'pocket.mapping', schemaName: 'pocket.mapping/v1', schemaVersion: '1.0.0' },
} as const;

export type DataPackDomain = keyof typeof DATA_PACK_ADAPTERS;
export type DataPackSchemaName = (typeof DATA_PACK_ADAPTERS)[DataPackDomain]['schemaName'];
export type DataPackSkillId = (typeof DATA_PACK_ADAPTERS)[DataPackDomain]['skillId'];
export type DataPackPrivacy = 'public' | 'private' | 'restricted';

export interface DataPackIdentity {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
}

export interface DataPackFile {
  role: 'records';
  path: string;
  media_type: 'application/json';
  bytes: number;
  sha256: string;
  records: number;
}

export interface DataPackManifest {
  protocol: typeof DATA_PACK_PROTOCOL;
  identity: DataPackIdentity;
  schema: {
    name: string;
    version: string;
    record_count: number;
  };
  compatibility: {
    skills: string[];
    runtime_min: string;
  };
  privacy: DataPackPrivacy;
  provenance: {
    source: string;
    license: string;
    generated_at: string;
  };
  distribution: {
    mode: 'inline' | 'chunked';
  };
  files?: DataPackFile[];
  records?: unknown[];
}

export interface BookPackLocation {
  kind: 'story' | 'author' | 'country';
  place: string;
  lng: number;
  lat: number;
  confidence: number;
}

export interface BookPackRecord {
  id: string;
  title: string;
  author: string;
  country: string;
  type: string;
  year: number | null;
  rating: number | null;
  date: string;
  synopsis: string;
  locations?: BookPackLocation[];
}

export interface MoviePackLocation {
  kind: 'filming' | 'story' | 'country';
  place: string;
  lng: number;
  lat: number;
  confidence: number;
}

export interface MoviePackRecord {
  id: string;
  title: string;
  original: string;
  type: string;
  director: string;
  country: string;
  year: number | null;
  rating: number | null;
  publicRating?: number | null;
  date: string;
  synopsis: string;
  locations?: MoviePackLocation[];
}

export interface MusicPlaybackRef {
  provider: 'oss' | 'youtube' | 'external' | 'none';
  url: string;
  sourceUrl?: string;
  sourceId?: string;
}

export interface MusicTrackPackRecord {
  id: string;
  title: string;
  artist: string;
  genre: string;
  durationSec: number | null;
  playback: MusicPlaybackRef;
  introText: string;
  introPlayback: MusicPlaybackRef;
}

export interface MusicPodcastPackRecord {
  id: string;
  title: string;
  subtitle: string;
  text: string;
  playback: MusicPlaybackRef;
}

export interface MusicCityPackRecord {
  id: string;
  slug: string;
  cityName: string;
  cityNameZh: string;
  ianaTz: string | null;
  tzOffset: number;
  station: { freq: number; name: string };
  cover: string;
  lat: number | null;
  lng: number | null;
  description: string;
  tracks: MusicTrackPackRecord[];
  podcast: MusicPodcastPackRecord[];
}

export interface PhotoPackRecord {
  id: string;
  title: string;
  city: string;
  date: string;
  lat: number | null;
  lng: number | null;
  thumbnailUrl: string;
  contentHash: string;
  summary: string;
}

export type MappingPlaceStatus = 'extant' | 'rebuilt' | 'memory-only';
export type MappingPlaceRelation = 'scene' | 'mentioned' | 'route' | 'subject';

export interface MappingPackLocation {
  id: string;
  name: string;
  status: MappingPlaceStatus;
  relation: MappingPlaceRelation;
  page: number;
  quote: string;
  note: string;
  lng: number;
  lat: number;
  confidence: number;
  confirmed: boolean;
  sourceRef?: string;
  sourceUrls?: string[];
}

export interface MappingPackRecord {
  id: string;
  title: string;
  author: string;
  era: string;
  city: string;
  sourceName: string;
  sourceSha256: string;
  summary: string;
  locations: MappingPackLocation[];
}

export type DataPackRecord = BookPackRecord | MoviePackRecord | MusicCityPackRecord | PhotoPackRecord | MappingPackRecord;

export interface InstalledDataPack {
  packKey: string;
  domain: DataPackDomain;
  manifest: DataPackManifest;
  records: DataPackRecord[];
  installedAt: string;
  source: string;
}

export interface DataPackState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  active: InstalledDataPack | null;
  error: string;
}

export const dataPackAdapterForSchema = (name: string) => (
  Object.values(DATA_PACK_ADAPTERS).find((adapter) => adapter.schemaName === name)
);

export const dataPackAdapterForDomain = (domain: DataPackDomain) => DATA_PACK_ADAPTERS[domain];

export const packKeyOf = (manifest: DataPackManifest): string => (
  `${manifest.identity.id}@${manifest.identity.version}`
);
