'use strict';
const AWS = require('aws-sdk');
const S3 = new AWS.S3();
const KSUID = require('ksuid');
const middy = require('@middy/core');
const httpErrorHandler = require('@middy/http-error-handler');
var bunyan = require('bunyan');

var log = bunyan.createLogger({name: 'GenerateURL'});

const GenerateURL = async event => {
  //generate random S3 key
  const key = await KSUID.random();
  const params = {
    Bucket: process.env.UPLOAD_BUCKET,
    Key: key.string,
    ContentType: 'text/csv'
  }
  log.info({bucket: params.Bucket, key: key.string}, "created signed put url");
  const url = await S3.getSignedUrlPromise('putObject', params);
  return {
    statusCode: 200,
    body: JSON.stringify(
      {
        url,
        key: key.string
      },
    ),
  };

};

const handler = middy(GenerateURL)
  .use(httpErrorHandler());
module.exports = {handler};