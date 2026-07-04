const { test } = require('node:test');
const assert = require('node:assert');
const YarrboardClient = require('../');

test('create our object without error', () => {
	const yb = new YarrboardClient();
	assert.ok(yb instanceof YarrboardClient);
});
