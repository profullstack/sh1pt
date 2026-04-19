# tauri-supabase

Tauri 2 (Rust + WebView) + React + Supabase sh1pt boilerplate. Ships native desktop apps to macOS, Windows, and Linux. Steam Deck Desktop Mode (Flatpak) opt-in.

```bash
cp -r boilerplates/tauri-supabase my-app
cd my-app
npm install
npm run dev

npx sh1pt setup
npx sh1pt ship --channel beta
```

Env vars (`VITE_*` are inlined into the WebView bundle):

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

Run `npm create tauri-app@latest` first if you need the full `src-tauri/` scaffold — this boilerplate shows the sh1pt wiring and Supabase integration, not the Tauri project itself.
