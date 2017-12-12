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

    // Attach options to worker
    worker.options = {
      concurrency: options.concurrency || 1
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

    // Timeout Logic
    if (job.timeout > 0) {

      let timeoutPromise = new Promise((resolve, reject) => {

        setTimeout(() => {
          reject(new Error('TIMEOUT: Job id: ' + job.id + ' timed out in ' + job.timeout  + 'ms.'));
        }, job.timeout);

      });

      await Promise.race([timeoutPromise, Worker.workers[job.name](job.id, JSON.parse(job.payload))]);

    } else {
      await Worker.workers[job.name](job.id, JSON.parse(job.payload));
    }

  }

}