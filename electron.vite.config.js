import { resolve } from 'path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
const buildOut = process.env.MYDASHBOARD_BUILD_OUT;
export default defineConfig({
    main: {
        build: {
            ...(buildOut ? { outDir: resolve(buildOut, 'main') } : {}),
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
        build: buildOut ? { outDir: resolve(buildOut, 'preload') } : {},
        plugins: [externalizeDepsPlugin()],
        resolve: {
            alias: {
                '@shared': resolve('src/shared'),
            },
        },
    },
    renderer: {
        build: buildOut ? { outDir: resolve(buildOut, 'renderer') } : {},
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
