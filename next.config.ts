import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== 'production';

const nextConfig: NextConfig = {
  // Next 16 writes an AGENTS.md on `next dev` unless this is off.
  agentRules: false,
  // Security: Restrict external images to trusted domains only
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.vrchat.cloud',
      },
      {
        protocol: 'https',
        hostname: 'api.vrchat.cloud',
      },
      {
        protocol: 'https',
        hostname: 'files.vrchat.cloud',
      },
    ],
  },
  // Security headers
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          // HTTPS でだけ有効になる。Cloudflare 経由の本番では常に HTTPS なので、以後 http で開かせない
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // 'unsafe-eval' が要るのは開発時（next dev の Fast Refresh）だけなので、本番では外す。
              // 'unsafe-inline' は Next が埋め込むインラインスクリプトに必要（nonce 方式は全ページの動的描画が要るので見送り）
              isDev ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob: https://*.vrchat.cloud https://api.vrchat.cloud https://files.vrchat.cloud https://*.cloudfront.net",
              "connect-src 'self' https://api.vrchat.cloud",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
