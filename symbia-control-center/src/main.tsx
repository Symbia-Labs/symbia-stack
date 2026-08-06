import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { loader } from '@monaco-editor/react';
import { App } from './App';
import './styles/globals.css';

// Monaco is served by this app's own server, same origin as everything else.
//
// Without this, @monaco-editor/loader uses its default and fetches the editor
// from cdn.jsdelivr.net at runtime: a cross-origin request to a third party,
// running whatever version the CDN answers with rather than the one in the
// lockfile, and failing entirely on a machine with no route to the public
// internet. The build copies monaco-editor/min/vs to dist/vendor/monaco/vs.
//
// Called here, once, before anything mounts. The editor is used in exactly one
// place (panels/catalog/shared/JsonEditor.tsx), but this configuration belongs
// to the application rather than to that component — a second call site is the
// forked-concern defect this codebase keeps producing.
loader.config({ paths: { vs: '/vendor/monaco/vs' } });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
