# expo-supabase

Expo (React Native) + Supabase sh1pt boilerplate. Ships to iOS, Android, and optionally F-Droid.

```bash
cp -r boilerplates/expo-supabase my-app
cd my-app
npm install
npx expo start

# once ready to ship:
npx sh1pt setup
npx sh1pt ship --channel beta   # → TestFlight + Play internal track
```

Supabase session is persisted via `expo-secure-store` (iOS Keychain / Android Keystore).

Env vars (prefixed `EXPO_PUBLIC_` so they get inlined into the native bundle):

```
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```
