import { resolve } from 'path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // Monorepo: include workspace root so standalone tracing works in Docker.
  outputFileTracingRoot: resolve(__dirname, '../..'),
  poweredByHeader: false,
  turbopack: { root: resolve(process.cwd(), '../..') },
};

export default nextConfig;
