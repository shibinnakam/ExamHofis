const serverlessExpress = require('@vendia/serverless-express');
const app = require('../server');

// Wrap Express app with @vendia/serverless-express for AWS Lambda & API Gateway
const serverlessExpressHandler = serverlessExpress({ app });

exports.handler = async (event, context) => {
  console.log(`[AWS Lambda] Event received for path: ${event.rawPath || event.path || '/'}`);
  return serverlessExpressHandler(event, context);
};
