/**
 * Original code from 'flat' library
 * Copyright (c) 2014, Hugh Kennedy
 * All rights reserved.
 * 
 * Modified by Cristian Liviero to support custom flattening logic.
 * 
 * Redistribution and use in source and binary forms, with or without modification,
 * are permitted provided that the following conditions are met:
 * 
 * 1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
 * 3. Neither the name of the nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.
 */

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
