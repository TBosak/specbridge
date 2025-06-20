<h1 align="center">SpecBridge
<p>
<a href="https://glama.ai/mcp/servers/@TBosak/specbridge">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@TBosak/specbridge/badge" alt="Specbridge MCP server" />
</a>
</p>
</h1>

An MCP server that turns OpenAPI specifications into MCP tools. Scan a folder for OpenAPI spec files and automatically generate corresponding tools. No configuration files, no separate servers - just drop specs in a folder and get tools.


Built with [FastMCP](https://www.npmjs.com/package/fastmcp) for TypeScript.

## ✨ Features

- 🎯 **Zero Configuration**: Filesystem is the interface - just drop OpenAPI specs in a folder
- 🔐 **Auto Authentication**: Simple `.env` file with `{API_NAME}_API_KEY` pattern
- 🏷️ **Namespace Isolation**: Multiple APIs coexist cleanly (e.g., `petstore_getPet`, `github_getUser`)
- 📝 **Full OpenAPI Support**: Handles parameters, request bodies, authentication, and responses
- 🚀 **Multiple Transports**: Support for stdio and HTTP streaming
- 🔍 **Built-in Debugging**: List command to see loaded specs and tools
- ✏️ **Spec Management**: Built-in tools to list, get, and update OpenAPI specifications
- 🌐 **API Discovery**: Integrated APIs.guru directory with 3000+ public API specifications

## 🚀 Quick Start

### 1️⃣ Install (optional)

```bash
npm install -g specbridge
```

### 2️⃣ Create a specs folder

```bash
mkdir ~/mcp-apis
```

### 3️⃣ Add OpenAPI specs

Drop any `.json`, `.yaml`, or `.yml` OpenAPI specification files into your specs folder:

```bash
# Example: Download the Petstore spec
curl -o ~/mcp-apis/petstore.json https://petstore3.swagger.io/api/v3/openapi.json
```

### 4️⃣ Configure authentication (optional)

Create a `.env` file in your specs folder:

```bash
# ~/mcp-apis/.env
PETSTORE_API_KEY=your_api_key_here
GITHUB_TOKEN=ghp_your_github_token
OPENAI_API_KEY=sk-your_openai_key
```

### 5️⃣ Add to MCP client configuration

For Claude Desktop or Cursor, add to your MCP configuration:

If installed on your machine:
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

Otherwise:
```json
{
  "mcpServers": {
    "specbridge": {
      "command": "npx",
      "args": ["-y", "specbridge", "--specs", "/absolute/path/to/your/specs"]
    }
  }
}
```

### 6️⃣ Restart your MCP client

That's it! Your OpenAPI specs are now available as MCP tools. ✅

## 💻 CLI Usage

### 🚀 Start the server

```bash
# Default: stdio transport, current directory
specbridge

# Custom specs folder
specbridge --specs ~/my-api-specs

# HTTP transport mode
specbridge --transport httpStream --port 8080
```

### 📋 List loaded specs and tools

```bash
# List all loaded specifications and their tools
specbridge list

# List specs from custom folder
specbridge list --specs ~/my-api-specs

## 🔑 Authentication Patterns

The server automatically detects authentication from environment variables using these patterns:

| Pattern | Auth Type | Usage |
|---------|-----------|--------|
| `{API_NAME}_API_KEY` | 🗝️ API Key | `X-API-Key` header |
| `{API_NAME}_TOKEN` | 🎫 Bearer Token | `Authorization: Bearer {token}` |
| `{API_NAME}_BEARER_TOKEN` | 🎫 Bearer Token | `Authorization: Bearer {token}` |
| `{API_NAME}_USERNAME` + `{API_NAME}_PASSWORD` | 👤 Basic Auth | `Authorization: Basic {base64}` |

The `{API_NAME}` is derived from the filename of your OpenAPI spec:
- `petstore.json` → `PETSTORE_API_KEY`
- `github-api.yaml` → `GITHUB_TOKEN` 
- `my_custom_api.yml` → `MYCUSTOMAPI_API_KEY`

## 🏷️ Tool Naming

Tools are automatically named using this pattern:
- **With operationId**: `{api_name}_{operationId}`
- **Without operationId**: `{api_name}_{method}_{path_segments}`

Examples:
- `petstore_getPetById` (from operationId)
- `github_get_user_repos` (generated from `GET /user/repos`)

## 📁 File Structure

```
your-project/
├── api-specs/           # Your OpenAPI specs folder
│   ├── .env            # Authentication credentials
│   ├── petstore.json   # OpenAPI spec files
│   ├── github.yaml     # 
│   └── custom-api.yml  # 
└── mcp-config.json     # MCP client configuration
```

## 📄 Example OpenAPI Spec

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

## 🛠️ Built-in Spec Management Tools

Specbridge automatically provides three built-in tools that allow you to manage your OpenAPI specifications:

### 🔧 `specbridge_list_specs`
Lists all OpenAPI specification files in your specs folder with details like file size and modification date.

### 📄 `specbridge_get_spec`
Retrieves the complete content of a specific OpenAPI specification file.
- **Parameter**: `filename` - The name of the spec file (e.g., "petstore.json", "github.yaml")

### ✏️ `specbridge_update_spec`
Updates the content of a specific OpenAPI specification file. Automatically validates the content and reloads the tools.
- **Parameters**: 
  - `filename` - The name of the spec file to update
  - `content` - The new content for the specification file
- **Features**:
  - ✅ Automatic backup creation before updates
  - ✅ JSON/YAML validation before saving
  - ✅ Security checks to prevent directory traversal
  - 🔄 Requires server restart to see updated tools

### 💡 Use Cases

These tools enable powerful workflows:
- **Enhance specs**: Use the LLM to improve descriptions, add missing parameters, or fix validation issues
- **Add endpoints**: Dynamically extend APIs by adding new paths and operations
- **Debug specs**: Retrieve and examine specification content to troubleshoot tool generation issues
- **Maintain consistency**: Standardize naming conventions, descriptions, and schemas across multiple specs

Example workflow:
1. `specbridge_list_specs` - See what specs are available
2. `specbridge_get_spec` - Retrieve a spec that needs enhancement
3. Ask the LLM to improve descriptions or add missing fields
4. `specbridge_update_spec` - Save the enhanced version
5. Restart the MCP server to see the updated tools with better descriptions!

## 🌐 API Discovery with APIs.guru

Specbridge includes built-in integration with [APIs.guru](https://apis.guru/), the largest directory of OpenAPI specifications with 3000+ public APIs. This enables powerful discovery and installation workflows:

### 🔍 Discovery Tools

- **`apisguru_getProviders`** - List all API providers (Google, GitHub, Stripe, OpenAI, etc.)
- **`apisguru_getProvider`** - Get all APIs from a specific provider with download URLs
- **`apisguru_getMetrics`** - Get directory statistics (total APIs, endpoints, providers)

### ⬇️ Download Tool

- **`specbridge_download_spec`** - Download and save any OpenAPI spec from a URL with a custom filename (no more generic "openapi.json" files!)

### 💡 Discovery Workflow Examples

**Find and add the Stripe API:**
1. `apisguru_getProviders` - Browse available providers
2. `apisguru_getProvider` with provider `"stripe.com"` - Get Stripe API details with download URL
3. Use `specbridge_download_spec` with the `swaggerUrl` and filename `"stripe-payments.json"` - Download with a descriptive name
4. Restart server - Now you have Stripe API tools named like `stripe_createPaymentIntent`!

**Explore other popular APIs:**
1. `apisguru_getProviders` - See all available providers (Google, GitHub, OpenAI, Twilio, etc.)
2. `apisguru_getProvider` with any provider name - Get their APIs with download URLs
3. Use `specbridge_download_spec` to add the ones you need

## 🔧 Troubleshooting

### ❌ No tools appearing?

1. Check that your OpenAPI specs are valid:
   ```bash
   specbridge list --specs /path/to/specs
   ```

2. Ensure files have correct extensions (`.json`, `.yaml`, `.yml`)

3. Check the server logs for parsing errors

> **⚠️ Note:** Specbridge works best when you use absolute paths (with no spaces) for the `--specs` argument and other file paths. Relative paths or paths containing spaces may cause issues on some platforms or with some MCP clients.

### 🔐 Authentication not working?

1. Verify your `.env` file is in the specs directory
2. Check the naming pattern matches your spec filename
3. Use the list command to verify auth configuration:
   ```bash
   specbridge list
   ```

### 🔄 Tools not updating after spec changes?

1. Restart the MCP server to reload the specs
2. Check file permissions
3. Restart the MCP client if needed

## 🛠️ Development

```bash
# Clone and install
git clone https://github.com/TBosak/specbridge.git
cd specbridge
npm install

# Build
npm run build

# Test locally
npm run dev -- --specs ./examples
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.
