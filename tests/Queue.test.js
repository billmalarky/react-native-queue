
// Define globals for eslint.
/* global describe it require */

// Load dependencies
import should from 'should'; // eslint-disable-line no-unused-vars
import QueueFactory, { Queue } from '../Models/Queue';
import Worker from '../Models/Worker';

describe('Models/Queue', function() {

  beforeEach(async () => {

    // Make sure each test starts with a fresh database.
    const queue = await QueueFactory();
    queue.flushQueue();

  });

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

  it('#addWorker() and removeWorker() should pass calls through to Worker class', async () => {

    const queue = await QueueFactory();
    const workerOptions = { concurrency: 4 };

    queue.addWorker('job-name', () => {}, workerOptions);

    // first worker is added with default options.
    Worker.workers['job-name'].should.be.a.Function();
    Worker.workers['job-name'].options.should.deepEqual(workerOptions);

    queue.removeWorker('job-name');

    // Worker has been removed.
    should.not.exist(Worker.workers['job-name']);

  });

  it('#createJob() requires job name at minimum', async () => {

    const queue = await QueueFactory();

    try {
      await queue.createJob();
      throw new Error('Job with no name should have thrown error.')
    } catch (error) {
      error.should.deepEqual(new Error('Job name must be supplied.'));
    }

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
      data: JSON.stringify({timeout: jobOptions.timeout, attempts: jobOptions.attempts}),
      priority: jobOptions.priority,
      active: false
    });

  });

  it('#createJob() should default to starting queue. stop() should stop queue.', async () => {

    const queue = await QueueFactory();
    const jobName = 'job-name';
    const payload = { data: 'example-data' };
    const jobOptions = { priority: 4, timeout: 3000, attempts: 3};

    queue.addWorker(jobName, () => {});

    queue.createJob(jobName, payload, jobOptions, false);
    queue.status.should.equal('inactive');

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

    // startQueue is false so queue should have started.
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

  });

  it('#getConcurrentJobs() If worker concurrency is set to 3, getConcurrentJobs() should get up to 3 of same type of job as next job on top of queue.', async () => {

    const queue = await QueueFactory();
    const jobName = 'job-name';
    const payload = { data: 'example-data' };
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
    const payload = { data: 'example-data' };
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
    const payload = { data: 'example-data' };
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
    const payload = { data: 'example-data' };
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
      return (payload.dummy && payload.dummy == '2 data')
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
      return (payload.dummy && payload.dummy == '2 data')
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
      return (payload.dummy && payload.dummy == '2 data')
    });
    failedJobData = JSON.parse(failedJob.data);
    failedJobData.failedAttempts.should.equal(3);

    // Ensure job marked as failed.
    failedJob.failed.should.be.a.Date();

    // Next getConcurrentJobs() should now finally return 'job-name' type jobs.
    const fourthConcurrentJobs = await queue.getConcurrentJobs();
    fourthConcurrentJobs.length.should.equal(3);

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

});