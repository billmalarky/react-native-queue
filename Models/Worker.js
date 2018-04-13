/**
 *
 * Worker Model
 *
 */

export default class Worker {

  /**
   *
   * Singleton map of all worker functions assigned to queue.
   *
   */
  static workers = {};

  /**
   *
   * Assign a worker function to the queue.
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

    // Validate input.
    if (!jobName || !worker) {
      throw new Error('Job name and associated worker function must be supplied.');
    }

    // Attach options to worker
    worker.options = {
      concurrency: options.concurrency || 1,
      onStart: options.onStart || null,
      onSuccess: options.onSuccess || null,
      onFailure: options.onFailure || null,
      onFailed: options.onFailed || null,
      onComplete: options.onComplete || null
    };

    Worker.workers[jobName] = worker;
  }

  /**
   *
   * Un-assign worker function from queue.
   *
   * @param jobName {string} - Name associated with jobs assigned to this worker.
   */
  removeWorker(jobName) {
    delete Worker.workers[jobName];
  }

  /**
   *
   * Get the concurrency setting for a worker.
   *
   * Worker concurrency defaults to 1.
   *
   * @param jobName {string} - Name associated with jobs assigned to this worker.
   * @throws Throws error if no worker is currently assigned to passed in job name.
   * @return {number}
   */
  getConcurrency(jobName) {

    // If no worker assigned to job name, throw error.
    if (!Worker.workers[jobName]) {
      throw new Error('Job ' + jobName + ' does not have a worker assigned to it.');
    }

    return Worker.workers[jobName].options.concurrency;

  }

  /**
   *
   * Execute the worker function assigned to the passed in job name.
   *
   * If job has a timeout setting, job will fail with a timeout exception upon reaching timeout.
   *
   * @throws Throws error if no worker is currently assigned to passed in job name.
   * @param job {object} - Job realm model object
   */
  async executeJob(job) {

    // If no worker assigned to job name, throw error.
    if (!Worker.workers[job.name]) {
      throw new Error('Job ' + job.name + ' does not have a worker assigned to it.');
    }

    // Data must be cloned off the realm job object for the timeout logic promise race.
    // More info: https://github.com/billmalarky/react-native-queue/issues/2#issuecomment-361418965
    const jobId = job.id;
    const jobName = job.name;
    const jobTimeout = job.timeout;
    const jobPayload = JSON.parse(job.payload);

    if (jobTimeout > 0) {

      let timeoutPromise = new Promise((resolve, reject) => {

        setTimeout(() => {
          reject(new Error('TIMEOUT: Job id: ' + jobId + ' timed out in ' + jobTimeout  + 'ms.'));
        }, jobTimeout);

      });

      await Promise.race([timeoutPromise, Worker.workers[jobName](jobId, jobPayload)]);

    } else {
      await Worker.workers[jobName](jobId, jobPayload);
    }

  }

  /**
   *
   * Execute an asynchronous job lifecycle callback associated with related worker.
   *
   * @param callbackName {string} - Job lifecycle callback name.
   * @param jobName {string} - Name associated with jobs assigned to related worker.
   * @param jobId {string} - Unique id associated with job.
   * @param jobPayload {object} - Data payload associated with job.
   */
  async executeJobLifecycleCallback(callbackName, jobName, jobId, jobPayload) {

    // Validate callback name
    const validCallbacks = ['onStart', 'onSuccess', 'onFailure', 'onFailed', 'onComplete'];
    if (!validCallbacks.includes(callbackName)) {
      throw new Error('Invalid job lifecycle callback name.');
    }

    // Fire job lifecycle callback if set.
    // Uses a try catch statement to gracefully degrade errors in production.
    if (Worker.workers[jobName].options[callbackName]) {

      try {
        await Worker.workers[jobName].options[callbackName](jobId, jobPayload);
      } catch (error) {
        console.error(error); // eslint-disable-line no-console
      }

    }

  }

}