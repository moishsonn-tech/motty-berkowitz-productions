// SSOT registry of every available test-harness scenario. A scenario is added to this array in
// the SAME commit that adds its file — this list (and the mirrored table in README.md) is the
// only place "what's covered" should be answered from. See README.md for the authoring
// convention every scenario file follows.
module.exports = [
  require('./sign-in-gate'),
  require('./core-crud-arc'),
  require('./realtime-sync'),
];
