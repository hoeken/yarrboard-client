const { test } = require('node:test');
const assert = require('node:assert');
const WebSocket = require('ws');
const YarrboardClient = require('../index.js');

// _sendQueue() reschedules itself via setTimeout. We mock setTimeout so a single
// call performs exactly one pass and the trailing reschedule is captured (never
// run), then drive the pump against a fake socket.
function fakeSocket() {
	return {
		readyState: WebSocket.OPEN,
		sent: [],
		closeCalled: false,
		send(data) { this.sent.push(data); },
		close() { this.closeCalled = true; },
	};
}

function readyClient() {
	const yb = new YarrboardClient();
	yb.log = () => {};
	yb.ws = fakeSocket();
	yb.closed = false;
	yb.stopped = false;
	return yb;
}

test('sends a queued message, drains it, and counts it', (t) => {
	t.mock.timers.enable({ apis: ['setTimeout'] });
	const yb = readyClient();
	yb.messageQueue = [{ cmd: 'ping', msgid: 7 }];
	yb._sendQueue();

	assert.strictEqual(yb.ws.sent.length, 1);
	assert.deepStrictEqual(JSON.parse(yb.ws.sent[0]), { cmd: 'ping', msgid: 7 });
	assert.strictEqual(yb.messageQueue.length, 0);
	assert.strictEqual(yb.sentMessageCount, 1);
});

test('tracks a confirmed message as in-flight so it can await a reply', (t) => {
	t.mock.timers.enable({ apis: ['setTimeout'] });
	const yb = readyClient();
	yb.messageQueue = [{ cmd: 'ping', msgid: 7 }];
	yb._sendQueue();

	assert.strictEqual(yb.lastMessageId, 7);
	assert.deepStrictEqual(yb.lastMessage, { cmd: 'ping', msgid: 7 });
	assert.strictEqual(yb.messageTimeoutCount, 0);
});

test('does not track an unconfirmed message (no msgid)', (t) => {
	t.mock.timers.enable({ apis: ['setTimeout'] });
	const yb = readyClient();
	yb.messageQueue = [{ cmd: 'noise' }];
	yb._sendQueue();

	assert.strictEqual(yb.ws.sent.length, 1);
	assert.strictEqual(yb.lastMessageId, 0);
});

test('addMessageId stamps a unique id onto every outgoing message', (t) => {
	t.mock.timers.enable({ apis: ['setTimeout'] });
	const yb = readyClient();
	yb.addMessageId = true;
	yb.messageQueue = [{ cmd: 'noise' }];
	yb._sendQueue();

	assert.strictEqual(JSON.parse(yb.ws.sent[0]).msgid, 1);
	assert.strictEqual(yb.lastMessageId, 1);
});

test('holds the queue while waiting for an outstanding reply', (t) => {
	t.mock.timers.enable({ apis: ['setTimeout'] });
	const yb = readyClient();
	yb.lastMessageId = 3;
	yb.lastMessageTime = Date.now(); // fresh, nowhere near the timeout
	yb.messageQueue = [{ cmd: 'ping', msgid: 4 }];
	yb._sendQueue();

	assert.strictEqual(yb.ws.sent.length, 0);
	assert.strictEqual(yb.messageQueue.length, 1);
});

test('resends the in-flight message once it times out', (t) => {
	t.mock.timers.enable({ apis: ['setTimeout'] });
	const yb = readyClient();
	// The pump only acts when there is also traffic waiting behind the in-flight message.
	yb.messageQueue = [{ cmd: 'waiting', msgid: 4 }];
	yb.lastMessage = { cmd: 'ping', msgid: 3 };
	yb.lastMessageId = 3;
	yb.messageTimeout = 5000;
	yb.lastMessageTime = Date.now() - 6000; // already past the timeout window
	yb._sendQueue();

	assert.strictEqual(yb.ws.sent.length, 1);
	assert.deepStrictEqual(JSON.parse(yb.ws.sent[0]), { cmd: 'ping', msgid: 3 });
	assert.strictEqual(yb.messageTimeoutCount, 1);
	assert.strictEqual(yb.lastMessageId, 3); // still awaiting a reply
	assert.strictEqual(yb.messageQueue.length, 1); // the waiting message is not touched yet
});

test('gives up on a message after three timeouts', (t) => {
	t.mock.timers.enable({ apis: ['setTimeout'] });
	const yb = readyClient();
	yb.messageQueue = [{ cmd: 'waiting', msgid: 4 }];
	yb.lastMessage = { cmd: 'ping', msgid: 3 };
	yb.lastMessageId = 3;
	yb.messageTimeout = 5000;
	yb.lastMessageTime = Date.now() - 6000;
	yb.messageTimeoutCount = 2; // this pass makes it the third
	yb._sendQueue();

	assert.strictEqual(yb.ws.sent.length, 0);
	assert.strictEqual(yb.lastMessage, null);
	assert.strictEqual(yb.lastMessageId, 0);
	assert.strictEqual(yb.lastMessageTime, 0);
	assert.strictEqual(yb.messageTimeoutCount, 0);
});

test('does not transmit while an OTA update is running', (t) => {
	t.mock.timers.enable({ apis: ['setTimeout'] });
	const yb = readyClient();
	yb.ota_started = true;
	yb.messageQueue = [{ cmd: 'ping', msgid: 1 }];
	yb._sendQueue();

	assert.strictEqual(yb.ws.sent.length, 0);
	assert.strictEqual(yb.messageQueue.length, 1);
});

test('relaxes the throttle delay toward the minimum on each idle pass', (t) => {
	t.mock.timers.enable({ apis: ['setTimeout'] });
	const yb = readyClient();
	yb.messageQueueDelay = 100;
	yb._sendQueue();
	assert.strictEqual(yb.messageQueueDelay, 90);

	yb.messageQueueDelay = 15;
	yb._sendQueue();
	assert.strictEqual(yb.messageQueueDelay, yb.messageQueueDelayMin); // floored, not negative
});

test('once stopped, the pump does nothing and stops rescheduling', (t) => {
	t.mock.timers.enable({ apis: ['setTimeout'] });
	const yb = readyClient();
	yb.stopped = true;
	yb.messageQueueDelay = 100;
	yb.messageQueue = [{ cmd: 'ping', msgid: 1 }];
	yb._sendQueue();

	assert.strictEqual(yb.ws.sent.length, 0);
	assert.strictEqual(yb.messageQueue.length, 1);
	assert.strictEqual(yb.messageQueueDelay, 100); // returned before touching anything
});
