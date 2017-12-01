
// Define globals for eslint.
/* global describe it */

// Load dependencies
import should from 'should'; // eslint-disable-line no-unused-vars
import Worker from '../Models/Worker';

describe('Models/Worker', function() {


  it('#addWorker() should work as expected', async () => {

    const worker = new Worker();

    worker.addWorker('test-job-one', async () => {});

    const workerOptions = {
      concurrency: 3
    };
    worker.addWorker('test-job-two', async () => {}, workerOptions);

    // first worker is added with default options.
    Worker.workers['test-job-one'].should.be.a.Function();
    Worker.workers['test-job-one'].options.should.deepEqual({
      concurrency: 1
    });

    // second worker is added with new concurrency option.
    Worker.workers['test-job-two'].should.be.a.Function();
    Worker.workers['test-job-two'].options.should.deepEqual(workerOptions);

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
        timeout: jobTimeout,
        attempts: 1
      }),
      priority: 0,
      active: false,
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

});