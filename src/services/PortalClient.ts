/**
 * Daisy IPTV v1.0.0 — Universal Portal Client
 * Works identically across React Native (Android Mobile, Android TV, iOS, Apple TV) and Web.
 */

import {
  PortalProfile,
  GenreItem,
  ChannelItem,
  VodMovieItem,
  SeriesShowItem,
  EpgProgram,
} from '../types/stb';

export class PortalClient {
  private profile: PortalProfile;
  private proxyBaseUrl?: string;

  constructor(profile: PortalProfile, proxyBaseUrl?: string) {
    this.profile = profile;
    this.proxyBaseUrl = proxyBaseUrl;
  }

  public getPortalEndpoint(): string {
    let base = (this.profile.host || '').trim();
    if (!base) {
      throw new Error('Please configure your portal URL in Profile Settings.');
    }
    if (!/^https?:\/\//i.test(base)) {
      base = 'http://' + base;
    }
    base = base.replace(/\/+$/, '');
    if (base.endsWith('/c')) {
      base = base.slice(0, -2);
    }
    if (base.endsWith('/portal.php') || base.endsWith('/load.php')) {
      return base;
    }
    return `${base}/portal.php`;
  }

  public getPortalHeaders(): Record<string, string> {
    const stbType = this.profile.stbType || 'MAG250';
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const cookie = `mac=${encodeURIComponent(this.profile.mac)}; stb_lang=en; timezone=${encodeURIComponent(tz)}`;
    const headers: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3',
      'X-User-Agent': `Model: ${stbType}; Link: WiFi`,
      Referer: this.profile.host.replace(/\/+$/, '') + '/',
      Cookie: cookie,
      Accept: '*/*',
    };
    if (this.profile.token) {
      headers['Authorization'] = `Bearer ${this.profile.token}`;
    }
    return headers;
  }

  private async request<T = any>(params: Record<string, string>, retryOnAuth = true): Promise<T> {
    const query: Record<string, string> = {
      ...params,
      JsHttpRequest: '1-xml',
    };
    if (this.profile.advancedEnabled && Array.isArray(this.profile.customParams)) {
      for (const pair of this.profile.customParams) {
        if (pair.key && pair.key.trim()) {
          query[pair.key.trim()] = pair.value || '';
        }
      }
    }

    const endpoint = this.getPortalEndpoint();
    let res: Response;

    if (this.proxyBaseUrl) {
      const proxyUrl = new URL(`${this.proxyBaseUrl}/api/portal`);
      proxyUrl.searchParams.set('_endpoint', endpoint);
      proxyUrl.searchParams.set('_mac', this.profile.mac);
      proxyUrl.searchParams.set('_stbType', this.profile.stbType || 'MAG250');
      if (this.profile.token) {
        proxyUrl.searchParams.set('_token', this.profile.token);
      }
      for (const [k, v] of Object.entries(query)) {
        proxyUrl.searchParams.set(k, v);
      }
      res = await fetch(proxyUrl.toString());
    } else {
      const qs = new URLSearchParams(query).toString();
      res = await fetch(`${endpoint}?${qs}`, {
        method: 'GET',
        headers: this.getPortalHeaders(),
      });
    }

    if (res.status === 401 && retryOnAuth && params.action !== 'handshake') {
      await this.handshake();
      return this.request<T>(params, false);
    }

    const text = await res.text();
    if (text.includes('Authorization failed') && retryOnAuth && params.action !== 'handshake') {
      await this.handshake();
      return this.request<T>(params, false);
    }

    const parsed = JSON.parse(text);
    return parsed.js as T;
  }

  public async handshake(): Promise<string> {
    const js = await this.request<{ token: string; random?: string }>(
      {
        type: 'stb',
        action: 'handshake',
        token: '',
      },
      false
    );
    if (!js || !js.token) {
      throw new Error('Portal handshake failed. Check your Portal Host and MAC address.');
    }
    this.profile.token = js.token;
    return js.token;
  }

  public async authenticateAndLoadProfile(): Promise<{
    profileData: Record<string, any>;
    accountInfo: { mac: string; phone?: string };
  }> {
    if (!this.profile.token) {
      await this.handshake();
    }

    const profileParams: Record<string, string> = {
      type: 'stb',
      action: 'get_profile',
      hd: '1',
      num_banks: '2',
      stb_type: this.profile.stbType || 'MAG250',
      image_version: '218',
      video_out: 'hdmi',
      auth_second_step: '1',
      not_valid_token: '0',
      client_type: 'STB',
    };

    if (this.profile.sendHwInfo !== false) {
      profileParams.sn = this.profile.serial || '';
      profileParams.device_id = this.profile.deviceId1 || '';
      profileParams.device_id2 = this.profile.deviceId2 || '';
      profileParams.signature = this.profile.signature || '';
      profileParams.hw_version = this.profile.hwVersion || '1.7-BD-00';
      profileParams.hw_version_2 = this.profile.hwVersion2 || '';
    }

    let profileData = await this.request<Record<string, any>>(profileParams);
    if (!profileData || !profileData.id || profileData.id === 0 || profileData.id === '0') {
      await this.handshake();
      profileData = await this.request<Record<string, any>>(profileParams);
    }

    const accountInfo = await this.request<{ mac: string; phone?: string }>({
      type: 'account_info',
      action: 'get_main_info',
    });

    if (accountInfo?.phone) {
      this.profile.expireDate = accountInfo.phone;
    }
    if (profileData?.id) {
      this.profile.accountId = String(profileData.id);
    }

    return { profileData, accountInfo };
  }

  public async getTvGenres(): Promise<GenreItem[]> {
    return (
      (await this.request<GenreItem[]>({
        type: 'itv',
        action: 'get_genres',
      })) || []
    );
  }

  public async getTvChannels(
    genreId = '*',
    page = 1,
    sortBy: string = 'number',
    favOnly = false
  ): Promise<{ total_items: number; max_page_items: number; data: ChannelItem[] }> {
    return await this.request({
      type: 'itv',
      action: 'get_ordered_list',
      genre: genreId,
      force_ch_link_check: '',
      fav: favOnly ? '1' : '0',
      sortby: sortBy,
      hd: '0',
      p: String(page),
    });
  }

  public async resolveLiveStreamUrl(channel: ChannelItem): Promise<string> {
    const cleanCmd = (raw: string) => raw.replace(/^(ffmpeg|ffrt\d*|auto)\s+/i, '').trim();
    const directUrl = cleanCmd(channel.cmd || '');

    try {
      const synthCmd = channel.id
        ? `ffmpeg http://localhost/ch/${channel.id}_`
        : channel.cmd;

      const res = await this.request<{ cmd: string }>({
        type: 'itv',
        action: 'create_link',
        cmd: synthCmd,
        series: '',
        forced_storage: '0',
        disable_ad: '0',
        download: '0',
        force_ch_link_check: '0',
      });

      let resolved = cleanCmd(res?.cmd || directUrl);
      if (resolved.includes('stream=&') && channel.id) {
        resolved = resolved.replace('stream=&', `stream=${encodeURIComponent(channel.id)}&`);
      }
      if (/^https?:\/\//i.test(resolved)) {
        return resolved;
      }
    } catch (e) {}
    return directUrl;
  }

  public async getShortEpg(channelId: string, size = 10): Promise<EpgProgram[]> {
    const res = await this.request<EpgProgram[]>({
      type: 'itv',
      action: 'get_short_epg',
      ch_id: channelId,
      size: String(size),
    });
    return Array.isArray(res) ? res : [];
  }

  public async getVodCategories(): Promise<GenreItem[]> {
    return (
      (await this.request<GenreItem[]>({
        type: 'vod',
        action: 'get_categories',
      })) || []
    );
  }

  public async getVodItems(
    categoryId = '*',
    page = 1,
    sortBy = 'added',
    searchQuery = ''
  ): Promise<{ total_items: number; max_page_items: number; data: VodMovieItem[] }> {
    const params: Record<string, string> = {
      type: 'vod',
      action: 'get_ordered_list',
      category: categoryId,
      sortby: sortBy,
      p: String(page),
    };
    if (searchQuery.trim()) {
      params.search = searchQuery.trim();
    }
    return await this.request(params);
  }

  public async resolveVodStreamUrl(vodCmd: string): Promise<string> {
    const res = await this.request<{ cmd: string }>({
      type: 'vod',
      action: 'create_link',
      cmd: vodCmd,
      series: '',
      forced_storage: '0',
      disable_ad: '0',
      download: '0',
      force_ch_link_check: '0',
    });
    return (res?.cmd || '').replace(/^(ffmpeg|ffrt\d*|auto)\s+/i, '').trim();
  }

  public async getSeriesCategories(): Promise<GenreItem[]> {
    return (
      (await this.request<GenreItem[]>({
        type: 'series',
        action: 'get_categories',
      })) || []
    );
  }

  public async getSeriesList(
    categoryId = '*',
    page = 1,
    sortBy = 'added',
    searchQuery = ''
  ): Promise<{ total_items: number; max_page_items: number; data: SeriesShowItem[] }> {
    const params: Record<string, string> = {
      type: 'series',
      action: 'get_ordered_list',
      category: categoryId,
      sortby: sortBy,
      p: String(page),
    };
    if (searchQuery.trim()) {
      params.search = searchQuery.trim();
    }
    return await this.request(params);
  }

  public async getSeriesSeasons(
    seriesId: string,
    categoryId = '*'
  ): Promise<{ total_items: number; data: SeriesShowItem[] }> {
    return await this.request({
      type: 'series',
      action: 'get_ordered_list',
      movie_id: seriesId,
      season_id: '0',
      episode_id: '0',
      category: categoryId,
      sortby: 'added',
      p: '1',
    });
  }

  public async resolveSeriesEpisodeStreamUrl(seasonCmd: string, episodeNumber: number): Promise<string> {
    const res = await this.request<{ cmd: string }>({
      type: 'vod',
      action: 'create_link',
      cmd: seasonCmd,
      series: String(episodeNumber),
      forced_storage: '0',
      disable_ad: '0',
      download: '0',
      force_ch_link_check: '0',
    });
    return (res?.cmd || '').replace(/^(ffmpeg|ffrt\d*|auto)\s+/i, '').trim();
  }
}
