# @collabco/myday-deploy-app

Utility to upload and update apps on [myday](http://myday.collabco.com) platform, by [Collabco](https://collabco.com).

## Prerequisites

Please contact [Collabco support](https://support.mydaycloud.com) for API and authentication details.

## Command Line Interface

To start using CLI, install the module globally:

```bash
npm install --global @collabco/myday-deploy-app
```

Usage:

```bash
myday-deploy-app [options]
```

Example v2 deployment:

```bash
myday-deploy-app \
  --appId "tenantalias.appname" \
  --file "path/to/app.zip" \
  --platform "v2" \
  --tenantId "Your tenant ID" \
  --apiUrl "Base URL for myday APIs" \
  --idSrvUrl "Base URL for myday identity server" \
  --clientId "Your client ID" \
  --clientSecret "Your client secret" \
  --verbose \
  --dry
```

Example v3 deployment:

```bash
myday-deploy-app \
  --appId "tenantalias.appname" \
  --file "path/to/app.zip" \
  --tenantId "Your tenant ID" \
  --apiUrl "Base URL for myday APIs" \
  --idSrvUrl "Base URL for myday identity server" \
  --clientId "Your client ID" \
  --clientSecret "Your client secret" \
  --verbose \
  --dry
```

## Node Interface

To start using Node interface, install the module locally:

```bash
npm install --save-dev @collabco/myday-deploy-app
```

Usage:

```js
const MydayDeployApp = require('myday-deploy-app');

const config = {
  appId: 'tenantalias.appname',
  file: 'path/to/app.zip',
  tenantId: 'Your tenant ID',
  apiUrl: 'Base URL for myday APIs',
  idSrvUrl: 'Base URL for myday identity server',
  clientId: 'Your client ID',
  clientSecret: 'Your client secret',
  verbose: true,
  dry: true
};

const instance = new MydayDeployApp(config).start();
```
