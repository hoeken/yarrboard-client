#!/usr/bin/env node
const YarrboardClient = require('../');
const mocha = require('mocha');

describe('YarrboardClient()', function () {
    it('create our object without error', function (done) {
        let yb = new YarrboardClient();
        done();
    });
});