const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

const defaultConfig = getDefaultConfig(__dirname);

const config = {
  resolver: {
    blockList: [
      /android[\/\\]app[\/\\]build[\/\\].*/,
      /android[\/\\]build[\/\\].*/,
    ],
    sourceExts: [...defaultConfig.resolver.sourceExts, 'mjs'],
  },
};

module.exports = mergeConfig(defaultConfig, config);
