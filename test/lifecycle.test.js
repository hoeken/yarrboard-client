const { test } = require('node:test');
const assert = require('node:assert');
const WebSocket = require('ws');
const YarrboardClient = require('../index.js');

function fakeSocket(readyState = WebSocket.OPEN) {
	return {
		readyState,
		closeCalled: false,
		close() { this.closeCalled = true; },
	};
}

function client() {
	const yb = new YarrboardClient();
	yb.log = () => {};
	return yb;
}

test('status() reflects the current state', () => {
	const yb = client();
	assert.strictEqual(yb.status(), 'IDLE');
	yb.state = 'CONNECTED';
	assert.strictEqual(yb.status(), 'CONNECTED');
});

test('isOpen() is false (not a crash) before start() has created a socket', () => {
	const yb = client();
	assert.doesNotThrow(() => yb.isOpen());
	assert.strictEqual(yb.isOpen(), false);
});

test('isOpen() is true only when the socket is open and the client is not closed', () => {
	const yb = client();
	yb.ws = fakeSocket(WebSocket.OPEN);
	yb.closed = false;
	assert.strictEqual(yb.isOpen(), true);
});

test('isOpen() is false when the socket is not in the OPEN state', () => {
	const yb = client();
	yb.ws = fakeSocket(WebSocket.CONNECTING);
	yb.closed = false;
	assert.strictEqual(yb.isOpen(), false);
});

test('isOpen() is false when the client has been closed, even with an open socket', () => {
	const yb = client();
	yb.ws = fakeSocket(WebSocket.OPEN);
	yb.closed = true;
	assert.strictEqual(yb.isOpen(), false);
});

test('close() before start() is safe and marks the client stopped/idle', () => {
	const yb = client();
	assert.doesNotThrow(() => yb.close());
	assert.strictEqual(yb.closed, true);
	assert.strictEqual(yb.stopped, true);
	assert.strictEqual(yb.state, 'IDLE');
});

test('close() shuts down the socket and stops the client for good', () => {
	const yb = client();
	yb.ws = fakeSocket(WebSocket.OPEN);
	yb.close();
	assert.strictEqual(yb.ws.closeCalled, true);
	assert.strictEqual(yb.closed, true);
	assert.strictEqual(yb.stopped, true);
	assert.strictEqual(yb.state, 'IDLE');
});
