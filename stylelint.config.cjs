const VAR_PATTERN = /^var\(--.*\)$/;
const CONTAINS_VAR_PATTERN = /var\(--.*\)/;
const LINEAR_GRADIENT_PATTERN = /^linear-gradient\(/;

module.exports = {
  ignoreFiles: ['css/tailwind.generated.css'],
  rules: {
    'at-rule-no-unknown': [true, { ignoreAtRules: ['tailwind', 'layer', 'apply'] }],
    'import-notation': 'string',
    'color-no-hex': true,
    'declaration-property-value-allowed-list': {
      color: [VAR_PATTERN, 'inherit', 'currentColor'],
      'background-color': [VAR_PATTERN, 'transparent', 'inherit'],
      background: [VAR_PATTERN, CONTAINS_VAR_PATTERN, LINEAR_GRADIENT_PATTERN, 'none', 'transparent'],
      'border-color': [VAR_PATTERN, CONTAINS_VAR_PATTERN, 'transparent', 'inherit', 'currentColor'],
      'outline-color': [VAR_PATTERN, 'transparent', 'inherit', 'currentColor'],
      fill: [VAR_PATTERN, 'none', 'currentColor', 'inherit'],
      stroke: [VAR_PATTERN, 'none', 'currentColor', 'inherit'],
      'box-shadow': [VAR_PATTERN, CONTAINS_VAR_PATTERN, 'none']
    }
  }
};
