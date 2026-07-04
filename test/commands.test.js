const { test } = require('node:test');
const assert = require('node:assert');
const YarrboardClient = require('../index.js');

// The command helpers all funnel through send(), which pushes onto messageQueue.
// None of them require an open socket, so we can inspect the queue directly.
function client() {
	const yb = new YarrboardClient();
	yb.log = () => {};
	return yb;
}

function queued(yb) {
	return yb.messageQueue[yb.messageQueue.length - 1];
}

test('login queues a login command with credentials and a msgid', () => {
	const yb = client();
	yb.login('skipper', 'secret');
	assert.deepStrictEqual(queued(yb), { cmd: 'login', user: 'skipper', pass: 'secret', msgid: 1 });
});

test('logout queues a logout command with a msgid', () => {
	const yb = client();
	yb.logout();
	assert.deepStrictEqual(queued(yb), { cmd: 'logout', msgid: 1 });
});

test('sayHello queues a hello command (confirmed by default)', () => {
	const yb = client();
	yb.sayHello();
	assert.deepStrictEqual(queued(yb), { cmd: 'hello', msgid: 1 });
});

test('config getters queue the right commands', () => {
	const yb = client();
	yb.getConfig();
	assert.deepStrictEqual(queued(yb), { cmd: 'get_config', msgid: 1 });
	yb.getNetworkConfig();
	assert.deepStrictEqual(queued(yb), { cmd: 'get_network_config', msgid: 2 });
	yb.getAppConfig();
	assert.deepStrictEqual(queued(yb), { cmd: 'get_app_config', msgid: 3 });
});

test('getUpdate and getStats are unconfirmed (no msgid)', () => {
	const yb = client();
	yb.getUpdate();
	assert.deepStrictEqual(queued(yb), { cmd: 'get_update' });
	yb.getStats();
	assert.deepStrictEqual(queued(yb), { cmd: 'get_stats' });
});

test('restart and factoryReset queue confirmed commands', () => {
	const yb = client();
	yb.restart();
	assert.deepStrictEqual(queued(yb), { cmd: 'restart', msgid: 1 });
	yb.factoryReset();
	assert.deepStrictEqual(queued(yb), { cmd: 'factory_reset', msgid: 2 });
});

test('startOTA queues an ota_start command (regression: used to throw on undefined `client`)', () => {
	const yb = client();
	assert.doesNotThrow(() => yb.startOTA());
	assert.deepStrictEqual(queued(yb), { cmd: 'ota_start', msgid: 1 });
});

test('setBrightness carries the brightness value', () => {
	const yb = client();
	yb.setBrightness(42);
	assert.deepStrictEqual(queued(yb), { cmd: 'set_brightness', brightness: 42, msgid: 1 });
});

test('confirmed messages get unique, monotonically increasing, non-zero msgids', () => {
	const yb = client();
	yb.getConfig();       // 1
	yb.getStats();        // unconfirmed, no id
	yb.restart();         // 2
	const ids = yb.messageQueue.map((m) => m.msgid);
	assert.deepStrictEqual(ids, [1, undefined, 2]);
});

test('send() drops unconfirmed messages once the queue exceeds 10, but always keeps confirmed ones', () => {
	const yb = client();
	// 12 unconfirmed sends: the queue only accepts while length <= 10, so it caps at 11.
	for (let i = 0; i < 12; i++)
		yb.send({ cmd: 'noise' }, false);
	assert.strictEqual(yb.messageQueue.length, 11);

	// A confirmed message is queued regardless of a full queue.
	yb.send({ cmd: 'important' }, true);
	assert.strictEqual(yb.messageQueue.length, 12);
	assert.strictEqual(queued(yb).cmd, 'important');
});
