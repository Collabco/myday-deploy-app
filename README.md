# @collabco/myday-deploy-app

[![npm-version](https://img.shields.io/npm/v/@collabco/myday-deploy-app)](https://www.npmjs.com/package/@collabco/myday-deploy-app) [![node-version](https://img.shields.io/node/v/@collabco/myday-deploy-app)](https://nodejs.org) [![dependencies](https://img.shields.io/librariesio/release/npm/@collabco/myday-deploy-app)](https://github.com/Collabco/myday-deploy-app/blob/master/package.json)

[![myday](./myday.png)](https://myday.collabco.com)

Utility to upload and update apps on [myday](https://myday.collabco.com) platform, by [Collabco](https://collabco.com).


## Prerequisites

Please contact Collabco Support for API and authentication details.

## Command Line Interface

To start using CLI, install the module globally:

```bash
npm install --global @collabco/myday-deploy-app
```

Usage:

```bash
myday-deploy-app [options]
```

Use [`npx`](https://medium.com/@maybekatz/introducing-npx-an-npm-package-runner-55f7d4bd282b) to run it anywhere, for example in CI/CD pipelines:
```bash
npx @collabco/myday-deploy-app [options]
```

Example v2 deployment:

```bash
myday-deploy-app \
  --appId "tenantalias.appname" \
  --file "path/to/app.zip" \
  --platform "v2" \
  --tenantId "Your tenant ID" \
  --apiUrl "Base URL for myday APIs" \
  --idSrvUrl "Base URL for myday Identity Server" \
  --clientId "Your client ID" \
  --clientSecret "Your client secret" \
  --verbose \
  --dryRun
```

Example v3 deployment:

```bash
myday-deploy-app \
  --appId "tenantalias.appname" \
  --file "path/to/app.zip" \
  --tenantId "Your tenant ID" \
  --apiUrl "Base URL for myday APIs" \
  --idSrvUrl "Base URL for myday Identity Server" \
  --clientId "Your client ID" \
  --clientSecret "Your client secret" \
  --verbose \
  --dryRun
```

## Node Interface

To start using Node interface, install the module locally:

```bash
npm install --save-dev @collabco/myday-deploy-app
```

Usage:

```js
const MydayDeployApp = require('@collabco/myday-deploy-app');

const config = {
  appId: 'tenantalias.appname',
  file: 'path/to/app.zip',
  tenantId: 'Your tenant ID',
  apiUrl: 'Base URL for myday APIs',
  idSrvUrl: 'Base URL for myday identity server',
  clientId: 'Your client ID',
  clientSecret: 'Your client secret',
  verbose: true,
  dryRun: true
};

const instance = new MydayDeployApp(config).start();
```

## Configuration

App options:
- `appId` _(required)_: Application ID, e.g. `tenantalias.appname`
- `file` _(required)_: Path to a zip archive with an app

Platform options:
- `platform` _(optional)_: Platform version, either `v3` (default) or `v2`
- `tenantId` _(optional)_: Tenant ID, required for tenant-level apps
- `apiUrl` _(required)_: Base URL for myday APIs

Identity Server options:
- `idSrvUrl` _(required)_: Base URL for myday Identity Server
- `clientId` _(required)_: OAuth client ID
- `clientSecret` _(required)_: OAuth client secret

Additional options:
- `verbose` _(optional)_: Verbose mode (additional output)
- `silent` _(optional)_: Silent mode (disable output)
- `dryRun` _(optional)_: Dry run, does not upload the app

CLI only options:
- `help`: Displays help
- `version`: Displays package version
