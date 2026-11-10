declare const __APP_VERSION__: string;

/** Commit und Zeitpunkt des Builds (siehe vite.config.ts) */
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'unbekannt';
