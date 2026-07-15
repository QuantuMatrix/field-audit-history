# Contributing

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [.NET SDK](https://dotnet.microsoft.com/download) 6.0+
- [Power Platform CLI](https://learn.microsoft.com/en-us/power-platform/developer/cli/introduction) (`pac`)

## Setup

```bash
# Clone the repo
git clone https://github.com/vp365ai/field-audit-history.git
cd field-audit-history

# Install dependencies
cd pcf
npm install
```

## Development

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Lint
npm run lint

# Start PCF test harness
npm start
```

## Build Solution

```bash
# From repo root
cd solution
dotnet build --configuration Release
```

This produces managed and unmanaged solution ZIPs in `releases/`.

## Project Structure

```
pcf/                          PCF control project
├── FieldAuditHistory/        Control source (TypeScript + React)
│   ├── components/           React components
│   ├── hooks/                Custom React hooks
│   ├── models/               TypeScript interfaces
│   ├── services/             Dataverse API service layer
│   ├── utils/                Utilities (CSV export, etc.)
│   └── __tests__/            Jest test suites
├── package.json              npm config
└── FieldAuditHistoryPCF.pcfproj  MSBuild project

solution/                     Dataverse solution packaging
├── FieldAuditHistory.cdsproj MSBuild project (references pcf/)
└── src/                      Solution Packager source files
```

## Guidelines

- All UI uses [Fluent UI v8](https://developer.microsoft.com/en-us/fluentui#/controls/web)
- React 16.14 (platform-provided via virtual control)
- Tests use Jest + React Testing Library
- ESLint with `@microsoft/eslint-plugin-power-apps`
- Maintain 80%+ branch coverage
