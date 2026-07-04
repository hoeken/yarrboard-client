const { test } = require('node:test');
const assert = require('node:assert');
const YarrboardClient = require('../index.js');

// Build a client whose log output is captured, and drive _onmessage directly
// with fake WebSocket message events ({ data: <string> }).
function client() {
	const yb = new YarrboardClient();
	yb.logs = [];
	yb.log = (text) => yb.logs.push(text);
	return yb;
}

function deliver(yb, obj) {
	yb._onmessage({ data: JSON.stringify(obj) });
}

test('a reply matching the in-flight msgid clears the pending message', () => {
	const yb = client();
	yb.lastMessageId = 5;
	yb.messageTimeoutCount = 2;
	deliver(yb, { msgid: 5, status: 'success', message: 'ok' });
	assert.strictEqual(yb.lastMessageId, 0);
	assert.strictEqual(yb.messageTimeoutCount, 0);
});

test('a reply with a mismatched msgid leaves the in-flight message untouched', () => {
	const yb = client();
	yb.lastMessageId = 5;
	deliver(yb, { msgid: 9 });
	assert.strictEqual(yb.lastMessageId, 5);
	assert.ok(yb.logs.some((l) => l.includes('unknown msgid')));
});

test('error and success statuses are logged', () => {
	const yb = client();
	deliver(yb, { status: 'error', message: 'boom' });
	deliver(yb, { status: 'success', message: 'yay' });
	assert.ok(yb.logs.some((l) => l.includes('Error: boom')));
	assert.ok(yb.logs.some((l) => l.includes('Success: yay')));
});

test('an ota_progress message flips ota_started on', () => {
	const yb = client();
	assert.strictEqual(yb.ota_started, false);
	deliver(yb, { msg: 'ota_progress', progress: 10 });
	assert.strictEqual(yb.ota_started, true);
});

test('a "Queue Full" error ramps up the throttle delay, capped at the max', () => {
	const yb = client();
	yb.messageQueueDelay = yb.messageQueueDelayMin;
	deliver(yb, { error: 'Queue Full' });
	assert.ok(yb.messageQueueDelay > yb.messageQueueDelayMin);
	assert.ok(yb.messageQueueDelay <= yb.messageQueueDelayMax);

	// Repeated throttling never exceeds the ceiling.
	for (let i = 0; i < 50; i++)
		deliver(yb, { error: 'Queue Full' });
	assert.strictEqual(yb.messageQueueDelay, yb.messageQueueDelayMax);
});

test('heartbeat pongs are swallowed and do not reach the onmessage callback', () => {
	const yb = client();
	const seen = [];
	yb.onmessage = (data) => seen.push(data);
	deliver(yb, { pong: true });
	assert.strictEqual(seen.length, 0);
});

test('regular messages are forwarded to the onmessage callback', () => {
	const yb = client();
	const seen = [];
	yb.onmessage = (data) => seen.push(data);
	deliver(yb, { cmd: 'update', value: 7 });
	assert.strictEqual(seen.length, 1);
	assert.deepStrictEqual(seen[0], { cmd: 'update', value: 7 });
});

test('malformed JSON is caught and never reaches the callback', () => {
	const yb = client();
	let called = false;
	yb.onmessage = () => { called = true; };
	assert.doesNotThrow(() => yb._onmessage({ data: 'this is not json {' }));
	assert.strictEqual(called, false);
	assert.ok(yb.logs.some((l) => l.includes('Message error')));
});

test('non-string payloads are ignored but still counted', () => {
	const yb = client();
	let called = false;
	yb.onmessage = () => { called = true; };
	assert.doesNotThrow(() => yb._onmessage({ data: 12345 }));
	assert.strictEqual(called, false);
});

test('receivedMessageCount increments for every inbound message', () => {
	const yb = client();
	assert.strictEqual(yb.receivedMessageCount, 0);
	deliver(yb, { cmd: 'a' });
	deliver(yb, { cmd: 'b' });
	yb._onmessage({ data: 'garbage' });
	assert.strictEqual(yb.receivedMessageCount, 3);
});
