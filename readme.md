# yarrboard-client

Client for connecting to a [Yarrboard](https://github.com/hoeken/yarrboard) 

## Install

```sh
npm install yarrboard-client
```

## Usage

```js
const YarrboardClient = require('yarrboard-client');

yb = new YarrboardClient(options.host, options.user, options.pass, options.login);
setTimeout(yb.printMessageStats.bind(yb), 1000);    

yb.onopen = function () {
  yb.json({"cmd":"toggle_channel","id": 0});
}

yb.onmessage = function (msg) {
  if (msg.msgid)
    this.log(msg.msgid);
}

yb.start();
```
