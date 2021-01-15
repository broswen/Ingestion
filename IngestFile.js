'use strict';
const AWS = require('aws-sdk');
const S3 = new AWS.S3();
const DDB = new AWS.DynamoDB.DocumentClient();
const parse = require('csv-parse');
const { Readable } = require("stream");
var bunyan = require('bunyan');

var log = bunyan.createLogger({name: 'IngestFile'});


module.exports.handler = async event => {
  //SQS can batch multiple S3 events
  for (let sqsRecord of event.Records) {
    const s3Event = JSON.parse(sqsRecord.body);
    log.info({s3Event});

    //S3 can batch multiple file events
    for (let s3Record of s3Event.Records) {
      const bucket = s3Record.s3.bucket.name;
      const key = s3Record.s3.object.key;
      const params = {
        Bucket: bucket,
        Key: key
      }
      //download file
      const file = await S3.getObject(params).promise();
      //convert to stream
      const readable = Readable.from(file.Body.toString());
      //pipe into csv-parse
      const parser = readable.pipe(parse({columns: true}));

      //aggregate items and WriteBatch in groups of 10
      let totalItems = 0;
      let items = [];
      for await (let item of parser) {
        items.push(item);
        if (items.length > 9) {
          await batchWrite(items);
          totalItems+=items.length;
          items = [];
        }
      }

      //the remaining items
      if (items) {
        await batchWrite(items);
        totalItems+=items.length;
      }

      log.info(`Uploaded ${totalItems} rows from ${bucket}/${key} to ${process.env.DATA_TABLE_NAME}`)
    }
  }
  return;
};

async function batchWrite(items){
  let params = {
    RequestItems: {
      [process.env.DATA_TABLE_NAME]: items.map(item => (
        {
          PutRequest: {
            //item must contain the Table partition key
            Item: item
          }
        }
      ))
    }
  }
  log.info({params}, "batch write");
  await DDB.batchWrite(params).promise();
}