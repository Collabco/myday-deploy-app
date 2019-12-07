const { bold } = require('chalk');
const request = require('request-promise-native');
const { createReadStream } = require('fs');

class MydayDeployApp {
  constructor({ appId, file, platform, tenantId, apiUrl, idSrvUrl, clientId, clientSecret, verbose, silent, dry }) {

    // Application ID, e.g. `collabco.attendancecapture`
    this.appId = appId;

    // Zip archive with the app to upload
    this.file = file;

    // Running on legacy vs new myday platform
    this.legacy = platform === 'v2';

    // Tenant ID, only for when uploading a tenant-level app
    // Yargs seems to pass `null` as a string. Oh well.
    this.tenantId = typeof tenantId === 'string' && tenantId !== 'null' ? tenantId : null;

    // Either global (for all tenants) or tenant (for just one tenant) level app
    this.appScope = this.tenantId ? 'Tenant' : 'Global';

    // Base myday API URL to perform app upload/update operations
    this.apiUrl = apiUrl;

    // Identity Server token endpoint address and other details for OAuth client credentials
    this.idSrvUrl = idSrvUrl;
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.clientScope = this.legacy ? 'myday-api' : 'myday_api';

    // Additional CLI options
    const noop = () => {};
    this.verboseLog = verbose ? console.log : noop;
    this.log = !silent ? console.log : noop;
    this.dry = dry;

    // Default request helper
    this.req = request.defaults({ json: true });
  }

  /**
   * Run OAuth client credentials flow to obtain an access token
   * required for myday API requests
   *
   * This requires clients being set on all relevant environments
   *
   * @param {string} url Identity Server URL
   * @param {string} client_id OAuth client ID
   * @param {string} client_secret OAuth client secret
   * @param {string} scope OAuth scopes, separated by space
   */
  async authorize(url, client_id, client_secret, scope) {

    this.verboseLog(`Requesting an access token…`);

    // Extract just access token property
    // Token type (`Bearer`) and expiry time (usually 1 hour) will always be the same
    const { access_token } = await this.req({
      url: url + '/connect/token',
      method: 'POST',
      form: { grant_type: 'client_credentials', client_id, client_secret, scope }
    });

    this.verboseLog(`Access token: ${bold(access_token)}`);

    // Extend existing request helper defaults with a bearer token authentication
    // This is overriding our existing helper made in the constructor
    this.req = this.req.defaults({ auth: { bearer: access_token }});
  }

  /**
   * Query myday AppStore API to get a list of all apps for a given scope
   * and get current version number of the app we're interested in.
   *
   * This can be `null` when the app was not found, e.g. it was not uploaded
   * to this environment yet.
   *
   * Note: This can blow up when app is invisible due to feature flags, but
   * probably only for tenant-level apps, so this will happen exactly… never.
   *
   * @param {string} id Application ID
   * @param {boolean} legacy Legacy platform
   * @param {string} baseUrl Base myday API URL for a given platform
   * @param {string} scope Application scope, `Global` or `Tenant`
   * @returns {Promise<string>} Current version number
   */
  async getCurrentVersion(id, legacy, baseUrl, scope) {

    this.verboseLog(`Determining URL to fetch existing apps…`);

    // Determine URL based on platform
    const url = legacy ?
      `${baseUrl}/apps?scope=${scope}` :
      `${baseUrl}/app/store/all?collectionScope=${scope}`;

    this.verboseLog(`URL: ${bold(url)}`);
    this.verboseLog(`Fetching existing apps…`);

    // Execute an authenticated request to myday AppStore
    const list = await this.req({ url });

    this.verboseLog(`Found ${bold(list.length)} apps for scope ${bold(scope)}.`);

    // Find and app of interest by ID
    const found = legacy ?
      list.find(x => x.id === id) :
      list.find(x => x.model.id === id);

    // Extract app model (v2/v3 interop)
    const model = found ? legacy ? found : found.model : undefined;

    this.verboseLog(model ?
      `Found app ${bold(legacy ? model.name : model.names['en-GB'])} with version ${bold(model.version)}.` :
      `Could not find such app on this environment. Is this a first time its uploaded?`
    );

    // If such app was found, return its version number (string)
    return model ? model.version : undefined;
  }

  /**
   * Upload application package to myday AppStore.
   *
   * On new myday platform there are two steps, because we have to submit
   * our file to Files API first and only then request an update in AppStore
   * by `fileId` obtained.
   *
   * Note: Version numbers matter, because AppStore API will stop you
   * from uploading apps with versions lower (semver) than previous ones.
   * However, also worth noting, exact same versions should work.
   *
   * @param {string} file Path to a zip archive
   * @param {string} id Application ID
   * @param {boolean} legacy Legacy platform
   * @param {string} baseUrl Base myday API URL for a given platform
   * @param {string} scope Application scope, e.g. `Global` or `Tenant`
   * @param {boolean} update Attempts and update instead of first upload, because app already exists
   * @returns {Promise<string>} New app version number
   */
  async uploadApp(file, id, legacy, baseUrl, scope, update) {

    this.verboseLog(`Determining URL to upload a zip file…`);

    // Determine upload URL based on platform
    // For legacy, also determine its inner part depending on update/upload scenario
    // For new myday, submit the file to Files API
    const url = legacy ?
      `${baseUrl}/apps/${update?'update':'upload'}?appId=${id}&scope=${scope}` :
      `${baseUrl}/files/file?virtualPath=apps&collectionScope=${scope}`;

    this.verboseLog(`URL: ${bold(url)}`);
    this.verboseLog(`Uploading zip file…`);

    // Send a multi-part form request with the zip archive
    const fileUpload = await this.req({
      url,
      method: 'POST',
      formData: { file: createReadStream(file) }
    });

    // For legacy platform, that's the only request
    // App model is returned, so we can exit with new version number
    if (legacy) {
      this.verboseLog(`${update?'Updated':'Uploaded new'} ${bold(fileUpload.name)} app with version ${bold(fileUpload.version)}.\n`);
      return fileUpload.version;
    }

    this.verboseLog(`Uploaded ${bold(fileUpload.fileId)} file with size ${bold(fileUpload.fileSize)}B.`);

    // For new platform, once we've uploaded a file, we need to use
    // a fileId obtained to instruct AppStore APIs
    // Also, change request method depending on update/upload scenario
    const storeRequest = await this.req({
      url: `${baseUrl}/app/store?appId=${id}&collectionScope=${scope}&fileId=${fileUpload.fileId}`,
      method: update ? 'PUT' : 'POST'
    });

    this.verboseLog(`${update?'Updated':'Uploaded new'} ${bold(storeRequest.names['en-GB'])} app with version ${bold(storeRequest.version)}.\n`);

    // App model is returned, so we can exit with new version number
    return storeRequest.version;
  }

  /**
   * Initialise all deployment tasks
   */
  async start() {

    this.verboseLog(`\nStarting with following configuration:
      appId:        ${bold(this.appId)}
      file:         ${bold(this.file)}
      legacy:       ${bold(this.legacy)}
      tenantId:     ${bold(this.tenantId)}
      appScope:     ${bold(this.appScope)}
      apiUrl:       ${bold(this.apiUrl)}
      idSrvUrl:     ${bold(this.idSrvUrl)}
      clientId:     ${bold(this.clientId)}
      clientSecret: ${bold(this.clientSecret.charAt(0) + '*'.repeat(this.clientSecret.length-2) + this.clientSecret.charAt(this.clientSecret.length-1))}
      clientScope:  ${bold(this.clientScope)}\n`.replace(/\n\s{6}/g, '\n - ')
    );

    // Pre-authorise and augment the request helper
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

    if (this.dry) {
      return this.log(`\n${!!currentVersion ?
        `Current ${bold(this.appId)} version is ${bold(currentVersion)}` :
        `App ${bold(this.appId)} does not exist yet`}. Dry run selected, quitting.`
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
