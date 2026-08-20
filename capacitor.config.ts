import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'art.throughtheglass.pocketearth',
  appName: 'Pocket Earth',
  webDir: 'dist',
  appendUserAgent: ' PocketEarthMobile/1.0',
  android: {
    backgroundColor: '#eaeaea',
  },
};

export default config;
