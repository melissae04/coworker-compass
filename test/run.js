'use strict';

/**
 * Zero-dependency test runner. `npm test` or `node test/run.js`.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const suites = [];
let currentSuite = null;

global.describe = (name, body) => {
  currentSuite = { name, tests: [] };
  suites.push(currentSuite);
  body();
  currentSuite = null;
};

global.it = (name, body) => {
  if (!currentSuite) throw new Error('it() outside describe()');
  currentSuite.tests.push({ name, body });
};

global.assert = assert;

fs.readdirSync(__dirname)
  .filter((file) => file.endsWith('.test.js'))
  .sort()
  .forEach((file) => require(path.join(__dirname, file)));

let passed = 0;
const failures = [];

suites.forEach((suite) => {
  console.log('\n' + suite.name);
  suite.tests.forEach((test) => {
    try {
      test.body();
      passed++;
      console.log('  ✓ ' + test.name);
    } catch (err) {
      failures.push({ suite: suite.name, test: test.name, err });
      console.log('  ✗ ' + test.name);
    }
  });
});

console.log('\n' + passed + ' passing, ' + failures.length + ' failing');

if (failures.length) {
  failures.forEach((failure) => {
    console.log('\n--- ' + failure.suite + ' > ' + failure.test + ' ---');
    console.log(failure.err && failure.err.stack ? failure.err.stack : failure.err);
  });
  process.exit(1);
}
