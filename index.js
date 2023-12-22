const ws = require('websocket');
const packageJSON = require('./package.json');

class YarrboardClient {
	constructor(hostname = "yarrboard.local", username = "admin", password = "admin", require_login = true, use_ssl = false) {
		this.config = false;
		this.closed = false;
		this.connectionRetryCount = 0;
		this.maxConnectionRetries = 0; // 0 = try forever
		this.state = "IDLE";
		this.connectionStates = ["IDLE", "CONNECTING", "CONNECTED", "RETRYING", "FAILED"];

		this.hostname = hostname;
		this.username = username;
		this.password = password;
		this.require_login = require_login;
		this.boardname = hostname.split(".")[0];
		this.use_ssl = use_ssl;

		this.addMessageId = false;
		this.messageQueue = [];
		this.lastMessage = {};
		this.lastMessageId = 0;
		this.lastMessageTime = 0;
		this.messageTimeout = 5000;
		this.messageTimeoutCount = 0;

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
		return this.state;

		// if (this.ws) {
		// 	if (this.ws.readyState == ws.w3cwebsocket.CONNECTING)
		// 		return "CONNECTING";
		// 	else if (this.isOpen())
		// 		return "CONNECTED";
		// 	//TODO: find a way to get better feedback here.
		// 	// else if (status == "RETRYING")
		// 	// 	return "RETRYING";
		// 	else
		// 		return "FAILED";
		// }
		// else
		// 	return "CONNECTING";
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
		this.state = "IDLE";
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
				if (this.lastMessageId)
				{
					//have we timed out?
					if ((Date.now() - this.messageTimeout) > this.lastMessageTime) {
						this.messageTimeoutCount++;

						this.log(`message ${this.lastMessageId} timed out #${this.messageTimeoutCount}`);

						//bail if we've hit too many timeouts
						if (this.messageTimeoutCount >= 3)
						{
							this.log(`bailing`);
							this.lastMessage = null;
							this.lastMessageId = 0;
							this.lastMessageTime = 0;
							this.messageTimeoutCount = 0;
						}
						else
						{
							this.log("resending: " + JSON.stringify(this.lastMessage));
							//this.lastMessage.msgid = this.lastMessage.msgid;
							//this.lastMessageId = this.lastMessage.msgid;
							this.lastMessageTime = Date.now();
							this.ws.send(JSON.stringify(this.lastMessage));
						}
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
						this.messageTimeoutCount = 0;
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

	setSwitchState(id, state, source, requireConfirmation = true) {
		if (state === true)
			state = "ON";
		else if (state === false)
			state = "OFF";
		
		return this.send({
			"cmd": "set_switch",
			"id": id,
			"state": state,
			"source": source
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

	setPWMChannelState(id, state, source, requireConfirmation = true) {
		if (state === true)
			state = "ON";
		else if (state === false)
			state = "OFF";
		
		return this.send({
			"cmd": "set_pwm_channel",
			"id": id,
			"state": state,
			"source": source
		}, requireConfirmation);
	}

	setPWMChannelDuty(id, duty, requireConfirmation = true) {
		return this.send({
			"cmd": "set_pwm_channel",
			"id": id,
			"duty": duty
		}, requireConfirmation);
	}

	togglePWMChannel(id, source, requireConfirmation = true) {
		return this.send({
			"cmd": "toggle_pwm_channel",
			"id": id,
			"source": source
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

		//update our state
		if (this.connectionRetryCount > 0)
			this.state = "RETRYING";
		else
			this.state = "CONNECTING";

		//okay, connect
		this.ws = new ws.w3cwebsocket(uri);
		this.ws.onopen = this._onopen.bind(this);
		this.ws.onerror = this._onerror.bind(this);
		this.ws.onclose = this._onclose.bind(this);
		this.ws.onmessage = this._onmessage.bind(this);
	}

	_onopen(event) {
		this.log(`Connected`);

		//update our state
		this.state = "CONNECTED";

		//we are connected, reload
		this.closed = false;
		this.ota_started = false;
		this.lastMessageId = 0;
		this.lastMessageTime = 0;
		this.messageQueue = [];
		this.connectionRetryCount = 0;

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

		//did we hit our max?
		if (this.maxConnectionRetries > 0 && this.connectionRetryCount <= this.maxConnectionRetries)
		{
			//update our retries
			this.connectionRetryCount++;

			delete this.ws;
			this._createWebsocket();	
		}
		else
		{
			this.log(`${this.connectionRetryCount} max retries, connection failed.`);
			this.state = "FAILED";
		}
	}

	_onmessage(event) {
		this.receivedMessageCount++;

		if (typeof event.data === 'string') {
			try {
				let data = JSON.parse(event.data);

				//check for a message reply.
				if (data.msgid)
				{
					if (data.msgid == this.lastMessageId)
					{
						this.lastMessageId = 0;
						this.messageTimeoutCount = 0;
					}
					else
					{
						this.log(`unknown msgid ${data.msgid}, looking for ${this.lastMessageId}`);
						this.log(JSON.stringify(data));
					}
				}

				//status?
				if (data.status == "error")
					this.log(`Error: ${data.message}`);
				if (data.status == "success")
					this.log(`Success: ${data.message}`);

				//are we doing an OTA?
				if (data.msg == "ota_progress")
					this.ota_started = true;

				//did we get a throttle message?
				if (data.error == "Queue Full")
				{
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
				this.log(error.toString());
			}
		}
	}
}
YarrboardClient.version = packageJSON.version;

module.exports = YarrboardClient;