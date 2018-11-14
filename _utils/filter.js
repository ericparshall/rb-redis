const sift = require('sift')

module.exports = function filter(records, query)
{
    return sift(query, records);
}