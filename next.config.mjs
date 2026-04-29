/** @type {import('next').NextConfig} */
const isElectronBuild = process.env.BUILD_TARGET === 'electron'

const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  allowedDevOrigins: ['*.vusercontent.net', '*.v0.app', '*.vercel.app'],
  // For Electron production build: export static HTML and use relative paths
  ...(isElectronBuild && {
    output: 'export',
    distDir: 'out',
    assetPrefix: './',
    trailingSlash: true,
  }),
}

export default nextConfig
