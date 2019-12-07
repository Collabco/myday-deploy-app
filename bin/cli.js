#!/usr/bin/env node
'use strict';

const { existsSync } = require('fs');
const MydayDeployApp = require('../src/main');
const argv = require('yargs')
  .usage('Usage: $0 [options]')

  .group(['appId', 'file'], 'App options:')
  .option('appId', { describe: 'Application ID', demandOption: true, requiresArg: true })
  .option('file', { describe: 'Path to a zip archive', demandOption: true, requiresArg: true })

  .group(['platform', 'tenantId', 'apiUrl'], 'Platform options:')
  .option('platform', { describe: 'Platform version', default: 'v3', choices: ['v2', 'v3'], requiresArg: true })
  .option('tenantId', { describe: 'Tenant ID, only for tenant-level apps', requiresArg: true })
  .option('apiUrl', { describe: 'Base myday API URL', demandOption: true, requiresArg: true })

  .group(['idSrvUrl', 'clientId', 'clientSecret'], 'Identity Server options:')
  .option('idSrvUrl', { describe: 'Identity Server URL', demandOption: true, requiresArg: true })
  .option('clientId', { describe: 'OAuth client ID', demandOption: true, requiresArg: true })
  .option('clientSecret', { describe: 'OAuth client secret', demandOption: true, requiresArg: true })

  .option('dry', { describe: 'Dry run, does not upload the app', type: 'boolean' })
  .option('silent', { describe: 'Silent mode (disable output)', type: 'boolean', conflicts: 'verbose' })
  .option('verbose', { describe: 'Verbose mode (additional output)', type: 'boolean', conflicts: 'silent' })

  .epilogue('For more information and OAuth access, contact Collabco support.')

  .check(args => {
    try { new URL(args.apiUrl); } catch (e) { throw new Error('Invalid apiUrl address'); }
    try { new URL(args.idSrvUrl); } catch (e) { throw new Error('Invalid idSrvUrl address'); }
    if (!args.appId.match(/^[a-z][a-z0-9]+\.[a-z][a-z0-9]+$/)) throw new Error('Invalid appId format');
    if (!existsSync(args.file)) throw new Error('Invalid file path or file does not exist');
    return true;
  })
  .hide('version')
  .strict()
  .argv;

const instance = new MydayDeployApp(argv).start();
