# SpecBridge

An MCP server that bridges OpenAPI specifications to MCP tools. Scan a folder for OpenAPI spec files and automatically generate corresponding tools. No configuration files, no separate servers - just drop specs in a folder and get tools.

Built with [FastMCP](https://www.npmjs.com/package/fastmcp) for TypeScript.

## Features

- **Zero Configuration**: Filesystem is the interface - just drop OpenAPI specs in a folder
- **Auto Authentication**: Simple `.env` file with `{API_NAME}_API_KEY` pattern
- **Namespace Isolation**: Multiple APIs coexist cleanly (e.g., `petstore_getPet`, `github_getUser`)
- **Full OpenAPI Support**: Handles parameters, request bodies, authentication, and responses
- **Multiple Transports**: Support for stdio and HTTP streaming
- **Built-in Debugging**: List command to see loaded specs and tools

## Quick Start

### 1. Install

```bash
npm install -g specbridge
```

### 2. Create a specs folder

```bash
mkdir ~/mcp-apis
```

### 3. Add OpenAPI specs

Drop any `.json`, `.yaml`, or `.yml` OpenAPI specification files into your specs folder:

```bash
# Example: Download the Petstore spec
curl -o ~/mcp-apis/petstore.json https://petstore3.swagger.io/api/v3/openapi.json
```

### 4. Configure authentication (optional)

Create a `.env` file in your specs folder:

```bash
# ~/mcp-apis/.env
PETSTORE_API_KEY=your_api_key_here
GITHUB_TOKEN=ghp_your_github_token
OPENAI_API_KEY=sk-your_openai_key
```

### 5. Add to MCP client configuration

For Claude Desktop or Cursor, add to your MCP configuration:

```json
{
  "mcpServers": {
    "specbridge": {
      "command": "specbridge",
      "args": ["--specs", "/path/to/your/specs/folder"]
    }
  }
}
```

### 6. Restart your MCP client

That's it! Your OpenAPI specs are now available as MCP tools.

## CLI Usage

### Start the server

```bash
# Default: stdio transport, current directory
specbridge

# Custom specs folder
specbridge --specs ~/my-api-specs

# HTTP transport mode
specbridge --transport httpStream --port 8080
```

### List loaded specs and tools

```bash
# List all loaded specifications and their tools
specbridge list

# List specs from custom folder
specbridge list --specs ~/my-api-specs
```

## Authentication Patterns

The server automatically detects authentication from environment variables using these patterns:

| Pattern | Auth Type | Usage |
|---------|-----------|--------|
| `{API_NAME}_API_KEY` | API Key | `X-API-Key` header |
| `{API_NAME}_TOKEN` | Bearer Token | `Authorization: Bearer {token}` |
| `{API_NAME}_BEARER_TOKEN` | Bearer Token | `Authorization: Bearer {token}` |
| `{API_NAME}_USERNAME` + `{API_NAME}_PASSWORD` | Basic Auth | `Authorization: Basic {base64}` |

The `{API_NAME}` is derived from the filename of your OpenAPI spec:
- `petstore.json` → `PETSTORE_API_KEY`
- `github-api.yaml` → `GITHUB_TOKEN` 
- `my_custom_api.yml` → `MYCUSTOMAPI_API_KEY`

## Tool Naming

Tools are automatically named using this pattern:
- **With operationId**: `{api_name}_{operationId}`
- **Without operationId**: `{api_name}_{method}_{path_segments}`

Examples:
- `petstore_getPetById` (from operationId)
- `github_get_user_repos` (generated from `GET /user/repos`)

## File Structure

```
your-project/
├── api-specs/           # Your OpenAPI specs folder
│   ├── .env            # Authentication credentials
│   ├── petstore.json   # OpenAPI spec files
│   ├── github.yaml     # 
│   └── custom-api.yml  # 
└── mcp-config.json     # MCP client configuration
```

## Example OpenAPI Spec

Here's a minimal example that creates two tools:

```yaml
# ~/mcp-apis/example.yaml
openapi: 3.0.0
info:
  title: Example API
  version: 1.0.0
servers:
  - url: https://api.example.com
paths:
  /users/{id}:
    get:
      operationId: getUser
      summary: Get user by ID
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: User found
  /users:
    post:
      operationId: createUser
      summary: Create a new user
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                name:
                  type: string
                email:
                  type: string
      responses:
        '201':
          description: User created
```

This creates tools named:
- `example_getUser`
- `example_createUser`

## Troubleshooting

### No tools appearing?

1. Check that your OpenAPI specs are valid:
   ```bash
   specbridge list --specs /path/to/specs
   ```

2. Ensure files have correct extensions (`.json`, `.yaml`, `.yml`)

3. Check the server logs for parsing errors

> **Note:** Specbridge works best when you use absolute paths (with no spaces) for the `--specs` argument and other file paths. Relative paths or paths containing spaces may cause issues on some platforms or with some MCP clients.

### Authentication not working?

1. Verify your `.env` file is in the specs directory
2. Check the naming pattern matches your spec filename
3. Use the list command to verify auth configuration:
   ```bash
   specbridge list
   ```

### Tools not updating after spec changes?

1. Restart the MCP server to reload the specs
2. Check file permissions
3. Restart the MCP client if needed

## Development

```bash
# Clone and install
git clone <repository-url>
cd specbridge
npm install

# Build
npm run build

# Test locally
npm run dev -- --specs ./examples

# Run tests
npm test
```

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.
