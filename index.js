const _ = require('lodash');
const co = require('co');

const MAX_TIMEOUT_VALUE = 2147483647;

module.exports = function(underlying, interval = 0, {
    leading = false,
    trailing = true,
    maxWait = null,
    delayBetweenExecutions = null,
    waitForNextExecution = true,
    allowConcurrentExecutions = false
}) {
    leading = !!leading;
    trailing = !!trailing;

    // function must either execute on leading side or on trailing side, not neither
    if (!leading && !trailing) {
        trailing = true;
    }

    waitForNextExecution = !!waitForNextExecution;

    // if function executes on leading side only, waiting for next execution makes no sense
    // same applies for trailing side only and previous execution
    if (!leading || !trailing) {
        waitForNextExecution = trailing;
    }

    allowConcurrentExecutions = !!allowConcurrentExecutions;

    interval = _.clamp(interval, 0, MAX_TIMEOUT_VALUE);

    let applyMaxWait = _.isNil(maxWait);
    maxWait = _.clamp(maxWait, interval, MAX_TIMEOUT_VALUE);

    let applyDelayBetweenExecutions = _.isNil(delayBetweenExecutions);
    delayBetweenExecutions = _.clamp(delayBetweenExecutions, 0, MAX_TIMEOUT_VALUE);

    // if a delay between executions is set, no consecutive executions can occur
    if (allowConcurrentExecutions && applyDelayBetweenExecutions) {
        allowConcurrentExecutions = false;
    }

    let currentlyExecuting = false;

    let callsWaiting = false;
    let firstWaitingCall = null;
    let lastProcessedCall = null;
    let lastCall = null;
    let lastCallArgs = null;
    let lastCallThis = null;
    let lastExecution = null;

    let nextRunTimer = null;
    let nextRunIsImmediate = false;

    let currentPromise = null;

    let nextPromise = null;
    let nextResolver = null;
    let nextRejecter = null;

    function cancelWaitingRun() {
        // properly cancel either immediate or timeout
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

        // clamp to acceptable timeout values
        time = _.clamp(time, 0, MAX_TIMEOUT_VALUE);

        // use either immediates or timeouts
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
            // make sure to keep the resolver and rejecter
            nextResolver = resolve;
            nextRejecter = reject;
        });
    }

    function scheduleNextRun() {
        let currentTime = Date.now();

        if (callsWaiting) {
            // calls are waiting, schedule a run

            let times = [lastCall + interval];

            // apply max wait(s)
            if (applyMaxWait) {
                if (leading && lastProcessedCall) {
                    times.push(lastProcessedCall + maxWait);
                }

                if (trailing && firstWaitingCall) {
                    times.push(firstWaitingCall + maxWait);
                }
            }

            let nextTime = _.min(times);

            // apply delay between executions
            if (applyDelayBetweenExecutions && lastExecution) {
                let nextAllowedTime = lastExecution + delayBetweenExecutions;

                if (nextAllowedTime > nextTime) {
                    nextTime = nextAllowedTime;
                }
            }

            // schedule actual run
            let wait = nextTime - currentTime;
            scheduleRun(executeUnderlying, wait);
        }
    }

    function executeUnderlying() {
        let promise = nextPromise;
        let resolve = nextResolver;
        let reject = nextRejecter;

        let funcArgs = lastCallArgs;
        let funcThis = lastCallThis;

        return co(function*() {
            currentlyExecuting = true;
            callsWaiting = false;
            firstWaitingCall = null;
            lastProcessedCall = lastCall;
            currentPromise = promise;
            cancelWaitingRun();
            setNextPromise();

            try {
                let result = yield underlying.apply(funcThis, funcArgs);

                resolve(result);
            }
            catch (err) {
                reject(err);
            }

            let finishTime = Date.now();

            // clean up if appropriate
            if (currentPromise === promise) {
                currentlyExecuting = false;
                lastExecution = finishTime;

                // schedule any delayed calls
                if (callsWaiting) {
                    scheduleNextRun();
                }
            }
        });
    }

    let debounced = function debouncer() {
        let currentTime = Date.now();
        let withinDebounceInterval = lastCall && lastCall + interval > currentTime;
        lastCall = currentTime;
        lastCallArgs = arguments;
        lastCallThis = this;

        if (leading) {
            if (!withinDebounceInterval) {
                // just run now
                executeUnderlying();
                return currentPromise;
            }
            else {
                // even if not the leading call, max wait may apply forcing a run
                if (applyMaxWait) {
                    let waitTime = currentTime - lastProcessedCall;

                    if (waitTime >= maxWait) {
                        callsWaiting = true;
                    }
                }
            }
        }

        if (trailing) {
            // calls are always waiting on the trailing edge
            callsWaiting = true;

            if (!firstWaitingCall) {
                firstWaitingCall = currentTime;
            }
        }

        if (callsWaiting) {
            // don't schedule runs during an execution unless allowed to
            if (!currentlyExecuting || allowConcurrentExecutions) {
                scheduleNextRun();
            }
        }

        // provide proper promise
        return waitForNextExecution ? nextPromise : currentPromise;
    }

    debounced.flush = function flush() {
        executeUnderlying();
    }

    debounced.cancel = function cancel() {
        nextRejecter(new Error('call canceled'));
        callsWaiting = false;
        firstWaitingCall = null;
        lastCall = null;
        cancelWaitingRun();
        setNextPromise();
    }

    setNextPromise();

    return debounced;
}
