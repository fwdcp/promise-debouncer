const _ = require('lodash');
const chai = require('chai');
const co = require('co');
const promiseDebouncer = require('..');

chai.use(require('chai-as-promised'));
const expect = chai.expect;

const TIMER_MAX_VARIANCE = 10;

function promiseDelay({
    timeout = 1000,
    value = null,
    success = true
}) {
    return new Promise(function(resolve, reject) {
        setTimeout(function() {
            if (success) {
                resolve(value);
            }
            else {
                reject(value);
            }
        }, timeout);
    });
}

function debounceTester() {
    return co.wrap(function*(value, delay = 0) {
        if (delay) {
            yield promiseDelay({
                timeout: delay
            });
        }

        return value;
    });
}

describe('promise debouncer', function() {
    this.timeout(10000);

    it('should debounce on the leading edge', co.wrap(function*() {
        const debounceTestFunction = promiseDebouncer(debounceTester(), 500, {
            leading: true
        });

        let promise1 = debounceTestFunction(1);
        yield promiseDelay({
            timeout: 100
        });
        let promise2 = debounceTestFunction(2);
        yield promiseDelay({
            timeout: 250
        });
        let promise3 = debounceTestFunction(3);
        yield promiseDelay({
            timeout: 1000
        });
        let promise4 = debounceTestFunction(4);

        yield [
            expect(promise1).to.eventually.equal(1),
            expect(promise2).to.eventually.equal(1),
            expect(promise3).to.eventually.equal(1),
            expect(promise4).to.eventually.equal(4)
        ];
    }));

    it('should debounce on the trailing edge', co.wrap(function*() {
        const debounceTestFunction = promiseDebouncer(debounceTester(), 500, {
            trailing: true
        });

        let promise1 = debounceTestFunction(1);
        yield promiseDelay({
            timeout: 100
        });
        let promise2 = debounceTestFunction(2);
        yield promiseDelay({
            timeout: 250
        });
        let promise3 = debounceTestFunction(3);
        yield promiseDelay({
            timeout: 1000
        });
        let promise4 = debounceTestFunction(4);

        yield [
            expect(promise1).to.eventually.equal(3),
            expect(promise2).to.eventually.equal(3),
            expect(promise3).to.eventually.equal(3),
            expect(promise4).to.eventually.equal(4)
        ];
    }));

    it('should debounce on both edges', co.wrap(function*() {
        const debounceTestFunction = promiseDebouncer(debounceTester(), 500, {
            leading: true,
            trailing: true
        });

        let promise1 = debounceTestFunction(1);
        yield promiseDelay({
            timeout: 100
        });
        let promise2 = debounceTestFunction(2);
        yield promiseDelay({
            timeout: 250
        });
        let promise3 = debounceTestFunction(3);
        yield promiseDelay({
            timeout: 1000
        });
        let promise4 = debounceTestFunction(4);

        yield [
            expect(promise1).to.eventually.equal(1),
            expect(promise2).to.eventually.equal(3),
            expect(promise3).to.eventually.equal(3),
            expect(promise4).to.eventually.equal(4)
        ];
    }));

    it('should obey max delay for leading edge', co.wrap(function*() {
        const debounceTestFunction = promiseDebouncer(debounceTester(), 500, {
            leading: true,
            maxWait: 1000
        });

        let promise1 = debounceTestFunction(1);
        yield promiseDelay({
            timeout: 300
        });
        let promise2 = debounceTestFunction(2);
        yield promiseDelay({
            timeout: 300
        });
        let promise3 = debounceTestFunction(3);
        yield promiseDelay({
            timeout: 300
        });
        let promise4 = debounceTestFunction(4);
        yield promiseDelay({
            timeout: 300
        });
        let promise5 = debounceTestFunction(5);

        yield [
            expect(promise1).to.eventually.equal(1),
            expect(promise2).to.eventually.equal(1),
            expect(promise3).to.eventually.equal(1),
            expect(promise4).to.eventually.equal(1),
            expect(promise5).to.eventually.equal(5)
        ];
    }));

    it('should obey max delay for trailing edge', co.wrap(function*() {
        const debounceTestFunction = promiseDebouncer(debounceTester(), 500, {
            trailing: true,
            maxWait: 1000
        });

        let promise1 = debounceTestFunction(1);
        yield promiseDelay({
            timeout: 300
        });
        let promise2 = debounceTestFunction(2);
        yield promiseDelay({
            timeout: 300
        });
        let promise3 = debounceTestFunction(3);
        yield promiseDelay({
            timeout: 300
        });
        let promise4 = debounceTestFunction(4);
        yield promiseDelay({
            timeout: 300
        });
        let promise5 = debounceTestFunction(5);

        yield [
            expect(promise1).to.eventually.equal(4),
            expect(promise2).to.eventually.equal(4),
            expect(promise3).to.eventually.equal(4),
            expect(promise4).to.eventually.equal(4),
            expect(promise5).to.eventually.equal(5)
        ];
    }));

    it('should condense executions', co.wrap(function*() {
        const debounceTestFunction = promiseDebouncer(debounceTester(), 500, {
            leading: true,
            condenseExecutions: true
        });

        let promise1 = debounceTestFunction(1, 2500);
        yield promiseDelay({
            timeout: 1000
        });
        let promise2 = debounceTestFunction(2, 2500);
        yield promiseDelay({
            timeout: 1000
        });
        let promise3 = debounceTestFunction(3, 2500);

        yield [
            expect(promise1).to.eventually.equal(1),
            expect(promise2).to.eventually.equal(2),
            expect(promise3).to.eventually.equal(2)
        ];
    }));

    it('should not condense executions', co.wrap(function*() {
        const debounceTestFunction = promiseDebouncer(debounceTester(), 500, {
            leading: true,
            condenseExecutions: false
        });

        let promise1 = debounceTestFunction(1, 2500);
        yield promiseDelay({
            timeout: 1000
        });
        let promise2 = debounceTestFunction(2, 2500);
        yield promiseDelay({
            timeout: 1000
        });
        let promise3 = debounceTestFunction(3, 2500);

        yield [
            expect(promise1).to.eventually.equal(1),
            expect(promise2).to.eventually.equal(2),
            expect(promise3).to.eventually.equal(3)
        ];
    }));

    it('should allow concurrent executions', co.wrap(function*() {
        const debounceTestFunction = promiseDebouncer(debounceTester(), 500, {
            leading: true,
            allowConcurrentExecutions: true
        });

        let promise1 = debounceTestFunction(1, 2500);
        yield promiseDelay({
            timeout: 1000
        });
        let promise2 = debounceTestFunction(2, 2500);

        yield expect(promise1).to.eventually.equal(1);

        yield Promise.race([
            expect(promise2).to.eventually.equal(2),
            promiseDelay({
                timeout: 1000 + TIMER_MAX_VARIANCE,
                success: false,
                value: new Error('promise not returned in time')
            })
        ]);
    }));

    it('should not allow concurrent executions', co.wrap(function*() {
        const debounceTestFunction = promiseDebouncer(debounceTester(), 500, {
            leading: true,
            allowConcurrentExecutions: false
        });

        let promise1 = debounceTestFunction(1, 2500);
        yield promiseDelay({
            timeout: 1000
        });
        let promise2 = debounceTestFunction(2, 2500);

        yield expect(promise1).to.eventually.equal(1);

        yield Promise.race([
            promiseDelay({
                timeout: 1000 + TIMER_MAX_VARIANCE
            }),
            expect(promise2).to.eventually.equal(2).then(function() {
                throw new Error('promise returned')
            })
        ]);
    }));

    it('should delay between concurrent executions', co.wrap(function*() {
        const debounceTestFunction = promiseDebouncer(debounceTester(), 500, {
            leading: true,
            delayBetweenExecutions: 1000,
            allowConcurrentExecutions: true
        });

        let promise1 = debounceTestFunction(1, 2500);
        yield promiseDelay({
            timeout: 1000
        });
        let promise2 = debounceTestFunction(2, 2500);

        yield expect(promise1).to.eventually.equal(1);

        yield Promise.race([
            promiseDelay({
                timeout: TIMER_MAX_VARIANCE
            }),
            expect(promise2).to.eventually.equal(2).then(function() {
                throw new Error('promise returned')
            })
        ]);
    }));

    it('should delay between non-concurrent executions', co.wrap(function*() {
        const debounceTestFunction = promiseDebouncer(debounceTester(), 500, {
            leading: true,
            delayBetweenExecutions: 1000,
            allowConcurrentExecutions: false
        });

        let promise1 = debounceTestFunction(1, 2500);
        yield promiseDelay({
            timeout: 1000
        });
        let promise2 = debounceTestFunction(2, 2500);

        yield expect(promise1).to.eventually.equal(1);

        yield Promise.race([
            promiseDelay({
                timeout: 2500 + TIMER_MAX_VARIANCE
            }),
            expect(promise2).to.eventually.equal(2).then(function() {
                throw new Error('promise returned')
            })
        ]);
    }));

    it('should not delay between concurrent executions', co.wrap(function*() {
        const debounceTestFunction = promiseDebouncer(debounceTester(), 500, {
            leading: true,
            delayBetweenExecutions: null,
            allowConcurrentExecutions: true
        });

        let promise1 = debounceTestFunction(1, 2500);
        yield promiseDelay({
            timeout: 1000
        });
        let promise2 = debounceTestFunction(2, 2500);

        yield expect(promise1).to.eventually.equal(1);

        yield Promise.race([
            expect(promise2).to.eventually.equal(2),
            promiseDelay({
                timeout: 1000 + TIMER_MAX_VARIANCE,
                success: false,
                value: new Error('promise not returned in time')
            })
        ]);
    }));

    it('should not delay between non-concurrent executions', co.wrap(function*() {
        const debounceTestFunction = promiseDebouncer(debounceTester(), 500, {
            leading: true,
            delayBetweenExecutions: null,
            allowConcurrentExecutions: false
        });

        let promise1 = debounceTestFunction(1, 2500);
        yield promiseDelay({
            timeout: 1000
        });
        let promise2 = debounceTestFunction(2, 2500);

        yield expect(promise1).to.eventually.equal(1);

        yield Promise.race([
            expect(promise2).to.eventually.equal(2),
            promiseDelay({
                timeout: 2500 + TIMER_MAX_VARIANCE,
                success: false,
                value: new Error('promise not returned in time')
            })
        ]);
    }));

    it('should cancel non-started executions', co.wrap(function*() {
        const debounceTestFunction = promiseDebouncer(debounceTester(), 500, {
            leading: true
        });

        let promise1 = debounceTestFunction(1, 2500);
        yield promiseDelay({
            timeout: 1000
        });
        let promise2 = debounceTestFunction(2, 2500);
        yield promiseDelay({
            timeout: 1000
        });
        let promise3 = debounceTestFunction(3, 2500);
        yield promiseDelay({
            timeout: 100
        });
        debounceTestFunction.cancel();

        yield [
            expect(promise1).to.eventually.equal(1),
            expect(promise2).to.eventually.be.rejectedWith(Error, 'canceled'),
            expect(promise3).to.eventually.be.rejectedWith(Error, 'canceled')
        ];
    }));

    it('should flush non-started executions', co.wrap(function*() {
        const debounceTestFunction = promiseDebouncer(debounceTester(), 500, {
            leading: true
        });

        let promise1 = debounceTestFunction(1, 2500);
        yield promiseDelay({
            timeout: 1000
        });
        let promise2 = debounceTestFunction(2, 2500);
        yield promiseDelay({
            timeout: 1000
        });
        let promise3 = debounceTestFunction(3, 2500);
        yield promiseDelay({
            timeout: 100
        });
        debounceTestFunction.flush();

        yield Promise.race([
            Promise.all([
                expect(promise1).to.eventually.equal(1),
                expect(promise2).to.eventually.equal(2),
                expect(promise3).to.eventually.equal(3)
            ]),
            promiseDelay({
                timeout: 2500 + TIMER_MAX_VARIANCE,
                success: false,
                value: new Error('promises not returned in time')
            })
        ]);
    }));
});
