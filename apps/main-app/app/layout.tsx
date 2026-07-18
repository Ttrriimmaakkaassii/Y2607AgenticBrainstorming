import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Multi-Agent Discussion Platform',
  description: 'WhatsApp-style multi-agent LLM discussion platform',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

/**
 * Global chunk-error recovery for static exports. When a new deploy changes
 * the hashed chunk filenames, browsers with cached old manifests try to load
 * chunks that no longer exist → 404/ChunkLoadError → white screen. This
 * script catches that and forces a hard reload so the browser fetches the
 * new manifest + new chunks. Runs once per page load.
 */
const CHUNK_RECOVERY = `(function(){
  if (window.__chunkRecovery) return; window.__chunkRecovery = true;
  window.addEventListener('error', function(e) {
    var msg = (e.message || '') + (e.error && e.error.name || '');
    if (msg.indexOf('ChunkLoadError') !== -1 || msg.indexOf('Loading chunk') !== -1) {
      console.warn('Chunk load failed — reloading to fetch new build assets.');
      window.location.reload();
    }
  }, true);
  window.addEventListener('unhandledrejection', function(e) {
    var msg = (e.reason && (e.reason.message || e.reason.name || '')) || String(e.reason || '');
    if (msg.indexOf('ChunkLoadError') !== -1 || msg.indexOf('Loading chunk') !== -1) {
      console.warn('Chunk load rejected — reloading to fetch new build assets.');
      window.location.reload();
    }
  });
})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: CHUNK_RECOVERY }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
