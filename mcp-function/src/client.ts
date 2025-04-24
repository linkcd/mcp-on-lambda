import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { AWSIAMTransport } from "./transport/AWSIAMTransport"; // Import the transport class

const serverUrl = process.env.MCP_SERVER_URL || "http://localhost:8080";

const transport = new AWSIAMTransport(new URL(serverUrl)); // Pass the serverUrl to the constructor

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