// Tipos mínimos do react-test-renderer (usado só nos testes de hooks).
declare module 'react-test-renderer' {
  import type { ReactElement } from 'react';

  export interface ReactTestRenderer {
    unmount(): void;
  }

  export function act(callback: () => void): void;
  export function act(callback: () => Promise<void>): Promise<void>;

  const TestRenderer: {
    create(element: ReactElement): ReactTestRenderer;
  };
  export default TestRenderer;
}
