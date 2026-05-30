# dnf / RPM (Fedora COPR)

Provides the `pkg-dnf` sh1pt target adapter for building and publishing RPM packages to [Fedora COPR](https://copr.fedorainfracloud.org).

## What it does

- Generates a valid `.spec` file for building RPM packages
- Submits build tasks to your Fedora COPR project via the COPR API
- Supports x86_64, aarch64, and noarch architectures

## Package

- Name: `@profullstack/sh1pt-target-pkg-dnf`
- Path: `packages/targets/pkg-dnf`
- Adapter ID: `pkg-dnf`
- Homepage: https://sh1pt.com

## Setup

```bash
sh1pt secret set COPR_LOGIN <your-copr-login>
sh1pt secret set COPR_TOKEN <your-copr-api-token>
sh1pt secret set COPR_PROJECT <owner>/<project>
```

See [Fedora COPR docs](https://docs.pagure.org/copr.copr/user_documentation.html) for setup steps.
