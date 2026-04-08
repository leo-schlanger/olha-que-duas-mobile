/**
 * Lightweight screen-level error boundary wrapper
 * Isolates errors per screen so one screen crashing doesn't take down the whole app
 */

import React, { ReactNode } from 'react';
import { ErrorBoundary } from './ErrorBoundary';

interface Props {
  children: ReactNode;
}

export function ScreenErrorBoundary({ children }: Props) {
  return <ErrorBoundary>{children}</ErrorBoundary>;
}
