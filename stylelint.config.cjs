module.exports = {
  ignoreFiles: ['css/tailwind.generated.css', 'css/style.css'],
  rules: {
    'at-rule-no-unknown': [true, { ignoreAtRules: ['tailwind', 'layer', 'apply'] }],
    'import-notation': 'string',
    'color-no-hex': true,
    'declaration-property-value-allowed-list': {
      color: ['var\(--.*\)', 'inherit', 'currentColor'],
      'background-color': ['var\(--.*\)', 'transparent', 'inherit'],
      background: ['var\(--.*\)', 'none', 'transparent'],
      'border-color': ['var\(--.*\)', 'transparent', 'inherit', 'currentColor'],
      'outline-color': ['var\(--.*\)', 'transparent', 'inherit', 'currentColor'],
      fill: ['var\(--.*\)', 'none', 'currentColor', 'inherit'],
      stroke: ['var\(--.*\)', 'none', 'currentColor', 'inherit'],
      'box-shadow': ['var\(--.*\)', 'none']
    }
  }
};
