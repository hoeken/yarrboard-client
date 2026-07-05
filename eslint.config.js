const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
	js.configs.recommended,
	{
		languageOptions: {
			ecmaVersion: 'latest',
			sourceType: 'commonjs',
			globals: {
				...globals.node,
			},
		},
		rules: {
			// The client defines callback hooks (onopen, onmessage, ...) whose
			// signatures are part of the public API even when unused here.
			'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
		},
	},
];
