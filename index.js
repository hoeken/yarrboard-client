const ws = require('websocket');

class YarrboardClient
{
	constructor(hostname="yarrboard.local", username="admin", password="admin", require_login = true)
	{
		this.config = false;
		this.closed = false;
	
		this.hostname = hostname;
		this.username = username;
		this.password = password;
		this.require_login = require_login;
		this.boardname = hostname.split(".")[0];

		this.addMessageId = false;

		this.socket_retries = 0;
		this.retry_time = 0;
		this.last_heartbeat = 0;
		this.heartbeat_rate = 1000;

		this.receivedMessageCount = 0;
		this.sentMessageCount = 0;
		this.lastReceivedMessageCount = 0;
		this.lastSentMessageCount = 0;
		this.lastMessageUpdateTime = Date.now();

		this.throttleTime = Date.now();
	}

	start()
	{
		this._createWebsocket();
	}

	log(text)
	{
		console.log(`[${this.hostname}] ${text}`);
	}

	close() {
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

	json(message)
	{
		//if we're throttled, skip this message
		if (this.throttleTime > Date.now())
		{
			let delta = this.throttleTime - Date.now();
			this.log(`throttled ${delta}ms`);
		}
		//only send it if we're not closed.
		else if (!this.closed)
		{
			if (this.ws.readyState == ws.w3cwebsocket.OPEN)
			{
				try {
					//keep track of our messages?
					this.sentMessageCount++;
					if (this.addMessageId)
						message.msgid = this.sentMessageCount;

					//this.log(message.cmd);
					this.ws.send(JSON.stringify(message));

					//send them back their message if it was a success
					return message;
				} catch (error) {
					this.log(`Send error: ${error}`);
				}
			}
		}

		return false;
	}

	printMessageStats()
	{
		let delta = Date.now() - this.lastMessageUpdateTime;
		let rmps = Math.round(((this.receivedMessageCount - this.lastReceivedMessageCount) / delta) * 1000);
		let smps = Math.round(((this.sentMessageCount - this.lastSentMessageCount) / delta) * 1000);

		this.log(`Recd m/s: ${rmps} | Sent m/s: ${smps} | Total Received/Sent: ${this.receivedMessageCount} / ${this.sentMessageCount}`);

		this.lastMessageUpdateTime = Date.now();
		this.lastSentMessageCount = this.sentMessageCount;
		this.lastReceivedMessageCount = this.receivedMessageCount;

		setTimeout(this.printMessageStats.bind(this), 1000);
	}

	fadeChannel(id, duty, millis)
	{
		return this.json({
            "cmd": "fade_channel",
            "id": id,
            "duty": duty,
            "millis": millis
        });
	}

	setChannelState(id, state)
	{
		return this.json({
			"cmd": "set_channel",
			"id": id,
			"state": state
		});
	}

	setChannelDuty(id, duty)
	{
		return this.json({
			"cmd": "set_channel",
			"id": id,
			"duty": duty
		});
	}

	toggleChannel(id)
	{
		return this.json({
            "cmd": "toggle_channel",
            "id": id
        });
	}

	onopen(event) {}

	onmessage(message, event) {
		this.log(JSON.stringify(message));
	}

	onerror(event) {}
	
	onclose(event) {}

	_createWebsocket()
	{
		this.ws = new ws.w3cwebsocket(`ws://${this.hostname}/ws`);
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

		//our connection watcher
		setTimeout(this._sendHeartbeat.bind(this), this.heartbeat_rate);

		if (this.require_login)
			this.login("admin", "admin");

		//load our config
		this.json({"cmd": "get_config"});

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

				if (data.status == "error")
					this.log(`Error: ${data.message}`);
				if (data.status == "success")
					this.log(`Success: ${data.message}`);

				if (data.status == "error" && data.message == "Websocket busy, throttle connection.")
				{
					//okay are we throttled already?
					let delta = this.throttleTime - Date.now();
					if (delta > 50)
						delta = delta * 1.5;
					else
						delta = 50;
		
					//maximum throttle 5s
					delta = Math.min(5000, delta);
					this.log(`Throttling: ${delta}ms`);
		
					//okay set our time
					this.throttleTime = Date.now() + delta;
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
			return;

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
			this.json({"cmd": "ping"});
			setTimeout(this._sendHeartbeat.bind(this), this.heartbeat_rate);
		}
		else if (this.ws.readyState == ws.w3cwebsocket.CLOSING)
		{
			this.log(`closing`);
			this._retryConnection();
		}
		else if (this.ws.readyState == ws.w3cwebsocket.CLOSED)
		{
			this.log(`closed`);
			this._retryConnection();
		}
	}

	_retryConnection()
	{
		//bail if we're done.
		if (this.closed)
			return;

		//bail if its good to go
		if (this.ws.readyState == ws.w3cwebsocket.OPEN)
			return;

		//keep watching if we are connecting
		if (this.ws.readyState == ws.w3cwebsocket.CONNECTING)
		{
			this.retry_time++;

			//tee it up.
			setTimeout(this._retryConnection.bind(this), 1000);

			return;
		}

		//keep track of stuff.
		this.retry_time = 0;
		this.socket_retries++;
		this.log(`Reconnecting... ${this.socket_retries}`);

		//reconnect!
		this._createWebsocket();

		//set some bounds
		let my_timeout = 500;
		my_timeout = Math.max(my_timeout, this.socket_retries * this.heartbeat_rate);
		my_timeout = Math.min(my_timeout, 60000);

		//tee it up.
		setTimeout(this._retryConnection.bind(this), my_timeout);
	}
}

module.exports = YarrboardClient;