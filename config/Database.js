/**
 * DB imitation based on RN AsyncStorage 
 */

import storage from './Storage';


/*

=== SCHEMA ===

JobSchema = {
  name: 'Job',
  primaryKey: 'id',
  properties: {
    id:  'string', // UUID.
    name: 'string', // Job name to be matched with worker function.
    payload: 'string', // Job payload stored as JSON.
    data: 'string', // Store arbitrary data like "failed attempts" as JSON.
    priority: 'int', // -5 to 5 to indicate low to high priority.
    active: { type: 'bool', default: false}, // Whether or not job is currently being processed.
    timeout: 'int', // Job timeout in ms. 0 means no timeout.
    created: 'date', // Job creation timestamp.
    failed: 'date?' // Job failure timestamp (null until failure).
  }
}

=== ====== ===

*/

const Job = '@queue:Job';

export default class Database {

  constructor() { }

  create = async (obj) => {
    await storage.push(Job, obj);
  };

  objects = async () => storage.get(Job);

  delete = async (obj) => {
    let objs = await this.objects();
    objs = objs.filter(o => o.id !== obj.id);

    await storage.save(Job, objs);
  };

  deleteAll = async () => {
    await storage.delete(Job);
  };

}