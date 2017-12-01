/**
 * Created by mayor on 11/16/17.
 */


export default class Worker {

  static workers = {};

  addWorker(jobName, worker, options = {}) {

    // Attach options to worker
    worker.options = {
      concurrency: options.concurrency || 1
    };

    Worker.workers[jobName] = worker;
  }

  removeWorker(jobName) {
    delete Worker.workers[jobName];
  }

  getConcurrency(jobName) {

    // If no worker assigned to job name, throw error.
    if (!Worker.workers[jobName]) {
      throw new Error('Job ' + jobName + ' does not have a worker assigned to it.');
    }

    return Worker.workers[jobName].options.concurrency;

  }

  async executeJob(job) {

    // If no worker assigned to job name, throw error.
    if (!Worker.workers[job.name]) {
      throw new Error('Job ' + job.name + ' does not have a worker assigned to it.');
    }

    // Timeout Logic
    const jobTimeout = JSON.parse(job.data).timeout;

    if (jobTimeout > 0) {

      let timeoutPromise = new Promise((resolve, reject) => {

        setTimeout(() => {
          reject(new Error('TIMEOUT: Job id: ' + job.id + ' timed out in ' + jobTimeout  + 'ms.'));
        }, jobTimeout);

      });

      await Promise.race([timeoutPromise, Worker.workers[job.name](job.id, JSON.parse(job.payload))]);

    } else {
      await Worker.workers[job.name](job.id, JSON.parse(job.payload));
    }

  }

};