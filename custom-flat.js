/**
 * This software contains code derived from the 'flat' library:
 * Copyright (c) 2014, Hugh Kennedy
 * Licensed under BSD 3-Clause License
 * SPDX-License-Identifier: BSD-3-Clause
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

      if (opts.safeTransform) {
        const mappedValue = opts.safeTransform(value, newKey);
        if (mappedValue !== undefined) {
          output[newKey] = mappedValue;
          return;
        }
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
