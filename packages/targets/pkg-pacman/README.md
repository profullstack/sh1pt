# Arch Linux AUR / Pacman

Provides the `pkg-pacman` sh1pt target adapter for generating `PKGBUILD` and `.SRCINFO`
files and publishing packages to the [Arch User Repository (AUR)](https://aur.archlinux.org).

## What it does

- Generates a valid `PKGBUILD` file for Arch Linux / Pacman
- Generates the matching `.SRCINFO` metadata file (required by AUR)
- Publishes to AUR via SSH on `sh1pt promote ship`
- Supports x86_64, aarch64, and noarch architectures

## Package

- Name: `@profullstack/sh1pt-target-pkg-pacman`
- Path: `packages/targets/pkg-pacman`
- Adapter ID: `pkg-pacman`
- Homepage: https://sh1pt.com

## Setup

```bash
sh1pt secret set AUR_SSH_KEY <path-to-your-aur-ssh-private-key>
```

1. Register at [aur.archlinux.org](https://aur.archlinux.org)
2. Add your SSH public key in AUR account settings
3. Clone your package: `git clone ssh://aur@aur.archlinux.org/<pkgname>.git`

See the [AUR submission guidelines](https://wiki.archlinux.org/title/AUR_submission_guidelines) for details.
