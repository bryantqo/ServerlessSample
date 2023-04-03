// This function will find a count in the DynamoDB table where the id is Count and decrement it by 1
// If the count is not found, it will create a new count with the id Count and a count of -1
exports.handler = async (event) => {
    // Get the count from the DynamoDB table
    const count = await getCount();
    
    // Decrement the count by 1
    const newCount = count - 1;
    
    // Save the new count to the DynamoDB table
    await saveCount(newCount);
    
    // Return the new count
    return {
        statusCode: 200,
        body: JSON.stringify(newCount)
    }
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

const saveCount = async (count) => {
    // Save the new count to the DynamoDB table
    await dynamoDb.put({
        TableName: process.env.DYNAMO_DB_TABLE,
        Item: {
            id: 'Count',
            count: count
        }
    }).promise();
}