declare module "react-native-queue" {
    interface QueueFactoryConfig {
        realmPath: string;
    }

    interface WorkerLifecycleCallback { (id: string, payload: any): Promise<any>; }

    interface WorkerOptions {
        concurrency?: number;
        onStart?: WorkerLifecycleCallback;
        onSuccess?: WorkerLifecycleCallback;
        onFailure?: WorkerLifecycleCallback;
        onFailed?: WorkerLifecycleCallback;
        onComplete?: WorkerLifecycleCallback;
    }

    interface JobOptions {
        priority?: number;
        timeout?: number;
        attempts?: number;
    }

    interface Job {
        id: string;         // UUID.
        name: string;       // Job name to be matched with worker function.
        payload: string;    // Job payload stored as JSON.
        data: string;       // Store arbitrary data like "failed attempts" as JSON.
        priority: number    // -5 to 5 to indicate low to high priority.
        active: boolean;    // Whether or not job is currently being processed.
        timeout: number;    // Job timeout in ms. 0 means no timeout.
        created: Date       // Job creation timestamp.
        failed?: Date       // Job failure timestamp (null until failure).
    }

    export class RNQueue {
        constructor(config: QueueFactoryConfig);
        addWorker(jobName: string, worker: (id: string, payload: any) => {}, options?: WorkerOptions): void;
        removeWorker(jobName: string): void;
        createJob(jobName: string, payload?: any, options?: JobOptions, startQueue?: boolean): void;
        start(lifespan?: number): Promise<boolean | undefined>;
        stop(): void;
        getJobs(sync?: boolean): Promise<Job[]>;
        getConcurrentJobs(queueLifespanRemaining?: number): Promise<Job[]>;
        processJob(job: Job): void;
        flushQueue(jobName: string): void;
        getStatus(): 'active' | 'inactive';
    }

    function queueFactory(config: QueueFactoryConfig): Promise<RNQueue>;

    export default queueFactory;
}
