
// Define globals for eslint.
/* global describe it */

// Load dependencies
import should from 'should'; // eslint-disable-line no-unused-vars
import Worker from '../Models/Worker';

describe('Models/Worker', function() {

  it('#addWorker() should validate input', async () => {

    const worker = new Worker();

    try {
      worker.addWorker(null, async () => {});
      throw new Error('worker.addWorker() should throw error if no jobname supplied.');
    } catch (error) {
      error.should.deepEqual(new Error('Job name and associated worker function must be supplied.'));
    }

    try {
      worker.addWorker('test-job-one', null);
      throw new Error('worker.addWorker() should throw error if no worker function supplied.');
    } catch (error) {
      error.should.deepEqual(new Error('Job name and associated worker function must be supplied.'));
    }

  });

  it('#addWorker() should work as expected', async () => {

    const worker = new Worker();

    worker.addWorker('test-job-one', async () => {});

    const workerOptions = {
      concurrency: 3,
      onStart: async () => {}
    };
    worker.addWorker('test-job-two', async () => {}, workerOptions);

    // first worker is added with default options.
    Worker.workers['test-job-one'].should.be.a.Function();
    Worker.workers['test-job-one'].options.should.deepEqual({
      concurrency: 1,
      onStart: null,
      onSuccess: null,
      onFailure: null,
      onFailed: null,
      onComplete: null
    });

    // second worker is added with new concurrency option.
    Worker.workers['test-job-two'].should.be.a.Function();
    Worker.workers['test-job-two'].options.should.deepEqual({
      concurrency: workerOptions.concurrency,
      onStart: workerOptions.onStart,
      onSuccess: null,
      onFailure: null,
      onFailed: null,
      onComplete: null
    });

  });

  it('#removeWorker() should work as expected', async () => {

    const worker = new Worker();

    // Add workers.
    worker.addWorker('test-job-one', async () => {});

    const workerOptions = {
      concurrency: 3
    };
    worker.addWorker('test-job-two', async () => {}, workerOptions);

    worker.addWorker('test-job-three', async () => {});

    Object.keys(Worker.workers).should.deepEqual(['test-job-one', 'test-job-two', 'test-job-three']);

    worker.removeWorker('test-job-two');

    Object.keys(Worker.workers).should.deepEqual(['test-job-one', 'test-job-three']);

  });

  it('#getConcurrency() should throw error if no worker assigned to passed in job name.', async () => {

    const worker = new Worker();
    const jobName = 'no-worker-exists';

    try {
      worker.getConcurrency(jobName);
      throw new Error('getConcurrency() should have thrown an error due to no worker assigned to that job name.');
    } catch (error) {
      error.should.deepEqual(new Error('Job ' + jobName + ' does not have a worker assigned to it.'));
    }

  });

  it('#getConcurrency() should return worker job concurrency', async () => {

    const worker = new Worker();

    // Add worker.
    const workerOptions = {
      concurrency: 36
    };
    worker.addWorker('test-job-one', async () => {}, workerOptions);

    worker.getConcurrency('test-job-one').should.equal(36);

  });

  it('#executeJob() should error if worker not assigned to job yet.', async () => {

    const worker = new Worker();

    const jobName = 'this-worker-does-not-exist';

    try {
      await worker.executeJob({ name : jobName });
      throw new Error('execute job should have thrown an error due to no worker assigned to that job name.');
    } catch (error) {
      error.should.deepEqual(new Error('Job ' + jobName + ' does not have a worker assigned to it.'));
    }

  });

  it('#executeJob() timeout logic should work if timeout is set.', async () => {

    const jobTimeout = 100;

    const job = {
      id: 'd21dca87-435c-4533-b0af-ed9844e6b827',
      name: 'test-job-one',
      payload: JSON.stringify({
        key: 'value'
      }),
      data: JSON.stringify({
        attempts: 1
      }),
      priority: 0,
      active: false,
      timeout: jobTimeout,
      created: new Date(),
      failed: null
    };

    const worker = new Worker();

    worker.addWorker('test-job-one', async () => {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve(true);
        }, 1000);
      });
    });

    try {
      await worker.executeJob(job);
      throw new Error('execute job should have thrown an error due to timeout.');
    } catch (error) {
      error.should.deepEqual(new Error('TIMEOUT: Job id: ' + job.id + ' timed out in ' + jobTimeout  + 'ms.'));
    }

  });

  it('#executeJob() should execute a job correctly.', async () => {

    let counter = 0;

    const job = {
      id: 'd21dca87-435c-4533-b0af-ed9844e6b827',
      name: 'test-job-one',
      payload: JSON.stringify({
        key: 'value'
      }),
      data: JSON.stringify({
        timeout: 0,
        attempts: 1
      }),
      priority: 0,
      active: false,
      created: new Date(),
      failed: null
    };

    const worker = new Worker();

    worker.addWorker('test-job-one', async () => {

      // Job increments counter.
      counter++;

      return new Promise((resolve) => {
        setTimeout(() => {
          resolve(true);
        }, 500);
      });
    });

    counter.should.equal(0);
    await worker.executeJob(job);
    counter.should.equal(1);

  });

  it('#executeJobLifecycleCallback() should execute a job lifecycle method correctly.', async () => {

    let onStartCalled = false;
    let testPassed = false;

    const job = {
      id: 'd21dca87-435c-4533-b0af-ed9844e6b827',
      name: 'test-job-one',
      payload: JSON.stringify({
        key: 'value'
      }),
      data: JSON.stringify({
        timeout: 0,
        attempts: 1
      }),
      priority: 0,
      active: false,
      created: new Date(),
      failed: null
    };

    const worker = new Worker();

    worker.addWorker('test-job-one', async () => {}, {
      onStart: (id, payload) => {

        onStartCalled = true;

        // Verify params passed correctly off job and payload JSON has been parsed.
        id.should.equal(job.id);
        payload.should.deepEqual({
          key: 'value'
        });

        // Explicitly mark test as passed because the assertions
        // directly above will be caught in the try/catch statement within
        // executeJobLifecycleCallback() if they throw an error. While any thrown errors will be
        // output to console, the test will still pass so won't be caught by CI testing.
        testPassed = true;

      }
    });

    onStartCalled.should.equal(false);
    const payload = JSON.parse(job.payload); // Payload JSON is always parsed by Queue model before passing to executeJobLifecycleCallback();
    await worker.executeJobLifecycleCallback('onStart', job.name, job.id, payload);
    onStartCalled.should.equal(true);
    testPassed.should.equal(true);

  });

  it('#executeJobLifecycleCallback() should throw an error on invalid job lifecycle name.', async () => {

    let onStartCalled = false;
    let testPassed = true;

    const job = {
      id: 'd21dca87-435c-4533-b0af-ed9844e6b827',
      name: 'test-job-one',
      payload: JSON.stringify({
        key: 'value'
      }),
      data: JSON.stringify({
        timeout: 0,
        attempts: 1
      }),
      priority: 0,
      active: false,
      created: new Date(),
      failed: null
    };

    const worker = new Worker();

    worker.addWorker('test-job-one', async () => {}, {
      onStart: () => {

        testPassed = false;
        throw new Error('Should not be called.');

      }
    });

    onStartCalled.should.equal(false);
    const payload = JSON.parse(job.payload); // Payload JSON is always parsed by Queue model before passing to executeJobLifecycleCallback();
    try {
      await worker.executeJobLifecycleCallback('onInvalidLifecycleName', job.name, job.id, payload);
    } catch (error) {
      error.should.deepEqual(new Error('Invalid job lifecycle callback name.'));
    }
    onStartCalled.should.equal(false);
    testPassed.should.equal(true);

  });

  it('#executeJobLifecycleCallback() job lifecycle callbacks that error out should gracefully degrade to console error.', async () => {

    let onStartCalled = false;
    let consoleErrorCalled = false;

    // Cache console error.
    const consoleErrorCache = console.error; // eslint-disable-line no-console

    // Overwrite console.error to make sure it gets called on job lifecycle
    // callback error and is passed the error object.
    console.error = (errorObject) => { // eslint-disable-line no-console
      consoleErrorCalled = true;
      errorObject.should.deepEqual(new Error('Something failed catastrophically!'));
    };

    const job = {
      id: 'd21dca87-435c-4533-b0af-ed9844e6b827',
      name: 'test-job-one',
      payload: JSON.stringify({
        key: 'value'
      }),
      data: JSON.stringify({
        timeout: 0,
        attempts: 1
      }),
      priority: 0,
      active: false,
      created: new Date(),
      failed: null
    };

    const worker = new Worker();

    worker.addWorker('test-job-one', async () => {}, {
      onStart: () => {

        onStartCalled = true;
        throw new Error('Something failed catastrophically!');

      }
    });

    onStartCalled.should.equal(false);
    consoleErrorCalled.should.equal(false);
    const payload = JSON.parse(job.payload); // Payload JSON is always parsed by Queue model before passing to executeJobLifecycleCallback();
    await worker.executeJobLifecycleCallback('onStart', job.name, job.id, payload);
    onStartCalled.should.equal(true);
    consoleErrorCalled.should.equal(true);

    // Re-apply console.error.
    console.error = consoleErrorCache; // eslint-disable-line no-console

  });

});