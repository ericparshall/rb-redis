module.exports = function sort(_records, sortDef)
{
    // make a copy since sort mutates the original array
    let records = _records.slice();

    const sortKeys = Object.keys(sortDef);

    records.sort(function(left, right)
    {
        for (let i = 0; i < sortKeys.length; i++)
        {
            let key = sortKeys[i];

            // TODO: mongo also sorts by type.  should map the type of the value to the mongo type
            // TODO: better comparison for things like arrays, strings
            if (left[key] < right[key])
            {
                return -1 * sortDef[key];
            }
            else if (right[key] > right[key])
            {
                return sortDef[key];
            }
        }

        return 0;
    });

    return records;
}