import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { defaultProvider } from "@aws-sdk/credential-provider-node";
import { SignatureV4 } from "@aws-sdk/signature-v4";
import { HttpRequest } from "@aws-sdk/protocol-http";
import { Sha256 } from "@aws-crypto/sha256-js";
import { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

const serverUrl = "https://deimkphmeo5jqzdrqu3fsywmqa0okvty.lambda-url.us-east-1.on.aws/mcp";

// AWS SignatureV4 signer
const signer = new SignatureV4({
    service: "lambda",
    region: "us-east-1", // Ensure this matches the region of your Lambda function
    credentials: defaultProvider(),
    sha256: Sha256,
});

// Custom transport to sign requests
class AWSIAMTransport extends StreamableHTTPClientTransport {
    async send(message: JSONRPCMessage): Promise<void> {
        const url = new URL(serverUrl);

        const httpRequest = new HttpRequest({
            method: "POST",
            protocol: url.protocol,
            hostname: url.hostname,
            path: url.pathname,
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json, text/event-stream", // Include both MIME types
                "Host": url.hostname, // Ensure the Host header is included
            },
            body: JSON.stringify(message),
        });

        // Sign the request
        const signedRequest = await signer.sign(httpRequest);

        // Convert signed request to fetch-compatible format
        const signedHeaders: HeadersInit = {};
        for (const [key, value] of Object.entries(signedRequest.headers)) {
            signedHeaders[key] = value!;
        }

        
        // console.log("Signed Request:", {
        //     method: signedRequest.method,
        //     headers: signedRequest.headers,
        //     body: signedRequest.body,
        //     url: `${httpRequest.protocol}//${httpRequest.hostname}${httpRequest.path}`,
        // });

        const response = await fetch(`${httpRequest.protocol}//${httpRequest.hostname}${httpRequest.path}`, {
            method: signedRequest.method,
            headers: signedHeaders,
            body: signedRequest.body as BodyInit,
        });

        // console.log("Response:", response);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        // Pass the response body directly to the onmessage callback
        if (this.onmessage && response.body) {
            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");

            // Stream the response to the onmessage callback
            let buffer = "";
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });

                // Process each line in the buffer
                const lines = buffer.split("\n");
                buffer = lines.pop() || ""; // Keep the last incomplete line in the buffer

                for (const line of lines) {
                    if (line.startsWith("data: ")) {
                        const jsonData = line.slice(6); // Remove "data: " prefix
                        try {
                            const jsonMessage: JSONRPCMessage = JSON.parse(jsonData);
                            this.onmessage(jsonMessage);
                        } catch (error) {
                            console.error("Failed to parse JSON from data:", jsonData, error);
                        }
                    }
                }
            }
        }
    }
}

const transport = new AWSIAMTransport(new URL(serverUrl));

const client = new Client({
    name: "example-client",
    version: "1.0.0",
});

async function main(): Promise<void> {
    await client.connect(transport);

    // Get list of available tools
    const tools = await client.listTools();
    console.log("Available tools:", tools);

    // Call the calculate tool
    const toolResult = await client.callTool({
        name: "calculate",
        arguments: { a: 3, b: 9, operation: "add" },
    });
    console.log("Calculation result:", toolResult.content);
}

main().catch((error: unknown) => {
    console.error("Error running MCP client:", error);
    process.exit(1);
});