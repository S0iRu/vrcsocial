/** @type {import('pm2').StartOptions} */
module.exports = {
  apps: [
    {
      name: 'vrcsocial',
      script: 'npm',
      // Cloudflare Tunnel だけが接続するので、このPC内からの接続に限定する
      args: 'start -- -H 127.0.0.1',
      interpreter: 'none',
      instances: 1,
      env: {
        NODE_ENV: 'production',
        PORT: '3001',
      },
    },
  ],
};
