const express = require('express');
const { useSam, loadConfig } = require('./local-sam-dev');

console.log("Starting...");

let app = express();

// Allow all CORS requests
app.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    next();
});

// Reply to OPTIONS requests
app.options("*", function (req, res, next) {
    res.sendStatus(200);
});


let args = process.argv.slice(2);
//Arguments are grouped by a --item value
// We will map the arguments to a config object
let config = {};
let currentKey = null;
for (let arg of args) {
    if (arg.startsWith("--")) {
        currentKey = arg.substring(2);
        config[currentKey] = {};
    }
    else {
        config[currentKey] = arg;
    }
}

console.log("Local dev starting with config", config);


// Unpack args and set environment variables - default to local if no arg is passed
let configFilePath = config.env || "local.env";

// Check if configFilePath exists
if (!require("fs").existsSync(configFilePath)) {
    console.log("That config file does not exist. Using default local config.");
    configFilePath = "../sam/local.env";
}

// Load the config file
console.log("Loading config from:", configFilePath);
const env = loadConfig(configFilePath);
console.log(config)

// Sets env variables and loads config into process.env
const setupEnvironment = () => {
    // Set the environment variables
    console.log("Setting environment variables");

    process.env.AWS_REGION = config.AWS_REGION || "us-east-1";
    // Is the below even needed?!?
    process.env.S3_PATH = config.S3_PATH || "s3://geoserver-configs";
    process.env.S3_BUCKET = config.S3_BUCKET || "geoserver-configs";
    process.env.S3_KEY = config.S3_KEY || "geoserver-configs";
    process.env.S3_SECRET = config.S3_SECRET || "geoserver-configs";
    process.env.S3_REGION = config.S3_REGION || "us-east-1";

    for (let key in env) {
        process.env[key] = env[key];
    }
}

setupEnvironment();

app.use(express.json());
app.use(express.text());
app.use(express.urlencoded());

app.get('/api/status', (req, res) => {
    console.log("/api/status");
    res.status(200).json({
        available: true
    });
});

let schema = useSam( config.samTemplate || "../sam/backend.yaml", app );

console.log("");

app.get('/schema', (req, res) => {
    res.status(200).json(schema);
});

// Get the PORT from the environment variables
const PORT = process.env.PORT || 3001;
// Start express on admin port
app.listen(PORT, () => {
    console.log(`Listening on port ${PORT}`);
});