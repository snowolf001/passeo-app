import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useApp} from '../context/AppContext';
import {getSessions, getCheckedInMembers, ApiSession} from '../services/api/sessionApi';
import {getMemberAttendance} from '../services/api/attendanceApi';
import {formatDate} from '../utils/date';
import {useAppTheme} from '../theme/useAppTheme';
import type {ThemeColors} from '../theme/colors';

type Props = {navigation: any};

export default function HomeScreen({navigation}: Props) {
  const {currentMembership, currentClub} = useApp();
  const {colors} = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [nextSession, setNextSession] = useState<ApiSession | null>(null);
  const [todaySession, setTodaySession] = useState<ApiSession | null>(null);
  const [isTodayCheckedIn, setIsTodayCheckedIn] = useState(false);
  const [hasTodaySession, setHasTodaySession] = useState(false);
  const [todayCheckedInCount, setTodayCheckedInCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    console.log(
      '[HomeScreen] loadData — currentMembership:',
      currentMembership?.id ?? 'null',
      'currentClub:',
      currentClub?.id ?? 'null',
    );

    if (!currentMembership) {
      console.log('[HomeScreen] loadData skipped — no currentMembership');
      return;
    }

    setLoading(true);

    try {
      const rawSessions = await getSessions(currentMembership.clubId);
      const sessions = rawSessions.sort(
        (a, b) =>
          new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
      );

      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);

      const todayEnd = new Date(now);
      todayEnd.setHours(23, 59, 59, 999);

      const upcoming = sessions.filter(s => new Date(s.startTime) >= now);
      setNextSession(upcoming[0] ?? null);

      const foundTodaySession = sessions.find(s => {
        const st = new Date(s.startTime);
        if (!(st >= todayStart && st <= todayEnd)) {
          return false;
        }
        if (s.endTime && new Date(s.endTime) < now) {
          return false;
        }
        return true;
      });

      if (foundTodaySession) {
        setHasTodaySession(true);
        setTodaySession(foundTodaySession);

        const [attendance, checkedInMembers] = await Promise.allSettled([
          getMemberAttendance(currentMembership.id),
          getCheckedInMembers(foundTodaySession.id),
        ]);

        setIsTodayCheckedIn(
          attendance.status === 'fulfilled'
            ? attendance.value.some(a => a.sessionId === foundTodaySession.id)
            : false,
        );

        setTodayCheckedInCount(
          checkedInMembers.status === 'fulfilled'
            ? checkedInMembers.value.length
            : 0,
        );
      } else {
        setHasTodaySession(false);
        setTodaySession(null);
        setIsTodayCheckedIn(false);
        setTodayCheckedInCount(0);
      }
    } finally {
      setLoading(false);
    }
  }, [currentMembership, currentClub]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', loadData);
    return unsub;
  }, [navigation, loadData]);

  console.log(
    '[HomeScreen] render — currentMembership:',
    currentMembership?.id ?? 'null',
    'currentClub:',
    currentClub?.id ?? 'null',
    'loading:',
    loading,
  );

  if (!currentMembership || !currentClub) {
    console.log('[HomeScreen] showing spinner — waiting for AppContext data');
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator
          style={styles.loadingSpinner}
          color={colors.primary}
        />
      </SafeAreaView>
    );
  }

  const role = currentMembership.role;
  const canCreateSession = ['host', 'owner'].includes(role);
  const displayName = currentMembership.userName ?? 'there';

  const todayStatus = (() => {
    if (loading) {
      return {
        icon: '⏳',
        title: 'Loading today',
        subtitle: 'Checking your session status...',
        secondary: undefined as string | undefined,
        toneStyle: styles.todayCardNeutral,
        textStyle: styles.todayTitle,
        subTextStyle: styles.todaySubtitle,
        onPress: undefined as (() => void) | undefined,
        cta: '',
      };
    }

    if (isTodayCheckedIn && todaySession) {
      return {
        icon: '✅',
        title: todaySession.title ?? 'Active Session',
        subtitle: `${todayCheckedInCount} checked in`,
        secondary: 'You have checked in',
        toneStyle: styles.todayCardSuccess,
        textStyle: styles.todayTitleDark,
        subTextStyle: styles.todaySubtitleDark,
        onPress: () =>
          navigation.navigate('SessionDetail', {sessionId: todaySession.id}),
        cta: 'Open session',
      };
    }

    if (hasTodaySession && todaySession) {
      return {
        icon: '🏃',
        title: todaySession.title ?? 'Active Session',
        subtitle: `${todayCheckedInCount} checked in`,
        secondary: "You haven't checked in yet",
        toneStyle: styles.todayCardInfo,
        textStyle: styles.todayTitleDark,
        subTextStyle: styles.todaySubtitleDark,
        onPress: () =>
          navigation.navigate('SessionDetail', {sessionId: todaySession.id}),
        cta: 'Check details',
      };
    }

    return {
      icon: '📆',
      title: 'No active session today',
      subtitle: 'Check the schedule for upcoming sessions.',
      secondary: undefined as string | undefined,
      toneStyle: styles.todayCardNeutral,
      textStyle: styles.todayTitle,
      subTextStyle: styles.todaySubtitle,
      onPress: () => navigation.navigate('Schedule' as any),
      cta: 'View schedule',
    };
  })();

  const TodayCardWrapper = todayStatus.onPress ? TouchableOpacity : View;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Text style={styles.overline}>Club home</Text>
          <Text style={styles.clubName}>{currentClub.name}</Text>
          <Text style={styles.greeting}>Welcome back, {displayName}</Text>
        </View>

        <Text style={styles.sectionTitle}>Today</Text>

        <TodayCardWrapper
          style={[styles.todayCard, todayStatus.toneStyle]}
          {...(todayStatus.onPress ? {onPress: todayStatus.onPress} : {})}>
          <View style={styles.todayIconWrap}>
            <Text style={styles.todayIcon}>{todayStatus.icon}</Text>
          </View>

          <View style={styles.todayContent}>
            <Text style={[styles.todayTitle, todayStatus.textStyle]}>
              {todayStatus.title}
            </Text>
            <Text style={[styles.todaySubtitle, todayStatus.subTextStyle]}>
              {todayStatus.subtitle}
            </Text>
            {!!(todayStatus as any).secondary && (
              <Text style={[styles.todaySubtitle, todayStatus.subTextStyle]}>
                {(todayStatus as any).secondary}
              </Text>
            )}

            {!!todayStatus.cta && (
              <Text
                style={[
                  styles.todayCta,
                  todayStatus.textStyle === styles.todayTitleDark
                    ? styles.todayCtaDark
                    : styles.todayCtaDefault,
                ]}>
                {todayStatus.cta} →
              </Text>
            )}
          </View>
        </TodayCardWrapper>

        <Text style={styles.sectionTitle}>Up next</Text>

        {nextSession ? (
          <TouchableOpacity
            style={styles.nextSessionCard}
            onPress={() =>
              navigation.navigate('SessionDetail', {sessionId: nextSession.id})
            }>
            <Text style={styles.nextSessionLabel}>Next session</Text>
            <Text
              style={styles.nextSessionTitle}
              numberOfLines={1}
              ellipsizeMode="tail">
              {nextSession.title}
            </Text>
            <Text style={styles.nextSessionDetail}>
              ⏱ {formatDate(nextSession.startTime)}
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No upcoming session</Text>
            <Text style={styles.emptySubtitle}>
              Nothing is scheduled yet. Check the schedule again later.
            </Text>
          </View>
        )}

        <View style={styles.summaryStrip}>
          <View style={styles.summaryPill}>
            <Text style={styles.summaryPillValue}>
              {currentMembership.credits}
            </Text>
            <Text style={styles.summaryPillLabel}>Credits</Text>
          </View>

          <TouchableOpacity
            style={styles.summaryPill}
            onPress={() => navigation.navigate('Profile' as any)}>
            <Text style={styles.summaryPillValue}>Profile</Text>
            <Text style={styles.summaryPillLabel}>Membership details</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Quick actions</Text>

        <View style={styles.quickGrid}>
          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => navigation.navigate('Schedule' as any)}>
            <Text style={styles.quickIcon}>📅</Text>
            <Text style={styles.quickTitle}>View Schedule</Text>
            <Text style={styles.quickSubtitle}>See upcoming sessions</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => navigation.navigate('Profile' as any)}>
            <Text style={styles.quickIcon}>👤</Text>
            <Text style={styles.quickTitle}>My Profile</Text>
            <Text style={styles.quickSubtitle}>Membership and details</Text>
          </TouchableOpacity>

          {canCreateSession && (
            <TouchableOpacity
              style={styles.quickCard}
              onPress={() => navigation.navigate('CreateSession')}>
              <Text style={styles.quickIcon}>➕</Text>
              <Text style={styles.quickTitle}>New Session</Text>
              <Text style={styles.quickSubtitle}>Create a session</Text>
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.sectionTitle}>Club snapshot</Text>

        <View style={styles.snapshotCard}>
          <View style={styles.snapshotRow}>
            <Text style={styles.snapshotLabel}>Club</Text>
            <Text
              style={styles.snapshotValue}
              numberOfLines={1}
              ellipsizeMode="tail">
              {currentClub.name}
            </Text>
          </View>

          {todaySession && (
            <>
              <View style={styles.snapshotDivider} />
              <View style={styles.snapshotRow}>
                <Text style={styles.snapshotLabel}>Today&apos;s session</Text>
                <Text
                  style={styles.snapshotValue}
                  numberOfLines={1}
                  ellipsizeMode="tail">
                  {todaySession.title}
                </Text>
              </View>
            </>
          )}

          {nextSession && (
            <>
              <View style={styles.snapshotDivider} />
              <View style={styles.snapshotRow}>
                <Text style={styles.snapshotLabel}>Next session</Text>
                <Text
                  style={styles.snapshotValue}
                  numberOfLines={1}
                  ellipsizeMode="tail">
                  {nextSession.title}
                </Text>
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
    },

    loadingSpinner: {
      marginTop: 60,
    },

    scroll: {
      padding: 20,
      paddingBottom: 40,
    },

    headerRow: {
      marginBottom: 20,
    },

    overline: {
      fontSize: 12,
      fontWeight: '700',
      color: c.primary,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: 6,
    },

    clubName: {
      fontSize: 28,
      fontWeight: '800',
      color: c.text,
    },

    greeting: {
      fontSize: 15,
      color: c.textMuted,
      marginTop: 6,
    },

    sectionTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: c.text,
      marginBottom: 12,
      marginTop: 2,
    },

    todayCard: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 18,
      padding: 16,
      marginBottom: 24,
      gap: 14,
    },

    todayCardSuccess: {
      backgroundColor: '#D1FAE5',
    },

    todayCardInfo: {
      backgroundColor: '#DBEAFE',
    },

    todayCardNeutral: {
      backgroundColor: c.card,
    },

    todayIconWrap: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.35)',
    },

    todayIcon: {
      fontSize: 24,
    },

    todayContent: {
      flex: 1,
      minWidth: 0,
    },

    todayTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: c.text,
    },

    todayTitleDark: {
      color: '#1C1C1E',
    },

    todaySubtitle: {
      fontSize: 13,
      color: c.textMuted,
      marginTop: 4,
      lineHeight: 18,
    },

    todaySubtitleDark: {
      color: '#3C3C43',
    },

    todayCta: {
      marginTop: 10,
      fontSize: 13,
      fontWeight: '700',
    },

    todayCtaDark: {
      color: '#1C1C1E',
    },

    todayCtaDefault: {
      color: c.primary,
    },

    nextSessionCard: {
      backgroundColor: c.primary,
      borderRadius: 18,
      padding: 20,
      marginBottom: 20,
    },

    nextSessionLabel: {
      fontSize: 12,
      color: 'rgba(255,255,255,0.78)',
      marginBottom: 6,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },

    nextSessionTitle: {
      fontSize: 20,
      fontWeight: '800',
      color: '#FFFFFF',
      marginBottom: 8,
    },

    nextSessionDetail: {
      fontSize: 14,
      color: 'rgba(255,255,255,0.9)',
      lineHeight: 20,
    },

    emptyCard: {
      backgroundColor: c.card,
      borderRadius: 18,
      padding: 18,
      marginBottom: 20,
    },

    emptyTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: c.text,
      marginBottom: 6,
    },

    emptySubtitle: {
      fontSize: 14,
      color: c.textMuted,
      lineHeight: 20,
    },

    summaryStrip: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 24,
    },

    summaryPill: {
      flex: 1,
      backgroundColor: c.card,
      borderRadius: 16,
      paddingVertical: 16,
      paddingHorizontal: 14,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 74,
    },

    summaryPillValue: {
      fontSize: 18,
      fontWeight: '800',
      color: c.text,
      textAlign: 'center',
    },

    summaryPillLabel: {
      fontSize: 12,
      color: c.textMuted,
      marginTop: 4,
      fontWeight: '600',
      textAlign: 'center',
    },

    quickGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      marginBottom: 24,
    },

    quickCard: {
      width: '48%',
      backgroundColor: c.card,
      borderRadius: 18,
      padding: 16,
      shadowColor: '#000',
      shadowOffset: {width: 0, height: 1},
      shadowOpacity: 0.05,
      shadowRadius: 3,
      elevation: 1,
    },

    quickIcon: {
      fontSize: 24,
      marginBottom: 10,
    },

    quickTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: c.text,
      marginBottom: 4,
    },

    quickSubtitle: {
      fontSize: 12,
      lineHeight: 17,
      color: c.textMuted,
    },

    snapshotCard: {
      backgroundColor: c.card,
      borderRadius: 18,
      padding: 16,
    },

    snapshotRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      minHeight: 26,
    },

    snapshotLabel: {
      flexShrink: 0,
      fontSize: 13,
      color: c.textMuted,
      fontWeight: '600',
      maxWidth: '42%',
    },

    snapshotValue: {
      flex: 1,
      minWidth: 0,
      flexShrink: 1,
      textAlign: 'right',
      fontSize: 14,
      color: c.text,
      fontWeight: '700',
    },

    snapshotDivider: {
      height: 1,
      backgroundColor: c.border,
      marginVertical: 12,
    },
  });
}
