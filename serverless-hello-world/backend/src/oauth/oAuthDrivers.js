/** @namespace auth */
/** @module oAuthDrivers */
let AWS = require('aws-sdk');
const fetch = require('node-fetch');
const jwkToPem = require('jwk-to-pem');

class OAuthDriver {

    /**
     * This function will build out our oAuth Config that will be passed to the client
     * @returns {Object} - The oAuth Config
     */
    async buildOAuthConfig() {
        throw new Error("Not Implemented");
    }

    /**
     * This function will get the groups for the user from the token.
     * @param {IDToken|AccessToken} token - The token object
     * @returns {String[]} - The groups for the user
     */
    async getGroups(token) {
        throw new Error("Not Implemented");
    }

    /**
     * This function will get the appropriate public key for the token.
     * The key is used to verify the signature of the token.
     * @returns {String} - The public key
     */
    async getPEM() {
        throw new Error("Not Implemented");
    }
}

class CognitoDriver extends OAuthDriver {

    constructor() {
        super();
    }

    /**
     * This function will build out our oAuth Config that will be passed to the client
     * We will have the ClientID on the environment variables
     * We can use the clientID to get the client secret from the cognito pool
     * @returns {Object} - The oAuth Config
    */
    async buildOAuthConfig() {
        let clientId = process.env.CLIENT_ID;
        let poolId = process.env.POOL_ID;
        let oAuthConfig = await this.obtainOAuthConfigForClient(clientId, poolId);
        return oAuthConfig;
    }

    /** 
     * This function extracts the cognito groups from the token.
     * In the future we will call to cognito to get the live groups
     * @param {IDToken} token - The token to extract the groups from
     * @returns {Promise<Array>} - The groups for the user
    */
    async getGroups(token) {
        
        // Request the groups from the cognito service
        try {
            return this.getCognitoGroups(token);
        } catch (err) {
            console.log("Error getting groups from cognito", err);
        }

        let groups = [];

        if (token.payload['cognito:groups']) {
            groups = token.payload['cognito:groups'];
        }

        return groups;
    }

    /**
     * This function will try to get the pem for a given token.
     * @param {IDToken|AccessToken} token - The token to get the pem for
     */
    async getPEM(token) {
        let url = `${token.payload.iss}/.well-known/jwks.json`;

        let jwks = await fetch(url).then(res => res.json());

        let pems = {};
        let keys = jwks['keys'];

        for (const element of keys) {
            //Convert each key to PEM
            let key_id = element.kid;
            let modulus = element.n;
            let exponent = element.e;
            let key_type = element.kty;
            let jwk = { kty: key_type, n: modulus, e: exponent };
            let pem = jwkToPem(jwk);
            pems[key_id] = pem;
        }

        let kid = token.header.kid;
        return pems[kid];
    }

    /**
     * This function will request the scopes, redirect url and client secret from cognito based on the client id.
     * @param {String} clientId - The client id to get the config for
     * @param {String} poolId - The pool id to get the config for
     * @returns {oAuthConfig} - The oAuth config
    */
    async obtainOAuthConfigForClient(clientId, poolId) {
        console.log("Using fancy method for getting config for", clientId, " on", poolId);
        let params = {
            "ClientId": clientId,
            "UserPoolId": poolId
        };

        let cognitoClient = new AWS.CognitoIdentityServiceProvider();
        let result = await cognitoClient.describeUserPoolClient(params).promise();

        let clientSecret = result.UserPoolClient.ClientSecret;

        // An app client can have multiple redirect uris. We need to find all the ones related to the domain in which the app is running.
        // Then we will take the first one of those.
        let redirectUris = result.UserPoolClient.CallbackURLs.filter(url => url.includes(process.env.DOMAIN));
        let redirectUri = redirectUris.length ? redirectUris[0] : "null";

        let scopes = result.UserPoolClient.AllowedOAuthScopes;

        let cognitoDescription = await cognitoClient.describeUserPool({ "UserPoolId": poolId }).promise();
        
        return {
            "clientId": clientId,
            "clientSecret": clientSecret,
            "redirectUri": redirectUri,
            "scopes": scopes,
            "host": cognitoDescription.UserPool.CustomDomain || (cognitoDescription.UserPool.Domain + ".auth." + (cognitoDescription.UserPool.Region || 'us-east-1') + ".amazoncognito.com"),
        };
    }

    /**
     * This function will request the groups from cognito for the provided access token.
     * It uses the adminListGroupsForUser function to get the groups.
     * We could, in theory, use the cognito:groups claim in the token, but that is not always up to date.
     * @param {AccessToken} accessToken 
     * @returns {String[]} - The groups for the user
     */
    async getCognitoGroups(accessToken) {
        // Call the AdminListGroupsForUser API to get the groups for the user
        let cognitoClient = new AWS.CognitoIdentityServiceProvider();
        let result = await cognitoClient.adminListGroupsForUser({
            UserPoolId: process.env.POOL_ID,
            Username: accessToken.payload.username
        }).promise();
        
        let groups = result.Groups.map(group => group.GroupName);
        return groups;
    }
}


module.exports = {
    CognitoDriver,
    OAuthDriver
};