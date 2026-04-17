const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Modules that require native code and should be mocked in Expo Go
const nativeOnlyModules = ['react-native-iap', 'react-native-nitro-modules'];

// Check if we're running in Expo Go (no native modules)
const isExpoGo = !process.env.EAS_BUILD && !process.env.EXPO_DEV_CLIENT_NETWORK;

if (isExpoGo) {
  // Create a custom resolver that mocks native-only modules
  const originalResolveRequest = config.resolver.resolveRequest;

  config.resolver.resolveRequest = (context, moduleName, platform) => {
    // Check if this is a native-only module
    if (nativeOnlyModules.includes(moduleName)) {
      // Return a mock module that exports empty/stub values
      return {
        filePath: require.resolve('./src/services/__mocks__/native-iap-mock.js'),
        type: 'sourceFile',
      };
    }

    // Use the default resolver for everything else
    if (originalResolveRequest) {
      return originalResolveRequest(context, moduleName, platform);
    }

    return context.resolveRequest(context, moduleName, platform);
  };
}

module.exports = config;
