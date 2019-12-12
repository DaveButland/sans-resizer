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

/*
createImageThumbnail = ( bucket, folder, image, width ) => {

  return new Promise((resolve, reject) => {
		const inputKey = 'private/'+folder+'/'+image ;
		const outputKey = 'thumbnail/'+folder+'/'+image+'-'+width ;

		var s3GetParams = {  Bucket: bucket, Key: inputKey } ;

		s3.getObject( s3GetParams, function(err, data) {
			if (err) { 
				console.log( "Error reading image - ", err, err.stack );
				reject( 'Error reading image' ) ;
			} else {
				const { Body, ContentType } = data
				const imageData = new Buffer.from(Body)
				const tasks = { width: width } ;

				sharp(imageData).resize(tasks).toBuffer().then(function(newFileInfo) {
					var s3PutParams = {  Bucket: bucket, Key: outputKey, ContentType, Body: newFileInfo } ;

					s3.putObject( s3PutParams, function( err, data) {
						if (err) { 
							console.log( "Error writing image - ", err, err.stack );
							reject( 'Error writing image' ) ;
						} else {
							console.log( "Resized image " + image, " width " + width ) ;
							resolve( 'Resized image ' + image + " to width " + width ) ;
						} 
					}) ;
				})
				.catch(function(err) {
					console.log( "Error resizing image - ", err, err.stack );
					reject( 'Error resizing image' ) ;
				});
			}
		}) ;
	});
}

createImageThumbnails = async(bucket, folder, image ) => {
	const sizes  = [300,600,900,1200,1500,1800] ;
	
	var resizing = [] ;
 
	for ( i = 0 ; i < sizes.length ; i++ ) {
		console.log( i, sizes[i] ) ;
		resizing.push( createImageThumbnail( bucket, folder, image, sizes[i] ) ) ;
	}

	await Promise.all(resizing);

	console.log("Finished resizing" ) ;
}

createFolderThumbnails = async( user, folder ) => {

	const quyen = '832bb986-871d-4bd2-a832-9e7134265604' ; // temp for now

	const bucket   = "private.sans-website.com"
	const table = 'sans-images' ;
	const index = 'userid-folderid-index' ;
	const expression = "userId = :u and folderId = :f" ;
	const values = {":u": quyen, ":f": folder } ;

	persist.readIndex( table, index, expression, values ).then( function ( data ) { 
		
		var images = data.Items ;
		images.map ( image => {
			createImageThumbnails( bucket, folder, image ) ;
		}) ;
		
	}).catch ( function( err ) {
		console.log( "Error reading images - ", err, err.stack );
	}) ;
}

exports.createImageThumbnailsTrigger = async (event) => {

	console.log("createImageThumbnailsTrigger entry ", util.inspect(event, {depth: 5}));

	const bucket = event.Records[0].s3.bucket.name;
	const key    = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, " "));
	const path   = key.split( "/" ) ;
	const folder = path[1] ;
	const image  = path[2] ;	

	await createThumbnails( bucket, folder, image ) ;

	console.log( "createImageThumbnailsTrigger exit" ) ;
}

exports.createFolderThumbnailsTrigger = async (event, context, callback) => {
	
	console.log("createFolderThumbnailsTrigger entry ", util.inspect(event, {depth: 5}));

	if ( ( !event.headers.Authorization ) || ( !event.headers.Authorization.startsWith("Bearer ") ) ) {
		return response.invalid( { errorMessage: "Missing or Invalid Authorization Token" } );
	}

	const sub = validateJWT.getSub( event.headers.Authorization.slice(7) ) ;

	if ( !sub ) {
		callback( null, response.failure( { errorMessages: "Invalid Token"} ) ) ;
		return false ;
	}
	
	const folderId = event.pathParameters.folderid ;

	await this.createFolderThumbnails( sub, folderId ) ;

	console.log( "createFolderThumbnailsTrigger exit" ) ;
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
	
	const quyen = '832bb986-871d-4bd2-a832-9e7134265604' ; // temp for now

	const folderId = event.pathParameters.folderid ;
	const width    = parseInt( event.queryStringParameters.width ) || 300 ;
	const table = 'sans-images' ;
	const index = 'userid-folderid-index' ;
	const expression = "userId = :u and folderId = :f" ;
	const values = {":u": quyen, ":f": folderId } ;

	console.log( "Resizing folder ", values ) ;

	persist.readIndex( table, index, expression, values ).then( function ( data ) { 
		
		var images = data.Items ;
		images.map ( image => {

			console.log( "Resizing image ", image.imageId ) ;

			image.thumbnail = image.imageId + '-' + width ;

			var bucket   = "private.sans-website.com"
			var key      = "private/" + image.folderId + "/" + image.imageId ;
			var thumbkey = "thumbnail/" + image.folderId + "/" + image.thumbnail ;

			console.log( JSON.stringify( image ) ) ;
	
			var s3GetParams = {  Bucket: bucket, Key: key } ;
				
			console.log( JSON.stringify( s3GetParams ) ) ;
	
			s3.getObject( s3GetParams, function(err, data) {
				if (err) { 
					console.log( "Error reading image - ", err, err.stack );
				} else {
					const { Body, ContentType } = data
					const imageData = new Buffer.from(Body)
					const tasks = { width: width } ;
	
					sharp(imageData).resize(tasks).toBuffer().then(function(newFileInfo) {
						var s3PutParams = {  Bucket: bucket, Key: thumbkey, ContentType, Body: newFileInfo } ;

						s3.putObject( s3PutParams, function( err, data) {
							if (err) { 
								console.log( "Error writing image - ", err, err.stack );
							} else {
								console.log( "Resized image " + image.imageId ) ;
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
*/

//New code from here

exports.createImageThumbnail = async ( bucket, folder, image, width ) => {
	const inputKey = 'private/'+folder+'/'+image ;
	const outputKey = 'thumbnail/'+folder+'/'+image+'-'+width ;
	const s3GetParams = {  Bucket: bucket, Key: inputKey } ;

	try {
		const inputImage = await s3.getObject( s3GetParams ).promise() ;
		const { Body, ContentType } = inputImage ;
		const imageData = new Buffer.from(Body)
		const tasks = { width: width } ;

		try {
			await sharp(imageData).resize(tasks).toBuffer().then( async function(newFileInfo) {
			
				const s3PutParams = {  Bucket: bucket, Key: outputKey, ContentType, Body: newFileInfo } ;

				try {
					const outputImage = await s3.putObject( s3PutParams ).promise() ; 
					console.log( "resized " + image + " " + width ) ;
					return outputImage ;
				} catch ( error ) {
					console.log( error ) ;
					return error ;
				} 
			}) ;
		} catch( error ) {
			console.log( error ) ;
			return error ;
		}
	} catch( error ) {
		console.log( error ) ;
		return error ;
	}
}

exports.createImageThumbnails = async ( bucket, folder, image ) => {
	const sizes  = [300,600,900,1200,1500,1800] ;

	try {

		const images = Promise.all( 
			sizes.map( async ( size ) => {
				return this.createImageThumbnail( bucket, folder, image, size ) ;
			})
		) ;

		return await images ;
	} catch ( error ) {
		console.log( error ) ;
		return error ;
	}
}

exports.createFolderThumbnails = async ( bucket, folder, image ) => {
	const sizes  = [300,600,900,1200,1500,1800] ;

	try {

		const images = Promise.all( 
			sizes.map( async ( size ) => {
				return this.createImageThumbnail( bucket, folder, image, size ) ;
			})
		) ;

		return await images ;
	} catch ( error ) {
		console.log( error ) ;
		return error ;
	}
}

exports.triggerCreateImageThumbnails = async (event) => {
  console.log('Received event:', JSON.stringify(event, null, 2));

	const bucket = event.Records[0].s3.bucket.name;
	const key    = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, " "));
	const path   = key.split( "/" ) ;
	const folder = path[1] ;
	const image  = path[2] ;	
	
	try {
		const images = await this.createImageThumbnails( bucket, folder, image ) ;
		console.log( "Finsihed" ) ;
		return true ;
	} catch ( error ) {
		console.log( error ) ;
		return false ;
	}
};

