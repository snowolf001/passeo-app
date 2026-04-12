import React, {useLayoutEffect} from 'react';
import {StyleSheet, View, TouchableOpacity, Alert, Text} from 'react-native';
import Pdf from 'react-native-pdf';
import Share from 'react-native-share';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/types';
import {useAppTheme} from '../theme/useAppTheme';

type Props = NativeStackScreenProps<RootStackParamList, 'PdfPreview'>;

export default function PdfPreviewScreen({route, navigation}: Props) {
  const {url, filename, title} = route.params;
  const {colors} = useAppTheme();

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={async () => {
            try {
              await Share.open({
                url,
                type: 'application/pdf',
                filename: filename ?? title ?? 'document',
                failOnCancel: false,
              });
            } catch (err: any) {
              const isCancel =
                err?.message?.includes('Cancel') ||
                err?.message?.includes('User did not share');
              if (!isCancel) {
                Alert.alert('Share Error', err?.message);
              }
            }
          }}
          style={{marginRight: 8, padding: 8}}>
          <Text
            style={{color: colors.primary, fontSize: 16, fontWeight: '600'}}>
            Share
          </Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, url, filename, title, colors.primary]);

  return (
    <View style={[styles.container, {backgroundColor: colors.background}]}>
      <Pdf
        source={{uri: url, cache: true}}
        onLoadComplete={(numberOfPages, _) =>
          console.log('Pages:', numberOfPages)
        }
        onPageChanged={(page, _) => console.log('Current page:', page)}
        onError={error => {
          console.log(error);
          Alert.alert('Error', 'Could not load PDF preview.');
        }}
        onPressLink={uri => console.log('Link pressed:', uri)}
        style={styles.pdf}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  pdf: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
});
