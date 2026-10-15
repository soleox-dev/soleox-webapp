import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  devIndicators: false,
  onDemandEntries: {
    maxInactiveAge: 15 * 60 * 1000,
    pagesBufferLength: 50,
  },
};

export default nextConfig;
