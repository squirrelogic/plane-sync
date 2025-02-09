# Plane Sync

A CLI tool to synchronize GitHub issues with Plane projects. This tool allows bidirectional synchronization of issues between GitHub and Plane, maintaining consistency across both platforms.

## Features

- Import GitHub issues to Plane
- Sync updates between GitHub and Plane
- Track changes using content hashing
- Bidirectional synchronization
- CLI interface for easy management

## Installation

1. Clone the repository:
```bash
git clone https://github.com/squirrelogic/plane-sync.git
cd plane-sync
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

4. Create a `.env` file with your API keys:
```env
GITHUB_TOKEN=your_github_token
PLANE_API_KEY=your_plane_api_key
```

## Configuration

1. Copy the example configuration:
```bash
cp .plane-sync.json my-config.json
```

2. Edit the configuration file with your settings:
```json
{
  "github": {
    "owner": "your-org-name",
    "repo": "your-repo-name",
    "projectNumber": 1,
    "isOrgProject": false
  },
  "plane": {
    "baseUrl": "https://your-plane-instance.com",
    "workspaceSlug": "your-workspace",
    "projectSlug": "your-project-id"
  },
  "sync": {
    "direction": "github-to-plane",
    "autoConvertBacklogItems": false
  }
}
```

## Usage

To sync issues using the default config file (`.plane-sync.json`):
```bash
npx @squirrelogic/plane-sync sync
```

To use a custom config file:
```bash
npx @squirrelogic/plane-sync sync --config my-config.json
```

To view sync status:
```bash
npx @squirrelogic/plane-sync status
```

## Configuration Options

- `github.owner`: Your GitHub username or organization name
- `github.repo`: The repository name
- `github.projectNumber`: The project number in GitHub
- `github.isOrgProject`: Whether this is an organization project (true) or repository project (false)
- `plane.baseUrl`: Your Plane instance URL
- `plane.workspaceSlug`: Your Plane workspace slug
- `plane.projectSlug`: Your Plane project ID
- `sync.direction`: One of "github-to-plane", "plane-to-github", or "both"
- `sync.autoConvertBacklogItems`: Whether to automatically convert GitHub project items to issues

## Development

1. Run in development mode:
```bash
npm run dev
```

2. Run tests:
```bash
npm test
```

## License

MIT
