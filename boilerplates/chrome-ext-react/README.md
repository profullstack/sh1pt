# chrome-ext-react

React + Vite + Supabase Chrome extension sh1pt boilerplate (Manifest V3).

```bash
cp -r boilerplates/chrome-ext-react my-ext
cd my-ext
npm install
npm run dev   # load `dist/` as an unpacked extension in chrome://extensions

npx sh1pt setup
npx sh1pt ship --channel beta
```

Supabase session is persisted via `chrome.storage.local` so auth survives across popup closes and service-worker restarts. Env vars are inlined at build time via Vite's `VITE_*` convention.
