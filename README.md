# mongo-to-mongoose

## Overview

`mongo-to-mongoose` is a CLI tool that generates Mongoose schemas from MongoDB collections.

## Installation

Install globally using npm to run `m2m` from anywhere:

```bash
npm install -g mongo-to-mongoose
```

## Usage

Run the CLI tool with the following options:

```bash
m2m -u <MongoDB_Connection_URL> -c <Collection_Name> [options]
```

### Required Options

- `-u, --url <url>`: MongoDB connection URL.
- `-c, --collection <collection>`: MongoDB collection name.

### Optional Flags

- `-d, --dbName`: MongoDB database name.
- `-t, --typeKey <typeKey>`: Specifies a custom `typeKey` for the Mongoose schema. If not provided, no `typeKey` is used.
- `-s, --sampleSize <sampleSize>`: Number of documents to sample for schema generation. If not provided, the tool processes the entire collection.

### Performance Tip

If performance is slow when processing large collections, consider using the `sampleSize` option to reduce the number of documents processed:

```bash
m2m -u "mongodb://localhost:27017" -c "students" -s 100
```

This will sample 100 documents from the collection instead of processing all records.

## Examples

### Generate Schema Without `typeKey`

```bash
m2m -u "mongodb://localhost:27017" -c "students"
```

Generated schema:

```javascript
{
  name: String,
  age: Number
}
```

### Generate Schema With `typeKey`

```bash
m2m -u "mongodb://localhost:27017" -c "students" -t '$type'
```

Generated schema:

```javascript
{
  name: { $type: String },
  age: { $type: Number }
}
```

## Error Handling

- If the collection is empty, a message is displayed, and no schema is generated.
- If an unsupported data type is encountered, an error message is logged.

## Contributing

Contributions are welcome! Feel free to submit issues or pull requests to enhance the tool.

## License

This project is licensed under the MIT License.

