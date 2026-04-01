import {Alert} from 'react-native';

interface UpgradeAlertOptions {
  title: string;
  message: string;
  onNavigateToUpgrade: () => void;
  confirmButtonText?: string;
  cancelButtonText?: string;
}

export function showUpgradeDialog({
  title,
  message,
  onNavigateToUpgrade,
  confirmButtonText = 'Unlock Evidence Protection',
  cancelButtonText = 'Not Now',
}: UpgradeAlertOptions) {
  Alert.alert(title, message, [
    {text: cancelButtonText, style: 'cancel'},
    {
      text: confirmButtonText,
      onPress: onNavigateToUpgrade,
      style: 'default',
    },
  ]);
}
