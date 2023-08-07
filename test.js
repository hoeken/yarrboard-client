import YarrboardClient from './index.js';

let yb = new YarrboardClient();

yb.log("hello");
yb.handleMessage = function (message) {
    this.log(message.msg);
}
yb.start();