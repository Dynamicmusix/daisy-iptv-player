/**
 * Daisy IPTV v1.0.0 — Universal Data Models
 * Shared across Web (Vercel), Android Mobile, Android TV, iOS, and Apple TV.
 */

export type BoxModelType = 'MAG250' | 'MAG254' | 'MAG256' | 'MAG322' | 'MAG420' | 'MAG524';
export type PlayerEngineType = 'Auto' | 'FFmpeg' | 'Native';
export type AspectRatioType = 'Auto' | 'Fit' | 'Full' | '16:9' | '4:3';
export type SortByType = 'number' | 'name' | 'added' | 'default';

export interface CustomKeyValue {
  key: string;
  value: string;
}

export interface PortalProfile {
  id: string;
  name: string;
  host: string;
  mac: string;
  advancedEnabled: boolean;
  stbType: BoxModelType;
  serial: string;
  deviceId1: string;
  deviceId2: string;
  signature: string;
  hwVersion: string;
  hwVersion2: string;
  sendHwInfo: boolean;
  customParams: [CustomKeyValue, CustomKeyValue, CustomKeyValue];
  token?: string;
  expireDate?: string;
  accountId?: string;
  lastChannelId?: string;
}

export interface DaisyPreferences {
  tvPlayer: PlayerEngineType;
  vodPlayer: PlayerEngineType;
  aspectRatio: AspectRatioType;
  sortBy: SortByType;
  bufferSizeMs: number;
  autoPlayLastChannel: boolean;
  pipEnabled: boolean;
  showSubtitles: boolean;
  darkMode: boolean;
  loadDynamicTheme: boolean;
  forceLoginOnSwitch: boolean;
  onlineBackupMode: boolean;
  audioLanguage: string;
  subtitleLanguage: string;
  playbackSpeed: number;
  epgOffsetMinutes: number;
  recordFormat: 'ts' | 'mp4' | 'mkv' | 'avi' | 'flv';
}

export interface GenreItem {
  id: string;
  title: string;
  alias?: string;
  censored?: number;
}

export interface ChannelItem {
  id: string;
  name: string;
  number: string;
  cmd: string;
  logo?: string;
  use_http_tmp_link?: string;
  tv_archive?: string | number | null;
  censored?: number;
}

export interface EpgProgram {
  id: string;
  ch_id: string;
  name: string;
  descr: string;
  time: string;
  time_to: string;
  start_timestamp?: number;
  stop_timestamp?: number;
}

export interface VodMovieItem {
  id: string;
  name: string;
  o_name?: string;
  cmd: string;
  screenshot_uri?: string;
  description?: string;
  year?: string;
  time?: number | string;
  director?: string;
  actors?: string;
  rating_imdb?: string;
  genres_str?: string;
  added?: string;
}

export interface SeriesShowItem {
  id: string;
  name: string;
  o_name?: string;
  cmd: string;
  screenshot_uri?: string;
  description?: string;
  year?: string;
  director?: string;
  actors?: string;
  rating_imdb?: string;
  genres_str?: string;
  series?: number[];
  category_id?: string;
}

export interface BackupPayload {
  version: string;
  restorationCode: string;
  createdAt: string;
  profiles: PortalProfile[];
  preferences: DaisyPreferences;
  favoriteChannels: string[];
  favoriteVod: string[];
  favoriteSeries: string[];
  hiddenGenres: string[];
  channelOrder: string[];
}
