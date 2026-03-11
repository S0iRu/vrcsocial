/** @type {import('pm2').StartOptions} */
module.exports = {
  apps: [
    {
      name: 'vrcsocial',
      script: 'npm',
      args: 'start',
      interpreter: 'none',
      instances: 1,
      env: {
        NODE_ENV: 'production',
        PORT: '3001',
      },
    },
  ],
};
