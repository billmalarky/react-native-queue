
// Define globals for eslint.
/* global describe it beforeEach process jest */

// Load dependencies
import should from 'should'; // eslint-disable-line no-unused-vars
import QueueFactory, { Queue } from '../Models/Queue';
import Worker from '../Models/Worker';
import Database from '../config/Database';
import moment from 'moment';

describe('Models/Queue', function() {

  beforeEach(async () => {

    // Make sure each test starts with a fresh database.
    const queue = await QueueFactory();
    queue.flushQueue();
  });

  const wait = time => new Promise(resolve => setTimeout(resolve,time));

  //
  // QUEUE LIFESPAN TESTING
  //

  it('#start(lifespan) queue with lifespan does not process jobs that have no timeout set.', async () => {

    const queue = await QueueFactory();
    const jobName = 'job-name';

    queue.addWorker(jobName, () => {});

    // Create a couple jobs
    queue.createJob(jobName, {}, {}, false);
    queue.createJob(jobName, {}, {}, false);
    queue.createJob(jobName, {}, {}, false);

    // startQueue is false so queue should not have started.
    queue.status.should.equal('inactive');

    // Start queue, don't await so this test can continue while queue processes.
    queue.start(10000);

    queue.status.should.equal('active');

    // Because no jobs should be processed due to not having defined timeouts
    // queue should become inactive well before 10 seconds passes.

    // wait a tick
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    queue.status.should.equal('inactive');

  });

  it('#start(lifespan) FUNDAMENTAL TEST (queue started with lifespan will process a job with job timeout set).', async () => {

    const queue = await QueueFactory();
    queue.flushQueue();
    const jobName = 'job-name';

    // Track the jobs that have executed to test against.
    let executedJobs = [];

    queue.addWorker(jobName, async (id, payload) => {

      // Track jobs that exec
      executedJobs.push(payload.trackingName);

    });

    // Create a job but don't auto-start queue
    queue.createJob(jobName, {
      trackingName: jobName
    }, {
      timeout: 100
    }, false);

    // startQueue is false so queue should not have started.
    queue.status.should.equal('inactive');

    // Start queue with lifespan, don't await so this test can continue while queue processes.
    queue.start(750);

    queue.status.should.equal('active');

    // wait a bit for queue to process job
    await new Promise((resolve) => {
      setTimeout(resolve, 750);
    });

    //Check that the correct jobs executed.
    executedJobs.should.deepEqual(['job-name']);

    // Queue should have stopped.
    queue.status.should.equal('inactive');

  });

  it('#start(lifespan) BASIC TEST (One job type, default job/worker options): queue will process jobs with timeout set as expected until lifespan ends.', async () => {

      // This test will intermittently fail in CI environments like travis-ci.
      // Intermittent failure is a result of the poor performance of CI environments
      // causing the timeouts in this test to become really flakey (setTimeout can't
      // guarantee exact time of function execution, and in a high load env execution can
      // be significantly delayed.
      if (process.env.COVERALLS_ENV == 'production') {
        return true;
      }

      const queue = await QueueFactory();
      queue.flushQueue();
      const jobName = 'job-name';
      const queueLifespan = 2000;
      let remainingLifespan = queueLifespan;

      // Track the jobs that have executed to test against.
      let executedJobs = [];

      // We need to be able to throw an error outside of
      // job workers, because errors thrown inside a job
      // worker function are caught and logged by job processing
      // logic. They will not fail the test. So track bad jobs
      // and throw error after jobs finish processing.
      let badJobs = [];

      queue.addWorker(jobName, async (id, payload) => {

        // Track jobs that exec
        executedJobs.push(payload.trackingName);

        // Detect jobs that should't be picked up by lifespan queue.
        if (remainingLifespan - 500 < payload.payloadOptionsTimeout) {
          badJobs.push({id, payload});
        }

        remainingLifespan = remainingLifespan - payload.payloadTimeout;

        await new Promise((resolve) => {
          setTimeout(resolve, payload.payloadTimeout);
        });

      }, { concurrency: 1});

      // 2000 (lifespan) - 200 (job1)  - 200 (job2) - 1000 (job3) - 50 (job 4) - 100 (timeout value for job 5 overflows remaining lifespan + 500ms for buffer so job5 will not exec) < 500

      // Create a couple jobs
      queue.createJob(jobName, {
        trackingName: 'job1',
        payloadTimeout: 200,
        payloadOptionsTimeout: 300 // Mirror the actual job options timeout in payload so we can use it for testing.
      }, {
        timeout: 300
      }, false);

      // Since more than one job can be written in 1 ms, we need to add a slight delay
      // in order to control the order jobs come off the queue (since they are time sorted)
      // If multiple jobs are written in the same ms, Realm can't be deterministic about job
      // ordering when we pop jobs off the top of the queue.
      await new Promise((resolve) => { setTimeout(resolve, 25); });

      queue.createJob(jobName, {
        trackingName: 'job2',
        payloadTimeout: 200,
        payloadOptionsTimeout: 300 // Mirror the actual job options timeout in payload so we can use it for testing.
      }, {
        timeout: 300
      }, false);
      await new Promise((resolve) => { setTimeout(resolve, 25); });

      queue.createJob(jobName, {
        trackingName: 'job3',
        payloadTimeout: 1000,
        payloadOptionsTimeout: 1100 // Mirror the actual job options timeout in payload so we can use it for testing.
      }, {
        timeout: 1100
      }, false);
      await new Promise((resolve) => { setTimeout(resolve, 25); });

      queue.createJob(jobName, {
        trackingName: 'job4',
        payloadTimeout: 500,
        payloadOptionsTimeout: 600 // Mirror the actual job options timeout in payload so we can use it for testing.
      }, {
        timeout: 600
      }, false);
      await new Promise((resolve) => { setTimeout(resolve, 25); });

      queue.createJob(jobName, {
        trackingName: 'job5',
        payloadTimeout: 50,
        payloadOptionsTimeout: 75 // Mirror the actual job options timeout in payload so we can use it for testing.
      }, {
        timeout: 75
      }, false);
      await new Promise((resolve) => { setTimeout(resolve, 25); });

      queue.createJob(jobName, {
        trackingName: 'job6',
        payloadTimeout: 25,
        payloadOptionsTimeout: 100 // Mirror the actual job options timeout in payload so we can use it for testing.
      }, {
        timeout: 100
      }, false);
      await new Promise((resolve) => { setTimeout(resolve, 25); });

      queue.createJob(jobName, {
        trackingName: 'job7',
        payloadTimeout: 1100,
        payloadOptionsTimeout: 1200 // Mirror the actual job options timeout in payload so we can use it for testing.
      }, {
        timeout: 1200
      }, false);
      await new Promise((resolve) => { setTimeout(resolve, 25); });

      // startQueue is false so queue should not have started.
      queue.status.should.equal('inactive');

      const queueStartTime = Date.now();

      // Start queue, don't await so this test can continue while queue processes.
      await queue.start(queueLifespan);

      const queueEndTime = Date.now();
      const queueProcessTime = queueStartTime - queueEndTime;

      if (queueProcessTime > queueLifespan) {
        throw new Error('ERROR: Queue did not complete before lifespan ended.');
      }

      if (badJobs.length) {
        throw new Error('ERROR: Queue with lifespan picked up bad jobs it did not have enough remaining lifespan to execute: ' + JSON.stringify(badJobs));
      }

      // Queue should have stopped.
      queue.status.should.equal('inactive');

      //Check that the correct jobs executed.
      executedJobs.should.deepEqual(['job1', 'job2', 'job4', 'job5', 'job6']);

      // Check jobs that couldn't be picked up are still in the queue.
      const remainingJobs = await queue.getJobs(true);

      const remainingJobNames = remainingJobs.map( job => {
        const payload = JSON.parse(job.payload);
        return payload.trackingName;
      });

      // queue.getJobs() doesn't order jobs in any particular way so just
      // check that the jobs still exist on the queue.
      remainingJobNames.should.containDeep(['job3', 'job7']);

    });

    it('#start(lifespan) ADVANCED TEST FULL (Multiple job names, job timeouts, concurrency, priority, retryDelay) - ONLY RUN IN NON-CI ENV: queue will process jobs with timeout set as expected until lifespan ends.', async () => {

      // This test will intermittently fail in CI environments like travis-ci.
      // Intermittent failure is a result of the poor performance of CI environments
      // causing the timeouts in this test to become really flakey (setTimeout can't
      // guarantee exact time of function execution, and in a high load env execution can
      // be significantly delayed.
      if (process.env.COVERALLS_ENV == 'production') {
        return true;
      }

      const queue = await QueueFactory();
      queue.flushQueue();
      const jobName = 'job-name';
      const anotherJobName = 'another-job-name';
      const timeoutJobName = 'timeout-job-name';
      const concurrentJobName = 'concurrent-job-name';
      const failingJobName = 'failing-job-name';
      const queueLifespan = 5300;
      let remainingLifespan = queueLifespan;

      // Track the jobs that have executed to test against.
      let executedJobs = [];

      // We need to be able to throw an error outside of
      // job workers, because errors thrown inside a job
      // worker function are caught and logged by job processing
      // logic. They will not fail the test. So track bad jobs
      // and throw error after jobs finish processing.
      let badJobs = [];

      queue.addWorker(jobName, async (id, payload) => {

        // Track jobs that exec
        executedJobs.push(payload.trackingName);

        // Detect jobs that should't be picked up by lifespan queue.
        if (remainingLifespan - 500 < payload.payloadOptionsTimeout) {
          badJobs.push({id, payload});
        }

        remainingLifespan = remainingLifespan - payload.payloadTimeout;

        await new Promise((resolve) => {
          setTimeout(resolve, payload.payloadTimeout);
        });

      }, { concurrency: 1});

      queue.addWorker(anotherJobName, async (id, payload) => {

        // Track jobs that exec
        executedJobs.push(payload.trackingName);

        // Detect jobs that should't be picked up by lifespan queue.
        if (remainingLifespan - 500 < payload.payloadOptionsTimeout) {
          badJobs.push({id, payload});
        }

        remainingLifespan = remainingLifespan - payload.payloadTimeout;

        await new Promise((resolve) => {
          setTimeout(resolve, payload.payloadTimeout);
        });

      }, { concurrency: 1});

      queue.addWorker(timeoutJobName, async (id, payload) => {

        // Track jobs that exec
        executedJobs.push(payload.trackingName);

        // Detect jobs that should't be picked up by lifespan queue.
        if (remainingLifespan - 500 < payload.payloadOptionsTimeout) {
          badJobs.push({id, payload});
        }

        remainingLifespan = remainingLifespan - payload.payloadOptionsTimeout;

        await new Promise((resolve) => {
          setTimeout(resolve, payload.payloadTimeout);
        });

      }, { concurrency: 1});

      queue.addWorker(concurrentJobName, async (id, payload) => {

        // Track jobs that exec
        executedJobs.push(payload.trackingName);

        // Detect jobs that should't be picked up by lifespan queue.
        if (remainingLifespan - 500 < payload.payloadOptionsTimeout) {
          badJobs.push({id, payload});
        }


        // Since these all run concurrently, only subtract the job with the longest
        // timeout that will presumabely finish last.
        if (payload.payloadTimeout == 600) {
          remainingLifespan = remainingLifespan - payload.payloadTimeout;
        }


        await new Promise((resolve) => {
          setTimeout(resolve, payload.payloadTimeout);
        });

      }, { concurrency: 4});

      queue.addWorker(failingJobName, async (id, payload) => {
        // Track jobs that exec
        executedJobs.push(payload.trackingName);

        // Detect jobs that should't be picked up by lifespan queue.
        if (remainingLifespan - 500 < payload.payloadOptionsTimeout) {
          badJobs.push({id, payload});
        }

        await new Promise( (resolve,reject) => {
          setTimeout(() => {
            reject('fail');
          }, payload.payloadTimeout);
        });
      }, { concurrency: 1});

      // Create a couple jobs
      // Broken in core module - not required so not fixing
      // queue.createJob(jobName, {
      //   trackingName: 'job1-job-name-payloadTimeout(100)-timeout(200)-priority(-1)',
      //   payloadTimeout: 100,
      //   payloadOptionsTimeout: 200 // Mirror the actual job options timeout in payload so we can use it for testing.
      // }, {
      //   timeout: 200,
      //   priority: -1
      // }, false);

      // Since more than one job can be written in 1 ms, we need to add a slight delay
      // in order to control the order jobs come off the queue (since they are time sorted)
      // If multiple jobs are written in the same ms, Realm can't be deterministic about job
      // ordering when we pop jobs off the top of the queue.
      // await new Promise((resolve) => { setTimeout(resolve, 25); });

      queue.createJob(anotherJobName, {
        trackingName: 'job2-another-job-name-payloadTimeout(1000)-timeout(1100)-priority(0)',
        payloadTimeout: 1000,
        payloadOptionsTimeout: 1100 // Mirror the actual job options timeout in payload so we can use it for testing.
      }, {
        timeout: 1100
      }, false);
      await new Promise((resolve) => { setTimeout(resolve, 25); });

      queue.createJob(anotherJobName, {
        trackingName: 'job3-another-job-name-payloadTimeout(750)-timeout(800)-priority(10)',
        payloadTimeout: 750,
        payloadOptionsTimeout: 800 // Mirror the actual job options timeout in payload so we can use it for testing.
      }, {
        timeout: 800,
        priority: 10
      }, false);
      await new Promise((resolve) => { setTimeout(resolve, 25); });

      queue.createJob(jobName, {
        trackingName: 'job4-job-name-payloadTimeout(10000)-timeout(10100)-priority(0)',
        payloadTimeout: 10000,
        payloadOptionsTimeout: 10100 // Mirror the actual job options timeout in payload so we can use it for testing.
      }, {
        timeout: 10100
      }, false);
      await new Promise((resolve) => { setTimeout(resolve, 25); });

      queue.createJob(jobName, {
        trackingName: 'job5-job-name-payloadTimeout(400)-timeout(500)-priority(0)',
        payloadTimeout: 400,
        payloadOptionsTimeout: 500 // Mirror the actual job options timeout in payload so we can use it for testing.
      }, {
        timeout: 500
      }, false);
      await new Promise((resolve) => { setTimeout(resolve, 25); });

      queue.createJob(timeoutJobName, {
        trackingName: 'job6-timeout-job-name-payloadTimeout(10000)-timeout(500)-priority(0)',
        payloadTimeout: 10000,
        payloadOptionsTimeout: 500 // Mirror the actual job options timeout in payload so we can use it for testing.
      }, {
        timeout: 500
      }, false);
      await new Promise((resolve) => { setTimeout(resolve, 25); });

      queue.createJob(jobName, {
        trackingName: 'job7-job-name-payloadTimeout(1000)-timeout(1100)-priority(1)',
        payloadTimeout: 1000,
        payloadOptionsTimeout: 1100 // Mirror the actual job options timeout in payload so we can use it for testing.
      }, {
        timeout: 1100,
        priority: 1
      }, false);
      await new Promise((resolve) => { setTimeout(resolve, 25); });


      // Create concurrent jobs
      queue.createJob(concurrentJobName, {
        trackingName: 'job8-concurrent-job-name-payloadTimeout(500)-timeout(600)-priority(0)',
        payloadTimeout: 500,
        payloadOptionsTimeout: 600 // Mirror the actual job options timeout in payload so we can use it for testing.
      }, {
        timeout: 600,
        priority: 0
      }, false);
      await new Promise((resolve) => { setTimeout(resolve, 25); });

      queue.createJob(concurrentJobName, {
        trackingName: 'job9-concurrent-job-name-payloadTimeout(510)-timeout(600)-priority(0)',
        payloadTimeout: 510,
        payloadOptionsTimeout: 600 // Mirror the actual job options timeout in payload so we can use it for testing.
      }, {
        timeout: 600,
        priority: 0
      }, false);
      await new Promise((resolve) => { setTimeout(resolve, 25); });

      queue.createJob(concurrentJobName, {
        trackingName: 'job10-concurrent-job-name-payloadTimeout(10000)-timeout(10100)-priority(0)', // THIS JOB WILL BE SKIPPED BY getConcurrentJobs() due to timeout too long.
        payloadTimeout: 10000,
        payloadOptionsTimeout: 10100 // Mirror the actual job options timeout in payload so we can use it for testing.
      }, {
        timeout: 10100,
        priority: 0
      }, false);
      await new Promise((resolve) => { setTimeout(resolve, 25); });

      queue.createJob(concurrentJobName, {
        trackingName: 'job11-concurrent-job-name-payloadTimeout(600)-timeout(700)-priority(0)',
        payloadTimeout: 600,
        payloadOptionsTimeout: 700 // Mirror the actual job options timeout in payload so we can use it for testing.
      }, {
        timeout: 700,
        priority: 0
      }, false);
      await new Promise((resolve) => { setTimeout(resolve, 25); });

      queue.createJob(jobName, {
        trackingName: 'job12-job-name-payloadTimeout(100)-timeout(200)-priority(0)',
        payloadTimeout: 100,
        payloadOptionsTimeout: 200 // Mirror the actual job options timeout in payload so we can use it for testing.
      }, {
        timeout: 200
      }, false);
      await new Promise((resolve) => { setTimeout(resolve, 25); });

      queue.createJob(jobName, {
        trackingName: 'job13-job-name-payloadTimeout(400)-timeout(500)-priority(0)', // THIS JOB WON'T BE RUN BECAUSE THE TIMEOUT IS 500 AND ONLY 950ms left by this pount. 950 - 500 = 450 and 500 remaining is min for job to be pulled.
        payloadTimeout: 400,
        payloadOptionsTimeout: 500 // Mirror the actual job options timeout in payload so we can use it for testing.
      }, {
        timeout: 500
      }, false);
      await new Promise((resolve) => { setTimeout(resolve, 25); });

      queue.createJob(jobName, {
        trackingName: 'job14-job-name-payloadTimeout(100)-timeout(200)-priority(0)',
        payloadTimeout: 100,
        payloadOptionsTimeout: 200 // Mirror the actual job options timeout in payload so we can use it for testing.
      }, {
        timeout: 200
      }, false);
      await new Promise((resolve) => { setTimeout(resolve, 25); });

      queue.createJob(jobName, {
        trackingName: 'job15-job-name-payloadTimeout(500)-timeout(600)-priority(0)', // THIS JOB WON'T BE RUN BECAUSE out of time!
        payloadTimeout: 500,
        payloadOptionsTimeout: 600 // Mirror the actual job options timeout in payload so we can use it for testing.
      }, {
        timeout: 600
      }, false);
      await new Promise((resolve) => { setTimeout(resolve, 25); });

      queue.createJob(failingJobName, {
        trackingName: 'job16-failing-job-name-retryDelay(2800)-attempts(3)', // This job should run twice in lifespan
        retryDelay: 3000,
        attempts: 3,
        payloadTimeout: 10,
      }, {
        timeout: 600,
        retryDelay: 3000,
        attempts: 3,
        priority: 100,
      }, false);
      await new Promise((resolve) => { setTimeout(resolve, 25); });

      // startQueue is false so queue should not have started.
      queue.status.should.equal('inactive');

      const queueStartTime = Date.now();

      // Start queue, don't await so this test can continue while queue processes.
      await queue.start(queueLifespan);

      const queueEndTime = Date.now();
      const queueProcessTime = queueStartTime - queueEndTime;

      if (queueProcessTime > queueLifespan) {
        throw new Error('ERROR: Queue did not complete before lifespan ended.');
      }

      if (badJobs.length) {
        throw new Error('ERROR: Queue with lifespan picked up bad jobs it did not have enough remaining lifespan to execute: ' + JSON.stringify(badJobs));
      }

      // Queue should have stopped.
      queue.status.should.equal('inactive');

      //Check that the correct jobs executed.
      executedJobs.should.deepEqual([
        'job16-failing-job-name-retryDelay(2800)-attempts(3)',
        'job3-another-job-name-payloadTimeout(750)-timeout(800)-priority(10)',
        'job7-job-name-payloadTimeout(1000)-timeout(1100)-priority(1)',
        'job2-another-job-name-payloadTimeout(1000)-timeout(1100)-priority(0)',
        'job5-job-name-payloadTimeout(400)-timeout(500)-priority(0)',
        'job16-failing-job-name-retryDelay(2800)-attempts(3)',
        'job6-timeout-job-name-payloadTimeout(10000)-timeout(500)-priority(0)', // This job executes but isn't deleted because it fails due to timeout.
        'job8-concurrent-job-name-payloadTimeout(500)-timeout(600)-priority(0)',
        'job9-concurrent-job-name-payloadTimeout(510)-timeout(600)-priority(0)',
        'job11-concurrent-job-name-payloadTimeout(600)-timeout(700)-priority(0)',
        'job12-job-name-payloadTimeout(100)-timeout(200)-priority(0)',
        'job14-job-name-payloadTimeout(100)-timeout(200)-priority(0)',
        // 'job1-job-name-payloadTimeout(100)-timeout(200)-priority(-1)'
      ]);

      // Check jobs that couldn't be picked up are still in the queue.
      const remainingJobs = await queue.getJobs(true);

      const remainingJobNames = remainingJobs.map( job => {
        const payload = JSON.parse(job.payload);
        return payload.trackingName;
      });

      // queue.getJobs() doesn't order jobs in any particular way so just
      // check that the jobs still exist on the queue.
      remainingJobNames.should.containDeep([
        'job4-job-name-payloadTimeout(10000)-timeout(10100)-priority(0)',
        'job6-timeout-job-name-payloadTimeout(10000)-timeout(500)-priority(0)',
        'job10-concurrent-job-name-payloadTimeout(10000)-timeout(10100)-priority(0)',
        'job13-job-name-payloadTimeout(400)-timeout(500)-priority(0)',
        'job15-job-name-payloadTimeout(500)-timeout(600)-priority(0)',
        'job16-failing-job-name-retryDelay(2800)-attempts(3)'
      ]);

    }, 10000); // Increase timeout of this advanced test to 10 seconds.

    it('#start(lifespan) "Zero lifespanRemaining" edge case #1 is properly handled.', async () => {

      // Mock Date.now()
      Date.now = jest.fn();
      Date.now.mockReturnValueOnce(0);
      Date.now.mockReturnValueOnce(1000);

      const queue = await QueueFactory();
      const jobName = 'job-name';
      let counter = 0;

      queue.addWorker(jobName, () => {
        counter++;
      });

      // Create a job
      queue.createJob(jobName, {}, {
        timeout: 100 // Timeout must be set to test that job still isn't grabbed during "zero lifespanRemaining" edge case.
      }, false);

      // startQueue is false so queue should not have started.
      queue.status.should.equal('inactive');

      // Start queue, don't await so this test can continue while queue processes.
      await queue.start(1000);

      // Queue should be inactive again.
      queue.status.should.equal('inactive');

      // Since we hit "zero lifespanRemaining" edge case, the job should never have been pulled
      // off the queue and processed. So counter should remain 0 and job should still exist.
      counter.should.equal(0);

      const jobs = await queue.getJobs(true);

      jobs.length.should.equal(1);

    });

    it('#start(lifespan) "Zero lifespanRemaining" edge case #2 is properly handled.', async () => {

      // Mock Date.now()
      Date.now = jest.fn();
      Date.now.mockReturnValueOnce(0);
      Date.now.mockReturnValueOnce(500);
      Date.now.mockReturnValueOnce(2000);

      const queue = await QueueFactory();
      const jobName = 'job-name';
      let counter = 0;

      queue.addWorker(jobName, () => {
        counter++;
      });

      // Create jobs
      queue.createJob(jobName, {}, {
        timeout: 100 // Timeout must be set to test that job still isn't grabbed during "zero lifespanRemaining" edge case.
      }, false);

      await new Promise((resolve) => { setTimeout(resolve, 25); }); // Space out inserts so time sorting is deterministic.

      queue.createJob(jobName, {
        testIdentifier: 'this is 2nd job'
      }, {
        timeout: 100 // Timeout must be set to test that job still isn't grabbed during "zero lifespanRemaining" edge case.
      }, false);

      // startQueue is false so queue should not have started.
      queue.status.should.equal('inactive');

      // Start queue, don't await so this test can continue while queue processes.
      await queue.start(2000);

      // Queue should be inactive again.
      queue.status.should.equal('inactive');

      // Since we skipped first "zero lifespanRemaining" edge case, one job should
      // be processed. However since we hit 2nd "zero lifespanRemaining" edge case,
      // second job should never be pulled off queue and so second job should still exist.
      counter.should.equal(1);

      const jobs = await queue.getJobs(true);

      const jobPayload = JSON.parse(jobs[0].payload);

      jobPayload.testIdentifier.should.equal('this is 2nd job');

    });

    //
    // FULL QUEUE UNIT TESTING
    //

    it('#constructor() sets values correctly', async () => {

      const queueNotInitialized = new Queue();

      queueNotInitialized.should.have.properties({
        realm: null,
        worker: new Worker(),
        status: 'inactive'
      });

    });

    it('QueueFactory initializes Realm', async () => {

      const queue = await QueueFactory();

      queue.realm.constructor.name.should.equal('Realm');

    });

    it('init() Calling init() multiple times will only set queue.realm once.', async () => {

      const queue = await QueueFactory();

      queue.realm.constructor.name.should.equal('Realm');

      // Overwrite realm instance to test it doesn't get set to the actual
      // Realm singleton instance again in init() since queue.realm is no longer null.
      queue.realm = 'arbitrary-string';

      queue.init();

      queue.realm.should.equal('arbitrary-string');

    });

    it('#addWorker() and removeWorker() should pass calls through to Worker class', async () => {

      const queue = await QueueFactory();
      const workerOptions = {
        concurrency: 4,
        onSuccess: async () => {}
      };

      queue.addWorker('job-name', () => {}, workerOptions);

      // first worker is added with default options.
      Worker.workers['job-name'].should.be.a.Function();
      Worker.workers['job-name'].options.should.deepEqual({
        concurrency: workerOptions.concurrency,
        onStart: null,
        onSuccess: workerOptions.onSuccess,
        onFailure: null,
        onFailed: null,
        onComplete: null
      });

      queue.removeWorker('job-name');

      // Worker has been removed.
      should.not.exist(Worker.workers['job-name']);

    });

    it('#createJob() requires job name at minimum', async () => {

      const queue = await QueueFactory();

      try {
        await queue.createJob();
        throw new Error('Job with no name should have thrown error.');
      } catch (error) {
        error.should.deepEqual(new Error('Job name must be supplied.'));
      }

    });

    it('#createJob() should validate job options.', async () => {

      const queue = await QueueFactory();
      const jobName = 'job-name';

      queue.addWorker(jobName, () => {});

      try {
        await queue.createJob(jobName, {}, {
          timeout: -100
        }, false);
        throw new Error('createJob() should validate job timeout option.');
      } catch (error) {
        error.should.deepEqual(new Error('Invalid job option.'));
      }

      try {
        await queue.createJob(jobName, {}, {
          attempts: -100
        }, false);
        throw new Error('createJob() should validate job attempts option.');
      } catch (error) {
        error.should.deepEqual(new Error('Invalid job option.'));
      }

    });

    it('#createJob() should apply defaults correctly', async () => {

      const queue = await QueueFactory();
      const jobName = 'job-name';

      queue.addWorker(jobName, () => {});

      queue.createJob(jobName, {}, {}, false);

      // startQueue is false so queue should not have started.
      queue.status.should.equal('inactive');

      const jobs = await queue.getJobs(true);

      // Check job has default values.
      jobs[0].should.have.properties({
        name: jobName,
        payload: JSON.stringify({}),
        data: JSON.stringify({attempts: 1}),
        priority: 0,
        active: false,
        timeout: 25000
      });

    });

    it('#createJob() should create a new job on the queue', async () => {

      const queue = await QueueFactory();
      const jobName = 'job-name';
      const payload = { data: 'example-data' };
      const jobOptions = { priority: 4, timeout: 3000, attempts: 3};

      queue.addWorker(jobName, () => {});

      queue.createJob(jobName, payload, jobOptions, false);

      // startQueue is false so queue should not have started.
      queue.status.should.equal('inactive');

      const jobs = await queue.getJobs(true);

      jobs[0].should.have.properties({
        name: jobName,
        payload: JSON.stringify(payload),
        data: JSON.stringify({attempts: jobOptions.attempts}),
        priority: jobOptions.priority,
        active: false,
        timeout: jobOptions.timeout
      });

    });

    it('#createJob() should default to starting queue. stop() should stop queue.', async () => {

      const queue = await QueueFactory();
      const jobName = 'job-name';
      const payload = { data: 'example-data' };
      const jobOptions = { priority: 4, timeout: 3000, attempts: 3};

      queue.addWorker(jobName, () => {});

      queue.createJob(jobName, payload, jobOptions, true);
      queue.status.should.equal('active');

      queue.stop();

      queue.status.should.equal('inactive');

    });

    it('#start() should start queue.', async () => {

      const queue = await QueueFactory();
      const jobName = 'job-name';
      const payload = { data: 'example-data' };
      const jobOptions = { priority: 4, timeout: 3000, attempts: 3};

      let counter = 0; // Incrementing this will be our job "work".

      queue.addWorker(jobName, () => {
        counter++;
      });

      // Create a couple jobs
      queue.createJob(jobName, payload, jobOptions, false);
      queue.createJob(jobName, payload, jobOptions, false);

      // startQueue is false so queue should not have started.
      queue.status.should.equal('inactive');

      queue.start();

      queue.status.should.equal('active');

      // Give queue 1000ms to churn through all the jobs.
      await new Promise((resolve) => {
        setTimeout(() => {
          resolve(true);
        }, 1000);
      });

      // Queue should be finished with no jobs left.
      queue.status.should.equal('inactive');

      const jobs = await queue.getJobs(true);

      jobs.length.should.equal(0);

      // Counter should be updated to reflect worker execution.
      counter.should.equal(2);

    });

    it('#start() called when queue is already active should NOT fire up a concurrent queue.', async () => {

      const queue = await QueueFactory();
      const jobName = 'job-name';
      const payload = { data: 'example-data' };
      const jobOptions = { priority: 4, timeout: 3000, attempts: 3};

      queue.addWorker(jobName, async () => {

        // Make queue take some time to process.
        await new Promise( resolve => {
          setTimeout(resolve, 1000);
        });

      });

      // Create a couple jobs
      queue.createJob(jobName, payload, jobOptions, false);
      queue.createJob(jobName, payload, jobOptions, false);

      // startQueue is false so queue should not have started.
      queue.status.should.equal('inactive');

      // Start queue, don't await so this test can continue while queue processes.
      queue.start();

      queue.status.should.equal('active');

      // Calling queue.start() on already running queue should cause start() to return
      // early with false bool indicating concurrent start did not occur.
      const falseStart = await queue.start(); //Must be awaited to resolve async func promise into false value.

      falseStart.should.be.False();

    });

    it('#getJobs() should grab all jobs in queue.', async () => {

      const queue = await QueueFactory();
      const jobName = 'job-name';
      const payload = { data: 'example-data' };
      const jobOptions = { priority: 4, timeout: 3000, attempts: 3};

      queue.addWorker(jobName, () => {});

      // Create a couple jobs
      queue.createJob(jobName, payload, jobOptions, false);
      queue.createJob(jobName, payload, jobOptions, false);
      queue.createJob(jobName, payload, jobOptions, false);
      queue.createJob(jobName, payload, jobOptions, false);

      const jobs = await queue.getJobs(true);

      jobs.length.should.equal(4);

      const mvccJobs = await queue.getJobs(); // Test non-blocking read version as well.

      mvccJobs.length.should.equal(4);

    });

    it('#getConcurrentJobs(queueLifespanRemaining) should work as expected for queues started with a lifespan.', async () => {

      const queue = await QueueFactory();
      const jobName = 'job-name';

      queue.addWorker(jobName, () => {}, {
        concurrency: 3
      });

      // Test that jobs with no timeout set will not be returned by getConcurrentJobs() if queueLifespanRemaining is passed.
      queue.createJob(jobName, {}, {
        timeout: 0
      }, false);
      queue.createJob(jobName, {}, {
        timeout: 0
      }, false);
      queue.createJob(jobName, {}, {
        timeout: 0
      }, false);

      const jobs = await queue.getConcurrentJobs(-1, 2000);

      // No jobs should be grabbed
      jobs.length.should.equal(0);

      // Reset DB
      queue.flushQueue();

      // Test that jobs with timeout not at least 500ms less than queueLifespanRemaining are not grabbed.
      queue.createJob(jobName, {}, {
        timeout: 500
      }, false);
      queue.createJob(jobName, {}, {
        timeout: 500
      }, false);
      queue.createJob(jobName, {}, {
        timeout: 500
      }, false);

      const notEnoughBufferJobs = await queue.getConcurrentJobs(-1,600);

      // No jobs should be grabbed
      notEnoughBufferJobs.length.should.equal(0);

      // Reset DB
      queue.flushQueue();

      //Lower bound edge case test
      queue.createJob(jobName, {}, {
        timeout: 0
      }, false);
      queue.createJob(jobName, {}, {
        timeout: 1
      }, false);
      queue.createJob(jobName, {}, {
        timeout: 1
      }, false);

      // startQueue is false so queue should not have started.
      queue.status.should.equal('inactive');

      const lowerBoundEdgeCaseJobs = await queue.getConcurrentJobs(-1,501);

      // Only the jobs with the timeouts set should be grabbed.
      lowerBoundEdgeCaseJobs.length.should.equal(2);

      // Reset DB
      queue.flushQueue();

      //Test concurrency is working as expected with lifespans.
      queue.createJob(jobName, {}, {
        timeout: 800
      }, false);
      queue.createJob(jobName, {}, {
        timeout: 1000
      }, false);
      queue.createJob(jobName, {}, {
        timeout: 1000
      }, false);
      queue.createJob(jobName, {}, {
        timeout: 1000
      }, false);

      // startQueue is false so queue should not have started.
      queue.status.should.equal('inactive');

      const lifespanConcurrencyJobs = await queue.getConcurrentJobs(-1,2000);

      // Only 3 jobs should be grabbed in this test even though all jobs
      // have valid timeouts because worker concurrency is set to 3
      lifespanConcurrencyJobs.length.should.equal(3);

      // Reset DB
      queue.flushQueue();

    });

    it('#getConcurrentJobs() If worker concurrency is set to 3, getConcurrentJobs() should get up to 3 of same type of job as next job on top of queue.', async () => {

      const queue = await QueueFactory();
      const jobName = 'job-name';
      const jobOptions = { priority: 4, timeout: 3000, attempts: 3};

      queue.addWorker(jobName, () => {}, {
        concurrency: 3
      });
      queue.addWorker('a-different-job', () => {});

      // Create a couple jobs
      queue.createJob(jobName, { random: 'this is 1st random data' }, jobOptions, false);
      queue.createJob('a-different-job', { dummy: 'data' }, {}, false); // This should not be returned by concurrentJobs() should all be of the 'job-name' type.
      queue.createJob(jobName, { random: 'this is 2nd random data' }, jobOptions, false);
      queue.createJob(jobName, { random: 'this is 3rd random data' }, jobOptions, false);
      queue.createJob(jobName, { random: 'this is 4th random data' }, jobOptions, false);

      const concurrentJobs = await queue.getConcurrentJobs();

      // Verify correct jobs retrieved.
      concurrentJobs.length.should.equal(3);
      JSON.parse(concurrentJobs[0].payload).should.deepEqual({ random: 'this is 1st random data' });
      JSON.parse(concurrentJobs[1].payload).should.deepEqual({ random: 'this is 2nd random data' });
      JSON.parse(concurrentJobs[2].payload).should.deepEqual({ random: 'this is 3rd random data' });

      // Ensure that other jobs also got created, but not returned by getConcurrentJobs().
      const jobs = await queue.getJobs(true);
      jobs.length.should.equal(5);

    });

    it('#getConcurrentJobs() If worker concurrency is set to 10, but only 4 jobs of next job type exist, getConcurrentJobs() should only return 4 jobs.', async () => {

      const queue = await QueueFactory();
      const jobName = 'job-name';
      const jobOptions = { priority: 4, timeout: 3000, attempts: 3};

      queue.addWorker(jobName, () => {}, {
        concurrency: 10
      });
      queue.addWorker('a-different-job', () => {});

      // Create a couple jobs
      queue.createJob(jobName, { random: 'this is 1st random data' }, jobOptions, false);
      queue.createJob('a-different-job', { dummy: 'data' }, {}, false); // This should not be returned by concurrentJobs() should all be of the 'job-name' type.
      queue.createJob(jobName, { random: 'this is 2nd random data' }, jobOptions, false);
      queue.createJob(jobName, { random: 'this is 3rd random data' }, jobOptions, false);
      queue.createJob(jobName, { random: 'this is 4th random data' }, jobOptions, false);

      const concurrentJobs = await queue.getConcurrentJobs();

      // Verify correct jobs retrieved.
      concurrentJobs.length.should.equal(4);
      JSON.parse(concurrentJobs[0].payload).should.deepEqual({ random: 'this is 1st random data' });
      JSON.parse(concurrentJobs[1].payload).should.deepEqual({ random: 'this is 2nd random data' });
      JSON.parse(concurrentJobs[2].payload).should.deepEqual({ random: 'this is 3rd random data' });
      JSON.parse(concurrentJobs[3].payload).should.deepEqual({ random: 'this is 4th random data' });

      // Ensure that other jobs also got created, but not returned by getConcurrentJobs().
      const jobs = await queue.getJobs(true);
      jobs.length.should.equal(5);

    });

    it('#getConcurrentJobs() Ensure that priority is respected.', async () => {

      const queue = await QueueFactory();
      const jobName = 'job-name';
      const jobOptions = { priority: 0, timeout: 3000, attempts: 3};

      queue.addWorker(jobName, () => {}, {
        concurrency: 3
      });
      queue.addWorker('a-different-job', () => {}, {
        concurrency: 2
      });

      // Create a couple jobs
      queue.createJob(jobName, { random: 'this is 1st random data' }, jobOptions, false);
      queue.createJob('a-different-job', { dummy: '1 data' }, { priority: 3 }, false);
      queue.createJob(jobName, { random: 'this is 2nd random data' }, jobOptions, false);
      queue.createJob('a-different-job', { dummy: '2 data' }, { priority: 5 }, false);
      queue.createJob('a-different-job', { dummy: '3 data' }, { priority: 3 }, false);
      queue.createJob(jobName, { random: 'this is 3rd random data' }, jobOptions, false);
      queue.createJob(jobName, { random: 'this is 4th random data' }, jobOptions, false);

      const concurrentJobs = await queue.getConcurrentJobs();

      // Verify correct jobs retrieved.
      // 'a-different-job' should be the jobs returned since job with payload "2 data" has highest priority
      // since the other 'a-different-job' jobs have same priority, "1 data" should get preference for 2nd concurrent job due
      // to timestamp order.
      concurrentJobs.length.should.equal(2);
      JSON.parse(concurrentJobs[0].payload).should.deepEqual({ dummy: '2 data' });
      JSON.parse(concurrentJobs[1].payload).should.deepEqual({ dummy: '1 data' });

      // Ensure that other jobs also got created, but not returned by getConcurrentJobs().
      const jobs = await queue.getJobs(true);
      jobs.length.should.equal(7);

    });

    it('#getConcurrentJobs() Marks selected jobs as "active"', async () => {

      const queue = await QueueFactory();
      const jobName = 'job-name';
      const jobOptions = { priority: 0, timeout: 3000, attempts: 3};

      queue.addWorker(jobName, () => {}, {
        concurrency: 3
      });
      queue.addWorker('a-different-job', () => {}, {
        concurrency: 2
      });

      // Create a couple jobs
      queue.createJob(jobName, { random: 'this is 1st random data' }, jobOptions, false);
      queue.createJob('a-different-job', { dummy: '1 data' }, { priority: 3 }, false);
      queue.createJob(jobName, { random: 'this is 2nd random data' }, jobOptions, false);
      queue.createJob('a-different-job', { dummy: '2 data' }, { priority: 5 }, false);
      queue.createJob('a-different-job', { dummy: '3 data' }, { priority: 3 }, false);
      queue.createJob(jobName, { random: 'this is 3rd random data' }, jobOptions, false);
      queue.createJob(jobName, { random: 'this is 4th random data' }, jobOptions, false);

      // Jobs returned by getConcurrentJobs() are marked "active" so they won't be returned by future getConcurrentJobs() calls.
      const concurrentJobs = await queue.getConcurrentJobs();

      // Get all the jobs in the DB and check that the "concurrentJobs" are marked "active."
      const jobs = await queue.getJobs(true);
      jobs.length.should.equal(7);

      const activeJobs = jobs.filter( job => job.active);
      activeJobs.length.should.equal(2);
      JSON.parse(concurrentJobs[0].payload).should.deepEqual({ dummy: '2 data' });
      JSON.parse(concurrentJobs[1].payload).should.deepEqual({ dummy: '1 data' });

    });

    it('#getConcurrentJobs() consecutive calls to getConcurrentJobs() gets new non-active jobs (and marks them active).', async () => {

      const queue = await QueueFactory();
      const jobName = 'job-name';
      const jobOptions = { priority: 0, timeout: 3000, attempts: 3};

      queue.addWorker(jobName, () => {}, {
        concurrency: 3
      });
      queue.addWorker('a-different-job', () => {}, {
        concurrency: 1
      });

      // Create a couple jobs
      queue.createJob(jobName, { random: 'this is 1st random data' }, jobOptions, false);
      queue.createJob('a-different-job', { dummy: '1 data' }, { priority: 3 }, false);
      queue.createJob(jobName, { random: 'this is 2nd random data' }, { priority: 4 }, false);
      queue.createJob('a-different-job', { dummy: '2 data' }, { priority: 5 }, false);
      queue.createJob('a-different-job', { dummy: '3 data' }, { priority: 3 }, false);
      queue.createJob(jobName, { random: 'this is 3rd random data' }, jobOptions, false);
      queue.createJob(jobName, { random: 'this is 4th random data' }, jobOptions, false);

      // Jobs returned by getConcurrentJobs() are marked "active" so they won't be returned by future getConcurrentJobs() calls.
      const concurrentJobs = await queue.getConcurrentJobs();

      // Get all the jobs in the DB and check that the "concurrentJobs" are marked "active."
      const jobs = await queue.getJobs(true);
      jobs.length.should.equal(7);

      const activeJobs = jobs.filter( job => job.active);
      activeJobs.length.should.equal(1);
      JSON.parse(concurrentJobs[0].payload).should.deepEqual({ dummy: '2 data' });

      // Next call to getConcurrentJobs() should get the next jobs of the top of the queue as expected
      // Next job in line should be type of job, then grab all the concurrents of that type and mark them active.
      const moreConcurrentJobs = await queue.getConcurrentJobs();
      moreConcurrentJobs.length.should.equal(3);
      JSON.parse(moreConcurrentJobs[0].payload).should.deepEqual({ random: 'this is 2nd random data' });
      JSON.parse(moreConcurrentJobs[1].payload).should.deepEqual({ random: 'this is 1st random data' });
      JSON.parse(moreConcurrentJobs[2].payload).should.deepEqual({ random: 'this is 3rd random data' });

      // Now we should have 4 active jobs...
      const allJobsAgain = await queue.getJobs(true);
      const nextActiveJobs = allJobsAgain.filter( job => job.active);
      nextActiveJobs.length.should.equal(4);

      // Next call to getConcurrentJobs() should work as expected
      const thirdConcurrentJobs = await queue.getConcurrentJobs();
      thirdConcurrentJobs.length.should.equal(1);
      JSON.parse(thirdConcurrentJobs[0].payload).should.deepEqual({ dummy: '1 data' });

      // Next call to getConcurrentJobs() should work as expected
      const fourthConcurrentJobs = await queue.getConcurrentJobs();
      fourthConcurrentJobs.length.should.equal(1);
      JSON.parse(fourthConcurrentJobs[0].payload).should.deepEqual({ dummy: '3 data' });

      // Next call to getConcurrentJobs() should be the last of the non-active jobs.
      const fifthConcurrentJobs = await queue.getConcurrentJobs();
      fifthConcurrentJobs.length.should.equal(1);
      JSON.parse(fifthConcurrentJobs[0].payload).should.deepEqual({ random: 'this is 4th random data' });

      // Next call to getConcurrentJobs() should return an empty array.
      const sixthConcurrentJobs = await queue.getConcurrentJobs();
      sixthConcurrentJobs.length.should.equal(0);

    });

    it('should set nextValidTime for job on failure which is retryDelay after now', async () => {
      const queue = await QueueFactory();
      const jobName = 'job-name';

      queue.addWorker(jobName, async () => {
        throw new Error('fail');
      }, {
        concurrency: 1
      });

      queue.createJob(jobName, {}, {
        attempts: 2,
        timeout: 250,
        retryDelay: 2000,
      }, false);

      const now = Date.now();
      await queue.start(1500);
      await wait(1500);

      const jobs = await queue.getJobs(true);
      const job = jobs[0];

      const jobData = JSON.parse(job.data);
      jobData.failedAttempts.should.equal(1);
      should.not.exist(job.failed);
      moment(job.nextValidTime).subtract(now).should.be.greaterThan(1000);
      queue.flushQueue();
    });

    const addFailedAttemptCount = async (realm, jobs, failedCount, nextValidTime = new Date()) => {
      const job = jobs[0];
      const jobData = JSON.parse(job.data);
      realm.write(() => {
        job.nextValidTime = nextValidTime;
        jobData.failedAttempts = failedCount;
        job.data = JSON.stringify(jobData);
      });
    };

    const addFailedStatus = async (realm, jobs) => {
      const job = jobs[0];
      realm.write(() => {
        job.failed = new Date();
      });
    };

    const createAndTestJob = async (nextValidTime, failed, expectedNumberOfReturn) => {
      const queue = await QueueFactory();
      const jobName = 'job-name';
      const realm = await Database.getRealmInstance();

      queue.addWorker(jobName, () => {}, {
        concurrency: 1
      });

      queue.createJob(jobName, {}, {
        attempts: 2,
        timeout: 99,
        retryDelay: 100,
      }, false);

      if(nextValidTime)
        await addFailedAttemptCount(realm, await queue.getJobs(true),1, nextValidTime);

      if(failed)
        await addFailedStatus(realm, await queue.getJobs(true));

      const returnedJobs = await queue.getConcurrentJobs(600);

      returnedJobs.length.should.equal(expectedNumberOfReturn);

      queue.flushQueue();
    };

    it('#getConcurrentJobs(queueLifespanRemaining) should return jobs with retryDelay set will be returned by getConcurrentJobs() as normal if not failedAttempts.', async () => {
      await createAndTestJob(null,false,1);
    });

    it('#getConcurrentJobs(queueLifespanRemaining) should not return jobs with nextValidTime in the future.', async () => {
      await createAndTestJob(new Date(new Date().getTime() + 1000),false,0);
    });

    it('#getConcurrentJobs(queueLifespanRemaining) should return jobs with nextValidTime in the past.', async () => {
      await createAndTestJob(new Date(new Date().getTime() - 1000),false,1);
    });

    it('#getConcurrentJobs(queueLifespanRemaining) should return jobs with nextValidTime now.', async () => {
      await createAndTestJob(new Date(),false,1);
    });

    it('#getConcurrentJobs(queueLifespanRemaining) should not return failed jobs.', async () => {
      await createAndTestJob(new Date(new Date().getTime() - 1000),true,0);
    });

    it('#processJob() executes job worker then deletes job on success', async () => {

      const queue = await QueueFactory();
      const jobName = 'job-name';
      const jobOptions = { priority: 0, timeout: 3000, attempts: 3};

      let counter = 0; // Incrementing this will be our job "work"

      queue.addWorker(jobName, () => {}, {
        concurrency: 3
      });
      queue.addWorker('a-different-job', () => {
        counter++;
      }, {
        concurrency: 1
      });

      // Create a couple jobs
      queue.createJob(jobName, { random: 'this is 1st random data' }, jobOptions, false);
      queue.createJob('a-different-job', { dummy: '1 data' }, { priority: 3 }, false);
      queue.createJob(jobName, { random: 'this is 2nd random data' }, jobOptions, false);
      queue.createJob('a-different-job', { dummy: '2 data' }, { priority: 5 }, false);
      queue.createJob('a-different-job', { dummy: '3 data' }, { priority: 3 }, false);
      queue.createJob(jobName, { random: 'this is 3rd random data' }, jobOptions, false);
      queue.createJob(jobName, { random: 'this is 4th random data' }, jobOptions, false);

      // Jobs returned by getConcurrentJobs() are marked "active" so they won't be returned by future getConcurrentJobs() calls.
      const concurrentJobs = await queue.getConcurrentJobs();
      concurrentJobs.length.should.equal(1);
      JSON.parse(concurrentJobs[0].payload).should.deepEqual({ dummy: '2 data' });

      // Process the job
      await queue.processJob(concurrentJobs[0]);

      // Ensure job work was performed.
      counter.should.equal(1);

      // Ensure completed job has been removed.
      const jobs = await queue.getJobs(true);
      jobs.length.should.equal(6);

      const jobExists = jobs.reduce((exists, job) => {
        const payload = JSON.parse(job.payload);
        if (payload.dummy && payload.dummy == '2 data') {
          exists = true;
        }
        return exists;
      }, false);

      jobExists.should.be.False();

    });

    it('#processJob() increments failedAttempts counter until max attempts then fails on job failure.', async () => {

      const queue = await QueueFactory();
      queue.flushQueue();
      const jobName = 'job-name';
      const jobOptions = { priority: 0, timeout: 3000, attempts: 3};

      let counter = 0; // Incrementing this will be our job "work"

      queue.addWorker(jobName, () => {}, {
        concurrency: 3
      });
      queue.addWorker('a-different-job', (id, payload) => {

        if (payload.dummy && payload.dummy == '2 data') {
          throw new Error('Fake job failure!');
        }

        counter++;

      }, {
        concurrency: 2
      });

      // Create a couple jobs
      queue.createJob(jobName, { random: 'this is 1st random data' }, jobOptions, false);
      queue.createJob('a-different-job', { dummy: '1 data' }, { priority: 3 }, false);
      queue.createJob(jobName, { random: 'this is 2nd random data' }, { priority: 1, timeout: 3000, attempts: 3}, false);
      queue.createJob('a-different-job', { dummy: '2 data' }, { priority: 5, attempts: 3 }, false);
      queue.createJob('a-different-job', { dummy: '3 data' }, { priority: 3 }, false);
      queue.createJob(jobName, { random: 'this is 3rd random data' }, jobOptions, false);
      queue.createJob(jobName, { random: 'this is 4th random data' }, jobOptions, false);

      // Jobs returned by getConcurrentJobs() are marked "active" so they won't be returned by future getConcurrentJobs() calls.
      const concurrentJobs = await queue.getConcurrentJobs();
      concurrentJobs.length.should.equal(2);
      JSON.parse(concurrentJobs[0].payload).should.deepEqual({ dummy: '2 data' });
      JSON.parse(concurrentJobs[1].payload).should.deepEqual({ dummy: '1 data' });

      // Process the jobs
      await Promise.all([queue.processJob(concurrentJobs[0]), queue.processJob(concurrentJobs[1])]);

      // Ensure job work was performed by ONE job (first should have failed).
      counter.should.equal(1);

      // Ensure other job was deleted on job completion and ensure failedAttempts incremented on failed job.
      const jobs = await queue.getJobs(true);
      jobs.length.should.equal(6);
      let failedJob = jobs.find((job) => {
        const payload = JSON.parse(job.payload);
        return (payload.dummy && payload.dummy == '2 data');
      });
      let failedJobData = JSON.parse(failedJob.data);
      failedJobData.failedAttempts.should.equal(1);


      // Next getConcurrentJobs() batch should get 2 jobs again, the failed job and remaining job of this job type.
      const secondConcurrentJobs = await queue.getConcurrentJobs();
      secondConcurrentJobs.length.should.equal(2);
      JSON.parse(secondConcurrentJobs[0].payload).should.deepEqual({ dummy: '2 data' });
      JSON.parse(secondConcurrentJobs[1].payload).should.deepEqual({ dummy: '3 data' });

      // Process the jobs
      await Promise.all([queue.processJob(secondConcurrentJobs[0]), queue.processJob(secondConcurrentJobs[1])]);

      // Ensure more job work was performed by ONE job (first should have failed).
      counter.should.equal(2);

      // Ensure other job was deleted on job completion and ensure failedAttempts incremented again on failed job.
      const secondJobs = await queue.getJobs(true);
      secondJobs.length.should.equal(5);
      failedJob = secondJobs.find((job) => {
        const payload = JSON.parse(job.payload);
        return (payload.dummy && payload.dummy == '2 data');
      });
      failedJobData = JSON.parse(failedJob.data);
      failedJobData.failedAttempts.should.equal(2);

      // Next getConcurrentJobs() batch should should get the one remaining job of this type that can fail one more time.
      const thirdConcurrentJobs = await queue.getConcurrentJobs();
      thirdConcurrentJobs.length.should.equal(1);
      JSON.parse(thirdConcurrentJobs[0].payload).should.deepEqual({ dummy: '2 data' });

      // Process the jobs
      await queue.processJob(thirdConcurrentJobs[0]);

      // Ensure new job work didn't happen because this job failed a 3rd time.
      counter.should.equal(2);

      // Ensure other job was deleted on job completion and ensure failedAttempts incremented again on failed job.
      const thirdJobs = await queue.getJobs(true);
      thirdJobs.length.should.equal(5); // Failed job still exists, it is just marked as failure.
      failedJob = thirdJobs.find((job) => {
        const payload = JSON.parse(job.payload);
        return (payload.dummy && payload.dummy == '2 data');
      });
      failedJobData = JSON.parse(failedJob.data);
      failedJobData.failedAttempts.should.equal(3);

      // Ensure job marked as failed.
      failedJob.failed.should.be.a.Date();

      // Next getConcurrentJobs() should now finally return 'job-name' type jobs.
      const fourthConcurrentJobs = await queue.getConcurrentJobs();
      fourthConcurrentJobs.length.should.equal(3);

    });

    it('#processJob() logs errors on job failure', async () => {

      const queue = await QueueFactory();
      const jobName = 'job-name';
      const jobOptions = { priority: 0, timeout: 5000, attempts: 3};

      let counter = 0; // Incrementing this will be our job "work"

      queue.addWorker(jobName, () => {

        counter++;

        throw new Error('Example Error number: ' + counter);

      }, {});

      queue.createJob(jobName, {}, jobOptions, false);

      const jobs = await queue.getConcurrentJobs();

      await queue.processJob(jobs[0]);

      const logCheckOneJob = await queue.getJobs(true);

      logCheckOneJob[0].data.should.equal(JSON.stringify({
        attempts: 3,
        failedAttempts: 1,
        errors: ['Example Error number: 1']
      }));

      await queue.processJob(jobs[0]);

      const logCheckTwoJob = await queue.getJobs(true);

      logCheckTwoJob[0].data.should.equal(JSON.stringify({
        attempts: 3,
        failedAttempts: 2,
        errors: ['Example Error number: 1', 'Example Error number: 2']
      }));

      await queue.processJob(jobs[0]);

      const logCheckThreeJob = await queue.getJobs(true);

      logCheckThreeJob[0].data.should.equal(JSON.stringify({
        attempts: 3,
        failedAttempts: 3,
        errors: ['Example Error number: 1', 'Example Error number: 2', 'Example Error number: 3']
      }));

      const noAvailableJobCheck = await queue.getConcurrentJobs();

      noAvailableJobCheck.length.should.equal(0);

    });

    it('#processJob() handles a job timeout as expected', async () => {

      const queue = await QueueFactory();
      const jobName = 'job-name';
      const jobOptions = { priority: 0, timeout: 500, attempts: 1};

      queue.addWorker(jobName, async () => {

        await new Promise((resolve) => {
          setTimeout(() => {
            resolve(true);
          }, 2000);
        });

      });

      queue.createJob(jobName, {}, jobOptions, false);

      const jobs = await queue.getConcurrentJobs();

      const jobId = jobs[0].id;

      await queue.processJob(jobs[0]);

      const logCheckOneJob = await queue.getJobs(true);

      logCheckOneJob[0].data.should.equal(JSON.stringify({
        attempts: 1,
        failedAttempts: 1,
        errors: ['TIMEOUT: Job id: '+ jobId +' timed out in 500ms.']
      }));

      const noAvailableJobCheck = await queue.getConcurrentJobs();

      noAvailableJobCheck.length.should.equal(0);

    });

    it('#flushQueue(name) should delete all jobs in the queue of type "name".', async () => {

      const queue = await QueueFactory();
      const jobName = 'job-name';
      const jobOptions = { priority: 0, timeout: 3000, attempts: 3};

      queue.addWorker(jobName, () => {}, {
        concurrency: 3
      });
      queue.addWorker('a-different-job', () => {}, {
        concurrency: 1
      });

      // Create a couple jobs
      queue.createJob(jobName, { random: 'this is 1st random data' }, jobOptions, false);
      queue.createJob('a-different-job', { dummy: '1 data' }, { priority: 3 }, false);
      queue.createJob(jobName, { random: 'this is 2nd random data' }, { priority: 4 }, false);
      queue.createJob('a-different-job', { dummy: '2 data' }, { priority: 5 }, false);
      queue.createJob('a-different-job', { dummy: '3 data' }, { priority: 3 }, false);
      queue.createJob(jobName, { random: 'this is 3rd random data' }, jobOptions, false);
      queue.createJob(jobName, { random: 'this is 4th random data' }, jobOptions, false);

      // Check all jobs created
      const jobs = await queue.getJobs(true);
      jobs.length.should.equal(7);

      queue.flushQueue(jobName);

      // Remaining 3 jobs should be of type 'a-different-job'
      const remainingJobs = await queue.getJobs(true);
      remainingJobs.length.should.equal(3);

      const jobNameTypeExist = remainingJobs.reduce((exists, job) => {
        if (job.name == jobName) {
          exists = true;
        }
        return exists;
      }, false);

      jobNameTypeExist.should.be.False();

    });

    it('#flushQueue() should delete all jobs in the queue.', async () => {

      const queue = await QueueFactory();
      const jobName = 'job-name';
      const jobOptions = { priority: 0, timeout: 3000, attempts: 3};

      queue.addWorker(jobName, () => {}, {
        concurrency: 3
      });
      queue.addWorker('a-different-job', () => {}, {
        concurrency: 1
      });

      // Create a couple jobs
      queue.createJob(jobName, { random: 'this is 1st random data' }, jobOptions, false);
      queue.createJob('a-different-job', { dummy: '1 data' }, { priority: 3 }, false);
      queue.createJob(jobName, { random: 'this is 2nd random data' }, { priority: 4 }, false);
      queue.createJob('a-different-job', { dummy: '2 data' }, { priority: 5 }, false);
      queue.createJob('a-different-job', { dummy: '3 data' }, { priority: 3 }, false);
      queue.createJob(jobName, { random: 'this is 3rd random data' }, jobOptions, false);
      queue.createJob(jobName, { random: 'this is 4th random data' }, jobOptions, false);

      // Check all jobs created
      const jobs = await queue.getJobs(true);
      jobs.length.should.equal(7);

      queue.flushQueue();

      // All jobs should be deleted.
      const remainingJobs = await queue.getJobs(true);
      remainingJobs.length.should.equal(0);

    });

    it('#flushQueue(name) does not bother with delete query if no jobs exist already.', async () => {

      const queue = await QueueFactory();

      // Mock queue.realm.delete() so we can test that it has not been called.
      let hasDeleteBeenCalled = false;
      queue.realm.delete = () => {
        hasDeleteBeenCalled = true; // Switch flag if function gets called.
      };

      queue.flushQueue('no-jobs-exist-for-this-job-name');

      hasDeleteBeenCalled.should.be.False();

    });

    ////
    //// JOB LIFECYCLE CALLBACK TESTING
    ////

    it('onStart lifecycle callback fires before job begins processing.', async () => {

      // This test will intermittently fail in CI environments like travis-ci.
      // Intermittent failure is a result of the poor performance of CI environments
      // causing the timeouts in this test to become really flakey (setTimeout can't
      // guarantee exact time of function execution, and in a high load env execution can
      // be significantly delayed.
      if (process.env.COVERALLS_ENV == 'production') {
        return true;
      }

      const queue = await QueueFactory();
      queue.flushQueue();
      const jobName = 'job-name';
      let jobProcessed = false;
      let testFailed = false;

      queue.addWorker(jobName, async () => {

        // Timeout needed because onStart runs async so we need to ensure this function gets
        // executed last.
        await new Promise((resolve) => {
          setTimeout(() => {
            jobProcessed = true;
            resolve();
          }, 0);
        });

      }, {
        onStart: () => {

          // If onStart runs after job has processed, fail test.
          if (jobProcessed) {
            testFailed = true;
            throw new Error('ERROR: onStart fired after job began processing.');
          }

        }
      });

      // Create a job
      queue.createJob(jobName, { random: 'this is 1st random data' }, {}, false);

      jobProcessed.should.equal(false);
      testFailed.should.equal(false);
      await queue.start();
      jobProcessed.should.equal(true);
      testFailed.should.equal(false);

    });

    it('onSuccess, onComplete lifecycle callbacks fire after job begins processing.', async () => {

      // This test will intermittently fail in CI environments like travis-ci.
      // Intermittent failure is a result of the poor performance of CI environments
      // causing the timeouts in this test to become really flakey (setTimeout can't
      // guarantee exact time of function execution, and in a high load env execution can
      // be significantly delayed.
      if (process.env.COVERALLS_ENV == 'production') {
        return true;
      }

      const queue = await QueueFactory();
      queue.flushQueue();
      const jobName = 'job-name';
      let jobProcessed = false;
      let testFailed = false;
      let onSuccessFired = false;
      let onCompleteFired = false;

      queue.addWorker(jobName, async () => {

        // Simulate work
        await new Promise((resolve) => {
          setTimeout(() => {
            jobProcessed = true;
            resolve();
          }, 300);
        });

      }, {
        onSuccess: () => {

          onSuccessFired = true;

          // If onSuccess runs before job has processed, fail test.
          if (!jobProcessed) {
            testFailed = true;
            throw new Error('ERROR: onSuccess fired before job began processing.');
          }

        },
        onComplete: () => {

          onCompleteFired = true;

          // If onComplete runs before job has processed, fail test.
          if (!jobProcessed) {
            testFailed = true;
            throw new Error('ERROR: onComplete fired before job began processing.');
          }

        }
      });

      // Create a job
      queue.createJob(jobName, { random: 'this is 1st random data' }, {}, false);

      jobProcessed.should.equal(false);
      testFailed.should.equal(false);
      onSuccessFired.should.equal(false);
      onCompleteFired.should.equal(false);
      await queue.start();
      jobProcessed.should.equal(true);
      testFailed.should.equal(false);
      onSuccessFired.should.equal(true);
      onCompleteFired.should.equal(true);

    });

    it('onFailure, onFailed lifecycle callbacks fire after job begins processing.', async () => {

      // This test will intermittently fail in CI environments like travis-ci.
      // Intermittent failure is a result of the poor performance of CI environments
      // causing the timeouts in this test to become really flakey (setTimeout can't
      // guarantee exact time of function execution, and in a high load env execution can
      // be significantly delayed.
      if (process.env.COVERALLS_ENV == 'production') {
        return true;
      }

      const queue = await QueueFactory();
      queue.flushQueue();
      const jobName = 'job-name';
      let jobProcessStarted = false;
      let testFailed = false;

      queue.addWorker(jobName, async () => {

        // Simulate work
        await new Promise((resolve, reject) => {
          setTimeout(() => {
            jobProcessStarted = true;
            reject(new Error('Job failed.'));
          }, 300);
        });

      }, {
        onFailure: () => {

          // If onFailure runs before job has processed, fail test.
          if (!jobProcessStarted) {
            testFailed = true;
            throw new Error('ERROR: onFailure fired before job began processing.');
          }

        },
        onFailed: () => {

          // If onFailed runs before job has processed, fail test.
          if (!jobProcessStarted) {
            testFailed = true;
            throw new Error('ERROR: onFailed fired before job began processing.');
          }

        }
      });

      // Create a job
      queue.createJob(jobName, { random: 'this is 1st random data' }, {}, false);

      jobProcessStarted.should.equal(false);
      testFailed.should.equal(false);
      await queue.start();
      jobProcessStarted.should.equal(true);
      testFailed.should.equal(false);

    });

    it('onFailure, onFailed lifecycle callbacks work as expected.', async () => {

      // This test will intermittently fail in CI environments like travis-ci.
      // Intermittent failure is a result of the poor performance of CI environments
      // causing the timeouts in this test to become really flakey (setTimeout can't
      // guarantee exact time of function execution, and in a high load env execution can
      // be significantly delayed.
      if (process.env.COVERALLS_ENV == 'production') {
        return true;
      }

      const queue = await QueueFactory();
      queue.flushQueue();
      const jobName = 'job-name';
      let jobAttemptCounter = 0;
      let onFailureFiredCounter = 0;
      let onFailedFiredCounter = 0;

      queue.addWorker(jobName, async () => {

        // Simulate work
        await new Promise((resolve, reject) => {
          setTimeout(() => {
            jobAttemptCounter++;
            reject(new Error('Job failed.'));
          }, 0);
        });

      }, {

        onFailure: () => {

          onFailureFiredCounter++;

        },
        onFailed: () => {

          onFailedFiredCounter++;

        }
      });

      const attempts = 3;

      // Create a job
      queue.createJob(jobName, { random: 'this is 1st random data' }, {
        attempts
      }, false);

      jobAttemptCounter.should.equal(0);
      await queue.start();
      onFailureFiredCounter.should.equal(attempts);
      onFailedFiredCounter.should.equal(1);
      jobAttemptCounter.should.equal(attempts);

    });

    it('onComplete fires only once on job with multiple attempts that ends in success.', async () => {

      // This test will intermittently fail in CI environments like travis-ci.
      // Intermittent failure is a result of the poor performance of CI environments
      // causing the timeouts in this test to become really flakey (setTimeout can't
      // guarantee exact time of function execution, and in a high load env execution can
      // be significantly delayed.
      if (process.env.COVERALLS_ENV == 'production') {
        return true;
      }

      const queue = await QueueFactory();
      queue.flushQueue();
      const jobName = 'job-name';
      let jobAttemptCounter = 0;
      let onFailureFiredCounter = 0;
      let onFailedFiredCounter = 0;
      let onCompleteFiredCounter = 0;
      const attempts = 3;

      queue.addWorker(jobName, async () => {

        jobAttemptCounter++;

        // Keep failing attempts until last attempt then success.
        if (jobAttemptCounter < attempts) {

          // Simulate work that fails
          await new Promise((resolve, reject) => {
            setTimeout(() => {
              reject(new Error('Job failed.'));
            }, 0);
          });

        } else {

          // Simulate work that succeeds
          await new Promise((resolve) => {
            setTimeout(() => {
              resolve();
            }, 0);
          });

        }

      }, {

        onFailure: () => {

          onFailureFiredCounter++;

        },
        onFailed: () => {

          onFailedFiredCounter++;

        },
        onComplete: () => {

          onCompleteFiredCounter++;

        }
      });

      // Create a job
      queue.createJob(jobName, { random: 'this is 1st random data succes' }, {
        attempts
      }, false);

      jobAttemptCounter.should.equal(0);
      await queue.start();
      onFailureFiredCounter.should.equal(attempts - 1);
      onFailedFiredCounter.should.equal(0);
      jobAttemptCounter.should.equal(attempts);
      onCompleteFiredCounter.should.equal(1);

    });

    it('onComplete fires only once on job with multiple attempts that ends in failure.', async () => {

      // This test will intermittently fail in CI environments like travis-ci.
      // Intermittent failure is a result of the poor performance of CI environments
      // causing the timeouts in this test to become really flakey (setTimeout can't
      // guarantee exact time of function execution, and in a high load env execution can
      // be significantly delayed.
      if (process.env.COVERALLS_ENV == 'production') {
        return true;
      }

      const queue = await QueueFactory();
      queue.flushQueue();
      const jobName = 'job-name';
      let jobAttemptCounter = 0;
      let onFailureFiredCounter = 0;
      let onFailedFiredCounter = 0;
      let onCompleteFiredCounter = 0;
      const attempts = 3;

      queue.addWorker(jobName, async () => {

        jobAttemptCounter++;

        // Simulate work that fails
        await new Promise((resolve, reject) => {
          setTimeout(() => {
            reject(new Error('Job failed.'));
          }, 0);
        });

      }, {

        onFailure: () => {

          onFailureFiredCounter++;

        },
        onFailed: () => {

          onFailedFiredCounter++;

        },
        onComplete: () => {

          onCompleteFiredCounter++;

        }
      });

      // Create a job
      queue.createJob(jobName, { random: 'this is 1st random data' }, {
        attempts
      }, false);

      jobAttemptCounter.should.equal(0);
      await queue.start();
      onFailureFiredCounter.should.equal(attempts);
      onFailedFiredCounter.should.equal(1);
      jobAttemptCounter.should.equal(attempts);
      onCompleteFiredCounter.should.equal(1);

    });

    it('onStart, onSuccess, onComplete Job lifecycle callbacks do not block job processing.', async () => {

      // This test will intermittently fail in CI environments like travis-ci.
      // Intermittent failure is a result of the poor performance of CI environments
      // causing the timeouts in this test to become really flakey (setTimeout can't
      // guarantee exact time of function execution, and in a high load env execution can
      // be significantly delayed.
      if (process.env.COVERALLS_ENV == 'production') {
        return true;
      }

      const queue = await QueueFactory();
      queue.flushQueue();
      const jobName = 'job-name';
      let workTracker = [];
      let tracker = [];

      queue.addWorker(jobName, async (id, payload) => {

        // Simulate work
        await new Promise((resolve) => {
          workTracker.push(payload.random);
          tracker.push('job processed');
          setTimeout(resolve, 0);
        });

      }, {

        onStart: async () => {

          // wait a bit
          await new Promise((resolve) => {
            setTimeout(() => {
              tracker.push('onStart completed.');
              resolve();
            }, 1000);
          });

        },
        onSuccess: async () => {

          // wait a bit
          await new Promise((resolve) => {
            setTimeout(() => {
              tracker.push('onSuccess completed.');
              resolve();
            }, 1000);
          });

        },
        onComplete: async () => {

          // wait a bit
          await new Promise((resolve) => {
            setTimeout(() => {
              tracker.push('onComplete completed.');
              resolve();
            }, 1000);
          });

        }
      });

      // Create a job
      queue.createJob(jobName, { random: 'this is 1st random data' }, {}, false);
      queue.createJob(jobName, { random: 'this is 2nd random data' }, {}, false);
      queue.createJob(jobName, { random: 'this is 3rd random data' }, {}, false);
      queue.createJob(jobName, { random: 'this is 4th random data' }, {}, false);
      queue.createJob(jobName, { random: 'this is 5th random data' }, {}, false);

      await queue.start();

      // Ensure all jobs processed.
      workTracker.should.containDeep([
        'this is 1st random data',
        'this is 2nd random data',
        'this is 4th random data',
        'this is 3rd random data',
        'this is 5th random data'
      ]);

      // Since lifecycle callbacks take a second to process,
      // queue should churn through all jobs well before any of the lifecycle
      // callbacks complete.
      const firstFive = tracker.slice(0, 5);
      firstFive.should.deepEqual([
        'job processed',
        'job processed',
        'job processed',
        'job processed',
        'job processed'
      ]);

    });

    it('onFailure, onFailed Job lifecycle callbacks do not block job processing.', async () => {

      // This test will intermittently fail in CI environments like travis-ci.
      // Intermittent failure is a result of the poor performance of CI environments
      // causing the timeouts in this test to become really flakey (setTimeout can't
      // guarantee exact time of function execution, and in a high load env execution can
      // be significantly delayed.
      if (process.env.COVERALLS_ENV == 'production') {
        return true;
      }

      const queue = await QueueFactory();
      queue.flushQueue();
      const jobName = 'job-name';
      let workTracker = [];
      let tracker = [];

      queue.addWorker(jobName, async (id, payload) => {

        // Simulate failure
        await new Promise((resolve, reject) => {
          workTracker.push(payload.random);
          setTimeout(() => {
            tracker.push('job attempted');
            reject(new Error('job failed'));
          }, 0);
        });

      }, {
        onFailure: async () => {

          // wait a bit
          await new Promise((resolve) => {
            setTimeout(() => {
              tracker.push('onFailure completed.');
              resolve();
            }, 1000);
          });

        },
        onFailed: async () => {

          // wait a bit
          await new Promise((resolve) => {
            setTimeout(() => {
              tracker.push('onFailed completed.');
              resolve();
            }, 1000);
          });

        }
      });

      // Create a job
      queue.createJob(jobName, { random: 'this is 1st random data' }, {}, false);
      queue.createJob(jobName, { random: 'this is 2nd random data' }, {}, false);
      queue.createJob(jobName, { random: 'this is 3rd random data' }, {}, false);
      queue.createJob(jobName, { random: 'this is 4th random data' }, {}, false);
      queue.createJob(jobName, { random: 'this is 5th random data' }, {}, false);

      await queue.start();

      // Ensure all jobs started to process (even though they are failed).
      workTracker.should.containDeep([
        'this is 1st random data',
        'this is 2nd random data',
        'this is 4th random data',
        'this is 3rd random data',
        'this is 5th random data'
      ]);

      // Since lifecycle callbacks take a second to process,
      // queue should churn through all jobs well before any of the lifecycle
      // callbacks complete.
      const firstFive = tracker.slice(0, 5);
      firstFive.should.deepEqual([
        'job attempted',
        'job attempted',
        'job attempted',
        'job attempted',
        'job attempted'
      ]);

    });

  /**
   *
   * Regression test for issue 15: Indefinite job Timeout is broken
   *
   * https://github.com/billmalarky/react-native-queue/issues/15
   *
   */
  it('does not override an explicitly set job timeout value of 0 with the default value of 25000.', async () => {

    const queue = await QueueFactory();
    queue.flushQueue();
    const jobName = 'job-name';

    // Attach the worker.
    queue.addWorker(jobName, async () => {});

    // Create a job
    queue.createJob(jobName, { random: 'this is 1st random data' }, {
      timeout: 0
    }, false);

    // Check that the created job has a timeout value of 0 instead of 25000.
    const jobs = await queue.getJobs(true);
    const job = jobs[0];
    job.timeout.should.equal(0);

    // Flush jobs
    queue.flushQueue();
  });

  it('should respect lifespan rules even with delayed jobs', async () => {
    const queue = await QueueFactory();
    queue.flushQueue();
    const jobName = 'this-job-name';

    function * succeedGeneratorFn() {
      yield false;
      yield false;
      yield true;
    }
    const succeedGenerator = succeedGeneratorFn();

    // Attach the worker.
    queue.addWorker(jobName, async (id,payload) => {
      if(!succeedGenerator.next().value) throw new Error('fail');
    }, false);

    queue.createJob(jobName,{foo:'bar'},{
      retryDelay: 500,
      attempts: 3,
      timeout: 200,
    },false);

    await queue.start(1250);
    await wait(1250);

    const jobs = await queue.getJobs(true);
    const job = jobs[0];
    const jobData = JSON.parse(job.data);
    should.not.exist(job.failed);
    jobData.failedAttempts.should.equal(2);

    await wait(500);
    await queue.start(1000);
    await wait(1500);

    const doneJobs = await queue.getJobs(true);
    doneJobs.length.should.equal(0);

    queue.flushQueue();
  });

  // Edge case
  it('should still trigger new jobs if lifespan = 0', async () => {
    const queue = await QueueFactory();
    queue.flushQueue();
    const jobName = 'job-name';
    let callCount = 0;
    // Attach the worker.
    queue.addWorker(jobName, async (id,payload) => {
      callCount = callCount + 1;
    }, false);

    queue.createJob(jobName,{foo:'bar'},{
      retryDelay: 500,
      attempts: 3,
      timeout: 200,
    },false);

    await queue.start(0);
    await wait(500);
    expect(callCount).toBe(1);

    queue.createJob(jobName,{foo:'bar'},{
      retryDelay: 500,
      attempts: 3,
      timeout: 200,
    });
    await wait(500);
    expect(callCount).toBe(2);

    queue.flushQueue();
  });

  // Edge case
  it('should still trigger new jobs if lifespan > 0', async () => {
    const queue = await QueueFactory();
    queue.flushQueue();
    const jobName = 'job-name';
    let callCount = 0;
    // Attach the worker.
    queue.addWorker(jobName, async (id,payload) => {
      callCount = callCount + 1;
    }, false);

    queue.createJob(jobName,{foo:'bar'},{
      retryDelay: 500,
      attempts: 3,
      timeout: 200,
    },false);

    await queue.start(1000);
    await wait(500);
    expect(callCount).toBe(1);

    queue.createJob(jobName,{foo:'bar'},{
      retryDelay: 500,
      attempts: 3,
      timeout: 200,
    });
    await wait(500);
    expect(callCount).toBe(2);

    queue.flushQueue();
  });

  it('should be able to define the number of jobs triggered per queue start with lifespan > 0', async () => {
    const queue = await QueueFactory();
    queue.flushQueue();
    const jobName = 'job-name';
    let callCount = 0;
    // Attach the worker.
    queue.addWorker(jobName, async (id,payload) => {
      callCount = callCount + 1;
    }, false);

    queue.createJob(jobName,{foo:'bar'},{
      retryDelay: 500,
      attempts: 3,
      timeout: 200,
    },false);

    queue.createJob(jobName,{foo:'goo'},{
      retryDelay: 500,
      attempts: 3,
      timeout: 200,
    }, false);

    queue.createJob(jobName,{foo:'bar'},{
      retryDelay: 500,
      attempts: 3,
      timeout: 200,
    },false);

    queue.createJob(jobName,{foo:'goo'},{
      retryDelay: 500,
      attempts: 3,
      timeout: 200,
    }, false);

    await queue.start(1000,1);
    await wait(600);
    expect(callCount).toBe(1);
    await wait(600);
    expect(callCount).toBe(1);

    await queue.start(1000,1);
    await wait(600);
    expect(callCount).toBe(2);
    await wait(600);
    expect(callCount).toBe(2);

    await queue.start(1000,2);
    await wait(600);
    expect(callCount).toBe(4);
    await wait(600);
    expect(callCount).toBe(4);

    await queue.start(1000,0);
    await wait(1100);
    expect(callCount).toBe(4);

    queue.flushQueue();
  });
});
