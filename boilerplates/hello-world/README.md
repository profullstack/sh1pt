# hello-world (boilerplate)

A minimal starter that demonstrates shipping one project to multiple surfaces with sh1pt. Copy this directory, rename it, and edit `sh1pt.config.ts`.

```bash
cp -r boilerplates/hello-world my-app
cd my-app
npm install
npx sh1pt setup           # one-time: wire store credentials
npx sh1pt ship --dry-run  # verify the plan
npx sh1pt ship --channel beta
```

Boilerplates are deliberately **not** part of the sh1pt pnpm workspace — they are standalone consumer projects that depend on published `@sh1pt/cli` and `@sh1pt/core`.
