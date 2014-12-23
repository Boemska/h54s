#h54s - HTML5 Data Adapter for SAS

HTML5 Data Adapter for SAS (‘h54s’ for short) lets SAS BI customers engage with HTML5 app developers to create modern data-driven frontends, while the SAS and data SMEs already embedded within the organisation transparently take care of the data and analytics requirements at the backend.

##Usage
Copy /dist/h54s-[version].js to your project, include it in your html page and create instance of the h54s object.

Creating the instance:
```
var adapter = new h54s(config);
```

Config parameter is configuration object. If you omit the config parameter, h54s object will be created with default configuration.

Default configuration looks like this:

```
{
  systemtype: 'SAS',
  sasService: 'default',
  url: '/SASStoredProcess/do',
  debug: false,
  loginUrl: '/SASLogon/Logon.do',
  sasParams: [],
  autoLogin: false
}
```

You can also provide hostUrl if your SAS instance is on another domain:
```
var adapter = new h54s({
  hostUrl: 'http://www.example.com/'
});
```

Or login credentials:
```
var adapter = new h54s({
  user: 'username',
  pass: 'password',
  autoLogin: true
});
```
Note that autoLogin: true will automatically try to log in on first SAS program call.

##API

###call(sasProgram, callback)
Calls SAS program and returns data in callback function.
Example:
```
adapter.call('/sas_programs/test', function(err, res){
  if(err) {
    //Houston we have a problem
  } else {
    //res is an object returned from the server
    console.log(res);
  }
});
```
>`err` is a custom javascript Error object with one extra field - type
>`err.type` could be "loginError", "notLoggedinError", "parseError", "sasError", or http response text if ajax request failed.

`err.type` meaning:

>"loginError" is returned if autoLogin is set but log in credentials are wrong or not set at all.
>"notLoggedinError" is returned if autoLogin is not set.
>"parseError" is returned if the adapter can't parse json response from server.
>"parseError" is returned only if debug mode is set (`debug: true` in config object). It indicates that SAS program has some errors.

###setCredentials(user, pass)
Sets log in credentials.
Example:
```
adapter.setCredentials('username', 'password');
```

###login(user, pass, callback)
Log in.
Example:
```
adapter.login('username', 'password', function(status) {
  if(status === -1) {
    //Wrong username or password
  } else if(status === 200) {
    //Success - user is logged in
  } else {
    //ajax call failed
    //status is value of http request status code
  }
});
```
or:
```
adapter.setCredentials('username', 'password');
  adapter.login(function(status) {
  if(status === -1) {
    //Wrong username or password
  } else if(status === 200) {
    //Success - user is logged in
  } else {
    //ajax call failed
    //status is value of http request status code
  }
});
```

###addTable(tableArray, macroName)
Adds an array of objects which are then sent to the server with first `call`.

```
adapter.addTable([
  {
    libname: 'WORK',
    memname: 'CHOSENLIB'
  }
], 'data');
```

>Note that tableArray is deleted after first SAS call.

###getSasErrors()
Returns SAS program errors.
Last 100 SAS errors are saved by adapter.
It returns array of objects:
```
var errors = adapter.getSasErrors();
```

>errors[i].sasProgram - SAS program which has errors
>errors[i].message - error message
>errors[i].time - the time of the response with errors (javascript Date object)

###getApplicationLogs()
Array of log strings:
```
var appLogs = adapter.getApplicationLogs();
```

>appLogs[i] is string returned from server, or added by adapter


###getDebugData()
When in debugging mode (`debug: true`), adapter will save every response from the server.
```
var debugData = adapter.getDebugData();
```

>debugData[i].debugHtml - SAS html output
>debugData[i].debugText - SAS text output (stripped html)
>debugData[i].sasProgram - SAS program called
>debugData[i].params - parameters sent to SAS program
>debugData[i].time - the time of the response (javascript Date object)


###setDebugMode()
Set debugging mode - `debug:true`:
```
adapter.setDebugMode();
```


###unsetDebugMode()
Unset  debugging mode - `debug:false`:
```
adapter.unsetDebugMode();
```

---

##Development

1. Clone the project.
2. Run `npm install`
3. Install grunt-cli if it's not installed already - `npm install -g grunt-cli`.
4. Edit host url, user and pass in /test/_server_data.js.
5. Run `grunt`. It will run jshint, concatenate the files in /src, and run karma tests. There are more grunt tasks like:
  1. `grunt compress` - Create minified h54s file.
  2. `grunt test` - Runs jshint and karma tests.
  3. `grunt watch` - Runs tests on file change.
  4. `grunt serveAngular` - Creates web server and serves angular.js example (default port is 1337)
  5. `grunt serveExtjs` - Creates web server and serves ext.js example (default port is 1337)
