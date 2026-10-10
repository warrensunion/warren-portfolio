// The page ships as static HTML so it reads before (or without) any JavaScript. This plugin
// renders src/content.js into index.html's <!--content--> slot. In dev it loads content through
// Vite's SSR loader so edits to content.js or render.js reload the page instead of needing a restart.
import { defineConfig } from 'vite';

const SOURCES = ['/src/content.js', '/src/render.js'];

function contentPlugin() {
  let server = null;
  return {
    name: 'portfolio-content',
    configureServer(s) {
      server = s;
    },
    async transformIndexHtml(html) {
      let content, renderPage;
      if (server) {
        ({ content } = await server.ssrLoadModule('/src/content.js'));
        ({ renderPage } = await server.ssrLoadModule('/src/render.js'));
      } else {
        ({ content } = await import('./src/content.js'));
        ({ renderPage } = await import('./src/render.js'));
      }
      const rendered = renderPage(content, { updated: new Date() });
      // Function replacer: a string replacement would expand $-patterns that appear in the copy.
      return html.replace('<!--content-->', () => rendered);
    },
    handleHotUpdate({ file, server: s }) {
      const path = file.replace(/\\/g, '/');
      if (SOURCES.some((p) => path.endsWith(p))) {
        for (const p of SOURCES) {
          const mod = s.moduleGraph.getModuleById(s.config.root.replace(/\\/g, '/') + p);
          if (mod) s.moduleGraph.invalidateModule(mod);
        }
        s.ws.send({ type: 'full-reload' });
        return [];
      }
    },
  };
}

export default defineConfig({
  plugins: [contentPlugin()],
});
