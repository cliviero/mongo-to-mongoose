function isBuffer(obj) {
  return obj && obj.constructor && obj.constructor.isBuffer && obj.constructor.isBuffer(obj)
}

export function flatten(target, opts) {
  opts = opts || {}
  const output = {}

  function step(object, prev) {
    Object.keys(object).forEach(function(key) {
      const value = object[key]
      const type = Object.prototype.toString.call(value)
      const isbuffer = isBuffer(value)
      const isobject = (
        type === '[object Object]' ||
        type === '[object Array]'
      )

      const newKey = prev
        ? prev + '.' + key
        : key

      if (opts.shouldFlatten && !opts.shouldFlatten(value)) {
        output[newKey] = value
        return
      }

      if (!isbuffer && isobject && Object.keys(value).length) {
        return step(value, newKey)
      }

      output[newKey] = value
    })
  }

  step(target)

  return output
}

export function unflatten(flatMap) {
  const schema = {};

  Object.keys(flatMap).forEach((path) => {
    const keys = path.split('.');
    let current = schema;

    for (let index = 0; index < keys.length; index++) {
      const key = keys[index];
      const nextKey = keys[index + 1];
      const isLastKey = index === keys.length - 1;

      if (nextKey === '0') {
        if (index + 1 === keys.length - 1) {
          current[key] = [flatMap[path]];
          break;
        } else {
          if (!current[key]) {
            current[key] = [{}];
          }
          current = current[key][0];
          index++;
        }
      } else if (isLastKey) {
        current[key] = flatMap[path];
      } else {
        if (!current[key]) {
          current[key] = {};
        }
        current = current[key];
      }
    }
  });

  return schema;
}
