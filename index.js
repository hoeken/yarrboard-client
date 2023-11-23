const ws = require('websocket');
const packageJSON = require('./package.json');

class YarrboardClient
{
	constructor(hostname="yarrboard.local", username="admin", password="admin", require_login = true, use_ssl = false)
	{
		this.config = false;
		this.closed = false;
	
		this.hostname = hostname;
		this.username = username;
		this.password = password;
		this.require_login = require_login;
		this.boardname = hostname.split(".")[0];
		this.use_ssl = use_ssl;

		this.addMessageId = true;
		this.lastMessageId = 0;
		this.lastMessageTime = 0;
		this.messageQueue = [];
		this.messageTimeout = 5000;

		this.socket_retries = 0;
		this.retry_time = 0;
		this.last_heartbeat = 0;
		this.heartbeat_rate = 1000;
		this.ota_started = false;

		this.receivedMessageCount = 0;
		this.sentMessageCount = 0;
		this.lastReceivedMessageCount = 0;
		this.lastSentMessageCount = 0;
		this.lastMessageUpdateTime = Date.now();

	}

	start()
	{
		this._createWebsocket();
		this._sendQueue();
	}

	log(text)
	{
		console.log(`[${this.hostname}] ${text}`);
	}

	close()
	{
		this.closed = true;
		this.ws.close();
	}

	login(username, password)
	{
		return this.json({
			"cmd": "login",
			"user": username,
			"pass": password
		});
	}

	_sendQueue()
	{
		//are we ready to party?
		if (this.messageQueue.length && !this.closed && this.ws.readyState == ws.w3cwebsocket.OPEN)
		{
			//OTA is blocking... dont send messages
			if (this.ota_started)
			{
				this.log(`skipping due to ota`);
			}
			//are we waiting for a response?
			else if(this.addMessageId && this.lastMessageId)
			{
				//check for timeouts
				if (Date.now() - this.messageTimeout > this.lastMessageTime)
				{
					this.log(`message ${this.lastMessageId} timed out`);
					this.lastMessageId = 0;
					this.lastMessageTime = 0;
				}

				//this.log(`waiting on message ${this.lastMessageId}`);
			}
			else
			{
				try 
				{
					//FIFO
					let message = this.messageQueue.shift();

					//keep track of our messages?
					this.sentMessageCount++;
					if (this.addMessageId)
					{
						message.msgid = this.sentMessageCount;
						this.lastMessageId = message.msgid;
						this.lastMessageTime = Date.now();
					}

					//finally send it off.
					this.ws.send(JSON.stringify(message));
				} catch (error) {
					this.log(`Send error: ${error}`);
				}
			}
		}

		//keep calling the sender!
		setTimeout(this._sendQueue.bind(this), 1);
	}

	json(message, queue = true)
	{
		if (queue || this.messageQueue.length == 0)
		{
			this.messageQueue.push(message);
		}
		else
		{
			//this.log(this.messageQueue.length);			
		}
	}

	printMessageStats()
	{
		if (this.ws.readyState == ws.w3cwebsocket.OPEN && (!this.closed || Date.now() - this.last_heartbeat > this.heartbeat_rate * 3))
		{
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

	fadePWMChannel(id, duty, millis, queue = true)
	{
		return this.json({
            "cmd": "fade_pwm_channel",
            "id": id,
            "duty": duty,
            "millis": millis
        }, queue);
	}

	setPWMChannelState(id, state, queue = true)
	{
		return this.json({
			"cmd": "set_pwm_channel",
			"id": id,
			"state": state
		}, queue);
	}

	setPWMChannelDuty(id, duty, queue = true)
	{
		return this.json({
			"cmd": "set_pwm_channel",
			"id": id,
			"duty": duty
		}, queue);
	}

	togglePWMChannel(id, queue = true)
	{
		return this.json({
            "cmd": "toggle_pwm_channel",
            "id": id
        }, queue);
	}

	setRGB(id, red = 0, green = 0, blue = 0, queue = true)
	{
		return this.json({
			"cmd": "set_rgb",
			"id": id,
			"red": red,
			"green": green,
			"blue": blue,
		}, queue);
	}

	onopen(event) {}

	onmessage(message, event) {
		//this.log(JSON.stringify(message));
	}

	onerror(event) {}
	
	onclose(event) {}

	_createWebsocket()
	{
		//encrypt?
		var protocol = "ws://";
		if (this.use_ssl)
			protocol = "wss://";

		//okay, connect
		this.ws = new ws.w3cwebsocket(`${protocol}${this.hostname}/ws`);
		this.ws.onopen = this._onopen.bind(this);
		this.ws.onerror = this._onerror.bind(this);
		this.ws.onclose = this._onclose.bind(this);
		this.ws.onmessage = this._onmessage.bind(this);
	}

	_onopen(event)
	{
		this.log(`Connected`);

		//we are connected, reload
		this.closed = false;
		this.socket_retries = 0;
		this.retry_time = 0;
		this.last_heartbeat = Date.now();
		this.ota_started = false;
		this.lastMessageId = 0;
		this.lastMessageTime = 0;
		this.messageQueue = [];

		//our connection watcher
		setTimeout(this._sendHeartbeat.bind(this), this.heartbeat_rate);

		//handle login
		if (this.require_login)
			this.login(this.username, this.password);

		//load our config
		//this.json({"cmd": "get_config"});

		//our callback
		this.onopen(event);
	}

	_onerror(event)
	{
		this.log(`Connection error:`);

		this.onerror(event);
	}

	_onclose(event) {
		this.log(`Connection closed`);

		this.onclose(event);
	}

	_onmessage(event)
	{
		this.receivedMessageCount++;

		if (typeof event.data === 'string') {
			try {
				let data = JSON.parse(event.data);

				this.last_heartbeat = Date.now();

				//mark the message as received
				if (this.addMessageId && data.msgid == this.lastMessageId)
					this.lastMessageId = 0;

				if (data.status == "error")
					this.log(`Error: ${data.message}`);
				if (data.status == "success")
					this.log(`Success: ${data.message}`);

				//are we doing an OTA?
				if (data.msg == "ota_progress")
				{
					this.ota_started = true;

					//restart our socket when finished
					if (data.progress == 100)
					{
						this.close();
						this.start();
					}
				}

				//this is our heartbeat reply, ignore
				if (data.pong) 
					true;
				else
					this.onmessage(data, event);
			}
			catch (error)
			{
				this.log(`Message error: ${error}`);
			}
		}
	}

	_sendHeartbeat()
	{
		//bail if we're done.
		if (this.closed)
		{
			return;
		}

		//did we not get a heartbeat?
		if (Date.now() - this.last_heartbeat > this.heartbeat_rate * 3)
		{
			this.log(`Missed heartbeat`)
			this.ws.close();
			this._retryConnection();
		}

		//only send it if we're already open.
		if (this.ws.readyState == ws.w3cwebsocket.OPEN)
		{
			this.json({"cmd": "ping"}, false);
			setTimeout(this._sendHeartbeat.bind(this), this.heartbeat_rate);
		}
		else if (this.ws.readyState == ws.w3cwebsocket.CLOSING)
		{
			this.log(`closing`);
			this._retryConnection();
		}
		else if (this.ws.readyState == ws.w3cwebsocket.CLOSED)
		{
			this._retryConnection();
		}
	}

	_retryConnection()
	{
		//bail if we're done.
		if (this.closed)
		{
			console.log(`Connection closed`);
			return;
		}

		//bail if its good to go
		if (this.ws.readyState == ws.w3cwebsocket.OPEN)
		{
			return;
		}

		//keep watching if we are connecting
		if (this.ws.readyState == ws.w3cwebsocket.CONNECTING)
		{
			console.log(`waiting for connection`);

			this.retry_time++;

			//tee it up.
			setTimeout(this._retryConnection.bind(this), 1000);

			return;
		}

		//keep track of stuff.
		this.retry_time = 0;
		this.socket_retries++;

		//reconnect!
		this._createWebsocket();

		//set some bounds
		let my_timeout = 500;
		my_timeout = Math.max(my_timeout, this.socket_retries * this.heartbeat_rate);
		my_timeout = Math.min(my_timeout, 60000);

		//tee it up.
		this.log(`Reconnecting in ${my_timeout}ms. Try #${this.socket_retries}`);
		setTimeout(this._retryConnection.bind(this), my_timeout);
	}
}
YarrboardClient.version = packageJSON.version;

module.exports = YarrboardClient;