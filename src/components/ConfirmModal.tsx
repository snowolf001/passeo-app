import React from 'react';
import {Modal, Pressable, StyleSheet, Text, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useAppTheme} from '../theme/useAppTheme';

type Props = {
  visible: boolean;
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export const ConfirmModal: React.FC<Props> = ({
  visible,
  title,
  message,
  confirmText = 'Delete',
  cancelText = 'Cancel',
  onCancel,
  onConfirm,
}) => {
  const {colors} = useAppTheme();

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={onCancel}>
      <View style={styles.modalContainer}>
        <Pressable
          style={[styles.backdrop, {backgroundColor: 'rgba(0,0,0,0.5)'}]}
          onPress={onCancel}
        />

        <View
          style={[
            styles.card,
            {backgroundColor: colors.card, borderColor: colors.border},
          ]}>
          <View style={styles.header}>
            <Icon name="alert-circle-outline" size={24} color="#EF5350" />
            <Text style={[styles.title, {color: colors.text}]}>{title}</Text>
          </View>

          {message && (
            <Text style={[styles.body, {color: colors.textMuted}]}>
              {message}
            </Text>
          )}

          <View style={styles.actions}>
            <Pressable
              style={({pressed}) => [
                styles.btn,
                {
                  borderColor: colors.border,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
              onPress={onCancel}>
              <Text style={{color: colors.text}}>{cancelText}</Text>
            </Pressable>

            <Pressable
              style={({pressed}) => [
                styles.btn,
                {
                  backgroundColor: '#EF5350',
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
              onPress={onConfirm}>
              <Text style={{color: '#fff', fontWeight: '800'}}>
                {confirmText}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {flex: 1, justifyContent: 'center', paddingHorizontal: 16},
  backdrop: {...StyleSheet.absoluteFillObject},
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    elevation: 10,
    shadowOpacity: 0.25,
    shadowRadius: 14,
    shadowOffset: {width: 0, height: 8},
  },
  header: {flexDirection: 'row', alignItems: 'center'},
  title: {marginLeft: 10, fontSize: 18, fontWeight: '700'},
  body: {marginTop: 12, fontSize: 15, lineHeight: 22, marginHorizontal: 4},
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 24,
    gap: 12,
  },
  btn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent', // Default transparent to allow background color usage without border
    alignItems: 'center',
    justifyContent: 'center',
  },
});
