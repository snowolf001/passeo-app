import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Pressable,
} from 'react-native';
import {useAppTheme} from '../theme/useAppTheme';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export default function UpgradeModal({visible, onClose}: Props) {
  const {colors} = useAppTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <Pressable
        style={[styles.backdrop, {backgroundColor: colors.overlay}]}
        onPress={onClose}>
        <Pressable style={[styles.sheet, {backgroundColor: colors.card}]}>
          <Text style={styles.lockIcon}>🔒</Text>
          <Text style={[styles.title, {color: colors.text}]}>
            Upgrade to Pro to unlock this feature
          </Text>
          <Text style={[styles.body, {color: colors.textMuted}]}>
            Applies to the entire club. Does not change roles or permissions.
          </Text>
          <TouchableOpacity
            style={[styles.upgradeBtn, {backgroundColor: colors.primary}]}
            onPress={onClose}>
            <Text style={styles.upgradeBtnText}>Upgrade</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.closeBtn, {backgroundColor: colors.surfaceRaised}]}
            onPress={onClose}>
            <Text style={[styles.closeBtnText, {color: colors.text}]}>
              Not now
            </Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
  },
  lockIcon: {
    fontSize: 44,
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 26,
    marginBottom: 12,
  },
  body: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  upgradeBtn: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  upgradeBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  closeBtn: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
