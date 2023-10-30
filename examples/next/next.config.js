/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverActions: true },
  transpilePackages: ['@forum/passkeys'],
}

module.exports = nextConfig
