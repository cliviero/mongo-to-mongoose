export default function stringifyObject(schema, options = {}) {
  const { indent = '  ' } = options

  function isValidKey(key) {
    return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key);
  }

  function stringifyHelper(value, currentIndent) {
    if (Array.isArray(value)) {
      const nextIndent = currentIndent + indent;
      return `[\n${value.map(item => nextIndent + stringifyHelper(item, nextIndent)).join(',\n')}\n${currentIndent}]`;
    } else if (typeof value === 'object' && value !== null) {
      const nextIndent = currentIndent + indent;
      return `{\n${Object.entries(value)
        .map(([key, val]) => {
          const formattedKey = isValidKey(key) ? key : `"${key}"`;
          return nextIndent + `${formattedKey}: ${stringifyHelper(val, nextIndent)}`;
        })
        .join(',\n')}\n${currentIndent}}`;
    } 
    return value;
  }

  return stringifyHelper(schema, '');
}
