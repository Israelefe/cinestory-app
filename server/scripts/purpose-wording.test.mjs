import test from 'node:test';
import assert from 'node:assert/strict';
import { purposeWordingIssues } from '../src/utils/purposeWording.js';

const accepted = [
  ['Convennant 25th Birthday Celebration', "Celebrating Convennant's 25th birthday."],
  ['25th birthday celebration', 'Celebrating a 25th birthday.'],
  ['these photos was taking for Ada 25th birthday celebration', "These photos were taken for Ada's 25th birthday celebration."],
  ['portrait shoot for Chidi and Nneka wedding anniversary', "A portrait shoot for Chidi and Nneka's wedding anniversary."],
  ['Product photos for Kora Studio new collection launch', "Product photos for Kora Studio's new collection launch."],
  ["Àdá and O’Neil wedding", "Àdá and O’Neil’s wedding."],
  ['Ada-Lynn 25th birthday', "Celebrating Ada-Lynn's 25th birthday."],
  ['Ada birthay photos', "Ada's birthday photos."],
  ['Birthday portraits without guests', 'Birthday portraits without guests.']
];
for (const [source, edit] of accepted) test(`wording edit keeps details: ${source}`, () => assert.deepEqual(purposeWordingIssues(source, edit), []));

const rejected = [
  ['Convennant 25th Birthday Celebration', "Celebrating Lora's 25th birthday."],
  ['Convennant birthday', "Celebrating Covenant's birthday."],
  ['25th birthday celebration', "Celebrating Ada's 25th birthday."],
  ['Lora', "Lora's birthday portraits."],
  ['Ada birthday', "Celebrating Ada's birthday in Lagos."],
  ['Ada 25th birthday', "Celebrating Ada's 30th birthday."],
  ['Ada 25th birthday', "Celebrating Ada's birthday."],
  ['Ada and her sister birthday photos', "Ada's birthday photos."],
  ['Ada birthday', "Celebrating Ada's joy and confidence on her birthday."],
  ['Birthday portraits without guests and with family', 'Birthday portraits with guests and without family.'],
  ['Ada birthday', 'Shoot type: Birthday\nPurpose: Ada birthday'],
  ['Ada birthday', 'x'.repeat(3001)],
  ['Ada birthday', ''],
  ['Ada birthday', null]
];
for (const [source, edit] of rejected) test(`wording edit rejects changed content: ${source} -> ${String(edit).slice(0, 85)}`, () => assert.ok(purposeWordingIssues(source, edit).length));
