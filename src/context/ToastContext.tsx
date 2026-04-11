/**
 * Lightweight toast / snackbar feedback system.
 *
 * Used by interactions that need non-intrusive confirmation (e.g. reminder
 * toggles, sync results) instead of blocking Alert.alert dialogs.
 *
 * Wraps react-native-paper's Snackbar so we get a polished, accessible widget
 * for free without bringing in another dependency.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { StyleSheet, View } from 'react-native';
import { Snackbar } from 'react-native-paper';
import { useTheme } from './ThemeContext';

type ToastVariant = 'info' | 'success' | 'error';

interface ToastOptions {
  variant?: ToastVariant;
  duration?: number;
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastContextValue {
  show: (_message: string, _options?: ToastOptions) => void;
  hide: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used inside <ToastProvider>');
  }
  return ctx;
}

interface ToastState {
  visible: boolean;
  message: string;
  variant: ToastVariant;
  duration: number;
  actionLabel?: string;
  onAction?: () => void;
}

const DEFAULT_DURATIONS: Record<ToastVariant, number> = {
  info: 2500,
  success: 2500,
  error: 4000,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const [state, setState] = useState<ToastState>({
    visible: false,
    message: '',
    variant: 'info',
    duration: DEFAULT_DURATIONS.info,
  });

  // Track the latest "show" call so a fast follow-up replaces the previous toast
  // instead of being queued behind its dismissal animation.
  const tokenRef = useRef(0);

  const show = useCallback((message: string, options: ToastOptions = {}) => {
    const variant = options.variant ?? 'info';
    const duration = options.duration ?? DEFAULT_DURATIONS[variant];
    tokenRef.current += 1;
    setState({
      visible: true,
      message,
      variant,
      duration,
      actionLabel: options.actionLabel,
      onAction: options.onAction,
    });
  }, []);

  const hide = useCallback(() => {
    setState((prev) => ({ ...prev, visible: false }));
  }, []);

  const value = useMemo(() => ({ show, hide }), [show, hide]);

  // Color the snackbar background by variant. Paper's Snackbar uses the wrapper
  // style for the visible card, not contentStyle.
  const variantBackground =
    state.variant === 'error'
      ? colors.primary
      : state.variant === 'success'
        ? colors.success
        : colors.backgroundCard;
  const variantText = state.variant === 'info' ? colors.text : colors.white;

  return (
    <ToastContext.Provider value={value}>
      {children}
      <View pointerEvents="box-none" style={styles.host}>
        <Snackbar
          visible={state.visible}
          onDismiss={hide}
          duration={state.duration}
          style={[styles.snackbar, { backgroundColor: variantBackground }]}
          theme={{ colors: { onSurface: variantText, inverseOnSurface: variantText } }}
          action={
            state.actionLabel
              ? {
                  label: state.actionLabel,
                  onPress: () => {
                    state.onAction?.();
                    hide();
                  },
                  textColor: variantText,
                }
              : undefined
          }
        >
          {state.message}
        </Snackbar>
      </View>
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  snackbar: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
  },
});
