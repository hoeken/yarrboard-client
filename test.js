#!/usr/bin/env node
const YarrboardClient = require('./index.js');

let yb = new YarrboardClient();

yb.onopen = function (event) {this.log("onconnect");}
yb.onerror = function (event) {this.log("onerror");};
yb.onclose = function (event) {this.log("onclose");};
yb.onmessage = function (message) {this.log(message.msg);};

yb.start();
//yb.close();