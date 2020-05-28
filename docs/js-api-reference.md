# JavaScript API Reference

Creating an instance of the adapter:

```js
var adapter = new h54s(config);
```

Config parameter is the configuration object. If you omit the config parameter, an adapter instance will be created with default configuration.

The default configuration looks like this:

```js
{
  url: '/SASStoredProcess/do',
  debug: false,
  loginUrl: '/SASLogon/Logon.do',
  maxXhrRetries: 5,
  retryAfterLogin: true
  sasApp: 'Stored Process Web App 9.3',
  ajaxTimeout: 30000,
  isRemoteConfig: false,
  metadataRoot: undefined,
  useMultipartFormData: true,
  RESTauth: false,
  RESTauthLoginUrl: '/SASLogon/v1/tickets'
}
```
`url` is the URI of the SAS Stored Process Web Application (SPWA), as configured on your SAS server.

`debug` sets or unsets the H54S debug mode by default.

`loginUrl` is the URI of the SAS Logon Application, as configured on your SAS server.

`maxXhrRetries` is the number of times the adapter will retry a request if it fails with a SAS program error or returns no data.

Paused calls will be executed automatically after login if `retryAfterLogin` is set to true. If one request fails with `err.type = 'notLoggedinError'`, other calls will be paused, and subsequently executed (or not) based on the `retryAfterLogin` property.

`sasApp` is the version of SAS - maps to _sasapp parameter returned on on SASLogon redirect

`ajaxTimeout` is the duration, in seconds, that an adapter instance will wait for a call before considering it a failure.

`isRemoteConfig` should be set to true if you want the adapter to use a config object specified in a file called `h54sConfig.json` at the root of your web application. Config properties in the constructor will override the remote properties. You can register functions which are automatically executed when a remote config is loaded using `adapter.onRemoteConfigUpdate(callbackFn)`

`metadataRoot` is the root metadata directory where your SAS programs for this application reside. With this set, the _program parameter passed to SAS will be `metadataRoot + sasProgram` for all calls made by that adapter instance.

`useMultipartFormData` - default is `false`. Set to `true` if you want to send data using `application/x-www-form-urlencoded` type of form. In case it's true, data should be passed to `adapter.call` method as instance of `h54s.Tables` (deprecated) object. Otherwise, it will throw an error.

If your SAS instance is on another domain to the one you are developing on, you can provide the SAS `hostUrl`:
```js
var adapter = new h54s({
  hostUrl: 'http://www.example.com/'
});
```
*Note that this is not allowed by the Same-Origin Policy of most browsers. This policy needs to be manually disabled in most modern browsers for testing and development purposes. Apart from IE which generally doesn't seem to care.*

Configuration objects can contain only the relevant config parameters and don't need to be complete:
```js
var adapter = new h54s({
  debug: true,
  maxXhrRetries: 0, //don't retry if we get error or no data
  ajaxTimeout: 0 //no ajax timeout
});
```


## call(sasProgram, dataObj, callback)

Calls SAS program and returns data in a callback function. Example:
```js
adapter.call('/BIP_Tree/test', dataObj, function(err, res){
  if(err) {
    //Houston we have a problem
  } else {
    //res is an object returned from the server
    console.log(res);
  }
});
```
`dataObj` is an instance of a h54s.SasData. Should be `null` if not sending any data.

`err` is a custom javascript Error object with one extra field, `type`.

`err.type` can be one of: "loginError", "notLoggedinError", "parseError", "sasError", "programError", or http response text if ajax request failed.

- "notLoggedinError" is returned if user is not logged in or SAS session expired.
- "parseError" is returned if the adapter can't parse json response from server.
- "sasError" is returned only if debug mode is set (`debug: true` in config object). It indicates that SAS program has some errors.
- "httpError" if http request failed returning status code other than 200.
- "unknownError" if data is returned, and it's valid json, but dates could not be converted or string values could not be decoded
- "programNotFound" if sasProgram parameter path is not correct or the user doesn't have the permission to execute it
- "programError" if `status` in SAS response is not equal to "success". Value of `status` property is saved in `err.status`


## login(user, pass, callback)
Log a user in to the SASLogon application. Example:

```js
adapter.login('username', 'password', function(status) {
  if(status === -1) {
    //Wrong username or password
  } else if(status === -2) {
    //Login is not working
  } else if(status === 200) {
    //Success - user is logged in
  } else {
    //ajax call failed
    //status is value of http request status code
  }
});
```

## logout(callback)
Example:
```js
adapter.logout(function(err) {
  if(err !== undefined) {
    //http request failed
    //err is status code number
  }
})
```

## h54s.SasData(tableArray | File, macroName [, specs])
Creates an object which stores tables or files, which are then sent back to SAS via the `call` method.
Note that `specs` parameter is ignore if the first parameter is instance of `Files` object.
For more information how to create File object, check `h54s.SasData.prototype.addFile` method.

This is equivalent to `h54s.Tables` constructor deprecated in v0.11.

```js
var specs = {
  someNumber: {colType: 'num', colLength: 8},
  someString: {colType: 'string', colLength: 5},
  someDate: {colType: 'date', colLength: 8}
};
var data = new h54s.SasData([
  {
    someNumber: 42.0,
    someString: 'Stuff',
    someDate: new Date()
  }
], 'data', specs);
```

## h54s.SasData.prototype.addTable(tableArray, macroName [, specs])
For specs object check the previous description (h54s.SasData) - it accepts the same specs object.

Adds additional tables to a SasData object:

```js
var data = new h54s.SasData([
  { name: 'Allan', sex: 'M', weight: 101.1 },
  { name: 'Abdul', sex: 'M', weight: 133.7 }
], 'datain');

data.addTable([
  {
    someNumber: 42.0,
    someString: 'Stuff'
  }
], 'moredata');
```

## h54s.SasData.prototype.addFile(File, macroName)
Add an instance of File object

```js
var data = new h54s.SasData([
  { name: 'Allan', sex: 'M', weight: 101.1 },
  { name: 'Abdul', sex: 'M', weight: 133.7 }
], 'datain');

data.addFile(new File(['content'], 'myFileName'), 'myFile');
```


## getSasErrors()
Returns an array of SAS program errors. Last 100 SAS errors are retained by the adapter.

It returns array of objects:
```js
var errors = adapter.getSasErrors();
```

`errors[i].sasProgram` - The SAS _program where the error occurred

`errors[i].message` - The error itself

`errors[i].time` - the time at which erroring response occurred (javascript Date object)


## getApplicationLogs()

Array of log objects that is kept by the Adapter. A log object with `message`, `time`, and `sasProgram` properties is added to this array by the adapter whenever the SAS macro variable of &logmessage. has been set, and therefore passed to the front end application log.
```js
var appLogs = adapter.getApplicationLogs();
```

`appLogs[i].message` is a string, either returned from server, or added by the adapter


## getDebugData()
When in debugging mode (`debug: true`), the adapter will save every response from the server.
```js
var debugData = adapter.getDebugData();
```

`debugData[i].debugHtml` - full SAS html output

`debugData[i].debugText` - SAS text output (stripped html)

`debugData[i].sasProgram` - SAS program that was called

`debugData[i].params` - parameters that were sent to SAS program

`debugData[i].time` - the time at which erroring response occurred (javascript Date object)

---

## getFailedRequests()
Note that failed requests array is populated only if debug mode is turned off (debug: false)

```js
var failedRequests = adapter.getFailedRequests();
```

`failedRequests[i].responseHtml` - SAS html output

`failedRequests[i].responseText` - SAS text output (stripped html)

`failedRequests[i].sasProgram` - SAS program called

`failedRequests[i].time` - the time of the response (javascript Date object)

## setDebugMode()
Set debugging mode - `debug:true`:
```js
adapter.setDebugMode();
```

## unsetDebugMode()
Unset  debugging mode - `debug:false`:
```js
adapter.unsetDebugMode();
```

## clearApplicationLogs()
Clears the application logs array
```js
adapter.clearApplicationLogs();
```

## clearDebugData()
Clears the debug data array
```js
adapter.clearDebugData()
```

## clearSasErrors()
Clears the SAS errors array
```js
adapter.clearSasErrors()
```

## clearFailedRequests()
Clears the failed requests array
```js
adapter.clearFailedRequests()
```

## clearAllLogs()
Clears all log arrays
```js
adapter.clearAllLogs()
```

This is the same as:
```js
adapter.clearApplicationLogs();
adapter.clearDebugData();
adapter.clearSasErrors();
adapter.clearFailedRequests();
```