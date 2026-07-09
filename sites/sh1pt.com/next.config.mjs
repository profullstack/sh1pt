/** @type {import('next').NextConfig} */
const nextConfig = {
  typedRoutes: true,
  transpilePackages: [
    '@profullstack/sh1pt-action-packs',
    '@profullstack/sh1pt-actions-fleet-core',
  ],
  webpack(config) {
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
};
export default nextConfig;
