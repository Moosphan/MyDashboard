import { resolve } from 'path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
    main: {
        build: {
            rollupOptions: {
                input: {
                    index: resolve('src/main/index.ts'),
                    'codex-session-usage-worker': resolve('src/main/services/codex-session-usage-worker.ts'),
                },
            },
        },
        plugins: [externalizeDepsPlugin()],
        resolve: {
            alias: {
                '@shared': resolve('src/shared'),
            },
        },
    },
    preload: {
        plugins: [externalizeDepsPlugin()],
        resolve: {
            alias: {
                '@shared': resolve('src/shared'),
            },
        },
    },
    renderer: {
        resolve: {
            alias: {
                '@': resolve('src/renderer'),
                '@shared': resolve('src/shared'),
                '@root': resolve('.'),
            },
        },
        plugins: [react()],
    },
});
