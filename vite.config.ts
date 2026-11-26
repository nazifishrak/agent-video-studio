import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

/**
 * `@xterm/xterm@6.0.0` ships a dead local TypeScript enum IIFE in `requestMode`
 * (`let r;(...NOT_RECOGNIZED...)(r||={});`). Rollup 4 tree-shakes `let r;` while
 * rewriting `r||={}` into `void 0||(r={})`, causing `ReferenceError: r is not defined`
 * whenever a TUI app (like `agy` or `claude`) sends a DECRQM query (`\x1b[?2026$p`).
 */
function fixXtermDecrpmEnum(): Plugin {
  const deadEnumRe =
    /let\s+([a-zA-Z_$][\w$]*);\([a-zA-Z_$][\w$]*=>\([^)]*NOT_RECOGNIZED[^)]*\)\)\(\1\|\|=\{\}\);/;
  return {
    name: 'fix-xterm-decrpm-enum',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('@xterm/xterm') || !id.endsWith('.mjs')) return null;
      if (!code.includes('NOT_RECOGNIZED')) return null;
      if (!deadEnumRe.test(code)) {
        throw new Error(
          `[fix-xterm-decrpm-enum] Found NOT_RECOGNIZED in ${id} but regex did not match; update plugin before building.`
        );
      }
      return {
        code: code.replace(deadEnumRe, '/* removed dead DECRPM enum */'),
        map: null,
      };
    },
  };
}

export default defineConfig({
  plugins: [fixXtermDecrpmEnum(), react(), tailwindcss()],
  root: path.resolve(__dirname, 'src/renderer'),
  base: './',
  build: {
    outDir: path.resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
});
