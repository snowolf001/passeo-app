import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  View,
  Text,
  SectionList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useApp} from '../context/AppContext';
import {getSessions, ApiSession} from '../services/api/sessionApi';
import {formatDate} from '../utils/date';
import {useAppTheme} from '../theme/useAppTheme';
// Club subscription status from backend is the source of truth for Pro gating.
// Store purchase history is only used for purchase/restore flows, not app startup entitlement checks.
import {useClubSubscription} from '../hooks/useClubSubscription';
import {
  canAccessFullHistory,
  FREE_SESSION_LIMIT,
} from '../config/entitlementConfig';
import type {ThemeColors} from '../theme/colors';

type SessionRow = ApiSession & {locked?: boolean};
type Props = {navigation: any};

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

export default function SessionsScreen({navigation}: Props) {
  const {currentMembership, currentClub} = useApp();
  const {colors} = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  // isPro comes from the backend club subscription status — not local purchase history.
  const {status: subStatus} = useClubSubscription(currentClub?.id);
  const isPro = subStatus?.isPro ?? false;
  const [sessions, setSessions] = useState<ApiSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadSessions = useCallback(async () => {
    const clubId = currentClub?.id;
    if (!clubId) {
      setSessions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await getSessions(clubId);
      setSessions(data);
      console.log('📡 sessions loaded:', data);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, [currentClub]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', loadSessions);
    return unsub;
  }, [navigation, loadSessions]);

  const {sections, lockedCount} = useMemo(() => {
    const now = Date.now();

    const upcoming = sessions
      .filter(s => new Date(s.startTime).getTime() > now)
      .sort(
        (a, b) =>
          new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
      );

    const past = sessions
      .filter(s => new Date(s.startTime).getTime() <= now)
      .sort(
        (a, b) =>
          new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
      );

    const freePast = canAccessFullHistory(isPro)
      ? past
      : past.slice(0, FREE_SESSION_LIMIT);
    const lockedPast = canAccessFullHistory(isPro)
      ? []
      : past.slice(FREE_SESSION_LIMIT);

    const builtSections: {title: string; data: SessionRow[]}[] = [];

    if (upcoming.length > 0) {
      builtSections.push({
        title: 'Upcoming Sessions',
        data: upcoming.map(s => ({...s, locked: false})),
      });
    }

    if (freePast.length > 0 || lockedPast.length > 0) {
      builtSections.push({
        title: 'Past Sessions',
        data: [
          ...freePast.map(s => ({...s, locked: false})),
          ...lockedPast.map(s => ({...s, locked: true})),
        ],
      });
    }

    return {sections: builtSections, lockedCount: lockedPast.length};
  }, [sessions, isPro]);

  const highlightedSession = useMemo(() => {
    const now = Date.now();

    const liveSession = sessions.find(session => {
      const start = new Date(session.startTime).getTime();
      const end = session.endTime
        ? new Date(session.endTime).getTime()
        : Infinity;
      return now >= start && now <= end;
    });

    if (liveSession) {
      return {
        type: 'live' as const,
        session: liveSession,
        title: 'Happening Now',
        subtitle: 'This session is currently open for check-in',
        accent: '#34C759',
      };
    }

    const nextSession = sections.find(s => s.title === 'Upcoming Sessions')
      ?.data[0];

    if (nextSession) {
      return {
        type: 'upcoming' as const,
        session: nextSession,
        title: 'Next Session',
        subtitle: 'Your next upcoming session',
        accent: '#007AFF',
      };
    }

    return null;
  }, [sessions, sections]);

  const getStatusBadge = (session: ApiSession) => {
    const now = Date.now();
    const start = new Date(session.startTime).getTime();
    const end = session.endTime
      ? new Date(session.endTime).getTime()
      : Infinity;

    if (now < start) {
      const diffHours = (start - now) / 3600000;

      if (diffHours <= 2) {
        return {
          label: 'Open for Check-In',
          textColor: '#1D4ED8',
          backgroundColor: '#DBEAFE',
        };
      }

      return {
        label: 'Upcoming',
        textColor: '#4B5563',
        backgroundColor: '#E5E7EB',
      };
    }

    if (now <= end) {
      return {
        label: 'Open for Check-In',
        textColor: '#1D4ED8',
        backgroundColor: '#DBEAFE',
      };
    }

    return {
      label: 'Ended',
      textColor: '#6B7280',
      backgroundColor: '#F3F4F6',
    };
  };

  const renderItem = ({item}: {item: SessionRow}) => {
    if (item.locked) {
      return (
        <TouchableOpacity
          style={[styles.card, styles.cardLocked]}
          onPress={() => navigation.navigate('ClubPro')}>
          <View style={styles.cardTop}>
            <Text
              style={[styles.cardTitle, styles.cardTitleLocked]}
              numberOfLines={1}>
              {item.title ?? item.locationName ?? 'Session'}
            </Text>
            <Text style={styles.lockBadge}>🔒</Text>
          </View>
          <Text style={[styles.detailText, {color: colors.textMuted}]}>
            {formatDate(item.startTime)}
          </Text>
        </TouchableOpacity>
      );
    }

    const badge = getStatusBadge(item);

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() =>
          navigation.navigate('SessionDetail', {sessionId: item.id})
        }>
        <View style={styles.cardTop}>
          <Text style={styles.cardTitle}>
            {item.title ?? item.locationName ?? 'Session'}
          </Text>
          {badge && (
            <View
              style={[
                styles.badgePill,
                {backgroundColor: badge.backgroundColor},
              ]}>
              <Text style={[styles.badgeText, {color: badge.textColor}]}>
                {badge.label}
              </Text>
            </View>
          )}
        </View>

        <Text style={styles.detailText}>⏱ {formatDate(item.startTime)}</Text>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={loadSessions} style={styles.retryButton}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerBlock}>
        <Text style={styles.headerTitle}>Club Schedule</Text>
        <Text style={styles.headerSubtitle}>
          View and check in to upcoming sessions
        </Text>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        renderSectionHeader={({section: {title}}) => (
          <Text style={[styles.sectionTitle, {marginTop: 20}]}>{title}</Text>
        )}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <>
            {highlightedSession && (
              <TouchableOpacity
                style={[
                  styles.highlightCard,
                  {borderLeftColor: highlightedSession.accent},
                ]}
                onPress={() =>
                  navigation.navigate('SessionDetail', {
                    sessionId: highlightedSession.session.id,
                  })
                }>
                <Text style={styles.highlightEyebrow}>
                  {highlightedSession.title}
                </Text>
                <Text style={styles.highlightTitle}>
                  {highlightedSession.session.title ??
                    highlightedSession.session.locationName ??
                    'Session'}
                </Text>
                <Text style={styles.highlightSubtitle}>
                  {highlightedSession.subtitle}
                </Text>
                <Text style={styles.highlightTime}>
                  {formatDate(highlightedSession.session.startTime)}
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.topActionCard}
              onPress={() => navigation.navigate('BackfillSessions')}>
              <View style={styles.topActionTextWrap}>
                <Text style={styles.topActionTitle}>Backfill Check-In</Text>
                <Text style={styles.topActionSubtitle}>
                  Missed a session? Check in after it ends
                </Text>
              </View>
              <Text style={styles.topActionArrow}>›</Text>
            </TouchableOpacity>
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>No sessions found</Text>
            <Text style={styles.emptyText}>
              No upcoming sessions scheduled yet.
            </Text>
          </View>
        }
        ListFooterComponent={
          lockedCount > 0 ? (
            <TouchableOpacity
              style={styles.upgradeBanner}
              onPress={() => navigation.navigate('ClubPro')}>
              <Text style={styles.upgradeBannerText}>
                🔒 Upgrade to Pro to unlock full history
              </Text>
            </TouchableOpacity>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: {flex: 1, backgroundColor: c.background},
    loader: {
      marginTop: 60,
    },
    headerBlock: {
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 10,
    },
    headerTitle: {
      fontSize: 24,
      fontWeight: 'bold',
      color: c.text,
    },
    headerSubtitle: {
      marginTop: 4,
      fontSize: 14,
      color: c.textMuted,
    },
    listContent: {
      padding: 16,
      paddingTop: 8,
      paddingBottom: 40,
    },
    highlightCard: {
      backgroundColor: c.card,
      borderRadius: 14,
      padding: 16,
      marginBottom: 12,
      borderLeftWidth: 4,
    },
    highlightEyebrow: {
      fontSize: 12,
      fontWeight: '700',
      color: c.textMuted,
      textTransform: 'uppercase',
    },
    highlightTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: c.text,
      marginTop: 6,
    },
    highlightSubtitle: {
      marginTop: 4,
      fontSize: 13,
      color: c.textMuted,
      lineHeight: 18,
    },
    highlightTime: {
      marginTop: 8,
      fontSize: 13,
      color: c.text,
      fontWeight: '600',
    },
    topActionCard: {
      backgroundColor: c.card,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 14,
      marginBottom: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    topActionTextWrap: {
      flex: 1,
      paddingRight: 12,
    },
    topActionTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: c.text,
    },
    topActionSubtitle: {
      marginTop: 4,
      fontSize: 13,
      color: c.textMuted,
      lineHeight: 18,
    },
    topActionArrow: {
      fontSize: 24,
      lineHeight: 24,
      color: c.textMuted,
      fontWeight: '600',
    },
    sectionTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: c.text,
      marginBottom: 12,
      marginLeft: 2,
    },
    card: {
      backgroundColor: c.card,
      borderRadius: 14,
      padding: 16,
      marginBottom: 12,
      shadowColor: '#000',
      shadowOffset: {width: 0, height: 2},
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 2,
    },
    cardTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 8,
    },
    cardTitle: {
      fontSize: 17,
      fontWeight: '600',
      color: c.text,
      flex: 1,
      marginRight: 8,
    },
    badgePill: {
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    badgeText: {
      fontSize: 12,
      fontWeight: '700',
    },
    detailText: {
      fontSize: 14,
      color: c.text,
      marginTop: 3,
    },
    emptyWrap: {
      marginTop: 48,
      alignItems: 'center',
      paddingHorizontal: 24,
    },
    emptyTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: c.text,
    },
    emptyText: {
      textAlign: 'center',
      color: c.textMuted,
      marginTop: 6,
      fontSize: 14,
      lineHeight: 20,
    },
    errorWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
    },
    errorText: {
      fontSize: 15,
      color: c.danger,
      textAlign: 'center',
      marginBottom: 16,
    },
    retryButton: {
      paddingHorizontal: 24,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: c.primary,
    },
    retryText: {
      fontSize: 15,
      fontWeight: '600',
      color: '#FFFFFF',
    },
    lockedSection: {
      marginTop: 8,
    },
    cardLocked: {
      opacity: 0.6,
      backgroundColor: c.surfaceRaised,
    },
    cardTitleLocked: {
      color: c.textMuted,
    },
    lockBadge: {
      fontSize: 14,
    },
    upgradeBanner: {
      marginTop: 8,
      marginBottom: 16,
      paddingVertical: 14,
      paddingHorizontal: 16,
      backgroundColor: c.surfaceRaised,
      borderRadius: 12,
      alignItems: 'center',
    },
    upgradeBannerText: {
      fontSize: 14,
      fontWeight: '600',
      color: c.textMuted,
    },
  });
}
