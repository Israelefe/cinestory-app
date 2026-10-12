import { configuration } from '../src/server/config.mjs';
import { initialiseStorage } from '../src/server/storage.mjs';
import { openDatabase, enqueue } from '../src/server/database.mjs';
const config = configuration(); await initialiseStorage(config); const db = openDatabase(config);
const task = enqueue(db, null, 'capture', { requestedAt: Date.now() }); console.log('Queued full capture refresh: ' + task.id + '. Keep the local studio running to process it.'); db.close();
