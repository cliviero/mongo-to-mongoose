#!/usr/bin/env node

import { Command } from 'commander';
import { MongoClient } from 'mongodb';
import { readFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { flatten } from './custom-flat.js';
import { unflatten } from 'flat';
import stringifyObject from 'stringify-object';

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
  if (typeof value === 'string') {
    return "String";
  }
  if (value._bsontype === 'ObjectId') {
    return "Schema.Types.ObjectId";
  }
  throw new Error(`Unsupported type of: ${value}`);
}

function mergeTypes(existingType, newType) {
  if (!existingType) return newType;
  if (existingType === newType) return existingType;
  return "Schema.Types.Mixed";
}

function updateFlatMap(doc, flatMap = {}, typeKey = 'type') {
  const flattened = flatten(doc, { 
    // Custom option to avoid flattening certain MongoDB types
    shouldFlatten: (value) => {
      if (value && typeof value === 'object' && (value._bsontype || value instanceof Date)) {
        return false;
      }
      return true;
    }
  });

  for (const [key, value] of Object.entries(flattened)) {
    // Normalize any numeric index in the path to '0' to merge types of all array elements
    let normalizedKey = key.replace(/\.\d+(\.|$)/g, '.0$1');

    // Handle 'type' field name collision with Mongoose or custom typeKey usage
    if (typeKey !== 'type') {
      normalizedKey += `.${typeKey}`;
    } else if (normalizedKey === 'type' || normalizedKey.endsWith('.type')) {
      normalizedKey += '.type';
    }

    try {
      flatMap[normalizedKey] = mergeTypes(flatMap[normalizedKey], inferType(value));
    } catch (error) {
      console.error('Error updating flatMap:', error.message);
    }
  }

  return flatMap;
}



async function generateSchemaFromMongo(connectionUrl, collectionName, dbName, typeKey, sampleSize) {
  const client = new MongoClient(connectionUrl);
  try {
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection(collectionName);
    const cursor = sampleSize
      ? collection.aggregate([{ $sample: { size: sampleSize } }])
      : collection.find();

    if (!(await cursor.hasNext())) {
      console.log('Collection is empty. No schema generated.');
      return;
    }

    let flatMap = {};
    for await (const doc of cursor) {
      flatMap = updateFlatMap(doc, flatMap, typeKey);
    }

    const json = unflatten(flatMap);
    const schema = stringifyObject(json, { 
      indent: '  ', 
      transform: (object, property, originalResult) => {
        const value = object[property];
        if (typeof value === 'string') {
          return value;
        }
        return originalResult;
      }
    });

    console.log(schema);
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
