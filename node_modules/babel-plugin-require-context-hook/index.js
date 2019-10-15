module.exports = ({ types: t }) => {
	return {
		name: 'require-context',
		visitor: {
			CallExpression: path => {
				if (
					t.isMemberExpression(path.node.callee, { computed: false }) &&
					t.isIdentifier(path.get('callee').node.object, { name: 'require' }) &&
					t.isIdentifier(path.get('callee').node.property, { name: 'context' })
				) {
					path.replaceWith(
						t.callExpression(t.identifier('__requireContext'), [
							t.identifier('__dirname'),
							...path.node.arguments
						])
					);
				}
			}
		}
	};
};
