import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { defaultProvider } from "@aws-sdk/credential-provider-node";
import { SignatureV4 } from "@aws-sdk/signature-v4";
import { HttpRequest } from "@aws-sdk/protocol-http";
import { Sha256 } from "@aws-crypto/sha256-js";
import { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { Url } from "url";

export class AWSIAMTransport extends StreamableHTTPClientTransport {
    private serverUrl: URL;
    private signer: SignatureV4;

    constructor(serverUrl: URL) {
        super(serverUrl);
        this.serverUrl = serverUrl;
        this.signer = new SignatureV4({
            service: "lambda",
            region: "us-east-1", // Ensure this matches the region of your Lambda function
            credentials: defaultProvider(),
            sha256: Sha256,
        });
    }

    async send(message: JSONRPCMessage): Promise<void> {
        const url = this.serverUrl;

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
        const signedRequest = await this.signer.sign(httpRequest);

        // Convert signed request to fetch-compatible format
        const signedHeaders: HeadersInit = {};
        for (const [key, value] of Object.entries(signedRequest.headers)) {
            signedHeaders[key] = value!;
        }

        const response = await fetch(`${httpRequest.protocol}//${httpRequest.hostname}${httpRequest.path}`, {
            method: signedRequest.method,
            headers: signedHeaders,
            body: signedRequest.body as BodyInit,
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        if (this.onmessage && response.body) {
            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");

            let buffer = "";
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });

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