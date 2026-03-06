module.exports = {
    apps: [{
        name: 'file-share-bot',
        script: './main.js',
        instances: 1,
        autorestart: true,
        watch: false,
        max_memory_restart: '512M',
        env: {
            NODE_ENV: 'production'
        },
        error_file: './logs/error.log',
        out_file: './logs/out.log',
        log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
        merge_logs: true,
        min_uptime: '10s',
        max_restarts: 10,
        restart_delay: 5000,
        kill_timeout: 5000,
        wait_ready: true,
        listen_timeout: 10000
    }]
};
