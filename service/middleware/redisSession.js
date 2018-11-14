module.exports = function (Config, maxAge)
{
    const session = require('express-session');
    const RedisStore = require('connect-redis')(session);
    const redisClient = Config.storages.redis.client;
    const sessionMiddleware = session({
        store: new RedisStore({client:redisClient}),
        secret: Config.RB_REDIS_SECRET,
        resave: false,
        saveUninitialized: true,
        cookie: {
            maxAge: maxAge, //12 hours
            secure: Config.RB_SECURE_COOKIE,
            httpOnly: true
        },
        name:Config.RB_REDIS_PREFIX
    });

    return sessionMiddleware;
}