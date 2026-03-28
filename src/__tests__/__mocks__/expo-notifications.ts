// Mock for expo-notifications
export const setNotificationHandler = jest.fn();
export const scheduleNotificationAsync = jest.fn(() => Promise.resolve('notification-id'));
export const cancelScheduledNotificationAsync = jest.fn(() => Promise.resolve());
export const cancelAllScheduledNotificationsAsync = jest.fn(() => Promise.resolve());
export const getAllScheduledNotificationsAsync = jest.fn(() => Promise.resolve([]));
export const getPermissionsAsync = jest.fn(() => Promise.resolve({ status: 'granted' }));
export const requestPermissionsAsync = jest.fn(() => Promise.resolve({ status: 'granted' }));
export const setNotificationChannelAsync = jest.fn(() => Promise.resolve());
export const AndroidImportance = { HIGH: 4, DEFAULT: 3 };
export const SchedulableTriggerInputTypes = { WEEKLY: 'weekly' };
