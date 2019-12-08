#!/usr/bin/env node
'use strict';

const MydayDeployApp = require('./index');
const argv = require('yargs')
  .usage('Usage: $0 [options]')

  .group(['appId', 'file'], 'App options:')
  .option('appId', { describe: 'Application ID', demandOption: true, requiresArg: true })
  .option('file', { describe: 'Path to a zip archive', demandOption: true, requiresArg: true })

  .group(['platform', 'tenantId', 'apiUrl'], 'Platform options:')
  .option('platform', { describe: 'Platform version', default: 'v3', choices: ['v2', 'v3'], requiresArg: true })
  .option('tenantId', { describe: 'Tenant ID, required for tenant-level apps', requiresArg: true })
  .option('apiUrl', { describe: 'Base URL for myday APIs', demandOption: true, requiresArg: true })

  .group(['idSrvUrl', 'clientId', 'clientSecret'], 'Identity Server options:')
  .option('idSrvUrl', { describe: 'Base URL for myday Identity Server', demandOption: true, requiresArg: true })
  .option('clientId', { describe: 'OAuth client ID', demandOption: true, requiresArg: true })
  .option('clientSecret', { describe: 'OAuth client secret', demandOption: true, requiresArg: true })

  .option('verbose', { describe: 'Verbose mode (additional output)', type: 'boolean', conflicts: 'silent' })
  .option('silent', { describe: 'Silent mode (disable output)', type: 'boolean', conflicts: 'verbose' })
  .option('dryRun', { describe: 'Dry run, does not upload the app', type: 'boolean' })

  .epilogue('For more information and OAuth access, contact Collabco Support.')
  .argv;

const instance = new MydayDeployApp(argv).start();
