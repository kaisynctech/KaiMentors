/** @type {import('next').NextConfig} */
const basePath = '/custom-sites/bandi-shares/v1'

const nextConfig = {
  output: 'export',
  basePath,
  assetPrefix: basePath,
  trailingSlash: false,
  images: {
    unoptimized: true,
    formats: ['image/avif', 'image/webp'],
  },
  async redirects() {
    return [
      {
        source: '/apply',
        destination: '/verify',
        permanent: false,
        basePath: false,
      },
    ]
  },
}

module.exports = nextConfig
