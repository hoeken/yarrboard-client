import ws from 'websocket';

export default class YarrboardClient
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

	doLogin(username, password)
	{
		this.json({
			"cmd": "login",
			"user": username,
			"pass": password
		});
	}

	json(message)
	{
		if (this.ws.readyState == ws.w3cwebsocket.OPEN) {
			try {
				//this.log(message.cmd);
				this.ws.send(JSON.stringify(message));
			} catch (error) {
				this.log(`Send error: ${error}`);
			}
		}
	}

	onopen(event) {console.log("sdfsd");}

	onmessage(message, event) {
		this.log(JSON.stringify(message));
	}

	onerror(event) {return true;}
	
	onclose(event) {return true;}

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
		this.socket_retries = 0;
		this.retry_time = 0;
		this.last_heartbeat = Date.now();

		//our connection watcher
		setTimeout(this._sendHeartbeat.bind(this), 1000);

		if (this.require_login)
			this.doLogin("admin", "admin");

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
		if (typeof event.data === 'string') {
			try {
				let data = JSON.parse(event.data);

				this.last_heartbeat = Date.now();

				if (data.status == "error")
					this.log(`Error: ${data.message}`);
				if (data.status == "success")
					this.log(`Success: ${data.message}`);

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
		if (Date.now() - this.last_heartbeat > 1000 * 2)
		{
			this.log(`Missed heartbeat`)
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
		my_timeout = Math.max(my_timeout, this.socket_retries * 1000);
		my_timeout = Math.min(my_timeout, 60000);

		//tee it up.
		setTimeout(this._retryConnection.bind(this), my_timeout);
	}
}