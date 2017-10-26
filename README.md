# HTML5 Data Adapter for SAS&reg; (H54S)

[![Join the chat at https://gitter.im/Boemska/h54s](https://badges.gitter.im/Join%20Chat.svg)](https://gitter.im/Boemska/h54s?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

## What is H54S?

H54S is a library that facilitates and manages seamless bi-directional communication between a HTML5 (JavaScript) based Web Application and back-end data services written in SAS and deployed on the SAS Enterprise BI platform. It lets Web Programmers and SAS Developers collaborate easily to build general purpose Web Applications with unprecedented speed and agility.

Yes. Unprecedented.

#### Server Requirements

- SAS&reg; BI Platform (v9.2 or later)
- SAS&reg; Stored Process Web Application (Integration Technologies)

#### Client Requirements

- A decent Web Browser. It'll work on IE8, but spare yourself the pain
- Your Web Application Framework or Library of choice
- Bower.js and Google Chrome recommended. Having Git installed is also useful.

## Why is it called H54S?

While we're reasonably decent with technology, we are seemingly terrible with names. If anyone can think of a name that doesn't sound like a strain of Bird Flu, we're open to suggestions.

## Great. How do I get started?

Clone this repository to somewhere local:

```
git clone https://github.com/Boemska/h54s
```

Then put your SAS hat on.

### SAS Back End

1. Copy the `sasautos` directory to your SAS Application Server. For this example we copied ours to `/pub/sasautos`.

2. Register a new SAS Stored Process, with Streaming output enabled. We called our Stored Process `/Apps/myFirstService`.

3. Set this to be the body of your program:

```sas
* get H54s (from wherever you placed it in step 1) ;
%include '/pub/sasautos/h54s.sas';

* Process and receive dataset from the client ;
%hfsGetDataset(datain,work.additions);

* Check if the dataset(s) were received ok;
%hfsErrorCheck;

* Do some SAS. Can be Anything. Merge and sort as an example ;
data mydata;
  set sashelp.class (obs=3 keep=name sex weight) work.additions;
run;

proc sort data=mydata;
  by name;
run;

* Return a resulting dataset to the client ;
%hfsHeader;
  %hfsOutDataset(processed, work, myData);
%hfsFooter;
```

4. Save your Stored Process.

5. Log on to your SAS Stored Process Web Application and run the STP. It should produce something like this output:

```json
{
  "usermessage" : "blank",
  "logmessage" : "H54S Exception - Input object datain was not found",
  "errormessage" : "blank",
  "executingUser" : "sasdemo",
  "executingPerson" : "SAS Demo User",
  "executingPid" : 1337,
  "sasDatetime" : 1764789146.3,
  "status" : "inputTableNotFound"
}
```

This is good enough for now. Time for some Front End Development.

### HTML5 Front End

Assuming that you have a local Web Server installed for development:

1. Create an `index.html` or start a new project in your chosen IDE.

2. Copy the `/dist/h54s.js` file to your project and include it. Your `index.html` might look like this:

```html
<!DOCTYPE html>
<html>
  <body>
    <script src="h54s.js"></script>
    <h1>Look Ma, Front End!</h1>
  </body>
</html>
```

3. *If you are hosting your index.html and project files from within a deployed static.war, or behind the same reverse proxy as your SPWA, you don't need this step. Otherwise, for most people:*

   Fire up your browser. This is where Chrome comes in handy, as it allows developers to disable [Same-Origin Policy](https://en.wikipedia.org/wiki/Same-origin_policy). To tell your browser to allow background requests to non-local pages while you develop, you need to start Chrome with the `--disable-web-security` command line flag. When you see this warning, you're in business:

   ![Chrome with --disable-web-security](https://cloud.githubusercontent.com/assets/1783133/11691304/abd0cb1a-9e9a-11e5-8d5e-9706b62a272f.png)

3. Load your `index.html` page, Open Chrome Developer Tools (F12), Open the Console tab.

4. Create an instance of the adapter. In the console, try typing `h5`... Chrome should autocomplete to `h54s`, meaning the script is sourced correctly.

   Assuming your SAS webapp URIs are the default `SASStoredProcess` and `SASLogon`, the following should be enough to get you started:

```javascript
// Instantiate adapter. If SPWA was located at
// http://myServer:8080/SASStoredProcess/, you would do a
var adapter = new h54s({hostUrl: 'http://myServer:8080/'});
// (note trailing slash)

// then create a dataset to send to SAS, which in JS is an
// object array that looks a bit like this
var myFirstTable = [
  { name: 'Allan', sex: 'M', weight: 101.1 },
  { name: 'Abdul', sex: 'M', weight: 133.7 }
];

// add it to a h54s SasData object
var data = new h54s.SasData(myFirstTable, 'datain');

// make your first call to SAS
adapter.call('/Apps/myFirstService', data, function(err, res) {
  if(err) {
    //Houston we have a problem
    console.log(err);
  } else {
    //res is an object returned from the server
    console.log(res);
  }
});
```
If you're logged into your SPWA and have a session cookie already, you should see this:

   ![Chrome console animation](https://cloud.githubusercontent.com/assets/1783133/11691306/aff89f10-9e9a-11e5-9edd-f9a4d4e8c1b1.gif)

Otherwise, if you're not logged in yet, you should see this:

   ![Chrome console animation](https://cloud.githubusercontent.com/assets/1783133/11691314/b763135c-9e9a-11e5-9e2a-cad9c4b50bd4.png)

The easist thing to do at this point is to log into your SPWA in another tab, refresh your page and try running the code again. However, if you're feeling adventurous you could skip ahead and try this in the console:

```javascript
adapter.login('mysasusername','mysaspassword'); // More on this later
```

Any queued `adapter.call()` calls should resume after a successful `adapter.login()`.

### What just happened? What did I do?

First, we registered a SAS Stored Process based back-end service. We told it to expect a data structure called `datain` and to convert it to a temporary table called `WORK.ADDITIONS`. Then, using `%hfsErrorCheck` we instructed it to halt processing the rest of the SAS program if the expected data wasn't sent by the client.

When the table arrived as expected, the program would do some SAS-based stuff (which given the power and flexibility of SAS could have been anything, from a secured lookup into a legacy mainframe-based system so you can pre-populate a form, to an on-the-fly Hadoop query built into your app). For this example, we just told it to merge the input dataset with a few records from the good old `SASHELP.CLASS` into a new temporary dataset called `WORK.MYDATA`, sort it, and return the resulting dataset to the client as an object array called `processed`.

Then, from the Web side, we started a new project by creating an `index.html` page which sources the client-side `h54s.js` script. We then used the Chrome Dev Console to run some JavaScript code - to create a configured instance of the h54s Adapter, create a sample dataset, attach that dataset to a call to SAS as `datain`, fire it over, and use a simple function to either show us the dataset that was returned by SAS as `processed`, or have a look at any errors that might have occured.

Easy, right? Read on.

## Data Structures and Conventions

The *Atomic Unit of Data transfer* for a H54S based App is the Dataset. This is a universal concept familiar to both JS and SAS programmers. In JavaScript Speak, a Dataset is an [object array](http://www.w3schools.com/js/js_json_syntax.asp), similar to the one created in the example above. Using [this terminology](http://www.w3schools.com/js/js_arrays.asp), each object in an array is the row of a dataset, and each of it's named members is the value of a variable of the same name.

Data Types between the front-end and back-end are mapped as follows:

#### JavaScript to SAS

| JavaScript | SAS      | Notes                                                                   |
|------------|----------|-------------------------------------------------------------------------|
| String     | String   | ASCII only at the moment. Working on UTF support                        |
| Numeric    | Numeric  | Same precision in both SAS and JS. Enforced.                            |
| Boolean    |          | Not permitted by adapter. Throws typeError. Use numerics for bools.     |
| Null       |          | Ignored. The value for the column is not included for that row.         |
| Undefined  |          | Same as Null                                                            |

To send dates to SAS, use `h54s.toSasDateTime(date)` to convert instance of `Date` object to numeric SAS date value.

#### SAS to JavaScript

| SAS      | JavaScript | Notes                                                                                               |
|----------|------------|-----------------------------------------------------------------------------------------------------|
| String   | String     | NewLine characters are stripped.                                                                    |
| Numeric  | Numeric    | Same precision in both SAS and JS.                                                                  |
| Date     |            | Unsupported. You won't be able to transmit data as SAS Dates. Convert, use output views and DHMS()  |

To parse numeric dates sent from SAS, use `h54s.fromSasDateTime(date)` to convert numeric SAS date value to JavaScript `Date` object

### But what about Parameters? I'm used to Parameters

Say goodbye to Parameters. For the purposes of H54S-based apps, Datasets supersede them. Input validation and typechecking should be done by your JavaScript app, and the Adapter ensures type safety and handles exceptions. If you're just looking to pass a single value back, you'll need to use a 'single-column, single-row table'. It might not seem like it to start with, but it's a blessing once you start working with multiple programmers and writing interface specifications.

To get a control table with some parameters, your JS code would look like this:
```javascript
var paramsRow={};
    paramsRow.myStringParam = 'stuff and things';
    paramsRow.myNumericParam = 123.123;
    paramsRow.myDatetimeParam = new Date();

var paramTable = [paramsRow];

    data.add(paramTable,'controlTable');
```

and the following SAS code would get you a table called `WORK.CONTROL` with three columns and one row:

```sas
%hfsGetDataset(controlTable, WORK.CONTROL);
```

Voila.


## SAS API Reference



### %hfsGetDataset(jsonvarname, outdset);

This macro deserialises a JavaScript data object into a SAS table.

`jsonvarname` is  the name given to the table array from the front end, corresponding to macroName in the `h54s.SasData(tableArray, macroName)` example

`outdset` is the name of the target dataset that the tableArray is to be deserialised into

### %hfsHeader;

This macro prepares the output stream for data object output. Conceptually similar to `%STPBEGIN`

### %hfsOutDataset(objectName, libn, dsn);

This macro serialises a SAS dataset to a JavaScript data object.

`objectName` is the name of the target JS object that the table will be serialised into

`libn` is the libname of the dataset to be serialised and transmitted to the frontend

`dsn` is the name of the dataset itself

### %hfsFooter;

This macro closes the output stream for data objects. Counterpart to `%hfsHeader`. Conceptually similar to `%STPEND`.

### %hfsErrorCheck;

This macro checks for the existence of an `&h54src` return code macro variable, and if present and is not set to 0, will output the associated error message to the front end before terminating the rest of the Stored Process code.


## JavaScript API Reference

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
  useMultipartFormData: true
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


### call(sasProgram, dataObj, callback)

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


### login(user, pass, callback)
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

### logout(callback)
Example:
```js
adapter.logout(function(err) {
  if(err !== undefined) {
    //http request failed
    //err is status code number
  }
})
```

### h54s.SasData(tableArray, macroName [, specs])
Creates an object which stores tables, which are then sent back to SAS via the `call` method.
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

### h54s.SasData.prototype.add(tableArray, macroName [, specs])
For specs object check the previous description (h54s.SasData) - it accepts the same specs object.

Adds additional tables to a SasData object:

```js
var data = new h54s.SasData([
  { name: 'Allan', sex: 'M', weight: 101.1 },
  { name: 'Abdul', sex: 'M', weight: 133.7 }
], 'datain');

data.add([
  {
    someNumber: 42.0,
    someString: 'Stuff'
  }
], 'moredata');
```


### getSasErrors()
Returns an array of SAS program errors. Last 100 SAS errors are retained by the adapter.

It returns array of objects:
```js
var errors = adapter.getSasErrors();
```

`errors[i].sasProgram` - The SAS _program where the error occurred

`errors[i].message` - The error itself

`errors[i].time` - the time at which erroring response occurred (javascript Date object)


### getApplicationLogs()

Array of log objects that is kept by the Adapter. A log object with `message`, `time`, and `sasProgram` properties is added to this array by the adapter whenever the SAS macro variable of &logmessage. has been set, and therefore passed to the front end application log.
```js
var appLogs = adapter.getApplicationLogs();
```

`appLogs[i].message` is a string, either returned from server, or added by the adapter


### getDebugData()
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

### getFailedRequests()
Note that failed requests array is populated only if debug mode is turned off (debug: false)

```js
var failedRequests = adapter.getFailedRequests();
```

`failedRequests[i].responseHtml` - SAS html output

`failedRequests[i].responseText` - SAS text output (stripped html)

`failedRequests[i].sasProgram` - SAS program called

`failedRequests[i].time` - the time of the response (javascript Date object)

### setDebugMode()
Set debugging mode - `debug:true`:
```js
adapter.setDebugMode();
```

###unsetDebugMode()
Unset  debugging mode - `debug:false`:
```js
adapter.unsetDebugMode();
```

###clearApplicationLogs()
Clears the application logs array
```js
adapter.clearApplicationLogs();
```

###clearDebugData()
Clears the debug data array
```js
adapter.clearDebugData()
```

###clearSasErrors()
Clears the SAS errors array
```js
adapter.clearSasErrors()
```

###clearFailedRequests()
Clears the failed requests array
```js
adapter.clearFailedRequests()
```

###clearAllLogs()
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

### Development and Testing of JS adapter code

1. Clone the project.
2. Run `npm install`
3. Install gulp-cli if it's not installed already - `npm install -g gulp-cli`.
4. Edit the host URL, user and pass in /test/js/_server_data.js.
5. Run `gulp`. It will run jshint and karma tests and creates build in dev/ directory. There are more gulp tasks.

  * `gulp watch` - Runs tests on file change.

  * `gulp release` - Creates dist/h54s.js and dist/h54s.min.js release files and runs karma tests with those files.

  * `gulp serveAngular` - Creates web server and serves angular.js example (default port is 1337)

  * `gulp serveExtjs` - Creates web server and serves ext.js example (default port is 1337)

  * `gulp serveExtjs2` - Creates web server and serves ext.js example (default port is 1337)

  * `gulp serveW2UI` - Creates web server and serves w2ui example (default port is 1337)


#### Any questions or comments? Come join the chat. [![Join the chat at https://gitter.im/Boemska/h54s](https://badges.gitter.im/Join%20Chat.svg)](https://gitter.im/Boemska/h54s?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

![Analytics](https://ga-beacon.appspot.com/UA-40531601-4/Boemska/h54s)
