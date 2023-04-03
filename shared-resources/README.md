# Serverless Learning Shared Resources

This app is used for all of the shared resources needed for the serverless learning series. The following resources are created.

1. Domain
    * will end up being your-first-name.serverless-learning.timmons-dev.com
1. Certificate
    * Will be valid for your-first-name.serverless-learning.timmons-dev.com and any immediate sub domains
1. Cognito User Pool
1. System Admin group
1. Public S3 with website hosting enabled

# Required Tools

1. AWS CLI
1. AWS SAM

# Setup

Ensure your aws cli is connected and are able to access the environment you are deploying to. To test this, run `aws s3 ls`.

# Deployment Steps

1. open a terminal in the sam directory
1. Run `sam build`
1. Run `sam deploy --guided`
1. When prompted enter the requested parameters
1. When prompted for a stack name enter `serverless-learning-your-first-name-here-resources` example: serverless-learning-bryant-resources
1. When prompted accept writing the parameters to file