const redis = require('redis');
const Debug = require_robinbase('Debug').prefix("Redis Storage");
const Schema = require_robinbase('base:Schema');

const filter = require('../_utils/filter');
const sort = require('../_utils/sort');

const serverId$ = Symbol('server id');

const RedisStorage = function(options)
{
    const self = this;

    self[serverId$] = Schema.utils.randomId();
    self.options = options;
    self.client = null;
}

RedisStorage.prototype.init = function(callback)
{
    const self = this;
    let connected = false;
    self.client = redis.createClient(self.options);
    self.client.on('error', function(err)
    {
        if (!connected)
        {
            callback(err);
        }

        Debug.log('Redis Error', err);
    });

    self.client.on('ready', function()
    {
        if (!connected)
        {
            connected = true;
            Debug.log('Redis Connected', self.options.server + ':' + self.options.port);
            callback(null);
        }
    });
}

RedisStorage.prototype.prepareCollection = function(myClass, callback)
{
    const self = this;
    myClass.storage = self;

    if (myClass.storageOptions && myClass.storageOptions.synchronize)
    {
        // pub sub
        ["create", "save", "update", "delete"].forEach(function(action)
        {
            const CHANNEL = myClass.collection + ":" + action
            const hookName = 'after' + action[0].toUpperCase() + action.substr(1);

            self.client.subscribe(CHANNEL);
            self.client.on('message', function(channel, message)
            {
                if (channel !== CHANNEL)
                {
                    return;
                }

                const data = JSON.parse(message);
                if (data.source === self[serverId$])
                {
                    return;
                }

                const key = data.key;

                myClass.crud.getOne({[myClass.schema.useId]: key}, function(err, record)
                {
                    myClass.emit(hookName, record, true, function(errs)
                    {
                        // nothing I guess
                    });
                });
            });

            myClass.on(hookName, function(record, callback)
            {
                self.client.publish(action, JSON.stringify({source: self[serverId$], key: record[myClass.schema.useId]}));
            });
        });
    }

    return callback(null);
}

RedisStorage.prototype.get = function(myClass, query, options, callback)
{
    const self = this;
    const useId = myClass.schema.useId;
    const collectionKey = RedisStorage.getCollectionKey(myClass.collection);

    let recordKey = query[useId];
    if (typeof recordKey === 'object' && recordKey['$eq'])
    {
        recordKey = recordKey['$eq'];
    }

    if (recordKey && typeof recordKey !== 'string')
    {
        return callback(null, []);
    }

    function filterResults(results)
    {
        results = filter(results, query);
        if (options.sort)
        {
            let sortDef = options.sort;
            if (Array.isArray(sortDef) && sortDef.length === 2)
            {
                sortDef = {[sortDef[0]]: sortDef[1].toLowerCase() === "desc" ? -1 : 1}
            }

            results = sort(results, sortDef);
        }

        let skip = 0;
        let limit = results.length;

        if (typeof options.skip === 'number')
        {
            skip = options.skip;
        }

        if (typeof options.limit === 'number')
        {
            limit = options.limit;
        }

        return results.slice(skip, limit + skip);
    }

    if (recordKey)
    {
        self.client.hget(collectionKey, recordKey, function(err, data)
        {
            if (err)
            {
                return callback(err, []);
            }

            if (!data)
            {
                return callback(null, []);
            }

            let record;
            try
            {
                record = JSON.parse(data);
            }
            catch (e)
            {
                return callback("Could not parse the record: " + (e.message || e), []);
            }

            callback (null, filterResults([record]));
        });
    }
    else
    {
        // get everything, then filter in memory
        self.client.hgetall(collectionKey, function(err, results)
        {
            if (err)
            {
                return callback(err, []);
            }

            if (results === null)
            {
                results = [];
            }

            const records = [];

            const resultKeys = Object.keys(results);

            for (let i = 0; i < resultKeys.length; i++)
            {
                try
                {
                    let record = JSON.parse(results[resultKeys[i]]);
                    records.push(record);
                }
                catch (e)
                {
                    return callback("Could not parse the record: " + (e.message || e), []);
                }
            }

            callback(null, filterResults(records));
        });
    }


}

RedisStorage.prototype.count = function(myClass, query, callback)
{
    const self = this;
    const collectionKey = RedisStorage.getCollectionKey(myClass.collection)

    if (Object.keys(query).length === 0)
    {
        // count all is easy
        self.client.hlen(collectionKey, callback);
    }
    else
    {
        // well, gotta load and filter em
        self.get(myClass, query, {}, function(err, values)
        {
            if (err)
            {
                return callback(err, null);
            }

            callback(null, values.length);
        });
    }
}

RedisStorage.prototype.update = function(myClass, object, query, setter, callback)
{
    const self = this;
    const collectionKey = RedisStorage.getCollectionKey(myClass.collection);

    const useId = myClass.schema.useId;

    const itemKey = typeof query === "string" ? query : query[useId];

    if (!itemKey)
    {
        return callback(new Error("RedisStorage update method requires the setter to have the items primary key."));
    }

    self.client.hget(collectionKey, itemKey, function(err, data)
    {
        if (err)
        {
            return callback(err, null);
        }

        if (data == null)
        {
            return callback(new Error("Could not find the object"), null);
        }

        try
        {
            var record = JSON.parse(data);
        }
        catch (e)
        {
            return callback(new Error("Could not parse the record: " + (e.messsage || e)), null);
        }

        const allow = filter([record], query).length > 0;

        if (!allow)
        {
            return callback(new Error("Could not find the object"), null);
        }

        for (key in setter)
        {
            record[key] = setter[key];
        }

        self.client.hset(collectionKey, itemKey, JSON.stringify(record), function(err, setResult)
        {
            callback(err, record);
        });
    });
}

RedisStorage.prototype.delete = function(myClass, object, query, callback)
{
    const self = this;
    const collectionKey = RedisStorage.getCollectionKey(myClass.collection);
    const useId = myClass.schema.useId;

    const itemKey = typeof query === "string" ? query : query[useId];

    if (!itemKey)
    {
        return callback(new Error("RedisStorage delete method requires the setter to have the items primary key."));
    }

    self.client.hdel(collectionKey, itemKey, function(err, result)
    {
        callback(err, object);
    });
}

RedisStorage.prototype.create = function(myClass, record, callback)
{
    const self = this;
    const collectionKey = RedisStorage.getCollectionKey(myClass.collection);
    const useId = myClass.schema.useId;

    if (!record[useId])
    {
        record[useId] = Schema.utils.randomId();
    }

    const recordKey = record[useId];

    self.client.hexists(collectionKey, useId, function(err, exists)
    {
        if (err)
        {
            return callback(err, null);
        }

        if (exists)
        {
            return callback(new Error("An item already exists with this key."), null);
        }

        self.client.hset(collectionKey, recordKey, JSON.stringify(record), function(err, setResult)
        {
            callback(err, record);
        });
    });
}

RedisStorage.getCollectionKey = function getCollectionKey(collectionName)
{
    return 'rbcollection:' + collectionName;
}

module.exports = RedisStorage;