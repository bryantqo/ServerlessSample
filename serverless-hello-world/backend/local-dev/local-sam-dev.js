const path = require('path');

const AWSMock = require('aws-sdk-mock');
const AWS = require('aws-sdk');

const { v4: uuidv4 } = require('uuid');


const systemLog = (source, ...args) => {
    let sourceLoggingColor = "\x1b[0m"
    switch (source) {
        case "EventBridge":
            sourceLoggingColor = "\x1b[36m" // cyan
            break;
        case "ApiGateway":
            sourceLoggingColor = "\x1b[32m" // green
            break;
    }

    const bold = "\x1b[1m"

    const resetLoggingColor = "\x1b[0m"

    console.log(sourceLoggingColor, bold, source + ":", resetLoggingColor, ...args);
};


const convertRequestToApiGateway = (req) => {
    console.log("Converting request to API Gateway format");
    console.log(req.headers);
    console.log(req.body);

    let body = null;
    console.log("Inspecting body");
    if (req.body) {

        let keys = Object.keys(req.body);
        body = req.body;

        if (keys.length == 1) {
            console.log("Found single key in body");
            if (typeof req.body[keys[0]] === 'string' && req.body[keys[0]].length == 0) {
                console.log("Found empty string in body");
                body = keys[0];
            }
        }
    } else {
        console.log("No body found");
    }

    let apiGatewayRequest = {
        "resource": "/{proxy+}",
        "path": req._parsedUrl.pathname,
        "httpMethod": req.method,
        "headers": req.headers,
        "queryStringParameters": req.query,
        "pathParameters": req.params,
        "stageVariables": null,
        "requestContext": {
            "resourceId": "123456",
            "resourcePath": "/{proxy+}",
            "httpMethod": req.method,
            "extendedRequestId": "c6af9ac6-7b61-11e6-9a41-93e8deadbeef",
            "requestTime": "09/Apr/2015:12:34:56 +0000",
            "path": req.path,
            "accountId": "123456789012",
            "protocol": req.protocol,
            "stage": "prod",
            "requestTimeEpoch": 1428582896000,
            "requestId": "c6af9ac6-7b61-11e6-9a41-93e8deadbeef",
            "identity": {
                "cognitoIdentityPoolId": null,
                "accountId": null,
                "cognitoIdentityId": null,
                "caller": null,
                "accessKey": null,
                "sourceIp": req.ip,
                "cognitoAuthenticationType": null,
                "cognitoAuthenticationProvider": null,
                "userArn": null,
                "userAgent": req.headers['user-agent'],
                "user": null
            },
            "domainName": "1234567890.execute-api.us-east-1.amazonaws.com",
            "apiId": "1234567890"
        },
        "body": body,
        "isBase64Encoded": false
    };
    return apiGatewayRequest;
}

const parseTemplate = (filePath) => {
    try {
        const fs = require('fs');
        const yaml = require('js-yaml');

        const AWS_SCHEMA = yaml.DEFAULT_SCHEMA.extend([
            new yaml.Type('!Ref', { kind: 'scalar', construct: function (data) { return { 'Ref': data }; } }),
            new yaml.Type('!Equals', { kind: 'sequence', construct: function (data) { return { 'Fn::Equals': data }; } }),
            new yaml.Type('!Not', { kind: 'sequence', construct: function (data) { return { 'Fn::Not': data }; } }),
            new yaml.Type('!Sub', { kind: 'scalar', construct: function (data) { return { 'Fn::Sub': data }; } }),
            new yaml.Type('!Sub', { kind: 'sequence', construct: function (data) { return { 'Fn::Sub': data }; } }),
            new yaml.Type('!If', { kind: 'sequence', construct: function (data) { return { 'Fn::If': data }; } }),
            new yaml.Type('!Join', { kind: 'sequence', construct: function (data) { return { 'Fn::Join': data }; } }),
            new yaml.Type('!Select', { kind: 'sequence', construct: function (data) { return { 'Fn::Select': data }; } }),
            new yaml.Type('!FindInMap', { kind: 'sequence', construct: function (data) { return { 'Fn::FindInMap': data }; } }),
            new yaml.Type('!GetAtt', { kind: 'scalar', construct: function (data) { return { 'Fn::GetAtt': data }; } }),
            new yaml.Type('!GetAZs', { kind: 'scalar', construct: function (data) { return { 'Fn::GetAZs': data }; } }),
            new yaml.Type('!Base64', { kind: 'mapping', construct: function (data) { return { 'Fn::Base64': data }; } })
        ]);

        const fileContents = fs.readFileSync(filePath, 'utf8');

        const template = yaml.load(fileContents, { schema: AWS_SCHEMA });
        return template;
    } catch (e) {
        console.log(e);
    }
}


// Open file and load json at configFilePath
const loadConfig = (filePath, keys) => {
    const fs = require('fs');
    const config = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const envConfig = {};

    // For each key in keys, and each property on config, search the json for that 
    // key and set the matching property and value on envConfig
    // ⚠️ This assume that the config file is referencing the Parameters property for all functions
    if (keys) {
        keys.forEach(key => {
            for (const [objKey, value] of Object.entries(config)) {
                if (objKey === 'Parameters' && value?.[key]) {
                    envConfig[key] = value[key];
                }
            }
        });
    }
    else {
        for (const [objKey, value] of Object.entries(config)) {
            if (objKey === 'Parameters') {
                for (const [paramKey, paramValue] of Object.entries(value)) {
                    envConfig[paramKey] = paramValue;
                }
            }
        }
    }

    return envConfig;
}


const lambdaHandler = async (event, resource, req, res) => {
    try {
        systemLog("ApiGateway", "Received request to", event.path);

        const handler = require(resource.path);
        const apiGatewayRequest = convertRequestToApiGateway(req);

        systemLog("ApiGateway", "Calling", resource.function, "on", resource.path);
        let response = await handler[resource.function](apiGatewayRequest, res);
        res.status(response.statusCode)
            .set(response.headers)
        if (response.body) {
            try {
                res.json(JSON.parse(response.body));
            } catch (e) {
                res.send(response.body);
            }
        }
        else {
            res.send();
        }
    } catch (err) {
        systemLog("ApiGateway", "Unhandled error", err);
        res.status(500).json({
            error: err
        });
    }
}


const mountEndpoints = (templateFilePath, apiPrefix, templateOrg, app) => {
    let schema = {};
    let template = JSON.parse(JSON.stringify(templateOrg));

    console.log("Mounting endpoints from template");
    const endpointResource = Object.keys(template.Resources).filter((key) => {
        const resource = template.Resources[key];
        return resource.Type === 'AWS::Serverless::Function' && resource.Properties.Events && Object.keys(resource.Properties.Events).filter((eventKey) => {
            const event = resource.Properties.Events[eventKey];
            return event.Type === 'Api';
        }).length > 0;
    }).map((key) => {
        console.log("Found api function", key);
        const resource = template.Resources[key];

        // Each event will have a Properties property which contains a Path property which is the path of the endpoint
        const events = Object.keys(resource.Properties.Events).map((eventKey) => {
            const event = resource.Properties.Events[eventKey];
            return {
                path: event.Properties.Path,
                method: event.Properties.Method
            };
        }

        );

        // The path for the handler should take the CodeUri property and append the Handler property
        // Also the path is realitive to the template file so we need to get the directory of the template file and append the CodeUri
        // Lastly the handler is in the format of 'file.function' so we need to split on the '.' and take the first part
        const handlerPath = path.join(path.dirname(templateFilePath), resource.Properties.CodeUri, resource.Properties.Handler.split('.')[0]);

        return {
            name: key,
            path: handlerPath,
            function: resource.Properties.Handler.split('.')[1],
            events: events
        };

    });

    console.log();

    // Loop through each endpoint resource and create an express route for it
    endpointResource.forEach((resource) => {
        schema[resource.name] = {
            path: resource.path,
            handlers: []
        };

        resource.events.forEach((event) => {
            console.log("Creating routes for", event.method, event.path);
            // Some events will have a path containing a {proxy+} which is a catch all for any path
            // We need to replace this with a wildcard for express
            // Make a copy of the path so we don't modify the original
            let path = JSON.parse(JSON.stringify(event.path));
            path = path.replace('{proxy+}', '*');

            // If the path does not start with a '/' then we need to add one
            if (!path.startsWith('/')) {
                path = '/' + path;
            }

            let handlerSchema = {
                path: path,
            };
            // Paths can contain parameters which are defined in the format of {parameterName}
            // We need to replace these with a wildcard for express and add the parameter to the schema
            let parameterNames = [];
            path = path.replace(/{(.*?)}/g, (match, parameterName) => {
                parameterNames.push(parameterName);
                return ':parameter';
            });

            if (parameterNames.length > 0) {
                handlerSchema.parameters = parameterNames;
            }

            schema[resource.name].handlers.push(handlerSchema);

            let type = "use";
            if (event.method) {
                type = event.method.toLowerCase();
            }

            if (type === "any") {
                type = "use";
            }

            console.log("\t => endpoint", path);

            app[type](path, async (req, res) => {
                lambdaHandler(event, resource, req, res);
            });

            path = apiPrefix + path;
            console.log("\t => endpoint", path);
            schema[resource.name].handlers.push(path);

            app[type](path, async (req, res) => {
                lambdaHandler(event, resource, req, res);
            });
        });
        console.log();
    });

    return schema;
}

const mountLayers = (templateFilePath, template) => {
    let schema = {};
    // Get the lambda layers and add them to path so that they can be required
    const lambdaLayerResource = Object.keys(template.Resources).filter((key) => {
        const resource = template.Resources[key];
        return resource.Type === 'AWS::Serverless::LayerVersion';
    }).map((key) => {
        console.log("Found lambda layer", key);
        const resource = template.Resources[key];
        return {
            name: key,
            path: path.join(path.dirname(templateFilePath), resource.Properties.ContentUri)
        };
    });

    lambdaLayerResource.forEach((resource) => {
        console.log("Adding layer", resource.name, "to path", resource.path);
        schema[resource.name] = resource.path;
        require('app-module-path').addPath(resource.path);
    });

    return schema;
}

const mountEventBridge = (template, templateFilePath) => {
    // Get all functions that have an eventbridge event
    const eventBridgeResource = Object.keys(template.Resources).filter((key) => {
        const resource = template.Resources[key];
        return resource.Type === 'AWS::Serverless::Function' && resource.Properties.Events && Object.keys(resource.Properties.Events).filter((eventKey) => {
            const event = resource.Properties.Events[eventKey];
            return event.Type === 'EventBridgeRule';
        }).length > 0;

    }).map((key) => {
        console.log("Found eventbridge function", key);
        const resource = template.Resources[key];
        const events = Object.keys(resource.Properties.Events).map((eventKey) => {
            console.log("Found eventbridge event", eventKey);
            const event = resource.Properties.Events[eventKey];
            console.log("Event", event);

            let pattern = event.Properties.Pattern;
            let sources = pattern.source;
            if (!Array.isArray(sources)) {
                sources = [sources];
            }
            let detailTypes = pattern['detail-type'];
            if (!Array.isArray(detailTypes)) {
                detailTypes = [detailTypes];
            }


            const handlerPath = path.join(path.dirname(templateFilePath), resource.Properties.CodeUri, resource.Properties.Handler.split('.')[0]);

            return {
                name: key,
                path: handlerPath,
                sources: sources,
                detailTypes: detailTypes,
                function: resource.Properties.Handler.split('.')[1],
                handler: resource.Properties.Handler.split('.')[0]
            };
        });
        return events;

    });

    /**
     * 
    {
      EventBusName: undefined,
      Source: 'OMM',
      DetailType: 'NewOrganizationEvent',
      Detail: '{"streamID":"4b02d4e6-89d1-4073-8f36-35de283370f8","streamType":"Organization","version":1,"eventType":{"type":"a9bf740e-6317-4272-8575-e8f547efd2b2","typeName":"NewCommunityPlanningAreaEvent","objectTypes":["Planning Area","Community Planning Area"],"eventSourceName":"Community Planning Area","name":"New Community Planning Area","description":"A new community planning area has been created"},"eventBody":{},"date":"2022-10-07T17:52:50.795Z","eventId":-1,"eventID":-1}',
      Time: 2022-10-07T17:52:50.796Z
    }
    
    {
        "version": "0",
        "id": "5ed10af5-d923-2f92-f774-d2fbacc99e95",
        "detail-type": "DeleteCommunityPlanEvent",
        "source": "Community Planning Area",
        "account": "178634862814",
        "time": "2022-09-28T12:11:39Z",
        "region": "us-east-1",
        "resources": [],
        "detail": {
            "eventID": 170,
            "streamID": "eede470b-938c-43df-afa5-d964fdb7785a",
            "version": 9,
            "userID": "4cbd72da-790c-4c41-b8f0-0328a6e63821",
            "eventType": {
                "type": "0c63cba8-90a2-433f-a8d7-7ac0081f3107"
            },
            "eventBody": {
                "planID": "114058f7-5c5d-4577-be58-de7ce3a2db38"
            },
            "date": "2022-08-29 19:05:05.363234"
        }
    }
     */

    const convertEventBridgeEvent = (event) => {
        return {
            version: event.version,
            id: event.id || uuidv4(),
            detailType: event.DetailType,
            source: event.Source,
            account: "123456789012",
            time: event.Time,
            region: "us-east-1",
            resources: [],
            detail: JSON.parse(event.Detail)
        };
    }

    const eventBridgeStub = AWSMock.mock('EventBridge', 'putEvents', (params, callback) => {
        try {
            systemLog("EventBridge", "putEvents captured by local-dev", params);
            // From the resources we found earlier we need to find the function that matches the event name
            // Then we need to call the function with the event
            params.Entries.forEach((entry) => {
                let convertedEvent = convertEventBridgeEvent(entry);
                eventBridgeResource.forEach((resource) => {
                    systemLog("EventBridge", "Checking resource", resource);
                    resource.forEach(async (event) => {
                        // If the event source and detail type match then we need to call the function
                        if (event.sources.includes(entry.Source) && event.detailTypes.includes(entry.DetailType)) {
                            systemLog("EventBridge", "Calling function", event.function, "with event", convertedEvent, "from", event.path);
                            try {
                                const handler = require(event.path);
                                let result = await handler[event.function](convertedEvent, {}, (err, data) => {
                                    systemLog("EventBridge", "Function returned", err, data);
                                });
                            } catch (err) {
                                systemLog("EventBridge", "Error calling function", err);
                            }
                        }
                    });
                });
            });

        } catch (err) {
            console.log("Error Handling Event Bus Event", err);
        }
        callback(null, {});
    });
}

const createEventBus = (app) => {
    // Create an __EVENT_BUS__ endpoint that can be used to send events to the event bus
    console.log("Creating an event bus endpoint on /__EVENT_BUS__");
    app.post('/__EVENT_BUS__', (req, res) => {
        let event = req.body;
        if (typeof event === 'string') {
            event = JSON.parse(event);
        }
        console.log("Received event", event);
        const eventBus = new AWS.EventBridge();
        eventBus.putEvents({
            Entries: [
                {
                    Source: event.source,
                    DetailType: event.detailType,
                    Detail: JSON.stringify(event.detail)
                }
            ]
        }, (err, data) => {
            if (err) {
                res.status(500).send(err);
            } else {
                res.status(200).send(data);
            }
        });
    });
}

const createFunctionMounts = (app, template, templatePath) => {
    console.log("Creating function mounts on /__FN__");

    // FInd all of the serverless functions in the template
    const keys = Object.keys(template.Resources);

    const functions = keys.map((key) => {
        const resource = template.Resources[key];
        return {
            Name: key,
            Resource: resource,

        };
    }).filter((fn) => {
        return fn.Resource.Type === 'AWS::Serverless::Function';
    });

    // For each function create a mount point
    functions.forEach((fn) => {
        try {
            let templateDir = path.dirname(templatePath);

            console.log("Creating mount point for function", fn.Name, 'on', `/__FN__/${fn.Name}`, "from", templateDir + '/' + fn.Resource.Properties.CodeUri);

            app.post(`/__FN__/${fn.Name}`, async (req, res) => {
                console.log("Received request for function", fn.Name);



                let functionPath = templateDir + '/' + fn.Resource.Properties.CodeUri;
                // The handler property should be in the format of <file>.<function>
                let handlerParts = fn.Resource.Properties.Handler.split('.');
                let handlerFile = handlerParts[0];
                let handlerFunctionPath = handlerParts.slice(1);
                let handlerPath = functionPath + '/' + handlerFile;
                let handler = require(handlerPath);

                console.log("Calling function", `${handlerPath}.${handlerFunctionPath.join(".")}(${req.body})`);

                let event = req.body;
                if (typeof event === 'string') {
                    event = JSON.parse(event);
                }

                try {
                    let fn = handler;
                    handlerFunctionPath.forEach((part) => {
                        fn = fn[part];
                    });
                    let eff = await fn(event);
                    console.log("Function returned", eff);
                    res.status(200).send(eff);
                } catch (err) {
                    console.log("Error calling function", err)
                    res.status(500).send(err);
                }
            });
        } catch (err) {
            console.log("Error creating function mount", err);
        }
    });
}

const useSam = (samYamlPath, app) => {

    let schema = {
        api: {},
        layers: {},
        eventBridge: {}
    }

    const templateFilePath = samYamlPath;
    const apiPrefix = '/api';
    const template = parseTemplate(templateFilePath);

    // Pull out all of the resources in the template that are of type 'AWS::Serverless::Function' and have a Properties property containing an 'Events' property which is an array and having at least one containing a Type property with a value of 'Api'
    schema.api = mountEndpoints(templateFilePath, apiPrefix, template, app);
    schema.layers = mountLayers(templateFilePath, template);
    schema.eventBridge = mountEventBridge(template, templateFilePath);

    createEventBus(app);
    createFunctionMounts(app, template, templateFilePath);

    return schema;

}

module.exports = {
    useSam: useSam,
    loadConfig: loadConfig,
};