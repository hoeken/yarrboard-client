const ws = require('websocket');
const packageJSON = require('./package.json');

class YarrboardClient {
	constructor(hostname = "yarrboard.local", username = "admin", password = "admin", require_login = true, use_ssl = false) {
		this.config = false;
		this.closed = false;

		this.hostname = hostname;
		this.username = username;
		this.password = password;
		this.require_login = require_login;
		this.boardname = hostname.split(".")[0];
		this.use_ssl = use_ssl;

		this.addMessageId = false;
		this.lastMessage = {};
		this.lastMessageId = 0;
		this.lastMessageTime = 0;
		this.messageQueue = [];
		this.messageTimeout = 2000;

		this.updateInterval = 1000;

		this.messageQueueDelayMax = 250;
		this.messageQueueDelayMin = 10; //limit the client to 100 messages / second
		this.messageQueueDelay = this.messageQueueDelayMin;

		this.ota_started = false;

		this.receivedMessageCount = 0;
		this.sentMessageCount = 0;
		this.lastReceivedMessageCount = 0;
		this.lastSentMessageCount = 0;
		this.lastMessageUpdateTime = Date.now();

	}

	start() {
		this._createWebsocket();
		this._sendQueue();
	}

	isOpen() {
		return !this.closed && this.ws.readyState == ws.w3cwebsocket.OPEN;
	}

	status() {
		if (this.ws) {
			if (this.ws.readyState == ws.w3cwebsocket.CONNECTING)
				return "CONNECTING";
			else if (this.isOpen())
				return "CONNECTED";
			//TODO: find a way to get better feedback here.
			// else if (status == "RETRYING")
			// 	return "RETRYING";
			else
				return "FAILED";
		}
		else
			return "CONNECTING";
	}

	log(text) {
		console.log(`[${this.hostname}] ${text}`);
	}

	close() {
		this.closed = true;
		this.ws.onopen = {};
		this.ws.onclose = {};
		this.ws.onerror = {};
		this.ws.onmessage = {};
		this.ws.close();
	}

	login(username, password) {
		return this.send({
			"cmd": "login",
			"user": username,
			"pass": password
		}, true);
	}

	logout() {
		return this.send({"cmd": "logout"}, true);
	}

	_sendQueue() {
		//are we ready to party?
		if (this.messageQueue.length && this.isOpen()) {
			//OTA is blocking... dont send messages
			if (this.ota_started)
				return;

			try {
				//are we waiting for a response?
				if (this.lastMessageId) {
					//check for timeouts
					if ((Date.now() - this.messageTimeout) > this.lastMessageTime) {
						this.log(`message ${this.lastMessageId} timed out, resending`);
						this.lastMessage.msgid = this.sentMessageCount;
						this.lastMessageId = this.lastMessage.msgid;
						this.lastMessageTime = Date.now();
						this.ws.send(JSON.stringify(this.lastMessage));
					}
				} else {
					//FIFO
					let message = this.messageQueue.shift();
					this.sentMessageCount++;

					//keep track of all messages?
					if (this.addMessageId)
						message.msgid = this.sentMessageCount;

					//are we tracking this one?
					if (message.msgid) {
						this.lastMessage = message;
						this.lastMessageId = message.msgid;
						this.lastMessageTime = Date.now();
					}

					//finally send it off.
					this.ws.send(JSON.stringify(message));
				}
			} catch (error) {
				this.log(`Send error: ${error}`);
			}
		}

		//relax our throttling, if any
		this.messageQueueDelay = this.messageQueueDelay - 10;
		this.messageQueueDelay = Math.max(this.messageQueueDelay, this.messageQueueDelayMin);

		//keep calling the sender!
		setTimeout(this._sendQueue.bind(this), this.messageQueueDelay);
	}

	send(message, requireConfirmation = true) {
		//add a message id to required messages
		if (requireConfirmation)
			message["msgid"] = this.sentMessageCount;

		//can we add it to the queue?
		if (requireConfirmation || this.messageQueue.length <= 10)
			this.messageQueue.push(message);
		// else
		// 	this.log(`Skipping, message queue full: ${this.messageQueue.length}`);
	}

	printMessageStats() {
		if (this.isOpen()) {
			let delta = Date.now() - this.lastMessageUpdateTime;
			let rmps = Math.round(((this.receivedMessageCount - this.lastReceivedMessageCount) / delta) * 1000);
			let smps = Math.round(((this.sentMessageCount - this.lastSentMessageCount) / delta) * 1000);

			this.log(`Recd m/s: ${rmps} | Sent m/s: ${smps} | Total Received/Sent: ${this.receivedMessageCount} / ${this.sentMessageCount}`);

			this.lastMessageUpdateTime = Date.now();
			this.lastSentMessageCount = this.sentMessageCount;
			this.lastReceivedMessageCount = this.receivedMessageCount;
		}

		setTimeout(this.printMessageStats.bind(this), 1000);
	}

	sayHello(requireConfirmation = true) {
		return this.send({ "cmd": "hello" }, requireConfirmation);
	}

	getConfig(requireConfirmation = true) {
		return this.send({ "cmd": "get_config" }, requireConfirmation);
	}

	getNetworkConfig(requireConfirmation = true) {
		return this.send({ "cmd": "get_network_config" }, requireConfirmation);
	}

	getAppConfig(requireConfirmation = true) {
		return this.send({ "cmd": "get_app_config" }, requireConfirmation);
	}

	getUpdate(requireConfirmation = false) {
		return this.send({ "cmd": "get_update" }, requireConfirmation);
	}

	startUpdatePoller(update_interval) {
		this.updateInterval = update_interval;
		this._updatePoller();
	}

	_updatePoller() {
		if (this.isOpen()) {
			this.getUpdate();
			setTimeout(this._updatePoller.bind(this), this.updateInterval);
		}
	}

	getStats(requireConfirmation = false) {
		return this.send({ "cmd": "get_stats" }, requireConfirmation);
	}

	restart() {
		return this.send({"cmd": "restart"}, true);
	}

	factoryReset() {
		return this.send({"cmd": "factory_reset"}, true);
	}

	startOTA() {
		client.send({"cmd": "ota_start"}, true);
	}

	setBrightness(brightness, requireConfirmation = true) {
		return this.send({
			"cmd": "set_brightness",
			"brightness": brightness
		}, requireConfirmation);
	}


	fadePWMChannel(id, duty, millis, requireConfirmation = true) {
		return this.send({
			"cmd": "fade_pwm_channel",
			"id": id,
			"duty": duty,
			"millis": millis
		}, requireConfirmation);
	}

	setPWMChannelState(id, state, requireConfirmation = true) {
		return this.send({
			"cmd": "set_pwm_channel",
			"id": id,
			"state": state
		}, requireConfirmation);
	}

	setPWMChannelDuty(id, duty, requireConfirmation = true) {
		return this.send({
			"cmd": "set_pwm_channel",
			"id": id,
			"duty": duty
		}, requireConfirmation);
	}

	togglePWMChannel(id, requireConfirmation = true) {
		return this.send({
			"cmd": "toggle_pwm_channel",
			"id": id
		}, requireConfirmation);
	}

	setRGB(id, red = 0, green = 0, blue = 0, requireConfirmation = false) {
		return this.send({
			"cmd": "set_rgb",
			"id": id,
			"red": red,
			"green": green,
			"blue": blue,
		}, requireConfirmation);
	}

	onopen(event) { }

	onmessage(message, event) {
		//this.log(JSON.stringify(message));
	}

	onerror(event) { }

	onclose(event) { }

	_createWebsocket() {
		//encrypt?
		var protocol = "ws://";
		if (this.use_ssl)
			protocol = "wss://";

		//where to, boss?
		let uri = `${protocol}${this.hostname}/ws`;
		this.log(`Opening websocket to: ${uri}`);

		//okay, connect
		this.ws = new ws.w3cwebsocket(uri);
		this.ws.onopen = this._onopen.bind(this);
		this.ws.onerror = this._onerror.bind(this);
		this.ws.onclose = this._onclose.bind(this);
		this.ws.onmessage = this._onmessage.bind(this);
	}

	_onopen(event) {
		this.log(`Connected`);

		//we are connected, reload
		this.closed = false;
		this.ota_started = false;
		this.lastMessageId = 0;
		this.lastMessageTime = 0;
		this.messageQueue = [];

		//handle login
		if (this.require_login)
			this.login(this.username, this.password);

		//our callback
		this.onopen(event);
	}

	_onerror(event) {
		this.log(`Connection error: code=${event.code} reason=${event.reason}`);

		this.onerror(event);
	}

	_onclose(event) {
		this.log(`Connection closed: code=${event.code} reason=${event.reason}`);

		this.closed = true;
		this.onclose(event);

		delete this.ws;
		this._createWebsocket();
	}

	_onmessage(event) {
		this.receivedMessageCount++;

		if (typeof event.data === 'string') {
			try {
				let data = JSON.parse(event.data);

				//mark the message as received
				if (this.lastMessageId && data.msgid == this.lastMessageId)
					this.lastMessageId = 0;

				//status?
				if (data.status == "error")
					this.log(`Error: ${data.message}`);
				if (data.status == "success")
					this.log(`Success: ${data.message}`);

				//are we doing an OTA?
				if (data.msg == "ota_progress") {
					this.ota_started = true;

					//restart our socket when finished
					// if (data.progress == 100) {
					// 	this.close();
					// 	this.start();
					// }
				}

				//did we get a throttle message?
				if (data.error == "Queue Full") {
					//this.messageQueueDelay = Math.round(10 * (1 + Math.random()));
					this.messageQueueDelay = this.messageQueueDelay + 25 + 25 * Math.random();
					this.messageQueueDelay = Math.min(this.messageQueueDelayMax, this.messageQueueDelay)
					this.log(`Throttling: ${this.messageQueueDelay}`);
				}

				//this is our heartbeat reply, ignore
				if (data.pong)
					true;
				else
					this.onmessage(data, event);
			}
			catch (error) {
				this.log(`Message error: ${error}`);
			}
		}
	}

	// _sendHeartbeat() {
	// 	//bail if we're done.
	// 	if (this.closed) {
	// 		return;
	// 	}

	// 	//did we not get a heartbeat?
	// 	if (Date.now() - this.last_heartbeat > this.heartbeat_rate * 3) {
	// 		this.log(`Missed heartbeat`)
	// 		this.ws.close();
	// 		this._retryConnection();
	// 	}

	// 	//only send it if we're already open.
	// 	if (this.ws.readyState == ws.w3cwebsocket.OPEN) {
	// 		this.send({ "cmd": "ping" }, false);
	// 		setTimeout(this._sendHeartbeat.bind(this), this.heartbeat_rate);
	// 	}
	// 	else if (this.ws.readyState == ws.w3cwebsocket.CLOSING) {
	// 		this.log(`closing`);
	// 		this._retryConnection();
	// 	}
	// 	else if (this.ws.readyState == ws.w3cwebsocket.CLOSED) {
	// 		this._retryConnection();
	// 	}
	// }

	// _retryConnection() {
	// 	//bail if we're done.
	// 	if (this.closed) {
	// 		console.log(`Connection closed`);
	// 		return;
	// 	}
	// 	//bail if its good to go
	// 	else if (this.ws.readyState == ws.w3cwebsocket.OPEN) {
	// 		return;
	// 	}
	// 	//keep watching if we are connecting
	// 	else if (this.ws.readyState == ws.w3cwebsocket.CONNECTING) {
	// 		console.log(`waiting for connection to open`);
	// 		this.retry_count++;

	// 		//give it a little bit.
	// 		if (this.retry_count < 5) {
	// 			setTimeout(this._retryConnection.bind(this), 1000);
	// 			return;
	// 		}
	// 	}
	// 	//keep watching if we are closing
	// 	else if (this.ws.readyState == ws.w3cwebsocket.CLOSING) {
	// 		console.log(`waiting for connection to close`);
	// 		this.retry_count++;

	// 		//give it a little bit.
	// 		if (this.retry_count < 5) {
	// 			setTimeout(this._retryConnection.bind(this), 1000);
	// 			return;
	// 		}
	// 	}

	// 	//try everything we can to stop the websocket.
	// 	this.ws.onopen = {};
	// 	this.ws.onclose = {};
	// 	this.ws.onerror = {};
	// 	this.ws.onmessage = {};
	// 	this.ws.close();
	// 	delete this.ws;

	// 	//keep track of stuff.
	// 	this.retry_count = 0;
	// 	this.socket_retries++;

	// 	//reconnect!
	// 	this._createWebsocket();

	// 	//set some bounds
	// 	let my_timeout = 500;
	// 	my_timeout = Math.max(my_timeout, this.socket_retries * this.heartbeat_rate);
	// 	my_timeout = Math.min(my_timeout, 60000);

	// 	//tee it up.
	// 	this.log(`Reconnecting, try #${this.socket_retries}. Next try in ${my_timeout}ms.`);
	// 	setTimeout(this._retryConnection.bind(this), my_timeout);
	// }
}
YarrboardClient.version = packageJSON.version;

module.exports = YarrboardClient;
