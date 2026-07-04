const { test } = require('node:test');
const assert = require('node:assert');
const YarrboardClient = require('../index.js');
const packageJSON = require('../package.json');

test('creates an instance', () => {
	const yb = new YarrboardClient();
	assert.ok(yb instanceof YarrboardClient);
});

test('applies sensible defaults', () => {
	const yb = new YarrboardClient();
	assert.strictEqual(yb.hostname, 'yarrboard.local');
	assert.strictEqual(yb.username, 'admin');
	assert.strictEqual(yb.password, 'admin');
	assert.strictEqual(yb.require_login, true);
	assert.strictEqual(yb.use_ssl, false);
	assert.strictEqual(yb.state, 'IDLE');
	assert.strictEqual(yb.closed, false);
	assert.strictEqual(yb.stopped, false);
	assert.strictEqual(yb.ws, null);
	assert.deepStrictEqual(yb.messageQueue, []);
});

test('honors constructor arguments', () => {
	const yb = new YarrboardClient('boat.example.com', 'skipper', 'secret', false, true);
	assert.strictEqual(yb.hostname, 'boat.example.com');
	assert.strictEqual(yb.username, 'skipper');
	assert.strictEqual(yb.password, 'secret');
	assert.strictEqual(yb.require_login, false);
	assert.strictEqual(yb.use_ssl, true);
});

test('derives boardname from the first hostname label', () => {
	assert.strictEqual(new YarrboardClient('helm.local').boardname, 'helm');
	assert.strictEqual(new YarrboardClient('a.b.c.d').boardname, 'a');
});

test('boardname falls back to the whole hostname when there is no dot', () => {
	assert.strictEqual(new YarrboardClient('localhost:8080').boardname, 'localhost:8080');
});

test('exposes the package version as a static property', () => {
	assert.strictEqual(YarrboardClient.version, packageJSON.version);
});

test('advertises its connection states', () => {
	const yb = new YarrboardClient();
	assert.deepStrictEqual(yb.connectionStates, ['IDLE', 'CONNECTING', 'CONNECTED', 'RETRYING', 'FAILED']);
});
