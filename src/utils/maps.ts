import {Linking, Platform} from 'react-native';

/**
 * Opens the given address in the device's native maps application.
 * On iOS this opens Apple Maps; on Android it opens Google Maps.
 *
 * This is wired up to the UI but will be enhanced later
 * (e.g. with a lat/lon from geocoding).
 */
export const openInMaps = (address: string): void => {
  const encodedAddress = encodeURIComponent(address);
  const url =
    Platform.OS === 'ios'
      ? `http://maps.apple.com/?q=${encodedAddress}`
      : `geo:0,0?q=${encodedAddress}`;

  Linking.canOpenURL(url)
    .then(supported => {
      if (supported) {
        Linking.openURL(url);
      } else {
        // Fall back to Google Maps web
        Linking.openURL(
          `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`,
        );
      }
    })
    .catch(err => console.warn('[maps] Failed to open maps:', err));
};
