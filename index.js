const _ = require('lodash');
const co = require('co');

const MAX_TIMEOUT_VALUE = 2147483647;

module.exports = function(underlying, interval = 0, {
    leading = false,
    trailing = true,
    maxWait = null,
    waitForNextExecution = true,
    allowConcurrentExecutions = false,
    waitBetweenConsecutiveExecutions = false
}) {
    leading = !!leading;
    trailing = !!trailing;

    if (!leading && !trailing) {
        trailing = true;
    }

    waitForNextExecution = !!waitForNextExecution;
    allowConcurrentExecutions = !!allowConcurrentExecutions;
    waitBetweenConsecutiveExecutions = !!waitBetweenConsecutiveExecutions;

    if (allowConcurrentExecutions && waitBetweenConsecutiveExecutions) {
        allowConcurrentExecutions = false;
    }

    interval = _.clamp(interval, 0, MAX_TIMEOUT_VALUE);

    let applyMaxWait = _.isNil(maxWait);
    maxWait = _.clamp(maxWait, interval, MAX_TIMEOUT_VALUE);

    let currentlyExecuting = false;
    
    let callWaitBegin = null;
    let lastCall = null;

    let nextRunTimer = null;
    let nextRunIsImmediate = false;
    
    let currentPromise = null;
    
    let nextPromise = null;
    let nextResolver = null;
    let nextRejecter = null;

    function cancelWaitingRun() {
        if (nextRunTimer) {
            if (nextRunIsImmediate) {
                clearImmediate(nextRunTimer);
            }
            else {
                clearTimeout(nextRunTimer);
            }
        }

        nextRunTimer = null;
    }

    function scheduleRun(func, time) {
        cancelWaitingRun();

        time = _.clamp(time, 0, MAX_TIMEOUT_VALUE);

        if (time === 0) {
            nextRunTimer = setImmediate(func);
            nextRunIsImmediate = true;
        }
        else {
            nextRunTimer = setTimeout(func, time);
            nextRunIsImmediate = false;
        }
    }

    function setNextPromise() {
        nextPromise = new Promise(function(resolve, reject) {
            nextResolver = resolve;
            nextRejecter = reject;
        });
    }

    function scheduleNextRun() {
        if (callWaitBegin) {
            // calls are waiting, schedule a run
            let currentTime = Date.now();
            let nextRunWait = applyMaxWait ? Math.min(interval, callWaitBegin + maxWait - currentTime) : interval;
            scheduleRun(executeUnderlying, nextRunWait);
        }
    }

    function executeUnderlying() {
        let promise = nextPromise;
        let resolve = nextResolver;
        let reject = nextRejecter;

        return co(function*() {
            currentlyExecuting = true;
            callWaitBegin = null;
            currentPromise = promise;
            cancelWaitingRun();
            setNextPromise();

            try {
                let result = yield underlying();

                resolve(result);
            }
            catch (err) {
                reject(err);
            }

            let finishTime = Date.now();

            // clean up if appropriate
            if (currentPromise === promise) {
                currentlyExecuting = false;

                if (waitBetweenConsecutiveExecutions) {
                    // reset wait timers
                    if (callWaitBegin) {
                        callWaitBegin = finishTime;
                    }

                    lastCall = finishTime;
                }

                scheduleNextRun();
            }
        });
    }

    let debounced = function debouncer() {
        let currentTime = Date.now();
        let withinDebounceInterval = lastCall && lastCall + interval > currentTime;
        lastCall = currentTime;

        if (currentlyExecuting) {
            if (!waitForNextExecution) {
                // no need to schedule a run
                return currentPromise;
            }

            if (!allowConcurrentExecutions) {
                // don't attempt to schedule the next run while an execution is ongoing
                if (!callWaitBegin) {
                    callWaitBegin = currentTime;
                }
                return nextPromise;
            }
        }

        if (leading && !withinDebounceInterval) {
            // just run now
            executeUnderlying();
            return currentPromise;
        }

        if (trailing) {
            // schedule the next execution
            if (!callWaitBegin) {
                callWaitBegin = currentTime;
            }
        }

        scheduleNextRun();
        return nextPromise;
    }

    debounced.flush = function flush() {
        executeUnderlying();
    }
    debounced.cancel = function cancel() {
        nextRejecter(new Error('call canceled'));
        callWaitBegin = null;
        lastCall = null;
        cancelWaitingRun();
        setNextPromise();
    }

    setNextPromise();

    return debounced;
}
