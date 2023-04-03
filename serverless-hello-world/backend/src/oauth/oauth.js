/**
 * This file is responsible for handling oAuth related activities.
 * It is responsible for the following:
 * 1. Exchanging a code for a token through the callback endpoint.
 * 2. Exchanging a refresh token for a token through the refresh endpoint.
 * 3. Logging out a user by clearing the cookie through the logout endpoint.
 * 4. Returning the oAuth config through the config endpoint.
 * 
 * This is inteded to be used with the useAuth hook in react. 
 */


let AWS = require('aws-sdk');

const fetch = require('node-fetch');

const authMiddleware = require('middleware');

let env = process.env;

/*
    * This is the main entry point for the lambda function.
    * It will be called by the API Gateway.
    * It wrapps the handler_unwrapped in order to catch any errors that have not been handled.
*/
const handler = async function (event) {
    try {
        let res = await handler_unwrapped(event);
        console.log("Handler completed successfully");
        return res;
    }
    catch (ex) {
        console.log("Encountered an unhandled exception", ex);
        return ({ "error": "Parameter not found. Please check the config for the supplied environment." })
    }
}

/*
    * This is the main entry point for the lambda function.
    * Depending on the path of the request it will call the appropriate function.
    * It handles the following paths:
    * /api/oauth/callback
    * /api/oauth/refresh
    * /api/oauth/logout
*/
const handler_unwrapped = async function (event) {
    let path = event.path
    console.log("Handling request for path", path);

    // Strip off our /api and /oauth if they are present
    // When runnign this locally the /api will not be present which is why we need to strip it off separately.
    path = path.replace(/^\/api/, "");
    path = path.replace(/^\/oauth\//, "");

    // Depending on the path we will call the appropriate function
    switch (path) {
        case "callback":
            console.log("Handling callback");
            return handleCallback(event);
        case "refresh":
            console.log("Handling refresh");
            return handleRefresh(event);
        case "logout":
            console.log("Handling logout");
            return handleLogout(event);
        case "config":
            console.log("Handling config");
            let oAuthDriver = await authMiddleware.getOAuthDriver();
            let config = await oAuthDriver.buildOAuthConfig();
            let anonUser = await authMiddleware.getAnonymousUser();
            let sanitizedConf = sanitizeOAuthConfig(config);
            sanitizedConf.anonUser = anonUser;
            return jsonSuccess(sanitizedConf, 7 * 24 * 60 * 60);
        default:
            console.log("Unhandled path", path);
    }
}


// This function ensures we are restuning a client safe config for oAuth
const sanitizeOAuthConfig = (oAuthConfig) => {
    let sanitizedOAuthConfig = {
        "clientId": oAuthConfig.clientId,
        "redirectUri": oAuthConfig.redirectUri,
        "scopes": oAuthConfig.scopes,
        "host": oAuthConfig.host
    };

    return sanitizedOAuthConfig;
}

/*
    * This is a helper function that will exchange an authorization code for a token.
    * The code is posted to the oauth endpoint (/oauth2/token) along with authorization.
    * The response is a json object that contains the token.
*/
const exchangeOAuthCodeForToken = async (code) => {
    console.log("Exchanging a code for a token");


    let oAuthDriver = await authMiddleware.getOAuthDriver();
    let config = await oAuthDriver.buildOAuthConfig();
    console.log("Using config", JSON.stringify(config));

    let redirectUri = config.redirectUri;
    let tokenUrl = `https://${config.host}/oauth2/token`;
    let authStr = config.clientId + ':' + config.clientSecret;
    let authorization = 'Basic ' + Buffer.from(authStr).toString('base64')
    let body = `grant_type=authorization_code&code=${code}&redirect_uri=${redirectUri}&client_id=${config.clientId}`;

    console.log("Sending request to exchange code for token", JSON.stringify({ tokenUrl, authorization, body }));

    let res = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': authorization
        },
        body: body
    }
    );

    console.log("Response from exchange code for token", JSON.stringify(res));

    res = await res.json();

    console.log("Response from exchange code for token", JSON.stringify(res));

    return res;
}

/*
    * This is a helper function that will exchange a refresh token for a new token.
    * The refresh token is posted to the oauth endpoint (/oauth2/token) along with authorization.
    * The response is a json object that contains the token.
*/
const exchangeOAuthRefreshTokenForToken = async (refreshToken) => {
    console.log("Exchanging a refresh token for a token");

    let oAuthDriver = await authMiddleware.getOAuthDriver();
    let config = await oAuthDriver.buildOAuthConfig();

    console.log("Using", JSON.stringify(config));

    let tokenUrl = `https://${config.host}/oauth2/token`;
    let authStr = config.clientId + ':' + config.clientSecret;
    let authorization = 'Basic ' + Buffer.from(authStr).toString('base64')
    let body = `grant_type=refresh_token&refresh_token=${refreshToken}&client_id=${config.clientId}`;

    return fetch(tokenUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': authorization
        },
        body: body
    }
    ).then(res => res.json());
}


/*
    * This is a helper function that wraps a response into a json object that lambda/apigateway understands as a sucessful html response.
*/
const htmlSuccess = (body, addlHeaders) => {
    console.log("Returning", body, JSON.stringify(body))

    let headers = {
        'Content-Type': 'text/html',
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,X-Api-Key,X-Amz-Security-Token"
    }

    if (addlHeaders) {
        for (let key in addlHeaders) {
            console.log("Adding header", key, JSON.stringify(addlHeaders[key]));
            headers[key] = addlHeaders[key];
        }
    }

    return (
        {
            statusCode: 200,
            "isBase64Encoded": false,
            body: body,
            headers
        });
}



/*
    * This is the handler for the callback endpoint
    * This is redirected to when a user authorizes the application via the authorization code flow.
*/
const handleCallback = async (event) => {
    console.log("Handling callback");
    let code = event.queryStringParameters.code;
    let state = event.queryStringParameters.state;

    let token = await exchangeOAuthCodeForToken(code);

    if (token.error !== undefined) {
        console.log("Error exchanging code for token", token.error);
        let ret = "<html><body>Error exchanging code for token</body></html>";

        return htmlSuccess(ret);
    }


    

    let tokenStr = Buffer.from(JSON.stringify(token)).toString('base64')

    let oAuthDriver = await authMiddleware.getOAuthDriver();

    let userData = await authMiddleware.tokenUtil.extractFromToken(tokenStr, oAuthDriver);

    if (!userData.valid) {
        console.log("Token is invalid");
        let ret = "<html><body>Token is invalid</body></html>";

        return htmlSuccess(ret);
    }

    // this is the data sent back to the client via postMessage on the opener of the window
    let messageData = { 'type': 'oauth-token', 'token': tokenStr, 'state': state, user: userData.user };

    let userDataStr = JSON.stringify(userData.user);

    // Escape any quotes in the message so that it can be used in a string literal within a script tag.
    // This is a bit of a hack, but it works.
    userDataStr = userDataStr.replace(/'/g, "\\'");

    //let: permissions

    let message = JSON.stringify(messageData);

    // This is the body of the webpage we return. If you want to play around with this I suggest adding a debugger right after the script tag.
    let content = `
    <!DOCTYPE html>
    <html>
        <body>Logging you in...
        <script>
            if(window.opener) {
                window.opener.postMessage(${message}, '*'); 
                //setTimeout(()=>{window.close()},1000);
            } else {
                // if the window is not opened by the opener, we can't postMessage to it.
                // Instead we will put our tokenStr in the session storage under a key called 'bootToken'.

                window.sessionStorage.setItem('bootToken', '${tokenStr}');
                window.sessionStorage.setItem('bootUser', '${userDataStr}');

                // Now redirect to the home page
                window.location.href = '/${state ? '#/?state=' + state : ''}';
            }
        </script>
        </body>
    </html>`;

    return htmlSuccess(content);
}

/*
    * This is the handler for the refresh endpoint
    * This is called when the user wants to refresh their token.
*/
const handleRefresh = async (event) => {
    try {
        console.log("Handling refresh");
        let refreshToken = event.body;

        // If the refresh token is null, undefined, not a string, or 0 length we will return a 401
        if (!refreshToken || typeof refreshToken !== 'string' || refreshToken.length === 0) {
            return badRequest("No refresh token provided");
        }

        let token = await exchangeOAuthRefreshTokenForToken(refreshToken);

        let tokenStr = Buffer.from(JSON.stringify(token)).toString('base64')

        let oAuthDriver = await authMiddleware.getOAuthDriver();

        let userData = await authMiddleware.tokenUtil.extractFromToken(tokenStr, oAuthDriver);

        return jsonSuccess({ token: tokenStr, user: userData.user }, 1);
    }
    catch (err) {
        console.log("Error handling refresh", err.message, JSON.stringify(err.stack));
        return jsonSuccess({ token: "", acls: [] }, 1);
    }

}


/*
    * This is the handler for the logout endpoint
    * For this sample it posts back to the window opener with a message that the user has logged out.
    * If you set any cookies in the callback process you should clear them here.
*/
const handleLogout = async (event) => {
    console.log("Handling logout");

    let content = `
    <!DOCTYPE html>
        <html>
            <body>Logging you out...
                <script>
                    if(window.opener) {
                        window.opener.postMessage({ 'type':'oauth-token', 'token': '', 'idToken': '' }, '*'); 
                        //window.close();
                    } else {
                        // Now redirect to the home page
                        window.sessionStorage.removeItem('bootToken');
                        window.location.href = '/';
                    }
                </script>
            </body>
        </html>`;

    return htmlSuccess(content);
}

module.exports = {
    handler
}

