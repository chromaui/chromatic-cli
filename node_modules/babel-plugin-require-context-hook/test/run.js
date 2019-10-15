require('babel-register')({
	plugins: [ require('../index') ]
});
require('../register')();
require('./test');
