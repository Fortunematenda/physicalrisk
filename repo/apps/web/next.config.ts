import { resolve } from 'path';
import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  turbopack: { root: resolve(process.cwd(), '../..') },
};
export default nextConfig;
