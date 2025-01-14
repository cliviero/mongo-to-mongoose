#!/usr/bin/env node

const commander = require('commander');
const clipboardy = require('clipboardy').default;
const { MongoClient } = require('mongodb');

function inferType(value) {
  if (typeof value === 'boolean') {
    return "Boolean";
  }
  if (typeof value === 'number' || value._bsontype === 'Decimal128') {
    return "Number";
  }
  if (value instanceof Date) {
    return "Date";
  }
  const valueAsDate = new Date(value);
  if (valueAsDate instanceof Date && !isNaN(valueAsDate.getTime()) && typeof value === 'string' && !/^\d+$/.test(value)) {
    return "Date";
  }
  if (typeof value === 'string' || value._bsontype === 'ObjectId') {
    return "String";
  }
  throw new Error(`Unsupported type of: ${value}`);
}

function updateFlatMap(doc, flatMap = {}, path = '') {
  Object.keys(doc).forEach((key) => {
    const currentPath = path ? `${path}.${key}` : key;
    const value = doc[key];

    try {
      flatMap[currentPath] = flatMap[currentPath] || inferType(value);
    } catch (error) {
      if (typeof value === 'object' && !Array.isArray(value)) {
        updateFlatMap(value, flatMap, currentPath);
      } else if (Array.isArray(value)) {
        if (value.length > 0) {
          if (typeof value[0] === 'object' && !Array.isArray(value[0])) {
            updateFlatMap(value[0], flatMap, currentPath + '.$');
          } else {
            flatMap[currentPath + '.$'] = flatMap[currentPath] || inferType(value[0]);
          }
        } else {
          flatMap[currentPath] = ["mongoose.Schema.Types.Mixed"];
        }
      } else {
        console.error(error.message);
      }
    }
  });

  return flatMap;
}

function flatMapToSchema(flatMap) {
  const schema = {};

  Object.keys(flatMap).forEach((path) => {
    const keys = path.split('.');
    let current = schema;

    for (let index = 0; index < keys.length; index++) {
      const key = keys[index];
      const nextKey = keys[index + 1];
      const isLastKey = index === keys.length - 1;

      if (nextKey === '$') {
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

function flatMapToMongooseJSONSchema(flatMap, indent = 2, typeKey = null) {
  function isValidKey(key) {
    return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key);
  }

  function stringifyHelper(value, currentIndent) {
    if (Array.isArray(value)) {
      return `[\n${value.map(item => ' '.repeat(currentIndent + indent) + stringifyHelper(item, currentIndent + indent)).join(',\n')}\n${' '.repeat(currentIndent)}]`;
    } else if (typeof value === 'object' && value !== null) {
      return `{\n${Object.entries(value)
        .map(([key, val]) => {
          const formattedKey = isValidKey(key) ? key : `"${key}"`;
          return ' '.repeat(currentIndent + indent) + `${formattedKey}: ${stringifyHelper(val, currentIndent + indent)}`;
        })
        .join(',\n')}\n${' '.repeat(currentIndent)}}`;
    } else if (typeof value === 'string') {
      switch (value) {
        case 'String':
        case 'Date':
        case 'Number':
        case 'Boolean':
          return typeKey ? `{ ${typeKey}: ${value} }` : value;
        default:
          return `"${value}"`;
      }
    }
    return value;
  }

  const schema = flatMapToSchema(flatMap);
  return stringifyHelper(schema, 0);
}

async function generateSchemaFromMongo(connectionUrl, collectionName, copyToClipboard, typeKey, sampleSize) {
  try {
    const client = await MongoClient.connect(connectionUrl);
    const db = client.db();
    const collection = db.collection(collectionName);

    let flatMap = {};

    console.log(`Starting schema generation...`);

    const stream = sampleSize
      ? collection.aggregate([{ $sample: { size: sampleSize } }]).stream()
      : collection.find().stream();

    for await (const doc of stream) {
      updateFlatMap(doc, flatMap);
    }

    if (Object.keys(flatMap).length === 0) {
      console.log('No records found.');
      return;
    }

    const typeKeyOption = typeKey ? `, { typeKey: '${typeKey}' }` : '';
    const schema = `const mongoose = require('mongoose');\n\n` +
      `const schema = new mongoose.Schema(${flatMapToMongooseJSONSchema(flatMap, 2, typeKey)}${typeKeyOption});\n\n` +
      `module.exports = mongoose.model('${collectionName}', schema);`;

    console.log(`\n\n${schema}`);

    if (copyToClipboard) {
      await clipboardy.write(schema);
      console.log('\n\nSchema copied to clipboard.');
    }

    client.close();
  } catch (error) {
    console.error('Error generating schema:', error);
  }
}

const program = new commander.Command();

program
  .version('1.0.0')
  .description('CLI tool to generate Mongoose schema from MongoDB collection using streaming')
  .requiredOption('-u, --url <url>', 'MongoDB connection URL')
  .requiredOption('-c, --collection <collection>', 'MongoDB collection name')
  .option('-cp, --copy', 'Copy schema to clipboard')
  .option('-t, --typeKey <typeKey>', 'Specify a custom typeKey for Mongoose schema')
  .option('-s, --sampleSize <sampleSize>', 'Number of documents to sample for schema generation', parseInt)
  .action((options) => {
    generateSchemaFromMongo(options.url, options.collection, options.copy, options.typeKey, options.sampleSize);
  });

program.parse(process.argv);
