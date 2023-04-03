// This function will get the count from the DynamoDB table
exports.handler = async (event) => {
    // Get the count from the DynamoDB table
    const count = await getCount();
    
    // Return the count as a http 200 response
    return {
        statusCode: 200,
        body: JSON.stringify(count)
    };
       
}

const AWS = require('aws-sdk');
const dynamoDb = new AWS.DynamoDB.DocumentClient();

const getCount = async () => {
    // Get the count from the DynamoDB table
    // The count will be in a field called "Count"
    const count = await dynamoDb.get({
        TableName: process.env.DYNAMO_DB_TABLE,
        Key: {
            id: 'Count'
        }
    }).promise();

    // If the item is not found, return 0
    if (!count.Item) {
        return 0;
    }
    
    // Return the count
    return count.Item.count;
}
