module.exports = {
    path: __dirname,
    name: "Redis",
    namespace: "redis",
    env: {
        RB_REDIS_PORT: 6379,
        RB_REDIS_SERVER: '127.0.0.1',
        RB_REDIS_PREFIX: '',
        RB_REDIS_SECRET: 'ROBINBASEREDIS',
    },
    compileEnv: function(config)
    {
        if (config.RB_REDIS_PREFIX == '')
        {
            config.RB_REDIS_PREFIX = 'robinbase:' + config.RB_PROJECT_TITLE.toLowerCase().replace(/[^a-z]/, '');
        }
    }
}