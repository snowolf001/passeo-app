import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

interface CharCounterProps {
  current: number;
  max: number;
}

export const CharCounter: React.FC<CharCounterProps> = ({current, max}) => {
  const remaining = max - current;
  const isWarning = remaining <= 20;

  return (
    <View style={styles.container}>
      <Text
        style={[
          styles.text,
          {color: isWarning ? '#F59E0B' : '#9CA3AF'}, // Orange or Gray
        ]}>
        {current} / {max}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'flex-end',
    marginTop: 4,
  },
  text: {
    fontSize: 12,
    fontWeight: '500',
  },
});
