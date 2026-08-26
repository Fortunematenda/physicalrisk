/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone needs symlinks (Docker/Linux). Windows local builds lack that privilege.
  ...(process.platform === 'win32' ? {} : { output: 'standalone' }),
  transpilePackages: ['@moss/shared'],
};
export default nextConfig;
