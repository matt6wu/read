module.exports = {
  apps: [{
    name: 'koodo-reader',
    cwd: '/home/ubuntu/app/koodo-reader',
    script: 'npm',
    args: 'start',
    env: {
      PORT: 6300,
      BROWSER: 'none'
    },
    max_restarts: 3,
    restart_delay: 5000
  }]
}
