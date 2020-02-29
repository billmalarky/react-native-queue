/**
 *
 * Queue Model
 *
 * Queue Job Realm Schema defined in ../config/Database
 *
 */

import Database from '../config/Database';
import uuid from 'react-native-uuid';
import Worker from './Worker';
import promiseReflect from 'promise-reflect';


export class Queue {

  /**
   *
   * Set initial class properties.
   *
   * @constructor
   */
  constructor() {
    this.realm = null;
    this.worker = new Worker();
    this.status = 'inactive';
  }

  /**
   *
   * Initializes the queue by connecting to Realm database.
   *
   */
  async init() {
    if (this.realm === null) {
      this.realm = await Database.getRealmInstance();
    }
  }

  /**
   *
   * Add a worker function to the queue.
   *
   * Worker will be called to execute jobs associated with jobName.
   *
   * Worker function will receive job id and job payload as parameters.
   *
   * Example:
   *
   * function exampleJobWorker(id, payload) {
   *  console.log(id); // UUID of job.
   *  console.log(payload); // Payload of data related to job.
   * }
   *
   * @param jobName {string} - Name associated with jobs assigned to this worker.
   * @param worker {function} - The worker function that will execute jobs.
   * @param options {object} - Worker options. See README.md for worker options info.
   */
  addWorker(jobName, worker, options = {}) {
    this.worker.addWorker(jobName, worker, options);
  }

  /**
   *
   * Delete worker function from queue.
   *
   * @param jobName {string} - Name associated with jobs assigned to this worker.
   */
  removeWorker(jobName) {
    this.worker.removeWorker(jobName);
  }

  /**
   *
   * Creates a new job and adds it to queue.
   *
   * Queue will automatically start processing unless startQueue param is set to false.
   *
   * @param name {string} - Name associated with job. The worker function assigned to this name will be used to execute this job.
   * @param payload {object} - Object of arbitrary data to be passed into worker function when job executes.
   * @param options {object} - Job related options like timeout etc. See README.md for job options info.
   * @param startQueue - {boolean} - Whether or not to immediately begin prcessing queue. If false queue.start() must be manually called.
   */
  createJob(name, payload = {}, options = {}, startQueue = true) {

    if (!name) {
      throw new Error('Job name must be supplied.');
    }

    // Validate options
    if (options.timeout < 0 || options.attempts < 0) {
      throw new Error('Invalid job option.');
    }

    this.realm.write(() => {

      this.realm.create('Job', {
        id: uuid.v4(),
        name,
        payload: JSON.stringify(payload),
        data: JSON.stringify({
          attempts: options.attempts || 1
        }),
        priority: Number.isInteger(options.priority) ? options.priority : 0,
        active: false,
        timeout: (options.timeout >= 0) ? options.timeout : 25000,
        created: new Date(),
        failed: null,
        nextValidTime: new Date(),
        retryDelay: Number.isInteger(options.retryDelay) ? options.retryDelay : 0,
      });

    });

    // Start queue on job creation if it isn't running by default.
    if (startQueue && this.status == 'inactive') {
      this.start();
    }

  }

  calculateRemainingLifespan () {
    const lifespanRemaining = this.lifespan - (Date.now() - this.startTime);
    return (lifespanRemaining === 0) ? -1 : lifespanRemaining; // Handle exactly zero lifespan remaining edge case.
  }

  async calculateJobs (jobsLimit) {
    if (this.lifespan !== 0) {
      return this.getConcurrentJobs(jobsLimit,this.calculateRemainingLifespan());
    } else {
      return this.getConcurrentJobs(jobsLimit);
    }

  }

  /**
   *
   * Start processing the queue.
   *
   * If queue was not started automatically during queue.createJob(), this
   * method should be used to manually start the queue.
   *
   * If queue.start() is called again when queue is already running,
   * queue.start() will return early with a false boolean value instead
   * of running multiple queue processing loops concurrently.
   *
   * Lifespan can be passed to start() in order to run the queue for a specific amount of time before stopping.
   * This is useful, as an example, for OS background tasks which typically are time limited.
   *
   * NOTE: If lifespan is set, only jobs with a timeout property at least 500ms less than remaining lifespan will be processed
   * during queue processing lifespan. This is to buffer for the small amount of time required to query Realm for suitable
   * jobs, and to mark such jobs as complete or failed when job finishes processing.
   *
   * IMPORTANT: Jobs with timeout set to 0 that run indefinitely will not be processed if the queue is running with a lifespan.
   *
   * @param lifespan {number} - If lifespan is passed, the queue will start up and run for lifespan ms, then queue will be stopped.
   * @return {boolean|undefined} - False if queue is already started. Otherwise nothing is returned when queue finishes processing.
   */
  async start(lifespan = 0, numberOfJobsToProcess) {
    this.lifespan = lifespan;
    let jobsProcessed = 0;

    // If queue is already running, don't fire up concurrent loop.
    if (this.status == 'active') {
      return false;
    }

    this.status = 'active';

    // Get jobs to process
    if(!this.startTime || this.calculateRemainingLifespan() < 0)
      this.startTime = Date.now();

    let concurrentJobs;
    concurrentJobs = await this.calculateJobs(numberOfJobsToProcess-jobsProcessed);

    while (this.status == 'active' && concurrentJobs.length) {

      // Loop over jobs and process them concurrently.
      const processingJobs = concurrentJobs.map( job => {
        return this.processJob(job);
      });
      jobsProcessed += concurrentJobs.length;

      // Promise Reflect ensures all processingJobs resolve so
      // we don't break await early if one of the jobs fails.
      await Promise.all(processingJobs.map(promiseReflect));

      // Get next batch of jobs.
      concurrentJobs = await this.calculateJobs(numberOfJobsToProcess - jobsProcessed);
    }

    this.status = 'inactive';
    if(this.calculateRemainingLifespan() < 500){
      delete this.startTime;
      delete this.lifespan;
    }
  }

  /**
   *
   * Stop processing queue.
   *
   * If queue.stop() is called, queue will stop processing until
   * queue is restarted by either queue.createJob() or queue.start().
   *
   */
  stop() {
    this.status = 'inactive';
    delete this.startTime;
    delete this.lifespan;
  }

  /**
   *
   * Get a collection of all the jobs in the queue.
   *
   * @param sync {boolean} - This should be true if you want to guarantee job data is fresh. Otherwise you could receive job data that is not up to date if a write transaction is occuring concurrently.
   * @return {promise} - Promise that resolves to a collection of all the jobs in the queue.
   */
  async getJobs(sync = false) {

    if (sync) {

      let jobs = null;
      this.realm.write(() => {

        jobs = this.realm.objects('Job');

      });

      return jobs;

    } else {
      return await this.realm.objects('Job');
    }

  }

  /**
   *
   * Get the next job(s) that should be processed by the queue.
   *
   * If the next job to be processed by the queue is associated with a
   * worker function that has concurrency X > 1, then X related (jobs with same name)
   * jobs will be returned.
   *
   * If queue is running with a lifespan, only jobs with timeouts at least 500ms < than REMAINING lifespan
   * AND a set timeout (ie timeout > 0) will be returned. See Queue.start() for more info.
   *
   * @param queueLifespanRemaining {number} - The remaining lifespan of the current queue process (defaults to indefinite).
   * @return {promise} - Promise resolves to an array of job(s) to be processed next by the queue.
   */
  async getConcurrentJobs(jobsLimit = -1, queueLifespanRemaining = 0) {

    let concurrentJobs = [];

    this.realm.write(() => {

      // Get next job from queue.
      let nextJob = null;
      const now = new Date();

      // Build query string
      // If queueLife
      const timeoutUpperBound = (queueLifespanRemaining - 500 > 0) ? queueLifespanRemaining - 499 : 0; // Only get jobs with timeout at least 500ms < queueLifespanRemaining.

      const initialQuery = (queueLifespanRemaining)
        ? 'active == FALSE AND failed == null AND timeout > 0 AND timeout < ' + timeoutUpperBound + ' AND nextValidTime <= $0'
        : 'active == FALSE AND failed == null AND nextValidTime <= $0';

      const limitQuery = jobsLimit > -1 ? ` LIMIT(${jobsLimit})` : '';

      let jobs = this.realm.objects('Job')
        .filtered(initialQuery + limitQuery, now)
        .sorted([['priority', true], ['created', false]]);

      if (jobs.length) {
        nextJob = jobs[0];
      }

      // If next job exists, get concurrent related jobs appropriately.
      if (nextJob) {

        const concurrency = this.worker.getConcurrency(nextJob.name);

        const allRelatedJobsQuery = (queueLifespanRemaining)
          ? 'name == "'+ nextJob.name +'" AND active == FALSE AND failed == null AND timeout > 0 AND timeout < ' + timeoutUpperBound + ' AND nextValidTime <= $0'
          : 'name == "'+ nextJob.name +'" AND active == FALSE AND failed == null AND nextValidTime <= $0';

        const allRelatedJobs = this.realm.objects('Job')
          .filtered(allRelatedJobsQuery + limitQuery, now)
          .sorted([['priority', true], ['created', false]]);

        let jobsToMarkActive = allRelatedJobs.slice(0, concurrency);

        // Grab concurrent job ids to reselect jobs as marking these jobs as active will remove
        // them from initial selection when write transaction exits.
        // See: https://stackoverflow.com/questions/47359368/does-realm-support-select-for-update-style-read-locking/47363356#comment81772710_47363356
        const concurrentJobIds = jobsToMarkActive.map( job => job.id);

        // Mark concurrent jobs as active
        jobsToMarkActive = jobsToMarkActive.map( job => {
          job.active = true;
        });

        // Reselect now-active concurrent jobs by id.
        const reselectQuery = concurrentJobIds.map( jobId => 'id == "' + jobId + '"').join(' OR ');
        const reselectedJobs = this.realm.objects('Job')
          .filtered(reselectQuery + limitQuery)
          .sorted([['priority', true], ['created', false]]);

        concurrentJobs = reselectedJobs.slice(0, concurrency);

      }

    });

    return concurrentJobs;

  }

  /**
   *
   * Process a job.
   *
   * Job lifecycle callbacks are called as appropriate throughout the job processing lifecycle.
   *
   * Job is deleted upon successful completion.
   *
   * If job fails execution via timeout or other exception, error will be
   * logged to job.data.errors array and job will be reset to inactive status.
   * Job will be re-attempted up to the specified "attempts" setting (defaults to 1),
   * after which it will be marked as failed and not re-attempted further.
   *
   * @param job {object} - Job realm model object
   */
  async processJob(job) {

    // Data must be cloned off the realm job object for several lifecycle callbacks to work correctly.
    // This is because realm job is deleted before some callbacks are called if job processed successfully.
    // More info: https://github.com/billmalarky/react-native-queue/issues/2#issuecomment-361418965
    const jobName = job.name;
    const jobId = job.id;
    const jobPayload = JSON.parse(job.payload);

    // Fire onStart job lifecycle callback
    this.worker.executeJobLifecycleCallback('onStart', jobName, jobId, jobPayload);

    try {

      await this.worker.executeJob(job);

      // On successful job completion, remove job
      this.realm.write(() => {

        this.realm.delete(job);

      });

      // Job has processed successfully, fire onSuccess and onComplete job lifecycle callbacks.
      this.worker.executeJobLifecycleCallback('onSuccess', jobName, jobId, jobPayload);
      this.worker.executeJobLifecycleCallback('onComplete', jobName, jobId, jobPayload);

    } catch (error) {

      // Handle job failure logic, including retries.
      let jobData = JSON.parse(job.data);

      this.realm.write(() => {

        // Increment failed attempts number
        if (!jobData.failedAttempts) {
          jobData.failedAttempts = 1;
        } else {
          jobData.failedAttempts++;
        }

        // Log error
        if (!jobData.errors) {
          jobData.errors = [ error.message ];
        } else {
          jobData.errors.push(error.message);
        }

        job.data = JSON.stringify(jobData);

        // Reset active status
        job.active = false;

        // Mark job as failed if too many attempts
        if (jobData.failedAttempts >= jobData.attempts) {
          job.failed = new Date();
        }

        job.nextValidTime = new Date(new Date().getTime() + job.retryDelay);
      });

      if(job.retryDelay && job.retryDelay > 0) setTimeout(() => {
        this.start(this.lifespan ? this.lifespan : 0);
      },job.retryDelay);

      // Execute job onFailure lifecycle callback.
      this.worker.executeJobLifecycleCallback('onFailure', jobName, jobId, jobPayload);

      // If job has failed all attempts execute job onFailed and onComplete lifecycle callbacks.
      if (jobData.failedAttempts >= jobData.attempts) {
        this.worker.executeJobLifecycleCallback('onFailed', jobName, jobId, jobPayload);
        this.worker.executeJobLifecycleCallback('onComplete', jobName, jobId, jobPayload);
      }

    }

  }

  /**
   *
   * Delete jobs in the queue.
   *
   * If jobName is supplied, only jobs associated with that name
   * will be deleted. Otherwise all jobs in queue will be deleted.
   *
   * @param jobName {string} - Name associated with job (and related job worker).
   */
  flushQueue(jobName = null) {

    if (jobName) {

      this.realm.write(() => {

        let jobs = this.realm.objects('Job')
          .filtered('name == "' + jobName + '"');

        if (jobs.length) {
          this.realm.delete(jobs);
        }

      });

    } else {
      this.realm.write(() => {

        this.realm.deleteAll();

      });
    }

  }

  /**
   * Delete a job in the queue with jobId
   * @param jobId {string} - id associated with job
   */
  flushJob(jobId) {
    try {
      if(jobId) {
        this.realm.write(() => {
          let jobs = this.realm
            .objects('Job')
            .filtered(`id == "${jobId}"`);
          if(jobs.length) {
            this.realm.delete(jobs);
            return;
          }
        });
      }
    } catch (e) {
      console.log('flushJob failed', jobId);
    }
  }

  async close() {
    await this.stop();
    await this.realm.close();
  }

}

/**
 *
 * Factory should be used to create a new queue instance.
 *
 * @return {Queue} - A queue instance.
 */
export default async function queueFactory() {

  const queue = new Queue();
  await queue.init();

  return queue;

}
