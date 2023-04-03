const handler = async (event, context) => {
    //Return a 200 response with a foo
    return {
        statusCode: 200,
        body: JSON.stringify({
            foo: "bar"
        })
    }
}

module.exports = {
    handler
}