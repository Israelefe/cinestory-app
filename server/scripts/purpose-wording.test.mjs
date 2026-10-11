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
  ['Birthday portraits without guests', 'Birthday portraits without guests.'],
  ['Ada at Thirty', 'Celebrating Ada at thirty.'],
  ['Ada at Thirty', 'Celebrating Ada turning 30.'],
  ['Ada at Thirty', "Celebrating Ada's 30th birthday.", { shootType: 'Birthday' }],
  ['Ada 2oth birthday', "Celebrating Ada's 20th birthday."],
  ['Ada 30th birthday', "Celebrating Ada's thirtieth birthday."],
  ['Ada thirtieth birthday', "Celebrating Ada's 30th birthday."],
  ['Chidi at Twenty-One', 'Celebrating Chidi at 21.'],
  ['Ada twenty fifth birthday in 2026', "Celebrating Ada's 25th birthday in 2026."],
  ['Ada one hundred and first birthday', "Celebrating Ada's 101st birthday."],
  ['Ada one hundred and twenty-first birthday', "Celebrating Ada's 121st birthday."],
  ['Chidi and Nneka tenth wedding anniversary', "Marking Chidi and Nneka's 10th wedding anniversary."],
  ['Ada traditional wedding', "Marking Ada's traditional wedding."],
  ['Product photos for Kora Studio collection launch', "Product photos for Kora Studio's collection launch."],
  ['These photos were shot for Kora Studio', 'These photographs were taken for Kora Studio.'],
  ['Ada 030th birthday', "Celebrating Ada's 30th birthday."],
  ['Birthday portraits without guests and family', 'Birthday portraits without family and guests.'],
  ['Birthday portraits without guests on 12 June', 'Birthday portraits on 12 June without guests.'],
  ['We don’t include guests in these birthday photos', 'We do not include guests in these birthday photos.'],
  ['We cannot include guests in these birthday photos', 'We can not include guests in these birthday photos.'],
  ["We're taking portraits for Kora Studio", 'We are taking portraits for Kora Studio.'],
  ['These photos are not for Ada birthday', "These photos aren't for Ada's birthday."]
];
for (const [source, edit, context] of accepted) test(`wording edit keeps details: ${source} -> ${edit}`, () => assert.deepEqual(purposeWordingIssues(source, edit, context), []));

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
  ['Ada birthday', null],
  ['Ada at Thirty', "Celebrating Lora's 30th birthday.", { shootType: 'Birthday' }],
  ['Ada at Thirty', "Celebrating Ada's 20th birthday.", { shootType: 'Birthday' }],
  ['Ada at Thirty', "Celebrating Ada's birthday.", { shootType: 'Birthday' }],
  ['Ada at Thirty', "Celebrating Ada's 30th birthday in Lagos.", { shootType: 'Birthday' }],
  ['Ada at Thirty', "Celebrating Ada's 30th birthday.", { shootType: 'Portrait' }],
  ['Ada', "Celebrating Ada's birthday.", { shootType: 'Birthday' }],
  ['Ada thirty birthday', "Celebrating Ada's twentieth birthday."],
  ['Ada 25th birthday in 2026', "Celebrating Ada's 26th birthday in 2025."],
  ['Ada 30th birthday and 30 photos', "Celebrating Ada's thirtieth birthday and photos."],
  ['Ada shoot at 10:30 am', "Ada's 10th birthday shoot at 30 am.", { shootType: 'Birthday' }],
  ['Ada shoot at 9 pm', "Ada's 9th birthday shoot at pm.", { shootType: 'Birthday' }],
  ['Ada memorial at thirty', "Celebrating Ada's memorial at thirty.", { shootType: 'Birthday' }],
  ['Ada memorial at thirty', "Ada's thirtieth birthday memorial.", { shootType: 'Birthday' }],
  ['Mark and Ada wedding', "Photographs of Ada's wedding."],
  ['Mark at Thirty', 'Celebrating a 30th birthday.', { shootType: 'Birthday' }],
  ['Honour memorial', 'Honouring the memorial.'],
  ["Capture's new collection launch", 'Photographs of the new collection launch.'],
  ['Birthday portraits without guests and family', 'Birthday portraits without guests and with family.'],
  ['Birthday portraits without guests and family', 'Birthday portraits without family and with guests.'],
  ['We don’t include guests in these birthday photos', 'We include guests in these birthday photos.'],
  ['We cannot include guests', 'We can include guests.'],
  ['Kora product launch on 12 June', 'Kora product launch on 13 June.'],
  ['Kora product launch at 10:30 am', 'Kora product launch at 10:30 pm.'],
  ['Ada birthday', "Photographs of Ada's birthday with Emeka."],
  ['Ada birthday', "Photographs of Ada's birthday in Abuja."],
  ['Ada maternity photos', "Photographs of Ada's baby shower."],
  ['Zainab bridal shower', "Photographs of Zainab's wedding."]
];
for (const [source, edit, context] of rejected) test(`wording edit rejects changed content: ${source} -> ${String(edit).slice(0, 85)}`, () => assert.ok(purposeWordingIssues(source, edit, context).length));

test('age equivalence works from one to ninety-nine across names, not a fixed birthday example', () => {
  const small = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  for (const name of ['Ife', 'Mark', 'Honour', 'Àdá', 'O’Neil', 'Chidi-Emeka']) {
    for (let age = 1; age < 100; age += 1) {
      const written = age < 20 ? small[age] : tens[Math.floor(age / 10)] + (age % 10 ? '-' + small[age % 10] : '');
      const suffix = age % 100 >= 11 && age % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[age % 10] || 'th');
      const source = `${name} at ${written}`;
      const correct = `Celebrating ${name}'s ${age}${suffix} birthday.`;
      assert.deepEqual(purposeWordingIssues(source, correct, { shootType: 'Birthday' }), [], `${source} -> ${correct}`);
      assert.ok(purposeWordingIssues(source, `Celebrating ${name}'s ${age + 1}th birthday.`, { shootType: 'Birthday' }).length, `Changed age was accepted for ${source}`);
    }
  }
});
