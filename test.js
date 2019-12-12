const AWS = require('aws-sdk') ;
const config = require('./config') ;
const resize = require('./resize') ;
const index = require('./index.js' ) ;

AWS.config.update({
	region: config.region
});

const s3 = new AWS.S3({signatureVersion: 'v4', signatureCache: false, accessKeyId: config.keys.accessKeyId, secretAccessKey: config.keys.secretAccessKey});

const event = {
  "Records": [ { 
      "s3": { 
          "bucket": { 
              "name": "private.sans-website.com" 
          }, 
          "object": { 
              "key": "private/e1dc9d32-24d6-40c2-a3ca-12310d3325e4/213bccf5-6aa2-4544-9fa5-c3729ae9579d"
          }
      }
  }] 
}

//index.createThumbnails( event ) ;

index.createFolderThumbnails( null, "1dff7707-bb12-4666-acbb-dac837e768d7" ) ;

