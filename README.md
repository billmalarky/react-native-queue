<img src="/docs/logo.png" alt="React Native Queue"/>

# React Native Queue
#### Simple. Powerful. Persistent.

[![Build Status](https://travis-ci.org/billmalarky/react-native-queue.svg?branch=master)](https://travis-ci.org/billmalarky/react-native-queue)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/billmalarky/react-native-queue/blob/master/LICENSE)
[![ESLint](https://img.shields.io/badge/eslint-ok-green.svg)](https://github.com/billmalarky/react-native-queue/blob/master/.eslintrc.js)
[![JSDoc](https://img.shields.io/badge/jsdoc-100%25%20code%20documentation-green.svg)](http://usejsdoc.org/)
[![Coverage Status](https://coveralls.io/repos/github/billmalarky/react-native-queue/badge.svg?branch=master)](https://coveralls.io/github/billmalarky/react-native-queue?branch=master)

A React Native at-least-once priority job queue / task queue backed by persistent Realm storage. Jobs will persist until completed, even if user closes and re-opens app. React Native Queue is easily integrated into OS background processes (services) so you can ensure the queue will continue to process until all jobs are completed even if app isn't in focus. It also plays well with Workers so your jobs can be thrown on the queue, then processed in dedicated worker threads for greatly improved processing performance.

## Table of Contents

* [Features](#features)
* [Example Use Cases](#example-use-cases)
* [Installation](#installation)
* [Basic Usage](#basic-usage)
* [Options and Job Lifecycle Callbacks](#options-and-job-lifecycle-callbacks)
* [Testing with Jest](#testing-with-jest)
* [Caveats](#caveats)
* [Advanced Usage Examples](#advanced-usage-examples)
  * [Advanced Job Full Example](#advanced-job-full-example)
  * [OS Background Task Full Example](#os-background-task-full-example)
* [Tutorials](#tutorials)

## Features

* **Simple API:** Set up job workers and begin creating your jobs in minutes with just two basic API calls
  * queue.addWorker(name, workerFunction, options = {})  
  * queue.createJob(name, payload = {}, options = {}, startQueue = true) 
* **Powerful options:** Easily modify default functionality. Set job timeouts, number of retry attempts, priority, job lifecycle callbacks, and worker concurrency with an options object. Start queue processing with a lifespan to easily meet OS background task time limits.
* **Persistent Jobs:** Jobs are persisted with Realm. Because jobs persist, you can easily continue to process jobs across app restarts or in OS background tasks until completed or failed (or app is uninstalled).
* **Powerful Integrations:** React Native Queue was designed to play well with others. The queue quickly integrates with a variety of OS background task and Worker packages so  processing your jobs in a background service or dedicated thread have never been easier.

## Example Use Cases

**React Native Queue is designed to be a swiss army knife for task management in React Native**. It abstracts away the many annoyances related to processing complex tasks, like durability, retry-on-failure, timeouts, chaining processes, and more. **Just throw your jobs onto the queue and relax - they're covered**.

Need advanced task functionality like dedicated worker threads or OS services? Easy:

* **React Native Queue + React Native Background Task:** [Simple and Powerful OS services](#os-background-task-full-example) that fire when your app is closed.
* **React Native Queue + React Native Workers:** Spinning up [dedicated worker threads](https://gist.github.com/billmalarky/1d1f72a267a1608606410602aa63cabf) for CPU intensive tasks has never been easier.

**Example Queue Tasks:**

* Downloading content for offline access.
* Media processing.
* Cache Warming.
* _Durable_ API calls to external services, such as publishing content to a variety of 3rd party distribution channel APIs.
* Complex and time-consuming jobs that you want consistently processed regardless if app is open, closed, or repeatedly opened and closed.
* Complex tasks with multiple linked dependant steps (job chaining).

## Installation

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

## Basic Usage

React Native Queue is a standard job/task queue built specifically for react native applications. If you have a long-running task, or a large number of tasks, consider turning that task into a job(s) and throwing it/them onto the queue to be processed in the background instead of blocking your UI until task(s) complete.

Creating and processing jobs consists of:
 
1. Importing and initializing React Native Queue
2. Registering worker functions (the functions that execute your jobs).
3. Creating jobs.
4. Starting the queue (note this happens automatically on job creation, but sometimes the queue must be explicitly started such as in a OS background task or on app restart). Queue can be started with a lifespan in order to limit queue processing time.

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

console.log('The above jobs are processing in the background of app now.');

```

## Options and Job Lifecycle Callbacks

#### Worker Options (includes async job lifecycle callbacks)

queue.addWorker() accepts an options object in order to tweak standard functionality and allow you to hook into asynchronous job lifecycle callbacks.

**IMPORTANT: Job Lifecycle callbacks are called asynchronously.** They do not block job processing or each other. Don't put logic in onStart that you expect to be completed before the actual job process begins executing. Don't put logic in onFailure you expect to be completed before onFailed is called. You can, of course, assume that the job process has completed (or failed) before onSuccess, onFailure, onFailed, or onComplete are asynchonrously called.

```js

queue.addWorker('job-name-here', async (id, payload) => { console.log(id); }, {
  
  // Set max number of jobs for this worker to process concurrently.
  // Defaults to 1.
  concurrency: 5,
  
  // JOB LIFECYCLE CALLBACKS
  
  // onStart job callback handler is fired when a job begins processing.
  //
  // IMPORTANT: Job lifecycle callbacks are executed asynchronously and do not block job processing 
  // (even if the callback returns a promise it will not be "awaited" on).
  // As such, do not place any logic in onStart that your actual job worker function will depend on,
  // this type of logic should of course go inside the job worker function itself.
  onStart: async (id, payload) => {
    
    console.log('Job "job-name-here" with id ' + id + ' has started processing.');  
    
  },
  
  // onSuccess job callback handler is fired after a job successfully completes processing.
  onSuccess: async (id, payload) => {
    
    console.log('Job "job-name-here" with id ' + id + ' was successful.');
    
  },
  
  // onFailure job callback handler is fired after each time a job fails (onFailed also fires if job has reached max number of attempts).
  onFailure: async (id, payload) => {
    
    console.log('Job "job-name-here" with id ' + id + ' had an attempt end in failure.');
    
  },
  
  // onFailed job callback handler is fired if job fails enough times to reach max number of attempts.
  onFailed: async (id, payload) => {
    
    console.log('Job "job-name-here" with id ' + id + ' has failed.');
    
  },
  
  // onComplete job callback handler fires after job has completed processing successfully or failed entirely.
  onComplete: async (id, payload) => {
    
    console.log('Job "job-name-here" with id ' + id + ' has completed processing.');
    
  }
  
}); 

```

#### Job Options

queue.createJob() accepts an options object in order to tweak standard functionality.

```js

queue.createJob('job-name-here', {foo: 'bar'}, {
  
  // Higher priority jobs (10) get processed before lower priority jobs (-10).
  // Any int will work, priority 1000 will be processed before priority 10, though this is probably overkill.
  // Defaults to 0.
  priority: 10, // High priority
  
  // Timeout in ms before job is considered failed.
  // Use this setting to kill off hanging jobs that are clogging up
  // your queue, or ensure your jobs finish in a timely manner if you want
  // to execute jobs in OS background tasks.
  //
  // IMPORTANT: Jobs are required to have a timeout > 0 set in order to be processed 
  // by a queue that has been started with a lifespan. As such, if you want to process
  // jobs in an OS background task, you MUST give the jobs a timeout setting.
  //
  // Setting this option to 0 means never timeout.
  //
  // Defaults to 25000.
  timeout: 30000, // Timeout in 30 seconds
  
  // Number of times to attempt a failing job before marking job as failed and moving on.
  // Defaults to 1.
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

#### Advanced Job Full Example

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

#### OS Background Task Full Example

For the purpose of this example we will use the [React Native Background Task](https://github.com/jamesisaac/react-native-background-task) module, but you could integrate React Native Queue with any acceptable OS background task module.

Follow the [installation steps](https://github.com/jamesisaac/react-native-background-task#installation) for React Native Background Task.

```js

import React, { Component } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  View,
  Button,
  AsyncStorage
} from 'react-native';

import BackgroundTask from 'react-native-background-task'
import queueFactory from 'react-native-queue';

BackgroundTask.define(async () => {

  // Init queue
  queue = await queueFactory();

  // Register worker
  queue.addWorker('background-example', async (id, payload) => {

    // Load some arbitrary data while the app is in the background
    if (payload.name == 'luke') {
      await AsyncStorage.setItem('lukeData', 'Luke Skywalker arbitrary data loaded!');
    } else {
      await AsyncStorage.setItem('c3poData', 'C-3PO arbitrary data loaded!');
    }

  });

  // Start the queue with a lifespan
  // IMPORTANT: OS background tasks are limited to 30 seconds or less.
  // NOTE: Queue lifespan logic will attempt to stop queue processing 500ms less than passed lifespan for a healthy shutdown buffer.
  // IMPORTANT: Queue processing started with a lifespan will ONLY process jobs that have a defined timeout set.
  // Additionally, lifespan processing will only process next job if job.timeout < (remainingLifespan - 500).
  await queue.start(20000); // Run queue for at most 20 seconds.

  // finish() must be called before OS hits timeout.
  BackgroundTask.finish();

});

export default class App extends Component<{}> {

  constructor(props) {
    super(props);

    this.state = {
      queue: null,
      data: null
    };

    this.init();

  }

  async init() {

    const queue = await queueFactory();

    // Add the worker.
    queue.addWorker('background-example', async (id, payload) => {
      // Worker has to be defined before related jobs can be added to queue.
      // Since this example is only concerned with OS background task worker execution,
      // We will make this a dummy function in this context.
      console.log(id);
    });

    // Attach initialized queue to state.
    this.setState({
      queue
    });

  }

  componentDidMount() {
    BackgroundTask.schedule(); // Schedule the task to run every ~15 min if app is closed.
  }

  makeJob(jobName, payload = {}) {
    console.log('job is created but will not execute until the above OS background task runs in ~15 min');
    this.state.queue.createJob(jobName, payload, {

      timeout: 5000 // IMPORTANT: If queue processing is started with a lifespan ie queue.start(lifespan) it will ONLY process jobs with a defined timeout.

    }, false); // Pass false so queue doesn't get started here (we want the queue to start only in OS background task in this example).
  }

  async checkData() {

    const lukeData = await AsyncStorage.getItem('lukeData');
    const c3poData = await AsyncStorage.getItem('c3poData');

    this.setState({
      data: {
        lukeData: (lukeData) ? lukeData : 'No data loaded from OS background task yet for Luke Skywalker.',
        c3poData: (c3poData) ? c3poData : 'No data loaded from OS background task yet for C-3PO.'
      }
    });

  }

  render() {

    let output = 'No data loaded from OS background task yet.';
    if (this.state.data) {
      output = JSON.stringify(this.state.data);
    }

    return (
      <View style={styles.container}>
        <Text style={styles.welcome}>
          Welcome to React Native!
        </Text>
        <Text>Click buttons below to add OS background task jobs.</Text>
        <Text>Then Close App (task will not fire if app is in focus).</Text>
        <Text>Job will exec in ~15 min in OS background.</Text>
        {this.state.queue && <Button title={"Press To Queue Luke Skywalker Job"} onPress={ () => { this.makeJob('background-example', { name: 'luke' }) } } /> }
        {this.state.queue && <Button title={"Press To Queue C-3PO Job"} onPress={ () => { this.makeJob('background-example', { name: 'c3po' }) } } /> }
        <Button title={"Check if Data was loaded in OS background"} onPress={ () => { this.checkData() } } />
        <Text>{output}</Text>
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

## Tutorials

#### Easy OS Background Tasks in React Native

An in-depth guide to setting up background tasks / services that run periodically when the app is closed.

* [Hosted on Medium](https://hackernoon.com/easy-os-background-tasks-in-react-native-bc4476c48b8a)
* [Raw Markdown](/docs/easy-os-background-tasks-in-react-native.md)

