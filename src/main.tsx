import { createRoot } from 'react-dom/client';

import GraphicsModeHost from './game/engine3d/GraphicsModeHost';
import { ErrorBoundary } from '@/components/error-boundary';

import './index.css';
import './monster-sprites.gen.css';

createRoot(document.getElementById('root')!, {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <ErrorBoundary>
    <GraphicsModeHost />
  </ErrorBoundary>,
);

// BUILD 345: signal the boot watchdog that React rendered (first painted
// frame), so pre-React crash handling stands down.
requestAnimationFrame(() => {
  (window as unknown as { __agBooted?: boolean }).__agBooted = true;
});
