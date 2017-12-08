# React Native Queue
#### Simple. Powerful. Persistent.

[![Build Status](https://travis-ci.org/billmalarky/react-native-queue.svg?branch=master)](https://travis-ci.org/billmalarky/react-native-queue)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/billmalarky/react-native-queue/blob/master/LICENSE)
[![ESLint](https://img.shields.io/badge/eslint-ok-green.svg)](https://github.com/billmalarky/react-native-queue/blob/master/.eslintrc.js)
[![JSDoc](https://img.shields.io/badge/jsdoc-100%25%20code%20documentation-green.svg)](http://usejsdoc.org/)
[![Coverage Status](https://coveralls.io/repos/github/billmalarky/react-native-queue/badge.svg?branch=master)](https://coveralls.io/github/billmalarky/react-native-queue?branch=master)

A React Native job queue / task queue backed by persistent Realm storage. Jobs will persist until completed, even if user closes and re-opens app. React Native Queue is easily integrated into React Native background processes so you can ensure the queue will continue to process until all jobs are completed.

##Features

* **Simple API:** Set up job workers and begin creating your jobs in minutes with just two basic API calls
  * queue.addWorker(name, workerFunction, options = {})  
  * queue.createJob(name, payload = {}, options = {}, startQueue = true) 
* **Powerful options:** Easily modify default functionality. Set job timeouts, number of retry attempts, priority, and worker concurrency with an options object.
* **Persistent Jobs:** Jobs are persisted with Realm. Because jobs persist, you can easily continue to process jobs across app restarts or in OS background tasks until completed or failed (or app is uninstalled).

##Installation

```bash
$ npm install --save react-native-queue
```

Or

```bash
$ yarn add react-native-queue
```

Then, because this package has a depedency on [Realm](https://github.com/realm/realm-js) you will need to link this native package by running:

```bash
$ react-native link realm
```

Linking realm **should only be done once**, reinstalling node_modules with npm or yarn does not require running the above command again.

To troubleshoot linking, refer to [the realm installation instructions](https://realm.io/docs/javascript/latest/#getting-started).

##Basic Usage

React Native Queue is a standard job/task queue built specifically for react native applications. If you have a long-running task, or a large number of tasks, consider turning that task into a job(s) and throwing it/them onto the queue to be processed in the background instead of blocking your UI until task(s) complete.

Creating and processing jobs consists of:
 
1. Importing React Native Queue
2. Registering worker functions (the functions that execute your jobs).
3. Creating jobs.
4. Starting the queue (note this happens automatically on job creation, but sometimes the queue must be explicitly started such as in a OS background task or on app restart).

```js

import queueFactory from 'react-native-queue';

// Of course this line needs to be in the context of an async function, 
// otherwise use queueFactory.then((queue) => { console.log('add workers and jobs here'); });
const queue = await queueFactory();

// Register the worker function for "example-job" jobs.
queue.addWorker('example-job', async (id, payload) => {
  console.log('EXECUTING "example-job" with id: ' + id);
  console.log(payload, 'payload');
  
  await new Promise((resolve) => {
    setTimeout(() => {
      console.log('"example-job" has completed!');
      resolve();
    }, 5000);
  });

});

// Create a couple "example-job" jobs.

// Example job passes a payload of data to 'example-job' worker.
// Default settings are used (note the empty options object).
// Because false is passed, the queue won't automatically start when this job is created, so usually queue.start() 
// would have to be manually called. However in the final createJob() below we don't pass false so it will start the queue.
// NOTE: We pass false for example purposes. In most scenarios starting queue on createJob() is perfectly fine.
queue.createJob('example-job', {
  emailAddress: 'foo@bar.com',
  randomData: {
    random: 'object',
    of: 'arbitrary data'
  }
}, {}, false);

// Create another job with an example timeout option set.
// false is passed so queue still hasn't started up.
queue.createJob('example-job', {
  emailAddress: 'example@gmail.com',
  randomData: {
    random: 'object',
    of: 'arbitrary data'
  }
}, {
  timeout: 1000 // This job will timeout in 1000 ms and be marked failed (since worker takes 5000 ms to complete).
}, false);

// This will automatically start the queue after adding the new job so we don't have to manually call queue.start().
queue.createJob('example-job', {
  emailAddress: 'another@gmail.com',
  randomData: {
    random: 'object',
    of: 'arbitrary data'
  }
});

console.log('The above jobs are processing in the background now.');

```

##Options

**Worker Options**

queue.addWorker() accepts an options object in order to tweak standard functionality.

```js

queue.addWorker('job-name-here', (id, payload) => { console.log(id); }, {
  
  // Set max number of jobs for this worker to process concurrently.
  // Defaults to 1.
  concurrency: 5
  
}); 

```

**Job Options**

queue.createJob() accepts an options object in order to tweak standard functionality.

```js

queue.createJob('job-name-here', {foo: 'bar'}, {
  
  // Higher priority jobs (10) get processed before lower priority jobs (-10).
  // Any int will work, priority 1000 will be processed before priority 10, though this is probably overkill.
  // Defaults to 0.
  priority: 10, // High priority
  
  // Timeout in ms before job is considered failed.
  // Use this setting to kill off hanging jobs that are clogging up
  // your queue.
  // Setting this option to 0 means never timeout.
  // Defaults to 0.
  timeout: 30000, // Timeout in 30 seconds
  
  // Number of times to attempt a failing job before marking job as failed and moving on.
  attempts: 4, // If this job fails to process 4 times in a row, it will be marked as failed.
  
}); 


```

## Testing with Jest

Because realm will write database files to the root test directory when running jest tests, you will need to add the following to your gitignore file if you use tests.

```text
/reactNativeQueue.realm*
```

## Caveats

**Jobs must be idempotent.** As with most queues, there are certain scenarios that could lead to React Native Queue processing a job more than once. For example, a job could timeout locally but remote server actions kicked off by the job could continue to execute. If the job is retried then effectively the remote code will be run twice. Furthermore, a job could fail due to some sort of exception halfway through then the next time it runs the first half of the job has already been executed once. Always design your React Native Queue jobs to be idempotent. If this is not possible, set job "attempts" option to be 1 (the default setting), and then you will have to write custom logic to handle the event of a job failing (perhaps via a job chain).

## Advanced Usage Examples

**Advanced Job Full Example**

```js

import React, { Component } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  View,
  Button
} from 'react-native';

import queueFactory from 'react-native-queue';

export default class App extends Component<{}> {

  constructor(props) {
    super(props);

    this.state = {
      queue: null
    };

    this.init();

  }

  async init() {

    const queue = await queueFactory();

    //
    // Standard Job Example
    // Nothing fancy about this job.
    //
    queue.addWorker('standard-example', async (id, payload) => {
      console.log('standard-example job '+id+' executed.');
    });

    //
    // Recursive Job Example
    // This job creates itself over and over.
    //
    let recursionCounter = 1;
    queue.addWorker('recursive-example', async (id, payload) => {
      console.log('recursive-example job '+ id +' started');
      console.log(recursionCounter, 'recursionCounter');

      recursionCounter++;

      await new Promise((resolve) => {
        setTimeout(() => {
          console.log('recursive-example '+ id +' has completed!');

          // Keep creating these jobs until counter reaches 3.
          if (recursionCounter <= 3) {
            queue.createJob('recursive-example');
          }

          resolve();
        }, 1000);
      });

    });

    //
    // Job Chaining Example
    // When job completes, it creates a new job to handle the next step
    // of your process. Breaking large jobs up into smaller jobs and then
    // chaining them together will allow you to handle large tasks in
    // OS background tasks, that are limited to 30 seconds of
    // execution every 15 minutes on iOS and Android.
    //
    queue.addWorker('start-job-chain', async (id, payload) => {
      console.log('start-job-chain job '+ id +' started');
      console.log('step: ' + payload.step);

      await new Promise((resolve) => {
        setTimeout(() => {
          console.log('start-job-chain '+ id +' has completed!');

          // Create job for next step in chain
          queue.createJob('job-chain-2nd-step', {
            callerJobName: 'start-job-chain',
            step: payload.step + 1
          });

          resolve();
        }, 1000);
      });

    });

    queue.addWorker('job-chain-2nd-step', async (id, payload) => {
      console.log('job-chain-2nd-step job '+ id +' started');
      console.log('step: ' + payload.step);

      await new Promise((resolve) => {
        setTimeout(() => {
          console.log('job-chain-2nd-step '+ id +' has completed!');

          // Create job for last step in chain
          queue.createJob('job-chain-final-step', {
            callerJobName: 'job-chain-2nd-step',
            step: payload.step + 1
          });

          resolve();
        }, 1000);
      });

    });

    queue.addWorker('job-chain-final-step', async (id, payload) => {
      console.log('job-chain-final-step job '+ id +' started');
      console.log('step: ' + payload.step);

      await new Promise((resolve) => {
        setTimeout(() => {
          console.log('job-chain-final-step '+ id +' has completed!');
          console.log('Job chain is now completed!');

          resolve();
        }, 1000);
      });

    });

    // Start queue to process any jobs that hadn't finished when app was last closed.
    queue.start();

    // Attach initialized queue to state.
    this.setState({
      queue
    });

  }

  makeJob(jobName, payload = {}) {
    this.state.queue.createJob(jobName, payload);
  }

  render() {

    return (
      <View style={styles.container}>
        <Text style={styles.welcome}>
          Welcome to React Native!
        </Text>
        {this.state.queue && <Button title={"Press For Standard Example"} onPress={ () => { this.makeJob('standard-example') } } /> }
        {this.state.queue && <Button title={"Press For Recursive Example"} onPress={ () => { this.makeJob('recursive-example') } } /> }
        {this.state.queue && <Button title={"Press For Job Chain Example"} onPress={ () => { this.makeJob('start-job-chain', { step: 1 }) } } /> }
      </View>
    );

  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5FCFF',
  },
  welcome: {
    fontSize: 20,
    textAlign: 'center',
    margin: 10,
  },
});


```
