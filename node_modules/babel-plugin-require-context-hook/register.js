function context(
	basedir,
	directory,
	useSubdirectories = false,
	regExp = /^\.\//
) {
	const path = require('path');
	const fs = require('fs');

	function enumerateFiles(basedir, dir) {
		let result = [];
		fs.readdirSync(path.join(basedir, dir)).forEach(function(file) {
			const relativePath = dir + '/' + file;
			const stats = fs.lstatSync(path.join(basedir, relativePath));
			if (stats.isDirectory()) {
				if (useSubdirectories) {
					result = result.concat(enumerateFiles(basedir, relativePath));
				}
			} else if (regExp.test(relativePath)) {
				result.push(relativePath);
			}
		});
		return result;
	}

	const absoluteDirectory = path.resolve(basedir, directory);
	const keys = enumerateFiles(absoluteDirectory, '.');

	function requireContext(key) {
		if (!keys.includes(key)) {
			throw new Error(`Cannot find module '${key}'.`);
		}
		const fullKey = require('path').resolve(absoluteDirectory, key);
		return require(fullKey);
	}

	requireContext.keys = () => keys;

	return requireContext;
}

module.exports = function register() {
	global.__requireContext = context;
};
