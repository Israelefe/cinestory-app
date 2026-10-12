import { configuration } from '../src/server/config.mjs';
import { initialiseStorage } from '../src/server/storage.mjs';
import { openDatabase, enqueue } from '../src/server/database.mjs';
const config = configuration(); await initialiseStorage(config); const db = openDatabase(config); console.log(enqueue(db, null, 'calibrate', { requestedAt: Date.now() })); db.close();
