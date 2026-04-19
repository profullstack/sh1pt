import { defineConfig } from '@sh1pt/core';

export default defineConfig({
  name: 'sh1pt-tauri-supabase',
  version: '0.1.0',
  targets: {
    mac: {
      use: 'desktop-mac',
      config: { bundleId: 'com.example.sh1pttaurisupabase', teamId: 'YOUR_TEAM_ID', distribution: 'dmg' },
    },
    win: {
      use: 'desktop-win',
      config: { appId: 'Example.Sh1ptTauriSupabase', publisherId: 'CN=YOUR_PUBLISHER', distribution: 'msi' },
    },
    linux: {
      use: 'desktop-linux',
      config: { appId: 'com.example.sh1pttaurisupabase', formats: ['appimage', 'deb', 'rpm'] },
    },
    deck: {
      enabled: false,
      use: 'desktop-steamos',
      config: { appId: 'com.example.sh1pttaurisupabase', sourceDir: './src-tauri/target/release', distribution: 'flathub' },
    },
  },
  hooks: {
    prebuild: 'npm run build && cd src-tauri && cargo build --release',
  },
});
