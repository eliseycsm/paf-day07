//npm i express morgan mysql2 mongodb dotenv multer multer-s3 aws-sdk 
//import fs(inbuilt)
const express = require('express')
const morgan = require('morgan')
const fs = require('fs')
const handlebars = require('express-handlebars')

//db libraries
//const mysql = require('mysql2/promise')
const multer = require('multer')
const multers3= require('multer-s3')
const AWS = require('aws-sdk')
const {Timestamp, MongoClient} = require('mongodb') //using mongo's timestamp class as it's native supported
//const MongoClient = require('mongodb').MongoClient
const ObjectId = require('mongodb').ObjectID

//config
require('dotenv').config()
//config = require('./config.json')
const APP_PORT=process.env.APP_PORT

//set config reference for mongodb
const DATABASE = 'take-temp-together'
const COLLECTION = 'temperature'
const LIMIT = 5


const app = express()
app.use(morgan('combined'))
app.use(express.urlencoded({extended: true}))

//config handlebars
app.engine('hbs', handlebars({defaultLayout: 'default.hbs'}))
app.set('view engine', 'hbs')
app.set('views', __dirname+ '/views')


//usually we create obj in the (req, resp) but to avoid errors we can isolate it out as below
const mkTemperature = (params, filenameId) => {
    return {
        ts: new Date(),
        user: params.username,
        q1: Boolean(params.q1) ,
        q2: Boolean(params.q2),
        temperature: parseFloat(params.temperature),
        image: filenameId
    }
}


//AWS config
const AWS_S3_HOSTNAME = process.env.AWS_S3_HOSTNAME
const AWS_S3_ACCESS_KEY = process.env.AWS_S3_ACCESS_KEY
const AWS_S3_SECRET_ACCESS_KEY = process.env.AWS_S3_SECRET_ACCESS_KEY
const AWS_S3_BUCKETNAME = process.env.AWS_S3_BUCKETNAME
//set up S3 Endpoint object
const spaceEndpoint = new AWS.Endpoint(AWS_S3_HOSTNAME) //pass hostname here

//create credentials in C:/<User>/.aws.credentials
//no need this - load into AWS.config.credentials
//!!! aws config/credentials file is used mainly for cli, for programming we use env vars
//AWS.config.credentials = new AWS.SharedIniFileCredentials('ac-paf2020')//profilename in credentials

//create s3 bucket
const s3 = new AWS.S3({
    endpoint: spaceEndpoint,
    accessKeyId: AWS_S3_ACCESS_KEY,
    secretAccessKey: AWS_S3_SECRET_ACCESS_KEY
})

//create instance of multer
const upload = multer({dest: process.env.TMP_DIR|| './temp'}) //store in temp folder

//set up mongo - create mongo client pool
//set up connection string & ping
//const uri = "mongodb+srv://fred:fred@paf-cluster.7ywpi.mongodb.net/?retryWrites=true&w=majority";
const MONGO_URL = 'mongodb://localhost:27017'
const client = new MongoClient(MONGO_URL, { useNewUrlParser: true, useUnifiedTopology: true });


app.get("/", (req, resp) => {
    resp.status(200).type('text/html')
    resp.send("page loaded")
})

//GET /temperature/:name
app.get('/temperature/:name', async (req, resp) => {
    const username = req.params.name

    const usernameResults = await client.db(DATABASE).collection(COLLECTION).find({
        user: {
            $regex: username,
            $options: 'i'
            }
    }).toArray()
    
    usernameResults.map( user => {
        if (!user.image) {//no image uploaded
            user.image = 'No image uploaded'
        } else {
            user.image = 'http://' + AWS_S3_BUCKETNAME + '.' + AWS_S3_HOSTNAME + '/' + user.image
        }
    })

    //  ----- add pagination for practice -----
//limit alr defined above


    console.log(usernameResults)
    if (usernameResults.length >= 0) {
        resp.status(200).type('text/html')
        resp.render('users', {
            results: usernameResults,
            noResults: usernameResults.length == 0,
            username: username
        })
    } else {
        resp.status(500).type('text/html')
        resp.send('Error with request')
    }

})


//POST /temperature
//app.post("/temperature", express.json(), //json as we are asumming its frm angular now, later when we upload have to change
app.post("/temperature", upload.single('temp-img'), //as json cannot handle file uploads so remove json
    (req, resp) => {
    //req.body.username, req.body.q1, req.body.q2, req.body.temperature
    /* console.log(req.body.username)
    const doc = mkTemperature(req.body)

    //insert doc into mongo and test it out
    client.db(DATABASE).collection(COLLECTION)
        .insertOne(doc)
        .then( res => {
            console.log("insert result: ", res)
            resp.status(200).type("application/json")
            resp.json({})
        }).catch(e => {
            console.error("insert error: ", error)
            resp.status(500).type("application/json")
            resp.json({error: e})
        })  */   

    //code for multer file upload

        resp.on('finish', () => {     //this is an event listener for the ending of the response - event will be fired when response ends, regardless of order of code
            //you can use this technique for any clean up commands 
            fs.unlink(req.file.path, () => {}) //no need to return anything we just want to delete temp file
            console.info('>>> response ended')
        })

        //HW: GO FIND THE EVENT LISTENER WHICH LISTENS TO WHEN EXPRESS RESTARTS OR CLOSES, AND USE THAT TO DELETE ALL THE TEMP FILES AT ONE GO
        //answer: server.on('close')

        console.info(">> req.body: ", req.body)
        console.info(">> req.file: ", req.file)

        //get req.body data, convert and upload into mongo
        const doc = mkTemperature(req.body, req.file.filename) //added type to mkTemperature for data type conversion

        //promise
        const uploadToMongo = client.db(DATABASE).collection(COLLECTION).insertOne(doc)
        //promise
        
        /* fs.readFile(req.file.path, (err, buff) => {
            const params = { // MUST USE Capitalcase for keys unless u use multer-s3
                Bucket: AWS_S3_BUCKETNAME,
                Key: req.file.filename,
                Body: buff,
                ACL: 'public-read',
                ContentType: req.file.mimetype,
                ContentLength: req.file.size,
                Metadata: {
                    originalName: req.file.originalname,
                    update: ''+ (new Date()).getTime()
                }
            }
            s3.putObject(params, (error, result) => {
                if (error) {
                    console.error('upload s3 fail ', error)
                }
                client.db(DATABASE).collection(COLLECTION).insertOne(doc)
                .then(result => {
                    console.info(`both uploads successful`)
                    resp.status(200).type('application/json')
                    resp.json({status: "successful"})
                }).catch(e => {
                    console.error(`uploads failed: `, e)
                    resp.status(500).type('application/json')
                    resp.json({status: "fail"})
                })

            })
        }) */

        const uploadToS3 = new Promise((resolve, reject) => {
            
            fs.readFile(req.file.path, (err, buff) => {
                const params = {
                    Bucket: AWS_S3_BUCKETNAME,
                    Key: req.file.filename,
                    Body: buff,
                    ACL: 'public-read',
                    ContentType: req.file.mimetype,
                    ContentLength: req.file.size,
                    Metadata: {
                        originalName: req.file.originalname,
                        update: ''+ (new Date()).getTime()
                    }
                }
                s3.putObject(params, (error, result) => {
                    if(result) resolve("s3 upload ok ", result)
                    else reject("upload to s3 failed ", err)
                })
            })
        }) 

        Promise.all([uploadToMongo, uploadToS3])
            .then(result => {
                console.info("both uploads successful")
            }).catch(e => console.error("error: ", e))

        resp.status(200).json({})

})
//we do not want to load app if keys are not available - but keys not available is not a promise, and we need to combine with mongoclient which is a promise
//convert keys not available to promise
const p0 =  new Promise(
    (resolve, reject) => {
        if ((!!process.env.AWS_S3_ACCESS_KEY) && (!!process.env.AWS_S3_SECRET_ACCESS_KEY)){
            resolve()
        } else{
            reject('S3 keys not found')
        }
    }
)

//connect to mongoclient
const p1 = client.connect()

Promise.all([p0, p1])
    .then(
    app.listen(APP_PORT, () => {
        //set up app only after all conditions are satisfied
        console.info(`Application started on port ${APP_PORT} at ${new Date()}`)
    })    
).catch(e => {
    console.error('Cannot connect: ', e)
})
