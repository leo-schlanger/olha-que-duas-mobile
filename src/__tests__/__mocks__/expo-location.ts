// Mock for expo-location
export const requestForegroundPermissionsAsync = jest.fn(() =>
  Promise.resolve({ status: 'granted' })
);
export const getCurrentPositionAsync = jest.fn(() =>
  Promise.resolve({
    coords: { latitude: 40.0, longitude: -8.0 },
  })
);
