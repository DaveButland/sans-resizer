const AWS = require('aws-sdk') ;
const util = require( 'util' ) ;
const sharp = require('sharp') ;

const config = require('./config') ;
const response = require('./response') ;
const persist  = require('./persist');
const validateJWT = require('./validateJWT');

AWS.config.update({
	region: config.region
});

const s3 = new AWS.S3({signatureVersion: 'v4', signatureCache: false, accessKeyId: config.keys.accessKeyId, secretAccessKey: config.keys.secretAccessKey});

exports.resize_old = (event, context, callback) => {

	if ( ( !event.headers.Authorization ) || ( !event.headers.Authorization.startsWith("Bearer ") ) ) {
		return response.invalid( { errorMessage: "Missing or Invalid Authorization Token" } );
	}

	const sub = validateJWT.getSub( event.headers.Authorization.slice(7) ) ;

	if ( !sub ) {
		callback( null, response.failure( { errorMessages: "Invalid Token"} ) ) ;
		return false ;
	}
	
	const body = JSON.parse( event.body ) ;
	const table = 'sans-images' ;
	var image = {} ;
	image.userId    = sub ; 
	image.imageId   = body.imageId
	image.folderId  = body.folderId ;
	image.name      = body.name ;
	image.type      = body.type ;
	image.size      = body.size ;
	image.thumbnail = body.thumbnail ;
	image.createdAt = body.createdAt ;

	image.thumbnail = image.imageId + '-300' ;

	var bucket   = "private.sans-website.com"
	var key      = "private/" + image.folderId + "/" + image.imageId ;
	var thumbkey = "private/" + image.folderId + "/" + image.thumbnail ;

	console.log( JSON.stringify( image ) ) ;

	var s3GetParams = {  Bucket: bucket, Key: key } ;

	console.log( JSON.stringify( s3GetParams ) ) ;

	s3.getObject( s3GetParams, function(err, data) {
		if (err) { 
			console.log("Failed to get image for resizing") ;
			console.log(err, err.stack); 
		} 
		else {

			const { Body, ContentType } = data
			const imageData = new Buffer.from(Body)
			const tasks = { width: 300 } ;

			sharp(imageData).resize(tasks).toBuffer().then(function(newFileInfo) {
				
				var s3PutParams = {  Bucket: bucket, Key: thumbkey, ContentType, Body: newFileInfo } ;

				s3.putObject( s3PutParams, function( err, data) {
					if (err) { 
						console.log("Failed to save resized image") ;
						console.log(err, err.stack); 
						callback( null, response.failure({ status: false }) );
					} 
					else {
						persist.put( table, image ).then( function( data ) {
							callback( null, response.success( image))
						}).catch ( function (error ) {
							console.log("Failed to update image record") ;
							console.log( "error=" + error) ;
							callback( null, response.failure({ status: false }) );
						}) ;
					}
				}) ;
			})
			.catch(function(err) {
				console.log("Resizing failed") ;
				console.log("Error occured", err);
				callback( null, response.failure({ status: false }) );
			});
		}
	}) ;
}

exports.resize = (event, context, callback) => {

	if ( ( !event.headers.Authorization ) || ( !event.headers.Authorization.startsWith("Bearer ") ) ) {
		return response.invalid( { errorMessage: "Missing or Invalid Authorization Token" } );
	}

	const sub = validateJWT.getSub( event.headers.Authorization.slice(7) ) ;

	if ( !sub ) {
		callback( null, response.failure( { errorMessages: "Invalid Token"} ) ) ;
		return false ;
	}
	
	const table = 'sans-images' ;
	const imageId = event.pathParameters.imageid ;
  const key = { userId: sub, imageId: imageId } 

	persist.get( table, key ).then( function( record ) {

		var image = record.Item ;
		image.thumbnail = image.imageId + '-300' ;

		var bucket   = "private.sans-website.com"
		var key      = "private/" + image.folderId + "/" + image.imageId ;
		var thumbkey = "private/" + image.folderId + "/" + image.thumbnail ;
	
		console.log( JSON.stringify( image ) ) ;
	
		var s3GetParams = {  Bucket: bucket, Key: key } ;
	
		console.log( JSON.stringify( s3GetParams ) ) ;
	
		s3.getObject( s3GetParams, function(err, data) {
			if (err) { 
				console.log( "Error reading image - ", err, err.stack );
				callback( null, response.failure({ status: false }) );
			} 
			else {
				const { Body, ContentType } = data
				const imageData = new Buffer.from(Body)
				const tasks = { width: 300 } ;
	
				sharp(imageData).resize(tasks).toBuffer().then(function(newFileInfo) {
					var s3PutParams = {  Bucket: bucket, Key: thumbkey, ContentType, Body: newFileInfo } ;
	
					s3.putObject( s3PutParams, function( err, data) {
						if (err) { 
							console.log( "Error writing image - ", err, err.stack );
							callback( null, response.failure({ status: false }) );
						} 
						else {
							persist.put( table, image ).then( function( data ) {
								callback( null, response.success( image ) )
							}).catch ( function( err ) {
								console.log( "Error updating table image - ", err, err.stack );
								callback( null, response.failure({ status: false }) );
							}) ;
						}
					}) ;
				})
				.catch(function(err) {
					console.log( "Error resizing image - ", err, err.stack );
					callback( null, response.failure({ status: false }) );
				});
			}
		}) ;	
	})
	.catch(function(err) {
		console.log( "Error getting image record - ", err, err.stack );
		callback( null, response.failure({ status: false }) );
	});
}

exports.resizeTest = (event) => {

	console.log("Reading options from event:\n", util.inspect(event, {depth: 5}));
	var bucket   = event.Records[0].s3.bucket.name;
	var key      = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, " "));  
	var thumbkey = key + '-300' ;

	path = key.split( "/" ) ;

	console.log( path ) ;
	console.log( bucket, key ) ;

}

exports.resizeImage = (event) => {

	// need to put some validation on this. 
	console.log("Reading options from event:\n", util.inspect(event, {depth: 5}));
	var bucket   = event.Records[0].s3.bucket.name;
	var key      = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, " "));  
	var path = key.split( "/" ) ;
	var thumbkey = 'thumbnail/' + path[1] + '/' + path[2] + '-300' ;

	console.log( bucket, key ) ;

	var s3GetParams = {  Bucket: bucket, Key: key } ;
	
	console.log( JSON.stringify( s3GetParams ) ) ;
	
	s3.getObject( s3GetParams, function(err, data) {
		if (err) { 
			console.log( "Error reading image - ", err, err.stack );
			return response.failure({ message: 'Failed to read image' }) ; 
		} 
		else {
			const { Body, ContentType } = data
			const imageData = new Buffer.from(Body)
			const tasks = { width: 300 } ;
	
			sharp(imageData).resize(tasks).toBuffer().then(function(newFileInfo) {
				var s3PutParams = {  Bucket: bucket, Key: thumbkey, ContentType, Body: newFileInfo } ;
	
				s3.putObject( s3PutParams, function( err, data) 
				{
					if (err) { 
						console.log( "Error writing image - ", err, err.stack );
						return response.failure({ message: 'Failed to write image' }) ;
						} 
					else {
						return response.success({ message: 'Created Thumbnails' }) ;
					}
				}) ;
			}).catch(function(err) {
				console.log( "Error resizeing image - ", err, err.stack );
				return response.failure({ message: 'Failed to resize image' }) ;
			});
		}
	}) ;
};

exports.resizeFolder = (event, context, callback) => {

	if ( ( !event.headers.Authorization ) || ( !event.headers.Authorization.startsWith("Bearer ") ) ) {
		return response.invalid( { errorMessage: "Missing or Invalid Authorization Token" } );
	}

	const sub = validateJWT.getSub( event.headers.Authorization.slice(7) ) ;

	if ( !sub ) {
		callback( null, response.failure( { errorMessages: "Invalid Token"} ) ) ;
		return false ;
	}
	
	const folderId = event.pathParameters.folderid ;
	const table = 'sans-images' ;
	const index = 'userid-folderid-index' ;
	const expression = "userId = :u and folderId = :f" ;
	const values = {":u": sub, ":f": folderId } ;

	console.log( "Resizing folder ", values ) ;

	persist.readIndex( table, index, expression, values ).then( function ( data ) { 
		
		var images = data.Items ;
		images.map ( image => {

			console.log( "Resizing image ", image.imageId ) ;

			image.thumbnail = image.imageId + '-300' ;

			var bucket   = "private.sans-website.com"
			var key      = "private/" + image.folderId + "/" + image.imageId ;
			var thumbkey = "private/" + image.folderId + "/" + image.thumbnail ;

			console.log( JSON.stringify( image ) ) ;
	
			var s3GetParams = {  Bucket: bucket, Key: key } ;
				
			console.log( JSON.stringify( s3GetParams ) ) ;
	
			s3.getObject( s3GetParams, function(err, data) {
				if (err) { 
					console.log( "Error reading image - ", err, err.stack );
				} else {
					const { Body, ContentType } = data
					const imageData = new Buffer.from(Body)
					const tasks = { width: 300 } ;
	
					sharp(imageData).resize(tasks).toBuffer().then(function(newFileInfo) {
						var s3PutParams = {  Bucket: bucket, Key: thumbkey, ContentType, Body: newFileInfo } ;

						s3.putObject( s3PutParams, function( err, data) {
							if (err) { 
								console.log( "Error writing image - ", err, err.stack );
							} else {
								persist.put( table, image ).then( function( data ) {
									console.log( "Resized image " + image.imageId ) ;
								}).catch ( function( err ) {
									console.log( "Error updating table image - ", err, err.stack );
								}) ;
							}
						}) ;
					})
					.catch(function(err) {
						console.log( "Error resizing image - ", err, err.stack );
					});
				}
			}) ;
		}) ;
	}).catch ( function( err ) {
		console.log( "Error reading images - ", err, err.stack );
	}) ;

	callback( null, response.success( "Finished") ) ;
}

