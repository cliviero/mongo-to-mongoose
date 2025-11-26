#!/usr/bin/env node

import { Command } from 'commander';
import { unflatten } from 'flat';
import { readFile } from 'fs/promises';
import { MongoClient } from 'mongodb';
import { dirname, join } from 'path';
import stringifyObject from 'stringify-object';
import { fileURLToPath } from 'url';
import { flatten } from './custom-flat.js';

// Get the directory name of the current module
const __dirname = dirname(fileURLToPath(import.meta.url));

// Read package.json to get version
const packageJson = JSON.parse(await readFile(join(__dirname, 'package.json'), 'utf-8'));

const BsonToMongooseTypeMap = {
  String: 'String',
  Number: 'Number',
  Date: 'Date',
  Binary: 'Buffer',
  Boolean: 'Boolean',
  ObjectId: 'Schema.Types.ObjectId',
  Decimal128: 'Schema.Types.Decimal128',
  Long: 'BigInt', // Int64
  Double: 'Number',
  Int32: 'Number',
  BSONSymbol: 'Schema.Types.Mixed',
  Code: 'Schema.Types.Mixed',
  MinKey: 'Schema.Types.Mixed',
  MaxKey: 'Schema.Types.Mixed',
  Timestamp: 'Schema.Types.Mixed'
}

function updateFlatMap(doc, flatMap = {}, typeKey = 'type') {
  const flattened = flatten(doc, { 
    safeTransform: (value) => {
      if (value == null || value instanceof RegExp) {
        return 'Schema.Types.Mixed';
      }

      const mongooseType = BsonToMongooseTypeMap[value?.constructor?.name]
      if (mongooseType) {
        return mongooseType;
      }
      
      return undefined;
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
      const existingType = flatMap[normalizedKey];
      const newType = value;
      if (!newType) {
        throw new Error(`Unsupported BSON type: ${value}`);
      }
      flatMap[normalizedKey] = mergeTypes(existingType, newType );
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
    const collection = db.collection(collectionName, { promoteValues: false });
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
