const assert = require('assert');

const requireA = require.context('./a', false, /\.js$/);
assert.deepEqual(
	requireA.keys().map(key => requireA(key)),
	['a']
);

const requireAB = require.context('./a', true, /\.js$/);
assert.deepEqual(
	requireAB.keys().map(key => requireAB(key)),
	['a', 'b']
);

console.log('OK');
