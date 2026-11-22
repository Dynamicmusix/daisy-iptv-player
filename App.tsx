/**
 * Daisy IPTV v1.0.0 — Shared React Native Universal App
 * Runs identically on:
 *   - Android Mobile (Phones & Tablets)
 *   - Android TV / Fire TV (D-Pad / Leanback Launcher)
 *   - iOS (iPhone & iPad)
 *   - Apple TV (tvOS via react-native-tvos)
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  PortalProfile,
  DaisyPreferences,
  GenreItem,
  ChannelItem,
  VodMovieItem,
  SeriesShowItem,
  EpgProgram,
} from './src/types/stb';
import { PortalClient } from './src/services/PortalClient';

const DEFAULT_PROFILE: PortalProfile = {
  id: 'default-profile',
  name: 'My IPTV Portal',
  host: '',
  mac: '00:1A:79:00:00:00',
  advancedEnabled: false,
  stbType: 'MAG250',
  serial: '',
  deviceId1: '',
  deviceId2: '',
  signature: '',
  hwVersion: '1.7-BD-00',
  hwVersion2: '',
  sendHwInfo: true,
  customParams: [
    { key: '', value: '' },
    { key: '', value: '' },
    { key: '', value: '' },
  ],
};

const DEFAULT_PREFS: DaisyPreferences = {
  tvPlayer: 'VLC',
  vodPlayer: 'VLC',
  aspectRatio: 'Auto',
  sortBy: 'number',
  bufferSizeMs: 3000,
  autoPlayLastChannel: true,
  pipEnabled: true,
  showSubtitles: true,
  darkMode: true,
  loadDynamicTheme: false,
  forceLoginOnSwitch: true,
  onlineBackupMode: false,
  audioLanguage: 'english',
  subtitleLanguage: 'english',
  playbackSpeed: 1.0,
  epgOffsetMinutes: 0,
  recordFormat: 'ts',
};

type ScreenRoute =
  | 'MAIN_MENU'
  | 'LIVE_TV'
  | 'EPG_GRID'
  | 'CATCHUP'
  | 'REORDER_CHANNELS'
  | 'VOD'
  | 'SERIES'
  | 'RADIO'
  | 'PROFILES'
  | 'NEW_PROFILE'
  | 'PREFERENCES'
  | 'FILTER_GENRES'
  | 'BACKUP_RESTORE'
  | 'ABOUT';

export default function App() {
  const [route, setRoute] = useState<ScreenRoute>('MAIN_MENU');
  const [sideMenuOpen, setSideMenuOpen] = useState(false);

  const [profiles, setProfiles] = useState<PortalProfile[]>([DEFAULT_PROFILE]);
  const [activeProfileId, setActiveProfileId] = useState<string>(DEFAULT_PROFILE.id);
  const [prefs] = useState<DaisyPreferences>(DEFAULT_PREFS);

  const [loading, setLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [expireDate, setExpireDate] = useState<string>('Not Connected');

  const [tvGenres, setTvGenres] = useState<GenreItem[]>([]);
  const [selectedTvGenre, setSelectedTvGenre] = useState<string>('*');
  const [tvChannels, setTvChannels] = useState<ChannelItem[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<ChannelItem | null>(null);
  const [activeStreamUrl, setActiveStreamUrl] = useState<string>('');
  const [shortEpg, setShortEpg] = useState<EpgProgram[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [favChannels, setFavChannels] = useState<string[]>([]);
  const [showFavOnly, setShowFavOnly] = useState<boolean>(false);

  const [vodCategories, setVodCategories] = useState<GenreItem[]>([]);
  const [selectedVodCat, setSelectedVodCat] = useState<string>('*');
  const [vodItems, setVodItems] = useState<VodMovieItem[]>([]);

  const [seriesCategories, setSeriesCategories] = useState<GenreItem[]>([]);
  const [selectedSeriesCat, setSelectedSeriesCat] = useState<string>('*');
  const [seriesItems, setSeriesItems] = useState<SeriesShowItem[]>([]);

  const activeProfile = useMemo(
    () => profiles.find((p) => p.id === activeProfileId) || profiles[0],
    [profiles, activeProfileId]
  );

  const client = useMemo(() => new PortalClient(activeProfile), [activeProfile]);

  useEffect(() => {
    if (activeProfile.host) {
      connectToPortal();
    }
  }, [activeProfileId]);

  async function connectToPortal() {
    if (!activeProfile.host) {
      setPortalError('Please configure your Portal Host and MAC address.');
      return;
    }
    setLoading(true);
    setPortalError(null);
    try {
      const { accountInfo } = await client.authenticateAndLoadProfile();
      if (accountInfo?.phone) {
        setExpireDate(accountInfo.phone);
      }
      const genres = await client.getTvGenres();
      setTvGenres(genres);
      const firstGenre = genres.find((g) => g.id !== '*')?.id || '*';
      setSelectedTvGenre(firstGenre);
      const chRes = await client.getTvChannels(firstGenre, 1, prefs.sortBy);
      setTvChannels(chRes.data || []);
    } catch (err: any) {
      setPortalError(err?.message || 'Unable to connect to portal');
    } finally {
      setLoading(false);
    }
  }

  async function selectTvGenre(genreId: string) {
    setSelectedTvGenre(genreId);
    setLoading(true);
    try {
      const chRes = await client.getTvChannels(genreId, 1, prefs.sortBy, showFavOnly);
      setTvChannels(chRes.data || []);
    } catch (e: any) {
      setPortalError(e?.message || 'Failed to load channels');
    } finally {
      setLoading(false);
    }
  }

  async function playChannel(ch: ChannelItem) {
    setSelectedChannel(ch);
    try {
      const url = await client.resolveLiveStreamUrl(ch);
      setActiveStreamUrl(url);
      const epg = await client.getShortEpg(ch.id);
      setShortEpg(epg);
    } catch (e: any) {
      setPortalError(e?.message || 'Failed to resolve stream link');
    }
  }

  async function openVodSection() {
    setRoute('VOD');
    if (vodCategories.length === 0 && activeProfile.host) {
      setLoading(true);
      try {
        const cats = await client.getVodCategories();
        setVodCategories(cats);
        const firstCat = cats.find((c) => c.id !== '*')?.id || '*';
        setSelectedVodCat(firstCat);
        const items = await client.getVodItems(firstCat, 1, 'added');
        setVodItems(items.data || []);
      } finally {
        setLoading(false);
      }
    }
  }

  async function openSeriesSection() {
    setRoute('SERIES');
    if (seriesCategories.length === 0 && activeProfile.host) {
      setLoading(true);
      try {
        const cats = await client.getSeriesCategories();
        setSeriesCategories(cats);
        const firstCat = cats.find((c) => c.id !== '*')?.id || '*';
        setSelectedSeriesCat(firstCat);
        const items = await client.getSeriesList(firstCat, 1, 'added');
        setSeriesItems(items.data || []);
      } finally {
        setLoading(false);
      }
    }
  }

  function toggleFavChannel(id: string) {
    setFavChannels((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" />

      <View style={styles.topBar}>
        <Pressable style={styles.topBtn} onPress={() => setSideMenuOpen(!sideMenuOpen)}>
          <Text style={styles.topBtnText}>☰ MENU</Text>
        </Pressable>

        <View style={styles.identityBox}>
          <Text style={styles.appTitle}>Daisy IPTV v1.0.0</Text>
          <Text style={styles.macBadge}>
            {activeProfile.name} • MAC: {activeProfile.mac} • Exp: {expireDate}
          </Text>
        </View>

        <View style={styles.topActions}>
          <Pressable style={styles.topBtn} onPress={() => setRoute('PROFILES')}>
            <Text style={styles.topBtnText}>PROFILES</Text>
          </Pressable>
          <Pressable style={styles.topBtn} onPress={() => setRoute('FILTER_GENRES')}>
            <Text style={styles.topBtnText}>FILTER</Text>
          </Pressable>
          <Pressable style={styles.topBtn} onPress={() => setRoute('BACKUP_RESTORE')}>
            <Text style={styles.topBtnText}>BACKUP</Text>
          </Pressable>
          <Pressable style={styles.topBtn} onPress={() => setRoute('PREFERENCES')}>
            <Text style={styles.topBtnText}>⚙ PREFS</Text>
          </Pressable>
        </View>
      </View>

      {portalError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{portalError}</Text>
          <Pressable onPress={connectToPortal} style={styles.retryBtn}>
            <Text style={styles.topBtnText}>RETRY</Text>
          </Pressable>
        </View>
      )}

      {route === 'MAIN_MENU' && (
        <View style={styles.carouselContainer}>
          <Text style={styles.sectionHeading}>DAISY IPTV — SELECT MODULE</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carouselRow}>
            {[
              { id: 'LIVE_TV', icon: '📺', title: 'LIVE TV', sub: `${tvGenres.length} Genres` },
              { id: 'VOD', icon: '🎬', title: 'VOD MOVIES', sub: 'Movies & 4K' },
              { id: 'SERIES', icon: '🎞️', title: 'SERIES / SHOWS', sub: 'Seasons & Episodes' },
              { id: 'RADIO', icon: '📻', title: 'RADIO', sub: 'Live Audio Channels' },
              { id: 'EPG_GRID', icon: '📅', title: 'EPG TV GUIDE', sub: 'Timeline Grid' },
              { id: 'PROFILES', icon: '👤', title: 'PORTAL PROFILES', sub: activeProfile.stbType },
              { id: 'PREFERENCES', icon: '⚙️', title: 'PREFERENCES', sub: `Player: ${prefs.tvPlayer}` },
            ].map((item, idx) => (
              <Pressable
                key={item.id}
                hasTVPreferredFocus={idx === 0}
                style={styles.carouselCard}
                onPress={() => {
                  if (item.id === 'VOD') openVodSection();
                  else if (item.id === 'SERIES') openSeriesSection();
                  else setRoute(item.id as ScreenRoute);
                }}
              >
                <Text style={styles.carouselIcon}>{item.icon}</Text>
                <Text style={styles.carouselTitle}>{item.title}</Text>
                <Text style={styles.carouselSub}>{item.sub}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {route === 'LIVE_TV' && (
        <View style={styles.splitScreen}>
          <View style={styles.genreCol}>
            <Text style={styles.colHeader}>GENRES ({tvGenres.length})</Text>
            <FlatList
              data={tvGenres}
              keyExtractor={(g) => g.id}
              renderItem={({ item }) => (
                <Pressable
                  style={[
                    styles.listRow,
                    selectedTvGenre === item.id && styles.listRowActive,
                  ]}
                  onPress={() => selectTvGenre(item.id)}
                >
                  <Text style={styles.listRowText} numberOfLines={1}>
                    {item.title}
                  </Text>
                </Pressable>
              )}
            />
          </View>

          <View style={styles.channelCol}>
            <View style={styles.toolbarRow}>
              <TextInput
                style={styles.searchInput}
                placeholder="Search channels..."
                placeholderTextColor="#8b9bb4"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              <Pressable
                style={[styles.smallBtn, showFavOnly && styles.smallBtnActive]}
                onPress={() => setShowFavOnly(!showFavOnly)}
              >
                <Text style={styles.smallBtnText}>★ FAV</Text>
              </Pressable>
              <Pressable style={styles.smallBtn} onPress={() => setRoute('REORDER_CHANNELS')}>
                <Text style={styles.smallBtnText}>EDIT</Text>
              </Pressable>
            </View>

            <FlatList
              data={tvChannels.filter((c) =>
                c.name.toLowerCase().includes(searchQuery.toLowerCase())
              )}
              keyExtractor={(c) => c.id}
              renderItem={({ item }) => (
                <Pressable
                  style={[
                    styles.channelRow,
                    selectedChannel?.id === item.id && styles.listRowActive,
                  ]}
                  onPress={() => playChannel(item)}
                >
                  <Text style={styles.chNumber}>{item.number}</Text>
                  <Text style={styles.chName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Pressable onPress={() => toggleFavChannel(item.id)}>
                    <Text style={styles.favStar}>
                      {favChannels.includes(item.id) ? '★' : '☆'}
                    </Text>
                  </Pressable>
                </Pressable>
              )}
            />
          </View>

          <View style={styles.playerCol}>
            <View style={styles.videoViewport}>
              <Text style={styles.videoTitle}>
                {selectedChannel ? selectedChannel.name : 'Select a channel'}
              </Text>
              {activeStreamUrl ? (
                <>
                  <Text style={styles.streamUrlText} numberOfLines={2}>
                    Engine: {prefs.tvPlayer} • Aspect: {prefs.aspectRatio} • Buffer: {prefs.bufferSizeMs}ms
                  </Text>
                  <Pressable
                    style={styles.vlcBtn}
                    onPress={() => Linking.openURL(`vlc://${activeStreamUrl}`)}
                  >
                    <Text style={styles.topBtnText}>▶ OPEN IN VLC / NATIVE PLAYER</Text>
                  </Pressable>
                </>
              ) : null}
            </View>

            <View style={styles.playerControlsRow}>
              <Pressable style={styles.smallBtn} onPress={() => setRoute('MAIN_MENU')}>
                <Text style={styles.smallBtnText}>EXIT</Text>
              </Pressable>
              <Pressable style={styles.smallBtn} onPress={() => setRoute('EPG_GRID')}>
                <Text style={styles.smallBtnText}>EPG</Text>
              </Pressable>
              <Pressable style={styles.smallBtn} onPress={() => setRoute('CATCHUP')}>
                <Text style={styles.smallBtnText}>CATCH-UP</Text>
              </Pressable>
            </View>

            <View style={styles.epgBox}>
              <Text style={styles.colHeader}>CHANNEL INFO / SHORT EPG</Text>
              {shortEpg.length === 0 ? (
                <Text style={styles.emptyText}>No Information.</Text>
              ) : (
                shortEpg.map((p) => (
                  <Text key={p.id} style={styles.epgItemText}>
                    {p.time} - {p.name}
                  </Text>
                ))
              )}
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b1320' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#111d33',
    borderBottomWidth: 1,
    borderBottomColor: '#1f3254',
  },
  identityBox: { flex: 1, marginHorizontal: 14 },
  appTitle: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  macBadge: { color: '#4cc9f0', fontSize: 12, marginTop: 2 },
  topActions: { flexDirection: 'row', gap: 8 },
  topBtn: {
    backgroundColor: '#1b2e4f',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2e4a7d',
  },
  topBtnText: { color: '#ffffff', fontSize: 12, fontWeight: '600' },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#7f1d1d',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  errorText: { color: '#fecaca', fontSize: 13 },
  retryBtn: { backgroundColor: '#991b1b', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4 },
  carouselContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  sectionHeading: { color: '#94a3b8', fontSize: 13, letterSpacing: 1.5, marginBottom: 20 },
  carouselRow: { alignItems: 'center', gap: 18, paddingHorizontal: 20 },
  carouselCard: {
    width: 190,
    height: 220,
    backgroundColor: '#14243e',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#274372',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  carouselIcon: { fontSize: 46, marginBottom: 14 },
  carouselTitle: { color: '#ffffff', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  carouselSub: { color: '#38bdf8', fontSize: 12, marginTop: 6, textAlign: 'center' },
  splitScreen: { flex: 1, flexDirection: 'row' },
  genreCol: { width: '24%', borderRightWidth: 1, borderRightColor: '#1e293b', backgroundColor: '#0f192a' },
  channelCol: { width: '36%', borderRightWidth: 1, borderRightColor: '#1e293b', backgroundColor: '#111d33' },
  playerCol: { flex: 1, padding: 12, backgroundColor: '#0b1320' },
  colHeader: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '700',
    padding: 10,
    backgroundColor: '#162642',
  },
  listRow: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#17253f' },
  listRowActive: { backgroundColor: '#0284c7' },
  listRowText: { color: '#e2e8f0', fontSize: 13 },
  toolbarRow: { flexDirection: 'row', padding: 8, gap: 6, backgroundColor: '#162642', alignItems: 'center' },
  searchInput: {
    flex: 1,
    backgroundColor: '#0b1320',
    color: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    fontSize: 13,
  },
  smallBtn: { backgroundColor: '#1e3a5f', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  smallBtnActive: { backgroundColor: '#eab308' },
  smallBtnText: { color: '#ffffff', fontSize: 11, fontWeight: '700' },
  channelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#17253f',
  },
  chNumber: { color: '#38bdf8', width: 42, fontWeight: '700', fontSize: 13 },
  chName: { color: '#ffffff', flex: 1, fontSize: 13 },
  favStar: { color: '#facc15', fontSize: 16, paddingLeft: 8 },
  videoViewport: {
    height: 220,
    backgroundColor: '#000000',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#274372',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  videoTitle: { color: '#ffffff', fontSize: 16, fontWeight: '700', marginBottom: 8 },
  streamUrlText: { color: '#94a3b8', fontSize: 12, marginBottom: 12, textAlign: 'center' },
  vlcBtn: { backgroundColor: '#f97316', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 6 },
  playerControlsRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  epgBox: { flex: 1, marginTop: 12, backgroundColor: '#0f192a', borderRadius: 8, overflow: 'hidden' },
  emptyText: { color: '#64748b', padding: 12, fontSize: 13 },
  epgItemText: { color: '#cbd5e1', paddingHorizontal: 12, paddingVertical: 6, fontSize: 12 },
});
