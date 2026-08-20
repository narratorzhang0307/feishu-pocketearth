module.exports = {
  apps: [
    {
      name: 'pocketearth',
      script: 'server.mjs',
      cwd: __dirname + '/../..',
      env: {
        NODE_ENV: 'production',
        API_PORT: '3009',
      },
    },
  ],
}
