const _ = require('lodash');
const co = require('co');

module.exports = function(underlying, interval = 0, {
    leading = null,
    trailing = null,
    maxWait = null,
    waitForNextExecution = null,
    allowConcurrentExecutions = null
}) {
    if (_.isNil(leading) && _.isNil(trailing)) {
        leading = false;
        trailing = true;
    }
    else {
        leading = !_.isNil(leading) ? !!leading : !trailing;
        trailing = !_.isNil(trailing) ? !!trailing : !leading;
    }
    
    waitForNextExecution = !_.isNil(waitForNextExecution) ? !!waitForNextExecution : true;
    allowConcurrentExecutions = !_.isNil(allowConcurrentExecutions) ? !!allowConcurrentExecutions : false;
    
    interval = _.clamp(interval, 0, Number.POSITIVE_INFINITY);
    maxWait = _.clamp(maxWait, interval, Number.POSITIVE_INFINITY);
    
    let currentlyExecuting = false;
    let lastCall = null;
    let lastExecution = null;
    
    let currentPromise = null;
    let currentResolver = null;
    let currentRejecter = null;
    
    let nextPromise = null;
    let nextResolver = null;
    let nextRejecter = null;
    
    return function() {
        // TODO: write main logic
    }
}
