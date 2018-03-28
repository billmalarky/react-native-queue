
# Easy OS Background Tasks in React Native

<img src="/docs/easy-os-background-tasks-in-react-native.png" alt="Easy OS Background Tasks in React Native Header Image"/>

**Thanks to a couple of relatively new libraries, running tasks in a background thread, also known as a service, when your react native app is closed has never been easier.**

Today I’ll walk you through setting up tasks that will run periodically even when your app is closed. If you already have React Native setup, and you’re staring at your IDE right now, it will only take you ~15 minutes to be fully up and running with this complete example.

**We will use two libraries to accomplish this:**

* [React Native Queue](https://github.com/billmalarky/react-native-queue): Control flow and job management.

* [React Native Background Task](https://github.com/jamesisaac/react-native-background-task): Register js handler function that will be executed when app is closed.

**In our example, we will do basic image pre-fetching (yeah yeah it’s a bit pointless but it’s easy to understand for illustrative purposes).**

**Examples of more realistic use cases for this functionality:**

* Downloading content for offline access.

* Media processing.

* Cache Warming.

* *Durable* API calls to external services, such as publishing content to a variety of 3rd party distribution channel APIs.

* Complex and time-consuming jobs that you want consistently processed regardless if app is open, closed, or repeatedly opened and closed.

## Installation

First create the skeleton React Native app in your working directory

    $ react-native init backgroundexample

Quickly install [react-native-queue](https://github.com/billmalarky/react-native-queue#installation) and [react-native-background-task](https://github.com/jamesisaac/react-native-background-task#installation) packages and link them (note react-native-background-fetch is an optional dependency of react-native-background-task required for iOS support).

    $ yarn add react-native-queue
    $ react-native link realm
    $ yarn add react-native-background-task
    $ react-native link react-native-background-task
    $ yarn add react-native-background-fetch@2.0.x
    $ react-native link react-native-background-fetch

Manually update the onCreate() method in MainApplication.java like so

    // Update the following file as seen below
    // android/app/src/main/java/com/backgroundexample/MainApplication.java

    @Override
    public void onCreate() {
      super.onCreate();
      SoLoader.init(this, /* native exopackage */ false);
      BackgroundTaskPackage.useContext(this); // ADD ME HERE!
    }

## Building The Feature

First lets update the react native skeleton app to include a screen of images that is toggled with a button press. Nothing fancy.

### Toggle Screen App.js Changes

Nothing fancy here. Just add ScrollView, Button, Image imports, modify the container style, add the image style, and make some small updates to the skeleton App class.

    import React, { Component } from 'react';
    import {
      Platform,
      StyleSheet,
      Text,
      ScrollView,
      Button,
      Image
    } from 'react-native';
    
    export default class App extends Component<{}> {
    
      constructor(props) {
        super(props);
    
        this.state = {
          showImages: false
        };
    
      }
    
      render() {
        return (
          <ScrollView style={styles.container}>
            <Button title={"Toggle Screen"} onPress={ () => { this.setState({ showImages: !this.state.showImages}) } } />
            {! this.state.showImages && <Text style={styles.welcome}>Home Screen</Text> }
            {this.state.showImages && <Text style={styles.welcome}>Image Screen</Text> }
            {this.state.showImages && <Image style={styles.image} source={{uri: 'https://i.imgur.com/kPkQTic.jpg'}} permanent={false} /> }
            {this.state.showImages && <Image style={styles.image} source={{uri: 'https://i.redd.it/uwvjph19mltz.jpg'}} permanent={false} /> }
            {this.state.showImages && <Image style={styles.image} source={{uri: 'https://i.redd.it/39w0xd9ersxz.jpg'}} permanent={false} /> }
          </ScrollView>
        );
      }
    }
    
    const styles = StyleSheet.create({
      container: {
        padding: 10
      },
      welcome: {
        fontSize: 20,
        textAlign: 'center',
        margin: 10,
      },
      image: {
        width:150,
        height: 204
      }
    });

### Integrating the background task

**At the top of App.js we will define the js function we want the OS to call periodically in the background when the app is closed (the “background task”).**

What we want to happen in this background task function, is to initialize the queue, and immediately start pulling jobs off of the queue and processing as many as we can before hitting the 30 second timeout imposed by iOS (Android does not have this timeout limitation but we need to adhere to the strictest constraints for cross-platform support) for background service functions. **Because of this hard timeout limit, we will call queue.start(lifespan) with a lifespan of 25 seconds**. This way, the queue will start processing jobs for at most 25 seconds (or until queue is cleared), then stop processing guaranteeing us time to call the required Background.finish() before the OS times out the function.

In our example, 25 seconds will be more than enough to churn through the entire queue, seeing as we’re only gonna pre-fetch 3 images. However, imagine if we were pre-fetching 10,000 images. **The queue keeps the jobs durable** (they won’t be deleted until completed, and can auto-retry on failure), so every ~15 min when the OS fires this function in the background again, another batch of images would be pre-fetched, and sooner or later all of the images would be pre-fetched all behind the scenes.

    import BackgroundTask from 'react-native-background-task'
    import queueFactory from 'react-native-queue';
    
    BackgroundTask.define(async () => {
    
      // Init queue
      queue = await queueFactory();
    
      // Register job worker
      queue.addWorker('pre-fetch-image', async (id, payload) => {
    
        Image.prefetch(payload.imageUrl);
    
      });
    
      // Start the queue with a lifespan
      // IMPORTANT: OS background tasks are limited to 30 seconds or less.
      // NOTE: Queue lifespan logic will attempt to stop queue processing 500ms less than passed lifespan for a healthy shutdown buffer.
      // IMPORTANT: Queue processing started with a lifespan will ONLY process jobs that have a defined timeout set.
      // Additionally, lifespan processing will only process next job if job.timeout < (remainingLifespan - 500).
      await queue.start(25000); // Run queue for at most 25 seconds.
    
      // finish() must be called before OS hits timeout.
      BackgroundTask.finish();
    
    });

Then add a componentDidMount() lifecycle method to the App component to schedule the background task when the app mounts.

    componentDidMount() {
      BackgroundTask.schedule(); // Schedule the task to run every ~15 min if app is closed.
    }

Your App.js file should now look something like this:

    import React, { Component } from 'react';
    import {
      Platform,
      StyleSheet,
      Text,
      ScrollView,
      Button,
      Image
    } from 'react-native';
    
    import BackgroundTask from 'react-native-background-task'
    import queueFactory from 'react-native-queue';
    
    BackgroundTask.define(async () => {
    
      // Init queue
      queue = await queueFactory();
    
      // Register job worker
      queue.addWorker('pre-fetch-image', async (id, payload) => {
    
        Image.prefetch(payload.imageUrl);
    
      });
    
      // Start the queue with a lifespan
      // IMPORTANT: OS background tasks are limited to 30 seconds or less.
      // NOTE: Queue lifespan logic will attempt to stop queue processing 500ms less than passed lifespan for a healthy shutdown buffer.
      // IMPORTANT: Queue processing started with a lifespan will ONLY process jobs that have a defined timeout set.
      // Additionally, lifespan processing will only process next job if job.timeout < (remainingLifespan - 500).
      await queue.start(25000); // Run queue for at most 25 seconds.
    
      // finish() must be called before OS hits timeout.
      BackgroundTask.finish();
    
    });
    
    export default class App extends Component<{}> {
    
      constructor(props) {
        super(props);
    
        this.state = {
          showImages: false
        };
    
      }
    
      componentDidMount() {
        BackgroundTask.schedule(); // Schedule the task to run every ~15 min if app is closed.
      }
    
      render() {
        return (
          <ScrollView style={styles.container}>
            <Button title={"Toggle Screen"} onPress={ () => { this.setState({ showImages: !this.state.showImages}) } } />
            {! this.state.showImages && <Text style={styles.welcome}>Home Screen</Text> }
            {this.state.showImages && <Text style={styles.welcome}>Image Screen</Text> }
            {this.state.showImages && <Image style={styles.image} source={{uri: 'https://i.imgur.com/kPkQTic.jpg'}} permanent={false} /> }
            {this.state.showImages && <Image style={styles.image} source={{uri: 'https://i.redd.it/uwvjph19mltz.jpg'}} permanent={false} /> }
            {this.state.showImages && <Image style={styles.image} source={{uri: 'https://i.redd.it/39w0xd9ersxz.jpg'}} permanent={false} /> }
          </ScrollView>
        );
      }
    }
    
    const styles = StyleSheet.create({
      container: {
        padding: 10
      },
      welcome: {
        fontSize: 20,
        textAlign: 'center',
        margin: 10,
      },
      image: {
        width:150,
        height: 204
      }
    });

### Adding Queue Jobs

Now that we’ve got our background task setup to initialize the queue and process jobs when our app is closed, we need a way to actually add jobs to the queue!

First we’ll initialize the queue in the app so we can use it to create jobs.

Reference the final App.js file below in lines 41–54 to make the necessary updates to the constructor() in order to initialize the queue inside the app.

After the queue is initialized, create the createPrefetchJobs() class method seen below in lines 60–86. Inside this method we will reference the queue instance stored in the app component state to create the 3 jobs that prefetch images to throw on the queue. Notice that we pass false as the last parameter to createJob(), this stops the queue from starting up processing immediately (which is the default behavior). In this example we don’t want the queue to process in the main app thread, so we’ll only call queue.start() in the background task.

Last but not least, update render() in line 92 to add the “Pre-fetch Images” button and wire it to the createPrefetchJobs() method we created earlier.

    import React, { Component } from 'react';
    import {
      Platform,
      StyleSheet,
      Text,
      ScrollView,
      Button,
      Image
    } from 'react-native';
    
    import BackgroundTask from 'react-native-background-task'
    import queueFactory from 'react-native-queue';
    
    BackgroundTask.define(async () => {
    
      // Init queue
      queue = await queueFactory();
    
      // Register job worker
      queue.addWorker('pre-fetch-image', async (id, payload) => {
    
        Image.prefetch(payload.imageUrl);
    
      });
    
      // Start the queue with a lifespan
      // IMPORTANT: OS background tasks are limited to 30 seconds or less.
      // NOTE: Queue lifespan logic will attempt to stop queue processing 500ms less than passed lifespan for a healthy shutdown buffer.
      // IMPORTANT: Queue processing started with a lifespan will ONLY process jobs that have a defined timeout set.
      // Additionally, lifespan processing will only process next job if job.timeout < (remainingLifespan - 500).
      await queue.start(25000); // Run queue for at most 25 seconds.
    
      // finish() must be called before OS hits timeout.
      BackgroundTask.finish();
    
    });
    
    export default class App extends Component<{}> {
    
      constructor(props) {
        super(props);
    
        this.state = {
          queue: null,
          showImages: false
        };
    
        queueFactory()
          .then(queue => {
            this.setState({queue});
          });
    
      }
    
      componentDidMount() {
        BackgroundTask.schedule(); // Schedule the task to run every ~15 min if app is closed.
      }
    
      createPrefetchJobs() {
    
        // Create the prefetch job for the first <Image> component.
        this.state.queue.createJob(
          'pre-fetch-image',
          { imageUrl: 'https://i.imgur.com/kPkQTic.jpg' }, // Supply the image url we want prefetched in this job to the payload.
          { attempts: 5, timeout: 15000 }, // Retry job on failure up to 5 times. Timeout job in 15 sec (prefetch is probably hanging if it takes that long).
          false // Must pass false as the last param so the queue starts up in the background task instead of immediately.
        );
    
        // Create the prefetch job for the second <Image> component.
        this.state.queue.createJob(
          'pre-fetch-image',
          { imageUrl: 'https://i.redd.it/uwvjph19mltz.jpg' }, // Supply the image url we want prefetched in this job to the payload.
          { attempts: 5, timeout: 15000 }, // Retry job on failure up to 5 times. Timeout job in 15 sec (prefetch is probably hanging if it takes that long).
          false // Must pass false as the last param so the queue starts up in the background task instead of immediately.
        );
    
        // Create the prefetch job for the third <Image> component.
        this.state.queue.createJob(
          'pre-fetch-image',
          { imageUrl: 'https://i.redd.it/39w0xd9ersxz.jpg' }, // Supply the image url we want prefetched in this job to the payload.
          { attempts: 5, timeout: 15000 }, // Retry job on failure up to 5 times. Timeout job in 15 sec (prefetch is probably hanging if it takes that long).
          false // Must pass false as the last param so the queue starts up in the background task instead of immediately.
        );
    
      }
    
      render() {
        return (
          <ScrollView style={styles.container}>
            <Button title={"Toggle Screen"} onPress={ () => { this.setState({ showImages: !this.state.showImages}) } } />
            {this.state.queue && <Button title={"Pre-fetch Images"} onPress={ this.createPrefetchJobs.bind(this) } />}
            {! this.state.showImages && <Text style={styles.welcome}>Home Screen</Text> }
            {this.state.showImages && <Text style={styles.welcome}>Image Screen</Text> }
            {this.state.showImages && <Image style={styles.image} source={{uri: 'https://i.imgur.com/kPkQTic.jpg'}} permanent={false} /> }
            {this.state.showImages && <Image style={styles.image} source={{uri: 'https://i.redd.it/uwvjph19mltz.jpg'}} permanent={false} /> }
            {this.state.showImages && <Image style={styles.image} source={{uri: 'https://i.redd.it/39w0xd9ersxz.jpg'}} permanent={false} /> }
          </ScrollView>
        );
      }
    }
    
    const styles = StyleSheet.create({
      container: {
        padding: 10
      },
      welcome: {
        fontSize: 20,
        textAlign: 'center',
        margin: 10,
      },
      image: {
        width:150,
        height: 204
      }
    });

### You’re Done!

Now boot up your react native app on an actual device **(background tasks WILL NOT FIRE in simulators)**. Once the app is booted, click the prefetch button to queue the jobs.

Now all that’s left is to unfocus the app, and wait. **OS Background tasks WILL NOT fire if the app is in focus** (that would sort of be against the entire point). After ~15 minutes, the OS will fire up the background task, initialize the queue, and start the queue up churning through your 3 prefetch jobs.

At this point your remote images have been prefetched to the phone’s local disk, and when you click “toggle screen” to view the images, they will be pulled from your local disk instead of the network.

### Questions? Troubleshooting.

If you’re having any issues, or have any questions, feel free to contact me directly and I can help you.
