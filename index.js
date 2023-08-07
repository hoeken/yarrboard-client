import ws from 'websocket';

export default function YarrboardClient(hostname="yarrboard.local", username="admin", password="admin", require_login = true)
{
	this.config = false;
	this.closed = false;

	this.hostname = hostname;
	this.username = username;
	this.password = password;
	this.require_login = require_login;

	this.boardname = hostname.split(".")[0];
}

YarrboardClient.prototype = {
	start : function ()
	{
		this._createWebsocket();
	},

	log : function (text)
	{
		console.log(text);
	},

	handleMessage : function (message) {
		this.log(message);
	},

	close : function () {
		this.closed = true;
		this.ws.close();
	},

	doLogin : function (username, password)
	{
		this.json({
			"cmd": "login",
			"user": username,
			"pass": password
		});
	},

	json : function (message)
	{
		if (this.ws.readyState == ws.w3cwebsocket.OPEN) {
			try {
				//this.log(message.cmd);
				this.ws.send(JSON.stringify(message));
			} catch (error) {
				this.log(`[${this.hostname}] Send error: ${error}`);
			}
		}
	},

	_createWebsocket : function ()
	{
		this.ws = new ws.w3cwebsocket(`ws://${this.hostname}/ws`);
		this.ws.onopen = this._onopen.bind(this);
		this.ws.onerror = this._onerror.bind(this);
		this.ws.onclose = this._onclose.bind(this);
		this.ws.onmessage = this._onmessage.bind(this);
	},

	_onerror : function ()
	{
		this.log(`[${this.hostname}] Connection error`);
	},

	_onopen : function ()
	{
		this.log(`[${this.hostname}] Connected`);

		//we are connected, reload
		this.socket_retries = 0;
		this.retry_time = 0;
		this.last_heartbeat = Date.now();

		//our connection watcher
		setTimeout(this._sendHeartbeat.bind(this), 1000);

		if (this.require_login)
			this.doLogin("admin", "admin");

		//load our config
		this.json({"cmd": "get_config"});
	},

	_onclose : function () {
		this.log(`[${this.hostname}] Connection closed`);
	},

	_onmessage : function (message)
	{
		if (typeof message.data === 'string') {
			try {
				let data = JSON.parse(message.data);

				this.last_heartbeat = Date.now();

				if (data.status == "error")
					this.log(`[${this.hostname}] Error: ${data.message}`);
				if (data.status == "success")
					this.log(`[${this.hostname}] Success: ${data.message}`);

				//this is our heartbeat reply, ignore
				if (data.pong) 
					true;
				else
					this.handleMessage(data);
			}
			catch (error)
			{
				this.log(`[${this.hostname}] Message error: ${error}`);
				//this.log(message);
			}
		}
	},

	_sendHeartbeat : function ()
	{
		//bail if we're done.
		if (this.closed)
			return;

		//did we not get a heartbeat?
		if (Date.now() - this.last_heartbeat > 1000 * 2)
		{
			this.log(`[${this.hostname}] Missed heartbeat`)
			this.ws.close();
			this._retryConnection();
		}

		//only send it if we're already open.
		if (this.ws.readyState == ws.w3cwebsocket.OPEN)
		{
			this.json({"cmd": "ping"});
			setTimeout(this._sendHeartbeat.bind(this), 1000);
		}
		else if (this.ws.readyState == ws.w3cwebsocket.CLOSING)
		{
			this.log(`[${this.hostname}] closing`);
			this._retryConnection();
		}
		else if (this.ws.readyState == ws.w3cwebsocket.CLOSED)
		{
			this.log(`[${this.hostname}] closed`);
			this._retryConnection();
		}
	},

	_retryConnection : function ()
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
		this.log(`[${this.hostname}] Reconnecting... ${this.socket_retries}`);

		//reconnect!
		this._createWebsocket();

		//set some bounds
		let my_timeout = 500;
		my_timeout = Math.max(my_timeout, this.socket_retries * 1000);
		my_timeout = Math.min(my_timeout, 60000);

		//tee it up.
		setTimeout(this._retryConnection.bind(this), my_timeout);
	},
}