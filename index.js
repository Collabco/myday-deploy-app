'use strict';

const { bold } = require('chalk');
const request = require('request-promise-native');
const { createReadStream } = require('fs');
const { normalize } = require('path');

class MydayDeployApp {
  /**
   * Utility to upload and update apps on myday platform
   *
   * @param {Object} options Deployment options
   * @param {string} options.appId Application ID, e.g. `tenantalias.appname`
   * @param {string} options.file Path to a zip archive (app package) to upload
   * @param {('v3'|'v2')} [options.platform=v3] Platform version
   * @param {string} [options.tenantId] Tenant, required for tenant-level apps
   * @param {string} options.apiUrl Base URL for myday APIs
   * @param {string} options.idSrvUrl Base URL for myday Identity Server
   * @param {string} options.clientId OAuth client ID
   * @param {string} options.clientSecret OAuth client secret
   * @param {boolean} [options.verbose] Verbose mode (additional output)
   * @param {boolean} [options.silent] Silent mode (disable output)
   * @param {boolean} [options.dryRun] Dry run, does not upload the app
   */
  constructor({ appId, file, platform, tenantId, apiUrl, idSrvUrl, clientId, clientSecret, verbose, silent, dryRun }) {

    // Application ID, e.g. `tenantalias.appname`
    if (!appId.match(/^[a-z][a-z0-9]+\.[a-z][a-z0-9]+$/)) throw new Error('Invalid appId: ' + appId);
    this.appId = appId;

    // Zip archive (app package) to upload
    this.file = createReadStream(normalize(file));

    // Running on legacy vs new myday platform
    this.legacy = platform === 'v2';

    // Tenant ID, only for when uploading a tenant-level app
    // Yargs (CLI) seems to pass `null` as a string. Oh well.
    this.tenantId = typeof tenantId === 'string' && tenantId !== 'null' ? tenantId : null;

    // Either global (for all tenants) or tenant (for just one tenant) level app
    this.appScope = this.tenantId ? 'Tenant' : 'Global';

    // Base myday API URL to perform app upload/update operations
    new URL(apiUrl); // throws exception if invalid
    this.apiUrl = apiUrl;

    // Identity Server base address and other details for OAuth client credentials flow
    new URL(idSrvUrl); // throws exception if invalid
    this.idSrvUrl = idSrvUrl;
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.clientScope = this.legacy ? 'myday-api' : 'myday_api';

    // Additional CLI options
    const noop = () => {};
    this.verboseLog = verbose ? console.log : noop;
    this.log = !silent ? console.log : noop;
    this.dryRun = dryRun;

    // Default request helper
    this.req = request.defaults({ json: true });
  }

  /**
   * Run OAuth client credentials flow against myday Identity Server to obtain
   * an access token required for myday API requests
   *
   * This requires clients being set on all relevant environments, please
   * contact Collabco Support to get access
   *
   * @param {string} url Base URL for myday Identity Server
   * @param {string} client_id OAuth client ID
   * @param {string} client_secret OAuth client secret
   * @param {string} scope OAuth scopes to request, separated by space
   * @returns {Promise<void>}
   */
  async authorize(url, client_id, client_secret, scope) {

    this.verboseLog(`Requesting Identity Server details…`);
    const { token_endpoint } = await this.req({ url: url + '/.well-known/openid-configuration' });

    this.verboseLog(`Token endpoint: ${bold(token_endpoint)}`);
    this.verboseLog(`Requesting an access token…`);

    // Extract just access token property
    const { access_token } = await this.req({
      url: token_endpoint,
      method: 'POST',
      form: { grant_type: 'client_credentials', client_id, client_secret, scope }
    });

    this.verboseLog(`Access token: ${bold(access_token)}`);

    // Extend existing request helper defaults with a bearer token authentication
    // This is overriding our existing helper made in the constructor
    this.req = this.req.defaults({ auth: { bearer: access_token }});
  }

  /**
   * Query myday API to get a list of all apps for a given scope
   * and get current version number of the app we're interested in.
   *
   * This can be `undefined` when the app was not found, e.g. it was not
   * uploaded to this environment yet.
   *
   * Note: This might not work for apps hidden via feature flags that do not
   * advertise their presence.
   *
   * @param {string} id Application ID
   * @param {boolean} legacy Legacy platform
   * @param {string} baseUrl Base myday API URL for a given platform
   * @param {('Global'|'Tenant')} scope Application scope
   * @returns {Promise<?string>} Current version number (semver)
   */
  async getCurrentVersion(id, legacy, baseUrl, scope) {

    this.verboseLog(`Determining URL to fetch existing apps…`);

    // Determine URL based on platform
    const url = legacy ?
      `${baseUrl}/apps?scope=${scope}` :
      `${baseUrl}/app/store/all?collectionScope=${scope}`;

    this.verboseLog(`Apps endpoint: ${bold(url)}`);
    this.verboseLog(`Fetching existing apps…`);

    // Execute an authenticated request to myday API
    const list = await this.req({ url });

    this.verboseLog(`Found ${bold(list.length)} apps for scope ${bold(scope)}.`);

    // Find and app of interest by ID
    // New platform returns version history in a addition to its model
    const found = legacy ?
      list.find(x => x.id === id) :
      list.find(x => x.model.id === id);

    // Extract app model (v2/v3 interop)
    const model = found ? legacy ? found : found.model : undefined;

    this.verboseLog(model ?
      `Found ${bold(legacy ? model.name : model.names['en-GB'])} app with version ${bold(model.version)}.` :
      `Could not find such app on this environment. Is this a new app?`
    );

    // If such app was found, return its version number
    return model ? model.version : undefined;
  }

  /**
   * Upload application package to myday
   *
   * On new myday platform there are two steps, because we have to submit
   * our file to Files API first and only then request an update in Apps API
   * by `fileId` obtained.
   *
   * Note: Version numbers matter, because Apps API will stop you
   * from uploading apps with versions lower (semver) than previous ones.
   * However, also worth noting, exact same versions should work.
   *
   * @param {import('fs').ReadStream} file Zip archive stream
   * @param {string} id Application ID
   * @param {boolean} legacy Legacy platform
   * @param {string} baseUrl Base myday API URL for a given platform
   * @param {('Global'|'Tenant')} scope Application scope
   * @param {boolean} update Attempts an update operation for existing apps
   * @returns {Promise<string>} New app version number (semver)
   */
  async uploadApp(file, id, legacy, baseUrl, scope, update) {

    this.verboseLog(`Determining URL to upload a zip file…`);

    // Determine upload URL based on platform
    // For legacy, also determine its inner part depending on update/upload scenario
    // For new myday, submit the file to Files API
    const url = legacy ?
      `${baseUrl}/apps/${update ? 'update' : 'upload'}?appId=${id}&scope=${scope}` :
      `${baseUrl}/files/file?virtualPath=apps&collectionScope=${scope}`;

    this.verboseLog(`URL: ${bold(url)}`);
    this.verboseLog(`Uploading zip file…`);

    // Send a multi-part form request with the zip archive
    const first = await this.req({
      url,
      method: 'POST',
      formData: { file }
    });

    // For legacy platform, that's the only request
    // App model is returned, so we can exit with new version number
    if (legacy) {
      this.verboseLog(`${update ? 'Updated' : 'Uploaded new'} ${bold(first.name)} app with version ${bold(first.version)}.\n`);
      return first.version;
    }

    this.verboseLog(`Uploaded ${bold(first.fileId)} file with size ${bold(first.fileSize)}B.`);

    // For new platform, once we've uploaded a file to Files API, we need to use the `fileId` obtained to instruct Apps APIs
    // Also, change request method depending on update/upload scenario
    const second = await this.req({
      url: `${baseUrl}/app/store?appId=${id}&collectionScope=${scope}&fileId=${first.fileId}`,
      method: update ? 'PUT' : 'POST'
    });

    this.verboseLog(`${update ? 'Updated' : 'Uploaded new'} ${bold(second.names['en-GB'])} app with version ${bold(second.version)}.\n`);

    // App model is returned, so we can exit with new version number
    return second.version;
  }

  /**
   * Initialise all deployment tasks
   */
  async start() {

    this.verboseLog(`\nStarting with following configuration:
      appId:        ${bold(this.appId)}
      file:         ${bold(this.file.path)}
      legacy:       ${bold(this.legacy)}
      tenantId:     ${bold(this.tenantId)}
      appScope:     ${bold(this.appScope)}
      apiUrl:       ${bold(this.apiUrl)}
      idSrvUrl:     ${bold(this.idSrvUrl)}
      clientId:     ${bold(this.clientId)}
      clientSecret: ${bold(this.clientSecret.charAt(0) + '*'.repeat(this.clientSecret.length - 2) + this.clientSecret.charAt(this.clientSecret.length - 1))}
      clientScope:  ${bold(this.clientScope)}\n`.replace(/\n\s{6}/g, '\n - ')
    );

    // Get an access token and augment the request helper
    await this.authorize(
      this.idSrvUrl,
      this.clientId,
      this.clientSecret,
      this.clientScope
    );

    // Check if the app already exists and if so, get its version
    const currentVersion = await this.getCurrentVersion(
      this.appId,
      this.legacy,
      this.apiUrl,
      this.appScope
    );

    // If a dry run was selected, finish here
    if (this.dryRun) {
      return this.log(`\n${!!currentVersion ?
        `Current ${bold(this.appId)} version is ${bold(currentVersion)}` :
        `App ${bold(this.appId)} does not exist yet`}. Dry run, quitting.`
      );
    }

    // Attempt to upload new (or first) version of the app
    const newVersion = await this.uploadApp(
      this.file,
      this.appId,
      this.legacy,
      this.apiUrl,
      this.appScope,
      !!currentVersion
    );

    this.log(!!currentVersion ?
      `Successfully updated ${bold(this.appId)} app from ${bold(currentVersion)} to ${bold(newVersion)}.` :
      `Successfully uploaded ${bold(this.appId)} app for the first time, with version ${bold(newVersion)}.`
    );
  }
}

module.exports = MydayDeployApp;
