/** @namespace auth */
/** @module middleware */

const jwt = require('jsonwebtoken');
const AWS = require('aws-sdk');

const { CognitoDriver } = require('./oAuthDrivers');


/*
    * This is a helper function that decodes the base64 encoded string of a jwt into a json object.
    * The token string consists of a preamble and a payload.
    * First we split the token into the preamble and the payload.
    * Then we convert the base64 into ascii.
    * Finally we convert the ascii into a json object.
*/
const decodeToken = (tokenStr) => {

    let preamble = tokenStr.split('.')[0];
    let payload = tokenStr.split('.')[1];

    let decodedToken = Buffer.from(payload, 'base64').toString('ascii');
    let decodedPre = Buffer.from(preamble, 'base64').toString('ascii');


    if (typeof decodedPre === 'string') {
        decodedPre = JSON.parse(decodedPre);
    }

    if (typeof decodedToken === 'string') {
        decodedToken = JSON.parse(decodedToken);
    }

    return { header: decodedPre, payload: decodedToken };


}


/**
 * This function handles validating the token.
 * based on the input token it will go out tot he issuer (iss) and retrieve the public keys.
 * Then we map the kid to the public key and verify the token.
 * Token verification is handled by the jsonwebtoken library imported above.
 * @param {Object} token - The token to validate
 * @param {String} tokenStr - The token as a string
 * @param {OAuthDriver} oAuthDriver - The driver to use to get the public keys
 * @returns {Validation} - The decoded token
*/
const validateToken = async (token, tokenStr, oAuthDriver) => {
    const pem = await oAuthDriver.getPEM(token);

    if (!pem) {
        console.log('Invalid token. No pem found.', pems);
        return { valid: false, message: "Invalid Token. No pem found." };
    }

    return jwt.verify(tokenStr, pem, function (err, payload) {
        if (err) {
            console.log("Invalid Token. verification failed.", JSON.stringify(err));
            return { valid: false, message: "Invalid Token. Unable to verify." };
        } else {
            return { valid: true, id: payload['sub'] };
        }
    });
}


const extractFromToken = async (token, oAuthDriver) => {
    console.log("Extracting from token", token);
    let anonymousUser = await getAnonymousUser();

    // Ensure that the token is not null
    if (!token) {
        if (!allowAnonymous)
            return { valid: false, message: "No token provided" };
        else {
            console.log("No token provided, returning anonymous access");
            return { valid: true, user: anonymousUser };
        }
    }

    // If the token is a string it may be coming directly from the header and needs to un base64d first
    if (typeof token === "string") {
        // If the value starts with "Bearer " then remove it
        if (token.startsWith("Bearer ")) {
            console.log('Removing "Bearer " from token');
            token = token.substring(7);
        }

        // Convert the base64 string to an object
        // If it is a full JWT, as in it contains the id_token and the access_token we need to split it
        // An actual access_token will be split into a preamble and a payload and signature separated by a dot
        // If the dot doesnt exist then someone is not using this library correctly
        try {
            if (token.split(".").length == 1) {
                token = JSON.parse(Buffer.from(token, 'base64').toString('ascii'));
                token = token.access_token;
            }
        } catch (err) {
            console.log("Error parsing token", err);
            return { valid: false, message: "Error parsing token", user: anonymousUser };
        }

    }

    let accessToken = decodeToken(token);
    let accessTokenStr = token;
    let verification = await validateToken(accessToken, accessTokenStr, oAuthDriver);

    if (!verification.valid) {
        console.log("Token is invalid");
        let anonymousUser = await getAnonymousUser();
        return { "valid": false, "message": "Token is invalid", user: anonymousUser };
    }
    else {
        console.log("Token is valid", JSON.stringify(verification), JSON.stringify(accessToken));
    }
    
    let groups = await oAuthDriver.getGroups(accessToken);

    let user = {
        id: verification.id,
        groups
    }

    return { valid: true, user: user };
}


const getUser = async (lambdaApiGatewayEvent) => {
    let oAuthDriver = await getOAuthDriver();
    let { user } = await extractFromToken(lambdaApiGatewayEvent.headers?.Authorization || lambdaApiGatewayEvent.headers?.authorization, oAuthDriver);
    return user;
}

const getUserFromID = async (id) => {
    try {
        let fakeToken = {
            payload: {
                username: id,
            }
        };

        let oAuthDriver = await getOAuthDriver();

        let groups = await oAuthDriver.getGroups(fakeToken);

        return {
            id,
            groups
        }
    }
    catch (err) {
        console.log("Error getting user from id", err);
        return null;
    }
}


const getOAuthDriver = async () => {
    // We should decide what driver top use based off the environment
    // For now we will just use cognito
    let oAuthDriver = new CognitoDriver();
    return oAuthDriver;
}

module.exports = {
    getUser,
    getUserFromID,
    tokenUtil: {
        extractFromToken,
        validateToken,
        decodeToken
    },
    getOAuthDriver
}