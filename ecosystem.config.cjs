module.exports = {
  apps: [
    {
      name: "amgs-production",
      cwd: "/srv/amgs/production",
      script: "node_modules/next/dist/bin/next",
      args: "start",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: "3100",
        HOSTNAME: "0.0.0.0",
      },
      time: true,
      out_file: "logs/pm2-out.log",
      error_file: "logs/pm2-error.log",
      merge_logs: true,
      max_memory_restart: "512M",
    },
  ],
};
