const _ = require('lodash');
const co = require('co');

const MAX_TIMEOUT_VALUE = 2147483647;

module.exports = function(underlying, interval = 0, {
    leading = null,
    trailing = null,
    maxWait = null,
    delayBetweenExecutions = null,
    condenseExecutions = false,
    allowConcurrentExecutions = false
} = {}) {
    leading = !!leading;
    trailing = !!trailing;

    // function must either execute on leading side or on trailing side, not neither
    if (!leading && !trailing) {
        trailing = true;
    }

    condenseExecutions = !!condenseExecutions;
    allowConcurrentExecutions = !!allowConcurrentExecutions;

    interval = _.clamp(interval, 0, MAX_TIMEOUT_VALUE);

    let applyMaxWait = !_.isNil(maxWait);
    maxWait = _.clamp(maxWait, interval, MAX_TIMEOUT_VALUE);

    let applyDelayBetweenExecutions = !_.isNil(delayBetweenExecutions);
    delayBetweenExecutions = _.clamp(delayBetweenExecutions, 0, MAX_TIMEOUT_VALUE);

    let executions = [];

    let waitTimer = null;
    let waitTimerIsImmediate = false;

    function cancelWait() {
        // properly cancel either immediate or timeout
        if (waitTimer) {
            if (waitTimerIsImmediate) {
                clearImmediate(waitTimer);
            }
            else {
                clearTimeout(waitTimer);
            }
        }

        waitTimer = null;
    }

    function scheduleWait(func, time) {
        cancelWait();

        // clamp to acceptable timeout values
        time = _.clamp(time, 0, MAX_TIMEOUT_VALUE);

        // use either immediates or timeouts
        if (time === 0) {
            waitTimer = setImmediate(func);
            waitTimerIsImmediate = true;
        }
        else {
            waitTimer = setTimeout(func, time);
            waitTimerIsImmediate = false;
        }
    }

    function dispatchExecution(execution) {
        return co(function*() {
            execution.startTime = Date.now();

            try {
                let result = yield underlying.apply(execution.this, execution.arguments);

                execution.resolve(result);
            }
            catch (err) {
                execution.reject(err);
            }

            execution.finishTime = Date.now();

            maintainExecutions(); // eslint-disable-line no-use-before-define
        })
    }

    function maintainExecutions() {
        let currentTime = Date.now();

        cancelWait();

        let nextCheckWait;

        for (let i = 0; i < executions.length; i++) {
            let execution = executions[i];

            if (execution.startTime) {
                // execution started

                if (execution.finishTime) {
                    // execution finished

                    if (applyDelayBetweenExecutions && execution.finishTime + delayBetweenExecutions > currentTime) {
                        // keep execution in array to constrain next execution
                        continue;
                    }
                    else if (execution.lastCallTime + interval > currentTime) {
                        // still within debounce interval, allow calls to continue being attached
                        continue;
                    }
                    else {
                        // remove execution from array and move on
                        executions.splice(i, 1);
                        i--;
                        continue;
                    }
                }
                else {
                    // no need to operate on an unfinished execution
                    continue;
                }
            }

            let expectedExecutionTime = execution.isLeading ? execution.firstCallTime : execution.lastCallTime + interval;

            if (i > 0) {
                // execution before this, check if wait required

                let lastExecution = executions[i - 1];

                if (!allowConcurrentExecutions) {
                    // no concurrent executions allowed

                    if (!lastExecution.startTime || !lastExecution.finishTime) {
                        // last execution is running or hasn't even started, so can't start this one
                        expectedExecutionTime = null;
                    }
                    else {
                        if (applyDelayBetweenExecutions) {
                            // need to make sure execution is sufficiently delayed
                            expectedExecutionTime = Math.max(lastExecution.finishTime + delayBetweenExecutions, expectedExecutionTime);
                        }
                    }
                }
                else {
                    if (applyDelayBetweenExecutions) {
                        // need to make sure execution is sufficiently delayed

                        if (!lastExecution.startTime) {
                            // last execution hasn't even started, so can't start this one
                            expectedExecutionTime = null;
                        }
                        else {
                            // need to make sure execution is sufficiently delayed
                            expectedExecutionTime = Math.max(lastExecution.startTime + delayBetweenExecutions, expectedExecutionTime);
                        }
                    }
                }
            }

            if (expectedExecutionTime) {
                if (expectedExecutionTime <= currentTime) {
                    // need to run the execution now, dispatch and continue operating on executions
                    dispatchExecution(execution);
                    continue;
                }
                else {
                    // defined amount of time before execution can begin
                    nextCheckWait = expectedExecutionTime - currentTime;
                }
            }

            break;
        }

        if (nextCheckWait) {
            scheduleWait(maintainExecutions, nextCheckWait);
        }
    }

    function createNewExecution({
        firstCallTime,
        isLeading,
        executionArguments,
        executionThis
    }) {
        let execution = {
            firstCallTime,
            lastCallTime: firstCallTime,
            isLeading,
            arguments: executionArguments,
            this: executionThis,
            startTime: null,
            finishTime: null
        };
        execution.promise = new Promise(function(resolve, reject) {
            execution.resolve = resolve;
            execution.reject = reject;
        });

        executions.push(execution);

        return execution;
    }

    function getApplicableExecution(currentTime, callArguments, callThis) {
        let lastExecution = _.last(executions);

        if (!lastExecution) {
            // there are no active executions, create a new one
            return createNewExecution({
                firstCallTime: currentTime,
                isLeading: leading,
                executionArguments: callArguments,
                executionThis: callThis
            });
        }

        if (condenseExecutions && !lastExecution.startTime) {
            // condense into non-executed execution
            return lastExecution;
        }

        if (lastExecution.lastCallTime + interval > currentTime) {
            // call falls within debounce interval of last execution

            if (lastExecution.isLeading && trailing) {
                // need to create a trailing execution
                return createNewExecution({
                    firstCallTime: lastExecution.firstCallTime,
                    isLeading: false,
                    executionArguments: callArguments,
                    executionThis: callThis
                });
            }

            if (applyMaxWait && lastExecution.firstCallTime + maxWait <= currentTime) {
                // max wait has been exceeded, create new execution
                return createNewExecution({
                    firstCallTime: currentTime,
                    isLeading: leading,
                    executionArguments: callArguments,
                    executionThis: callThis
                });
            }

            // attach to last execution
            return lastExecution;
        }

        // need to create a new execution
        return createNewExecution({
            firstCallTime: currentTime,
            isLeading: leading,
            executionArguments: callArguments,
            executionThis: callThis
        });
    }

    let debounced = function debouncer() {
        let currentTime = Date.now();
        let execution = getApplicableExecution(currentTime, arguments, this);

        // update last call time
        execution.lastCallTime = currentTime;

        if (!execution.isLeading) {
            // update arguments and this for trailing execution
            execution.arguments = arguments;
            execution.this = this;
        }

        maintainExecutions();

        return execution.promise;
    }

    debounced.flush = function flush() {
        _.forEach(executions, function(execution) { // eslint-disable-line lodash/prefer-filter
            if (!execution.startTime) {
                // execution hasn't started, dispatch
                dispatchExecution(execution);
            }
        });

        maintainExecutions();
    }

    debounced.cancel = function cancel() {
        executions = _.reject(executions, function(execution) {
            if (execution.startTime) {
                // execution has started, leave alone
                return false;
            }
            else {
                // execution hasn't started, cancel
                execution.reject(new Error('canceled'));
                return true;
            }
        });

        maintainExecutions();
    }

    return debounced;
}
