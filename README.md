# Mcp on lambda

Updated version based on https://community.aws/content/2vzj07Wyk6Lw281Tvs1Lw7kJJNW/building-scalable-mcp-servers-on-aws-lambda-a-practical-guide

What is new in this repo:
1. The Lambda function URL is protected by AWS IAM 
2. The client will sign the request to Lambda function URL based on current AWS credential 