# Plane Importer

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
git clone https://github.com/yourusername/plane-importer.git
cd plane-importer
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

## Usage

To sync issues:
```bash
plane-sync sync --github-repo owner/repo --plane-project project-slug
```

To view sync status:
```bash
plane-sync status
```

## Configuration

The tool requires both GitHub and Plane API credentials to function:

1. GitHub Token: Generate a personal access token with `repo` scope
2. Plane API Key: Generate from your Plane workspace settings

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
