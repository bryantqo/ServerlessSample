# Hello World

This project is intended to quickly allow the developer to have a sample serverless application. The frontend is written in react, includes a basic cognito login, and a button to increment or decrement a state that is stored in DynamoDB

# Required Tools

1. Visual Studio Code
1. AWS CLI
1. AWS SAM
1. Nodejs16

# Setup

1. If you have not already ensure that the shared-resources project has been completed
1. Ensure you are logged in via the AWS CLI to the environment you will be developing in. (Confirm by running `aws s3 ls`)
1. Run the setup task under run and debug

# Delivery

To deliver the project to be checked deploy to the TG development aws account with a stack named serverless-hello-world-{your-name-here}

# Goals and Tasks

The overall goal of this project is to get a feel for the components within a serverless application. The code is feature complete and you will be focused mostly on how the application lives in AWS.

1. GOAL: Deploy the application to the development environment
1. BONUS: Refactor the Increment and Decrement functions to also accept a parameter of how much to do so by, implement -10, -5, -2, +2, +5, +10 buttons to invoke the api as such

# Steps

Open the folder with visual studio code. You will note that it is broken down by frontend and backend. Select the run and debug tab. From the dropdown select the Backend Emulation and start it. Next select the Frontend and run it. Open a browser to localhost:3000.