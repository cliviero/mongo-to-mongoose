#!/usr/bin/env node

import { Command } from 'commander';
import { MongoClient } from 'mongodb';
import { readFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// Get the directory name of the current module
const __dirname = dirname(fileURLToPath(import.meta.url));

// Read package.json to get version
const packageJson = JSON.parse(await readFile(join(__dirname, 'package.json'), 'utf-8'));

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
  if (valueAsDate instanceof Date && !isNaN(valueAsDate.getTime()) && typeof value === 'string' && !/^\d[\d\s]*$/.test(value)) {
    return "Date";
  }
  if (typeof value === 'string' || value._bsontype === 'ObjectId') {
    return "String";
  }
  throw new Error(`Unsupported type of: ${value}`);
}

function mergeTypes(existingType, newType) {
  if (!existingType) return newType;
  if (existingType === newType) return existingType;
  return "mongoose.Schema.Types.Mixed";
}

function updateFlatMap(doc, flatMap = {}, path = '') {
  for (const key in doc) {
    const currentPath = path ? `${path}.${key}` : key;
    const value = doc[key];

    try {
      flatMap[currentPath] = mergeTypes(flatMap[currentPath], inferType(value));
    } catch (error) {
      if (typeof value === 'object' && !Array.isArray(value)) {
        updateFlatMap(value, flatMap, currentPath);
      } else if (Array.isArray(value)) {
        if (value.length > 0) {
          if (typeof value[0] === 'object' && !Array.isArray(value[0])) {
            updateFlatMap(value[0], flatMap, currentPath + '.$');
          } else {
            flatMap[currentPath + '.$'] = mergeTypes(flatMap[currentPath + '.$'], inferType(value[0]));
          }
        }
      } else {
        console.error(error.message);
      }
    }
  }

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

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

async function generateSchemaFromMongo(connectionUrl, collectionName, dbName, typeKey, sampleSize) {
  const client = new MongoClient(connectionUrl);
  try {
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection(collectionName);
    const count = await collection.countDocuments();

    if (count === 0) {
      console.log('Collection is empty. No schema generated.');
      return;
    }

    const cursor = sampleSize
      ? collection.aggregate([{ $sample: { size: sampleSize } }])
      : collection.find();

    let flatMap = {};
    for await (const doc of cursor) {
      flatMap = updateFlatMap(doc, flatMap);
    }

    const schema = flatMapToSchema(flatMap);
    const mongooseSchema = flatMapToMongooseJSONSchema(schema, 2, typeKey);
    console.log(mongooseSchema);
  } finally {
    await client.close();
  }
}

const program = new Command();

program
  .name('mongo-to-mongoose')
  .description('Generate Mongoose schemas from MongoDB collections')
  .version(packageJson.version);

program
  .requiredOption('-u, --url <url>', 'MongoDB connection URL')
  .requiredOption('-c, --collection <collection>', 'MongoDB collection name')
  .option('-d, --dbName <dbName>', 'MongoDB database name')
  .option('-t, --typeKey <typeKey>', 'Custom typeKey for Mongoose schema')
  .option('-s, --sampleSize <sampleSize>', 'Number of documents to sample', parseInt)
  .action(async (options) => {
    try {
      await generateSchemaFromMongo(
        options.url,
        options.collection,
        options.dbName,
        options.typeKey,
        options.sampleSize
      );
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

program.parse();
