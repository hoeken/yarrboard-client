const { test } = require('node:test');
const assert = require('node:assert');
const { WebSocketServer } = require('ws');
const YarrboardClient = require('../index.js');

function listen() {
	return new Promise((resolve) => {
		const wss = new WebSocketServer({ port: 0 });
		wss.on('listening', () => resolve(wss));
	});
}

async function waitFor(cond, label = 'condition', timeout = 3000) {
	const start = Date.now();
	while (!cond()) {
		if (Date.now() - start > timeout)
			throw new Error(`timed out waiting for ${label}`);
		await new Promise((r) => setTimeout(r, 10));
	}
}

// Spin up a real local server + client, record everything the server receives,
// and tear both down (for good) when the test finishes.
async function harness(t, { requireLogin = false } = {}) {
	const wss = await listen();
	const port = wss.address().port;
	const received = [];
	wss.on('connection', (socket) => {
		socket.on('message', (data) => {
			try { received.push(JSON.parse(data.toString())); } catch { /* ignore */ }
		});
	});
	const yb = new YarrboardClient(`localhost:${port}`, 'skipper', 'secret', requireLogin);
	yb.log = () => {};
	t.after(() => {
		yb.close();
		for (const c of wss.clients) c.terminate();
		return new Promise((resolve) => wss.close(() => resolve()));
	});
	return { wss, port, yb, received };
}

test('connects and reports CONNECTED / isOpen', async (t) => {
	const { yb } = await harness(t);
	await new Promise((resolve) => { yb.onopen = () => resolve(); yb.start(); });
	assert.strictEqual(yb.status(), 'CONNECTED');
	assert.strictEqual(yb.isOpen(), true);
});

test('automatically logs in on connect when require_login is set', async (t) => {
	const { yb, received } = await harness(t, { requireLogin: true });
	yb.start();
	await waitFor(() => received.some((m) => m.cmd === 'login'), 'login message');
	const login = received.find((m) => m.cmd === 'login');
	assert.strictEqual(login.user, 'skipper');
	assert.strictEqual(login.pass, 'secret');
});

test('does not log in when require_login is false', async (t) => {
	const { yb, received } = await harness(t, { requireLogin: false });
	await new Promise((resolve) => { yb.onopen = () => resolve(); yb.start(); });
	await new Promise((r) => setTimeout(r, 100)); // let the pump run a few cycles
	assert.ok(!received.some((m) => m.cmd === 'login'));
});

test('delivers queued commands over the socket', async (t) => {
	const { yb, received } = await harness(t);
	await new Promise((resolve) => { yb.onopen = () => resolve(); yb.start(); });
	yb.getConfig();
	await waitFor(() => received.some((m) => m.cmd === 'get_config'), 'get_config message');
	assert.strictEqual(received.find((m) => m.cmd === 'get_config').msgid, 1);
});

test('a server reply clears the in-flight message and reaches onmessage', async (t) => {
	const { yb, wss } = await harness(t);
	wss.on('connection', (socket) => {
		socket.on('message', (data) => {
			const msg = JSON.parse(data.toString());
			socket.send(JSON.stringify({ msgid: msg.msgid, status: 'success', echo: msg.cmd }));
		});
	});
	const seen = [];
	yb.onmessage = (data) => seen.push(data);
	await new Promise((resolve) => { yb.onopen = () => resolve(); yb.start(); });
	yb.getConfig(); // msgid 1
	await waitFor(() => seen.some((m) => m.echo === 'get_config'), 'echoed reply');
	await waitFor(() => yb.lastMessageId === 0, 'in-flight cleared');
	assert.strictEqual(yb.lastMessageId, 0);
});

test('reconnects automatically after the server drops the connection', async (t) => {
	const { yb, wss } = await harness(t);
	let opens = 0;
	yb.onopen = () => { opens++; };
	yb.start();
	await waitFor(() => opens === 1, 'first connect');
	for (const c of wss.clients) c.close();
	await waitFor(() => opens >= 2, 'reconnect');
	assert.ok(opens >= 2);
	assert.strictEqual(yb.status(), 'CONNECTED');
});

test('onclose fires when the connection drops', async (t) => {
	const { yb, wss } = await harness(t);
	let closes = 0;
	yb.onclose = () => { closes++; };
	await new Promise((resolve) => { yb.onopen = () => resolve(); yb.start(); });
	for (const c of wss.clients) c.close();
	await waitFor(() => closes >= 1, 'onclose callback');
	assert.ok(closes >= 1);
});

test('close() stops the client for good — no reconnect afterward', async (t) => {
	const { yb, wss } = await harness(t);
	let opens = 0;
	yb.onopen = () => { opens++; };
	yb.start();
	await waitFor(() => opens === 1, 'connect');
	yb.close();
	const opensAtClose = opens;
	for (const c of wss.clients) c.terminate();
	await new Promise((r) => setTimeout(r, 250));
	assert.strictEqual(opens, opensAtClose); // never reconnected
	assert.strictEqual(yb.status(), 'IDLE');
});
