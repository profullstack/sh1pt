import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';

// F-Droid — FOSS Android app repo. Two modes:
//   - 'main-repo': submit metadata PR to fdroiddata; F-Droid's servers
//     reproducibly build from source. No prebuilt APKs accepted.
//   - 'self-hosted': publish your own repo that users add as a source.
//     Like Homebrew taps — less friction, less reach.
interface Config {
  packageName: string;              // e.g. com.acme.myapp
  mode: 'main-repo' | 'self-hosted';
  // main-repo: metadata file inputs (category, license, sourceRepo, issueTracker…)
  metadata?: {
    categories: string[];
    license: string;               // SPDX id, must be FSF-free
    sourceRepo: string;
    issueTracker?: string;
    authorName?: string;
  };
  // self-hosted: where to publish the generated fdroid repo
  selfHosted?: {
    repoDir: string;               // local path for the generated repo
    uploadTo: 'github-pages' | 'cdn' | 's3';
  };
}

export default defineTarget<Config>({
  id: 'pkg-fdroid',
  kind: 'package-manager',
  label: 'F-Droid (Android FOSS repo)',
  async build(ctx, config) {
    if (config.mode === 'main-repo') {
      ctx.log(`render fdroiddata metadata for ${config.packageName}`);
      // TODO: render YAML metadata file targeting fdroiddata repo
      return { artifact: `${ctx.outDir}/${config.packageName}.yml` };
    }
    ctx.log(`fdroid update · self-hosted repo at ${config.selfHosted?.repoDir}`);
    // TODO: `fdroid update -c` on a prepared repo dir containing the APK
    return { artifact: config.selfHosted!.repoDir };
  },
  async ship(ctx, config) {
    if (config.mode === 'main-repo') {
      ctx.log(`open PR against fdroiddata for ${config.packageName}`);
      if (ctx.dryRun) return { id: 'dry-run' };
      // TODO: clone fdroiddata, commit metadata, push branch, open PR via GH_TOKEN
      return { id: `${config.packageName}@${ctx.version}`, url: `https://f-droid.org/packages/${config.packageName}` };
    }
    ctx.log(`publish self-hosted repo → ${config.selfHosted?.uploadTo}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: sync repo dir to github-pages / cdn / s3 with correct index-v1.jar signatures
    return { id: `${config.packageName}@${ctx.version}` };
  },

  setup: manualSetup({
    label: "F-Droid",
    vendorDocUrl: "https://f-droid.org/docs/",
    steps: [
      "F-Droid builds from source \u2014 no upload, just a metadata PR",
      "Fork f-droid/fdroiddata \u2192 add your app metadata \u2192 submit MR",
      "Manual review 1-4 weeks",
    ],
  }),
});
