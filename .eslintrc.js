module.exports = {
	root: true,
	env: {
		browser: true,
		node: true,
	},
	parserOptions: {
		parser: 'babel-eslint',
		ecmaVersion: 11,
	},
	extends: [
		// 'plugin:vue/recommended',
		// 'plugin:prettier/recommended',
	],
	// required to lint *.vue files
	plugins: [
		// 'vue',
		// 'prettier',
	],
	// add your custom rules here
	rules: {
		'prettier/prettier': 'off',
		'no-console': process.env.NODE_ENV === 'production' ? 'off' : 'off',
		'no-debugger': process.env.NODE_ENV === 'production' ? 'off' : 'off',
		'arrow-parens': ['off', 'as-needed'],
		'generator-star-spacing': ['off', 'before'],
		'indent': ['off', 'tab'],
		'no-tabs': ['off', {
			'allowIndentationTabs': true
		}],
		'spaced-comment': ['off', 'never'],
		'space-before-function-paren': ['off', 'never'],
		'semi': ['off', 'always'],
		'vue/html-indent': ['off', 'tab'],
		'vue/script-indent': ['off', 'tab', {
			'baseIndent': 1
		}],
		'vue/attributes-order': ['off'],
		'vue/mustache-interpolation-spacing': ['off', 'never'],
		'vue/require-prop-types': ['off'],
		'vue/require-default-prop': ['off'],
		'vue/max-attributes-per-line': ['off', {
			'singleline': 1,
			'multiline': {
				'max': 1,
				'allowFirstLine': false
			}
		}]
	},
};
