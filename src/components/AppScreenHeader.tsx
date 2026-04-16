import React, {useMemo} from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import {useAppTheme} from '../theme/useAppTheme';
import type {ThemeColors} from '../theme/colors';

type Props = {
  title: string;
  onBackPress?: () => void;
  rightSlot?: React.ReactNode;
};

export default function AppScreenHeader({
  title,
  onBackPress,
  rightSlot,
}: Props) {
  const {colors} = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.headerBar}>
      <TouchableOpacity
        onPress={onBackPress}
        style={styles.backButton}
        hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
        <Text style={styles.backArrow}>←</Text>
      </TouchableOpacity>

      <Text style={styles.headerTitle} numberOfLines={1}>
        {title}
      </Text>

      <View style={styles.rightSide}>
        {rightSlot ?? <View style={styles.headerRightSpacer} />}
      </View>
    </View>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    headerBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 18,
    },

    backButton: {
      width: 40,
      height: 40,
      justifyContent: 'center',
      alignItems: 'flex-start',
    },

    backArrow: {
      fontSize: 24,
      color: c.text,
    },

    headerTitle: {
      flex: 1,
      fontSize: 20,
      fontWeight: '700',
      color: c.text,
      textAlign: 'center',
      marginHorizontal: 8,
    },

    rightSide: {
      width: 40,
      alignItems: 'flex-end',
      justifyContent: 'center',
    },

    headerRightSpacer: {
      width: 40,
      height: 40,
    },
  });
}
