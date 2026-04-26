# Target Matrix

Each row is a **target adapter** — one plugin in `packages/targets/*`. Status legend: `✅` stubbed, `🚧` planned, `—` not started.

## Interface surfaces

### Web / PWA
| Target id | Channel | Status |
|---|---|---|
| `web-static` | Cloudflare Pages / Netlify / S3+CDN | ✅ |
| `web-pwa` | Manifest + service worker | 🚧 |

### CLI / TUI
| Target id | Channel | Status |
|---|---|---|
| `pkg-npm` | npmjs.com | ✅ |
| `pkg-aube` | Aube (npm-compatible publish) | ✅ |
| `pkg-homebrew` | Homebrew tap | ✅ |
| `pkg-winget` | Microsoft winget | 🚧 |
| `pkg-scoop` | Scoop bucket | 🚧 |
| `pkg-apt` | apt repo / PPA | 🚧 |
| `pkg-snap` | Snapcraft | 🚧 |
| `pkg-flatpak` | Flathub | 🚧 |
| `pkg-aur` | Arch User Repo | 🚧 |
| `pkg-nix` | nixpkgs | 🚧 |

### Desktop
| Target id | Channel | Status |
|---|---|---|
| `desktop-mac` | Mac App Store / notarized DMG | ✅ |
| `desktop-win` | Microsoft Store / MSIX / MSI | ✅ |
| `desktop-linux` | AppImage / Snap / Flatpak / deb / rpm | ✅ |
| `desktop-steamos` | Steam Deck Desktop Mode (Flathub / self-hosted) | ✅ |

### Mobile
| Target id | Channel | Status |
|---|---|---|
| `mobile-ios` | App Store Connect + TestFlight | ✅ |
| `mobile-android` | Google Play + internal tracks | 🚧 |
| `pkg-fdroid` | F-Droid (FOSS Android repo) | ✅ |
| `mobile-huawei` | Huawei AppGallery | — |
| `mobile-amazon` | Amazon Appstore | — |

### Wearable
| Target id | Channel | Status |
|---|---|---|
| `wear-watchos` | App Store (watchOS) | — |
| `wear-wearos` | Play Store (Wear OS) | — |
| `wear-garmin` | Connect IQ | — |

### TV / Console
| Target id | Channel | Status |
|---|---|---|
| `tv-tvos` | App Store (tvOS) | ✅ |
| `tv-androidtv` | Play Store (Android TV) | ✅ |
| `tv-roku` | Roku Channel Store | ✅ ⚠️ |
| `tv-firetv` | Amazon Fire TV | ✅ |
| `tv-webos` | LG Content Store | ✅ |
| `tv-tizen` | Samsung Tizen Store | — |
| `console-steam` | Steam / Steam Deck (SteamOS) | ✅ |
| `console-xbox` | Microsoft Partner Center | — |
| `console-playstation` | PlayStation Partners | — |
| `console-switch` | Nintendo NDP | — |

### XR (VR / AR)
| Target id | Channel | Status |
|---|---|---|
| `xr-webxr` | WebXR (browser-native VR/AR) | ✅ |
| `xr-meta-quest` | Meta Horizon Store (Quest 2/3/Pro/3S) | ✅ |
| `xr-sidequest` | SideQuest (Quest sideload) | ✅ |
| `xr-visionos` | App Store (Apple Vision Pro) | ✅ |
| `xr-pico` | Pico Store | ✅ |
| `xr-steamvr` | Steam (PCVR / OpenXR) | ✅ |
| `xr-viveport` | Viveport | — |

### Browser extension
| Target id | Channel | Status |
|---|---|---|
| `browser-chrome` | Chrome Web Store | ✅ |
| `browser-firefox` | addons.mozilla.org | 🚧 |
| `browser-edge` | Edge Add-ons | 🚧 |
| `browser-safari` | App Store (Safari ext.) | 🚧 |

### Plugin / integration
| Target id | Channel | Status |
|---|---|---|
| `plugin-vscode` | VS Code Marketplace + OpenVSX | 🚧 |
| `plugin-jetbrains` | JetBrains Marketplace | 🚧 |
| `plugin-figma` | Figma Community | 🚧 |
| `plugin-slack` | Slack App Directory | 🚧 |
| `plugin-zapier` | Zapier Platform | 🚧 |
| `plugin-shopify` | Shopify App Store | 🚧 |
| `plugin-wordpress` | wordpress.org plugins | 🚧 |
| `plugin-notion` | Notion integrations | — |

### Voice
| Target id | Channel | Status |
|---|---|---|
| `voice-alexa` | Alexa Skills | — |
| `voice-google` | Google Actions | — |

### Chat / bot
| Target id | Channel | Status |
|---|---|---|
| `chat-telegram` | Telegram Bot API | ✅ |
| `chat-slack` | Slack App Directory | ✅ |
| `chat-signal` | signal-cli / signald | ✅ ⚠️ |
| `chat-discord` | Discord App Directory | ✅ |
| `chat-whatsapp` | WhatsApp Business Cloud API | ✅ |
| `chat-teams` | Teams App Store | — |
| `chat-line` | LINE Developers | — |

### Email
| Target id | Channel | Status |
|---|---|---|
| `email-transactional` | Postmark / Resend / SES templates | 🚧 |

### Embedded / IoT
| Target id | Channel | Status |
|---|---|---|
| `iot-balena` | balenaCloud | — |
| `iot-hass` | Home Assistant add-ons | — |
| `iot-esphome` | ESPHome OTA | — |

### API / SDK / Webhooks
| Target id | Channel | Status |
|---|---|---|
| `api-rapidapi` | RapidAPI Hub | — |
| `api-aws-marketplace` | AWS Marketplace (API) | — |
| `pkg-jsr` | JSR (TS-native) | ✅ |
| `pkg-deno` | deno.land/x (git tags) | ✅ |
| `pkg-ghpackages` | GitHub Packages (npm) | ✅ |
| `sdk-npm` | npm (library) | 🚧 |
| `sdk-pypi` | PyPI | 🚧 |
| `sdk-maven` | Maven Central | 🚧 |
| `sdk-nuget` | NuGet | 🚧 |
| `sdk-cargo` | crates.io | 🚧 |
| `sdk-gomod` | pkg.go.dev (proxy) | 🚧 |
| `sdk-packagist` | Packagist | — |
| `sdk-rubygems` | RubyGems | — |
| `sdk-hex` | hex.pm | — |
| `sdk-pub` | pub.dev | — |
| `webhooks` | Versioned outbound webhook catalog | — |

### CDN / container registries
| Target id | Channel | Status |
|---|---|---|
| `pkg-cdn` | jsDelivr / unpkg / esm.sh / cdnjs / Skypack / JSPM | ✅ |
| `pkg-docker` | Docker Hub / GHCR / Quay / ECR / GCR / ACR | ✅ |

### App hosting
| Target id | Channel | Status |
|---|---|---|
| `deploy-denodeploy` | Deno Deploy | ✅ |
| `deploy-workers` | Cloudflare Workers | ✅ |
| `deploy-fly` | Fly.io | ✅ |
| `deploy-railway` | Railway | ✅ |
| `deploy-render` | Render | — |
| `deploy-vercel` | Vercel (SSR/API) | — |
| `deploy-netlify` | Netlify (Functions/Edge) | — |
| `deploy-lambda` | AWS Lambda | — |
| `deploy-cloudrun` | Google Cloud Run | — |

---

## Note on package managers

Package managers are a **distribution channel**, not an interface — the CLI ships *via* `pkg-homebrew`, the SDK ships *via* `sdk-npm`. Each interface surface can fan out to multiple distribution channels. The manifest composes them:

```ts
targets: {
  cli: {
    use: 'cli-binary',
    distribute: ['pkg-npm', 'pkg-homebrew', 'pkg-winget', 'pkg-scoop'],
  },
}
```
