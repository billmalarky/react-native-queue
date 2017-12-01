/**
 *
 * Queue Model
 *
 * Job Realm Schema defined in ../config/Database
 *
 */

import Database from '../config/Database';
import uuid from 'react-native-uuid';
import Worker from './Worker';
import promiseReflect from 'promise-reflect';


export class Queue {

  constructor() {
    this.realm = null;
    this.worker = new Worker();
    this.status = 'inactive';
  }

  async init() {
    if (this.realm === null) {
      this.realm = await Database.getRealmInstance();
    }
  }

  addWorker(jobName, worker, options = {}) {
    this.worker.addWorker(jobName, worker, options);
  }

  removeWorker(jobName) {
    this.worker.removeWorker(jobName);
  }

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

  async start() {

    // If queue is already running, don't fire up concurrent loop.
    if (this.status == 'active') {
      return;
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

  stop() {
    this.status = 'inactive';
  }

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

export default async function queueFactory() {

  const queue = new Queue();
  await queue.init();

  return queue;

}
