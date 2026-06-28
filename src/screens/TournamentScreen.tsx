/**
 * @file src/screens/TournamentScreen.tsx
 *
 * Tournament Hub — lean presentation shell.
 *
 * Responsibilities (this file):
 *   • UI segment state (explore / my)
 *   • Navigation (TournamentDetail, CreateTournament)
 *   • Focus-based Explore refresh via useFocusEffect
 *   • Rendering via extracted components + useTournaments hook
 *
 * Business logic lives in:
 *   src/hooks/useTournaments.ts     — data fetching, polling, real-time subscription
 *   src/components/tournament/      — TournamentCard, EmptyFeed, SegmentedControl
 */

import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { TournamentStackParamList } from '../navigation/types';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import type { ColorTokens } from '../theme/tokens';
import type { Tournament } from '../types/tournament';
import { seedMockData } from '../services/tournamentService';

import {
  EmptyFeed,
  SegmentedControl,
  TournamentCard,
} from '../components/tournament';
import type { Segment } from '../components/tournament';
import { useTournaments } from '../hooks/useTournaments';

// ─── Types ────────────────────────────────────────────────────────────────────

type HubSegment = 'explore' | 'my';

// ─── Layout constants ─────────────────────────────────────────────────────────

const H_PAD = 20;
const TAB_H = 68;

// ─── Screen-level styles ──────────────────────────────────────────────────────

function makeScrStyles(c: ColorTokens) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background.secondary,
    },
    topHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: H_PAD,
      paddingTop: 6,
      paddingBottom: 18,
    },
    screenTitle: {
      fontSize: 28,
      fontWeight: '800',
      color: c.text.primary,
      letterSpacing: -0.5,
    },
    screenSubtitle: {
      fontSize: 13,
      fontWeight: '500',
      color: c.text.muted,
    },
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    livePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: c.status.success + '1A',
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderWidth: 1,
      borderColor: c.status.success + '38',
    },
    liveDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: c.status.success,
    },
    liveText: {
      fontSize: 12,
      fontWeight: '700',
      color: c.status.success,
    },
    listContent: {
      paddingHorizontal: H_PAD,
      paddingTop: 16,
      gap: 12,
    },
    loadingWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 14,
    },
    loadingText: {
      fontSize: 14,
      fontWeight: '500',
    },
    fab: {
      position: 'absolute',
      left: H_PAD,
      right: H_PAD,
    },
    fabBtn: {
      height: 56,
      backgroundColor: c.accent.primary,
      borderRadius: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      shadowColor: c.accent.primary,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.38,
      shadowRadius: 12,
      elevation: 10,
    },
    fabText: {
      fontSize: 16,
      fontWeight: '800',
      color: c.text.inverse,
      letterSpacing: 0.2,
    },
  });
}

// ─── Segment definitions ──────────────────────────────────────────────────────

const SEGMENTS: Segment[] = [
  { key: 'explore', label: 'Keşfet' },
  { key: 'my',      label: 'Turnuvalarım' },
];

// ─── Screen ───────────────────────────────────────────────────────────────────

export function TournamentScreen() {
  const insets               = useSafeAreaInsets();
  const { uid }              = useAuth();
  const navigation           = useNavigation<NativeStackNavigationProp<TournamentStackParamList>>();
  const { theme }            = useTheme();
  const c                    = theme.colors;
  const scr                  = useMemo(() => makeScrStyles(c), [theme]);

  // ── UI state (screen-only concerns) ────────────────────────────────────────

  const [activeSegment, setActiveSegment] = useState<HubSegment>('explore');

  // ── Data & polling via hook ─────────────────────────────────────────────────

  const {
    exploreTournaments,
    myTournaments,
    isLoadingExplore,
    isLoadingMy,
    isRefreshingExplore,
    refreshExplore,
  } = useTournaments(uid);

  // ── Focus-based refresh for Explore ────────────────────────────────────────
  // Skip the very first focus event (hook's useEffect already handles the
  // initial load).  Subsequent focus events trigger a silent refresh so the
  // feed is up-to-date when the user navigates back from another screen.

  const isFirstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (isFirstFocus.current) {
        isFirstFocus.current = false;
        return;
      }
      refreshExplore();
    }, [refreshExplore]),
  );

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSegmentChange = useCallback((key: string) => {
    Haptics.selectionAsync().catch(() => {});
    setActiveSegment(key as HubSegment);
  }, []);

  const handleTournamentPress = useCallback((tournamentId: string) => {
    navigation.navigate('TournamentDetail', { tournamentId });
  }, [navigation]);

  const handleCreatePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    navigation.navigate('CreateTournament');
  }, [navigation]);

  const handleSeedLongPress = useCallback(() => {
    Alert.alert('Seeding…', 'Adding mock data');
    seedMockData()
      .then(() => {
        refreshExplore();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        Alert.alert('Başarılı', 'Test verileri eklendi!');
      })
      .catch((err: unknown) => {
        Alert.alert('Hata', err instanceof Error ? err.message : 'Seed başarısız.');
      });
  }, [refreshExplore]);

  // ── Derived ────────────────────────────────────────────────────────────────

  const isExplore  = activeSegment === 'explore';
  const isLoading  = isExplore ? isLoadingExplore : isLoadingMy;
  const tournaments = isExplore ? exploreTournaments : myTournaments;
  const bottomPad  = TAB_H + insets.bottom + 80;

  const emptyMessage = isExplore
    ? 'Şu an herkese açık aktif bir turnuva bulunmuyor.'
    : uid
      ? 'Henüz bir turnuvanız yok.\nİlk turnuvanızı şimdi oluşturun!'
      : 'Turnuvalarınızı görmek için giriş yapmanız gerekiyor.';

  const showCta = !isExplore && uid !== null;

  // ── FlatList callbacks (stable, memoised) ─────────────────────────────────

  const keyExtractor = useCallback((item: Tournament) => item.id, []);

  const renderItem = useCallback(
    ({ item }: { item: Tournament }) => (
      <TournamentCard
        tournament={item}
        onPress={() => handleTournamentPress(item.id)}
      />
    ),
    [handleTournamentPress],
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={[scr.container, { paddingTop: insets.top }]}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View style={scr.topHeader}>
        <TouchableOpacity
          activeOpacity={0.8}
          onLongPress={handleSeedLongPress}
          style={{ gap: 2 }}
        >
          <Text style={scr.screenTitle}>Turnuvalar</Text>
          <Text style={scr.screenSubtitle}>İstanbul Tenis Ligi · 2026</Text>
        </TouchableOpacity>

        <View style={scr.headerRight}>
          <View style={scr.livePill}>
            <View style={scr.liveDot} />
            <Text style={scr.liveText}>Aktif</Text>
          </View>
        </View>
      </View>

      {/* ── Segmented control ──────────────────────────────────────────── */}
      <View style={{ paddingBottom: 16 }}>
        <SegmentedControl
          segments={SEGMENTS}
          active={activeSegment}
          onSelect={handleSegmentChange}
        />
      </View>

      {/* ── Feed ───────────────────────────────────────────────────────── */}
      <View style={{ flex: 1 }}>
        {isLoading ? (
          <View style={scr.loadingWrap}>
            <ActivityIndicator size="large" color={c.accent.primary} />
            <Text style={[scr.loadingText, { color: c.text.muted }]}>Yükleniyor…</Text>
          </View>
        ) : (
          <FlatList
            data={tournaments}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            contentContainerStyle={[
              scr.listContent,
              { paddingBottom: bottomPad },
              tournaments.length === 0 && { flex: 1 },
            ]}
            showsVerticalScrollIndicator={false}
            initialNumToRender={8}
            maxToRenderPerBatch={10}
            windowSize={5}
            removeClippedSubviews
            refreshControl={
              isExplore ? (
                <RefreshControl
                  refreshing={isRefreshingExplore}
                  onRefresh={refreshExplore}
                  tintColor={c.accent.primary}
                  colors={[c.accent.primary]}
                />
              ) : undefined
            }
            ListEmptyComponent={
              <EmptyFeed
                message={emptyMessage}
                cta={showCta ? 'Turnuva Oluştur' : undefined}
                onCta={showCta ? handleCreatePress : undefined}
              />
            }
          />
        )}
      </View>

      {/* ── FAB — any authenticated user can create a tournament ─────── */}
      {uid !== null && (
        <View style={[scr.fab, { bottom: insets.bottom + TAB_H + 12 }]}>
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={handleCreatePress}
            style={scr.fabBtn}
          >
            <Ionicons name="add-circle-outline" size={22} color={c.text.inverse} />
            <Text style={scr.fabText}>Turnuva Oluştur</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
