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

    this.realm.write(() => {

      this.realm.create('Job', {
        id: uuid.v4(),
        name,
        payload: JSON.stringify(payload),
        data: JSON.stringify({
          timeout: (options.timeout > 0) ? options.timeout : 0,
          attempts: options.attempts || 1
        }),
        priority: options.priority || 0,
        active: false,
        created: new Date(),
        failed: null
      });

    });

    // Start queue on job creation if it isn't running by default.
    if (startQueue && this.status == 'inactive') {
      this.start();
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
   * @return {boolean|undefined} - False if queue is already started. Otherwise nothing is returned when queue finishes processing.
   */
  async start() {

    // If queue is already running, don't fire up concurrent loop.
    if (this.status == 'active') {
      return false;
    }

    this.status = 'active';

    let concurrentJobs = await this.getConcurrentJobs();

    while (this.status == 'active' && concurrentJobs.length) {

      // Loop over jobs and process them concurrently.
      const processingJobs = concurrentJobs.map( job => {
        return this.processJob(job);
      });

      // Promise Reflect ensures all processingJobs resolve so
      // we don't break await early if one of the jobs fails.
      await Promise.all(processingJobs.map(promiseReflect));

      // Get next batch of jobs.
      concurrentJobs = await this.getConcurrentJobs();

    }

    this.status = 'inactive';

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
   * @return {promise} - Promise resolves to an array of job(s) to be processed next by the queue.
   */
  async getConcurrentJobs() {

    let concurrentJobs = [];

    this.realm.write(() => {

      // Get next job from queue.
      let nextJob = null;

      let jobs = this.realm.objects('Job')
        .filtered('active == FALSE AND failed == null')
        .sorted([['priority', true], ['created', false]]);

      if (jobs.length) {
        nextJob = jobs[0];
      }

      // If next job exists, get concurrent related jobs appropriately.
      if (nextJob) {

        const concurrency = this.worker.getConcurrency(nextJob.name);

        const allRelatedJobs = this.realm.objects('Job')
          .filtered('name == "'+ nextJob.name +'" AND active == FALSE AND failed == null')
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
        const query = concurrentJobIds.map( jobId => 'id == "' + jobId + '"').join(' OR ');
        const reselectedJobs = this.realm.objects('Job')
          .filtered(query)
          .sorted([['priority', true], ['created', false]]);

        concurrentJobs = reselectedJobs.slice(0, concurrency);

      }

    });

    return concurrentJobs;

  }

  /**
   *
   * Execute a job.
   *
   * Job is deleted upon successful completion.
   *
   * If job fails execution via timeout or other exception, job will be
   * re-attempted up to the specified "attempts" setting (defaults to 1),
   * after which it will be marked as failed and not re-attempted further.
   *
   * @param job {object} - Job realm model object
   */
  async processJob(job) {

    try {

      await this.worker.executeJob(job);

      // On job completion, remove job
      this.realm.write(() => {

        this.realm.delete(job);

      });

    } catch (error) {

      // Handle job failure logic, including retries.
      this.realm.write(() => {

        // Increment failed attempts number
        let jobData = JSON.parse(job.data);

        if (!jobData.failedAttempts) {
          jobData.failedAttempts = 1;
        } else {
          jobData.failedAttempts++;
        }

        job.data = JSON.stringify(jobData);

        // Reset active status
        job.active = false;

        // Mark job as failed if too many attempts
        if (jobData.failedAttempts >= jobData.attempts) {
          job.failed = new Date();
        }

      });

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
