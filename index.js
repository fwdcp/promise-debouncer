const _ = require('lodash');
const co = require('co');

module.exports = function(underlying, interval = 0, {
    leading = false,
    trailing = true,
    maxWait = 0,
    waitForNextExecution = true,
    allowConcurrentExecutions = false,
    spaceConsecutiveExecutions = false
}) {
    leading = !!leading;
    trailing = !!trailing;
    
    waitForNextExecution = !!waitForNextExecution;
    allowConcurrentExecutions = !!allowConcurrentExecutions;
    spaceConsecutiveExecutions = !!spaceConsecutiveExecutions;
    
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
    
    function executeUnderlying(promise, resolve, reject) {
        return co(function*() {
            currentlyExecuting = true;
            
            if (!spaceConsecutiveExecutions) {
                lastExecution = Date.now();
            }
            
            try {
                let result = yield underlying();
                
                resolve(result);
            }
            catch (err) {
                reject(err);
            }
            
            // clean up if appropriate
            if (currentPromise === promise) {
                currentlyExecuting = false;
                
                currentPromise = nextPromise;
                currentResolver = nextResolver;
                currentRejecter = nextRejecter;
                
                if (spaceConsecutiveExecutions) {
                    lastExecution = Date.now();
                }
            }
        });
    }
    
    return function() {
        let currentTime = Date.now();
        
        // TODO: write main logic
    }
}
