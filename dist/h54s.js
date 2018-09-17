(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.h54s = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/*
* h54s error constructor
* @constructor
*
*@param {string} type - Error type
*@param {string} message - Error message
*@param {string} status - Error status returned from SAS
*
*/
function h54sError(type, message, status) {
  if(Error.captureStackTrace) {
    Error.captureStackTrace(this);
  }
  this.message = message;
  this.type    = type;
  this.status  = status;
}

h54sError.prototype = Object.create(Error.prototype, {
  constructor: {
    configurable: false,
    enumerable: false,
    writable: false,
    value: h54sError
  },
  name: {
    configurable: false,
    enumerable: false,
    writable: false,
    value: 'h54sError'
  }
});

module.exports = h54sError;

},{}],2:[function(require,module,exports){
var h54sError = require('../error.js');

/*
* h54s SAS Files object constructor
* @constructor
*
*@param {file} file - File added when object is created
*@param {string} macroName - macro name
*
*/
function Files(file, macroName) {
  this._files = {};

  Files.prototype.add.call(this, file, macroName);
}

/*
* Add file to files object
* @param {file} file - Instance of JavaScript File object
* @param {string} macroName - Sas macro name
*
*/
Files.prototype.add = function(file, macroName) {
  if(file && macroName) {
    if(!(file instanceof File || file instanceof Blob)) {
      throw new h54sError('argumentError', 'First argument must be instance of File object');
    }
    if(typeof macroName !== 'string') {
      throw new h54sError('argumentError', 'Second argument must be string');
    }
    if(!isNaN(macroName[macroName.length - 1])) {
      throw new h54sError('argumentError', 'Macro name cannot have number at the end');
    }
  } else {
    throw new h54sError('argumentError', 'Missing arguments');
  }

  this._files[macroName] = [
    'FILE',
    file
  ];
};

module.exports = Files;

},{"../error.js":1}],3:[function(require,module,exports){
var h54sError = require('./error.js');

/*
* Represents html5 for sas adapter
* @constructor
*
*@param {object} config - adapter config object, with keys like url, debug, etc.
*
*/
var h54s = module.exports = function(config) {

  //default config values
  this.maxXhrRetries        = 5;
  this.url                  = "/SASStoredProcess/do";
  this.debug                = false;
  this.loginUrl             = '/SASLogon/Logon.do';
  this.retryAfterLogin      = true;
  this.ajaxTimeout          = 30000;
  this.useMultipartFormData = true;
  this.RESTauth             = false;
  this.RESTauthLoginUrl     = '/SASLogon/v1/tickets';

  this.remoteConfigUpdateCallbacks = [];
  this._pendingCalls = [];
  this._ajax = require('./methods/ajax.js')();

  _setConfig.call(this, config);

  //override with remote if set
  if(config && config.isRemoteConfig) {
    var self = this;

    this._disableCalls = true;

    // 'h54sConfig.json' is for the testing with karma
    //replaced with gulp in dev build
    this._ajax.get('h54sConfig.json').success(function(res) {
      var remoteConfig = JSON.parse(res.responseText);

      for(var key in remoteConfig) {
        if(remoteConfig.hasOwnProperty(key) && config[key] === undefined && key !== 'isRemoteConfig') {
          config[key] = remoteConfig[key];
        }
      }

      _setConfig.call(self, config);

      //execute callbacks when we have remote config
      //note that remote conifg is merged with instance config
      for(var i = 0, n = self.remoteConfigUpdateCallbacks.length; i < n; i++) {
        var fn = self.remoteConfigUpdateCallbacks[i];
        fn();
      }

      //execute sas calls disabled while waiting for the config
      self._disableCalls = false;
      while(self._pendingCalls.length > 0) {
        var pendingCall = self._pendingCalls.shift();
        var sasProgram  = pendingCall.sasProgram;
        var callback    = pendingCall.callback;
        var params      = pendingCall.params;

        //update program with metadataRoot if it's not set
        if(self.metadataRoot && pendingCall.params._program.indexOf(self.metadataRoot) === -1) {
          pendingCall.params._program = self.metadataRoot.replace(/\/?$/, '/') + pendingCall.params._program.replace(/^\//, '');
        }

        //update debug because it may change in the meantime
        params._debug = self.debug ? 131 : 0;

        self.call(sasProgram, null, callback, params);
      }
    }).error(function (err) {
      throw new h54sError('ajaxError', 'Remote config file cannot be loaded. Http status code: ' + err.status);
    });
  }

  // private function to set h54s instance properties
  function _setConfig(config) {
    if(!config) {
      this._ajax.setTimeout(this.ajaxTimeout);
      return;
    } else if(typeof config !== 'object') {
      throw new h54sError('argumentError', 'First parameter should be config object');
    }

    //merge config object from parameter with this
    for(var key in config) {
      if(config.hasOwnProperty(key)) {
        if((key === 'url' || key === 'loginUrl') && config[key].charAt(0) !== '/') {
          config[key] = '/' + config[key];
        }
        this[key] = config[key];
      }
    }

    //if server is remote use the full server url
    //NOTE: this is not permited by the same-origin policy
    if(config.hostUrl) {
      if(config.hostUrl.charAt(config.hostUrl.length - 1) === '/') {
        config.hostUrl = config.hostUrl.slice(0, -1);
      }
      this.hostUrl          = config.hostUrl;
      this.url              = config.hostUrl + this.url;
      this.loginUrl         = config.hostUrl + this.loginUrl;
      this.RESTauthLoginUrl = config.hostUrl + this.RESTauthLoginUrl;
    }

    this._ajax.setTimeout(this.ajaxTimeout);
  }
};

//replaced with gulp
h54s.version = '1.0.0';


h54s.prototype = require('./methods');

h54s.Tables = require('./tables');
h54s.Files = require('./files');
h54s.SasData = require('./sasData.js');

h54s.fromSasDateTime = require('./methods/utils.js').fromSasDateTime;
h54s.toSasDateTime = require('./tables/utils.js').toSasDateTime;

//self invoked function module
require('./ie_polyfills.js');

},{"./error.js":1,"./files":2,"./ie_polyfills.js":4,"./methods":7,"./methods/ajax.js":6,"./methods/utils.js":8,"./sasData.js":9,"./tables":10,"./tables/utils.js":11}],4:[function(require,module,exports){
module.exports = function() {
  if (!Object.create) {
    Object.create = function(proto, props) {
      if (typeof props !== "undefined") {
        throw "The multiple-argument version of Object.create is not provided by this browser and cannot be shimmed.";
      }
      function ctor() { }
      ctor.prototype = proto;
      return new ctor();
    };
  }


  // From https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/keys
  if (!Object.keys) {
    Object.keys = (function () {
      'use strict';
      var hasOwnProperty = Object.prototype.hasOwnProperty,
          hasDontEnumBug = !({toString: null}).propertyIsEnumerable('toString'),
          dontEnums = [
            'toString',
            'toLocaleString',
            'valueOf',
            'hasOwnProperty',
            'isPrototypeOf',
            'propertyIsEnumerable',
            'constructor'
          ],
          dontEnumsLength = dontEnums.length;

      return function (obj) {
        if (typeof obj !== 'object' && (typeof obj !== 'function' || obj === null)) {
          throw new TypeError('Object.keys called on non-object');
        }

        var result = [], prop, i;

        for (prop in obj) {
          if (hasOwnProperty.call(obj, prop)) {
            result.push(prop);
          }
        }

        if (hasDontEnumBug) {
          for (i = 0; i < dontEnumsLength; i++) {
            if (hasOwnProperty.call(obj, dontEnums[i])) {
              result.push(dontEnums[i]);
            }
          }
        }
        return result;
      };
    }());
  }

  // From https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/lastIndexOf
  if (!Array.prototype.lastIndexOf) {
    Array.prototype.lastIndexOf = function(searchElement /*, fromIndex*/) {
      'use strict';

      if (this === void 0 || this === null) {
        throw new TypeError();
      }

      var n, k,
        t = Object(this),
        len = t.length >>> 0;
      if (len === 0) {
        return -1;
      }

      n = len - 1;
      if (arguments.length > 1) {
        n = Number(arguments[1]);
        if (n != n) {
          n = 0;
        }
        else if (n !== 0 && n != (1 / 0) && n != -(1 / 0)) {
          n = (n > 0 || -1) * Math.floor(Math.abs(n));
        }
      }

      for (k = n >= 0 ? Math.min(n, len - 1) : len - Math.abs(n); k >= 0; k--) {
        if (k in t && t[k] === searchElement) {
          return k;
        }
      }
      return -1;
    };
  }
}();

},{}],5:[function(require,module,exports){
var logs = {
  applicationLogs: [],
  debugData: [],
  sasErrors: [],
  failedRequests: []
};

var limits = {
  applicationLogs: 100,
  debugData: 20,
  failedRequests: 20,
  sasErrors: 100
};

module.exports.get = {
  getSasErrors: function() {
    return logs.sasErrors;
  },
  getApplicationLogs: function() {
    return logs.applicationLogs;
  },
  getDebugData: function() {
    return logs.debugData;
  },
  getFailedRequests: function() {
    return logs.failedRequests;
  }
};

module.exports.clear = {
  clearApplicationLogs: function() {
    logs.applicationLogs.splice(0, logs.applicationLogs.length);
  },
  clearDebugData: function() {
    logs.debugData.splice(0, logs.debugData.length);
  },
  clearSasErrors: function() {
    logs.sasErrors.splice(0, logs.sasErrors.length);
  },
  clearFailedRequests: function() {
    logs.failedRequests.splice(0, logs.failedRequests.length);
  },
  clearAllLogs: function() {
    this.clearApplicationLogs();
    this.clearDebugData();
    this.clearSasErrors();
    this.clearFailedRequests();
  }
};

/*
* Adds application logs to an array of logs
*
* @param {string} res - server response
*
*/
module.exports.addApplicationLog = function(message, sasProgram) {
  if(message === 'blank') {
    return;
  }
  var log = {
    message:    message,
    time:       new Date(),
    sasProgram: sasProgram
  };
  logs.applicationLogs.push(log);

  if(logs.applicationLogs.length > limits.applicationLogs) {
    logs.applicationLogs.shift();
  }
};

/*
* Adds debug data to an array of logs
*
* @param {string} res - server response
*
*/
module.exports.addDebugData = function(htmlData, debugText, sasProgram, params) {
  logs.debugData.push({
    debugHtml:  htmlData,
    debugText:  debugText,
    sasProgram: sasProgram,
    params:     params,
    time:       new Date()
  });

  if(logs.debugData.length > limits.debugData) {
    logs.debugData.shift();
  }
};

/*
* Adds failed requests to an array of logs
*
* @param {string} res - server response
*
*/
module.exports.addFailedRequest = function(responseText, debugText, sasProgram) {
  logs.failedRequests.push({
    responseHtml: responseText,
    responseText: debugText,
    sasProgram:   sasProgram,
    time:         new Date()
  });

  //max 20 failed requests
  if(logs.failedRequests.length > limits.failedRequests) {
    logs.failedRequests.shift();
  }
};

/*
* Adds SAS errors to an array of logs
*
* @param {string} res - server response
*
*/
module.exports.addSasErrors = function(errors) {
  logs.sasErrors = logs.sasErrors.concat(errors);

  while(logs.sasErrors.length > limits.sasErrors) {
    logs.sasErrors.shift();
  }
};

},{}],6:[function(require,module,exports){
module.exports = function() {
  var timeout = 30000;
  var timeoutHandle;

  var xhr = function(type, url, data, multipartFormData) {
    var methods = {
      success: function() {},
      error:   function() {}
    };
    var XHR     = XMLHttpRequest || ActiveXObject;
    var request = new XHR('MSXML2.XMLHTTP.3.0');

    request.open(type, url, true);

    //multipart/form-data is set automatically so no need for else block
    if(!multipartFormData) {
      request.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    }
    request.onreadystatechange = function () {
      if (request.readyState === 4) {
        clearTimeout(timeoutHandle);
        if (request.status >= 200 && request.status < 300) {
          methods.success.call(methods, request);
        } else {
          methods.error.call(methods, request);
        }
      }
    };

    if(timeout > 0) {
      timeoutHandle = setTimeout(function() {
        request.abort();
      }, timeout);
    }

    request.send(data);

    return {
      success: function (callback) {
        methods.success = callback;
        return this;
      },
      error: function (callback) {
        methods.error = callback;
        return this;
      }
    };
  };

  var serialize = function(obj) {
    var str = [];
    for(var p in obj) {
      if (obj.hasOwnProperty(p)) {
        if(obj[p] instanceof Array) {
          for(var i = 0, n = obj[p].length; i < n; i++) {
            str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p][i]));
          }
        } else {
          str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p]));
        }
      }
    }
    return str.join("&");
  };

  var createMultipartFormDataPayload = function(obj) {
    var data = new FormData();
    for(var p in obj) {
      if(obj.hasOwnProperty(p)) {
        if(obj[p] instanceof Array) {
          for(var i = 0, n = obj[p].length; i < n; i++) {
            data.append(p, obj[p][i]);
          }
        } else {
          data.append(p, obj[p]);
        }
      }
    }
    return data;
  };

  return {
    get: function(url, data) {
      var dataStr;
      if(typeof data === 'object') {
        dataStr = serialize(data);
      }
      var urlWithParams = dataStr ? (url + '?' + dataStr) : url;
      return xhr('GET', urlWithParams);
    },
    post: function(url, data, multipartFormData) {
      var payload;
      if(typeof data === 'object') {
        if(multipartFormData) {
          payload = createMultipartFormDataPayload(data);
        } else {
          payload = serialize(data);
        }
      }
      return xhr('POST', url, payload, multipartFormData);
    },
    setTimeout: function(t) {
      timeout = t;
    }
  };
};

},{}],7:[function(require,module,exports){
var h54sError = require('../error.js');
var logs = require('../logs.js');
var Tables = require('../tables');
var SasData = require('../sasData.js');
var Files = require('../files');

/*
* Call Sas program
*
* @param {string} sasProgram - Path of the sas program
* @param {function} callback - Callback function called when ajax call is finished
*
*/
module.exports.call = function(sasProgram, dataObj, callback, params) {
  var self        = this;
  var retryCount  = 0;
  var dbg         = this.debug;

  if (!callback || typeof callback !== 'function'){
    throw new h54sError('argumentError', 'You must provide callback');
  }
  if(!sasProgram) {
    throw new h54sError('argumentError', 'You must provide Sas program file path');
  }
  if(typeof sasProgram !== 'string') {
    throw new h54sError('argumentError', 'First parameter should be string');
  }
  if(this.useMultipartFormData === false && !(dataObj instanceof Tables)) {
    throw new h54sError('argumentError', 'Cannot send files using application/x-www-form-urlencoded. Please use Tables or default value for useMultipartFormData');
  }

  if(!params) {
    params = {
      _program: this._utils.getFullProgramPath(this.metadataRoot, sasProgram),
      _debug:   this.debug ? 131 : 0,
      _service: 'default'
    };
  }

  if(dataObj) {
    var key, dataProvider;
    if(dataObj instanceof Tables) {
      dataProvider = dataObj._tables;
    } else if(dataObj instanceof Files || dataObj instanceof SasData){
      dataProvider = dataObj._files;
    } else {
      throw new h54sError('argumentError', 'Wrong type of tables object');
    }
    for(key in dataProvider) {
      if(dataProvider.hasOwnProperty(key)) {
        params[key] = dataProvider[key];
      }
    }
  }

  if(this._disableCalls) {
    this._pendingCalls.push({
      sasProgram: sasProgram,
      callback:   callback,
      params:     params
    });
    return;
  }

  this._ajax.post(this.url, params, this.useMultipartFormData).success(function(res) {
    if(self._utils.needToLogin.call(self, res)) {
      //remember the call for latter use
      self._pendingCalls.push({
        sasProgram: sasProgram,
        callback:   callback,
        params:     params
      });

      //there's no need to continue if previous call returned login error
      if(self._disableCalls) {
        return;
      } else {
        self._disableCalls = true;
      }

      callback(new h54sError('notLoggedinError', 'You are not logged in'));
    } else {
      var resObj, unescapedResObj, err;
      var done = false;

      if(!dbg) {
        try {
          resObj = self._utils.parseRes(res.responseText, sasProgram, params);
          logs.addApplicationLog(resObj.logmessage, sasProgram);

          if(dataObj instanceof Tables) {
            unescapedResObj = self._utils.unescapeValues(resObj);
          } else {
            unescapedResObj = resObj;
          }

          if(resObj.status !== 'success') {
            err = new h54sError('programError', resObj.errormessage, resObj.status);
          }

          done = true;
        } catch(e) {
          if(e instanceof SyntaxError) {
            if(retryCount < self.maxXhrRetries) {
              done = false;
              self._ajax.post(self.url, params, self.useMultipartFormData).success(this.success).error(this.error);
              retryCount++;
              logs.addApplicationLog("Retrying #" + retryCount, sasProgram);
            } else {
              self._utils.parseErrorResponse(res.responseText, sasProgram);
              self._utils.addFailedResponse(res.responseText, sasProgram);
              err = new h54sError('parseError', 'Unable to parse response json');
              done = true;
            }
          } else if(e instanceof h54sError) {
            self._utils.parseErrorResponse(res.responseText, sasProgram);
            self._utils.addFailedResponse(res.responseText, sasProgram);
            err = e;
            done = true;
          } else {
            self._utils.parseErrorResponse(res.responseText, sasProgram);
            self._utils.addFailedResponse(res.responseText, sasProgram);
            err = new h54sError('unknownError', e.message);
            err.stack = e.stack;
            done = true;
          }
        } finally {
          if(done) {
            callback(err, unescapedResObj);
          }
        }
      } else {
        try {
          resObj = self._utils.parseDebugRes(res.responseText, sasProgram, params);
          logs.addApplicationLog(resObj.logmessage, sasProgram);

          if(dataObj instanceof Tables) {
            unescapedResObj = self._utils.unescapeValues(resObj);
          } else {
            unescapedResObj = resObj;
          }

          if(resObj.status !== 'success') {
            err = new h54sError('programError', resObj.errormessage, resObj.status);
          }

          done = true;
        } catch(e) {
          if(e instanceof SyntaxError) {
            err = new h54sError('parseError', e.message);
            done = true;
          } else if(e instanceof h54sError) {
            if(e.type === 'parseError' && retryCount < 1) {
              done = false;
              self._ajax.post(self.url, params, self.useMultipartFormData).success(this.success).error(this.error);
              retryCount++;
              logs.addApplicationLog("Retrying #" + retryCount, sasProgram);
            } else {
              if(e instanceof h54sError) {
                err = e;
              } else {
                err = new h54sError('parseError', 'Unable to parse response json');
              }
              done = true;
            }
          } else {
            err = new h54sError('unknownError', e.message);
            err.stack = e.stack;
            done = true;
          }
        } finally {
          if(done) {
            callback(err, unescapedResObj);
          }
        }
      }
    }
  }).error(function(res) {
    if(res.status === 401) {
      callback(new h54sError('notLoggedinError', 'You are not logged in'));
    } else {
      logs.addApplicationLog('Request failed with status: ' + res.status, sasProgram);
      callback(new h54sError('httpError', res.statusText));
    }
  });
};

/*
* Login method
*
* @param {string} user - Login username
* @param {string} pass - Login password
* @param {function} callback - Callback function called when ajax call is finished
*
* OR
*
* @param {function} callback - Callback function called when ajax call is finished
*
*/
module.exports.login = function(user, pass, callback) {
  if(!user || !pass) {
    throw new h54sError('argumentError', 'Credentials not set');
  }
  if(typeof user !== 'string' || typeof pass !== 'string') {
    throw new h54sError('argumentError', 'User and pass parameters must be strings');
  }
  //NOTE: callback optional?
  if(!callback || typeof callback !== 'function') {
    throw new h54sError('argumentError', 'You must provide callback');
  }

  if(!this.RESTauth) {
    handleSasLogon.call(this, user, pass, callback);
  } else {
    handleRestLogon.call(this, user, pass, callback);
  }
};

function handleSasLogon(user, pass, callback) {
  var self = this;

  var loginParams = {
    _service: 'default',
    ux: user,
    px: pass,
    //for SAS 9.4,
    username: user,
    password: pass
  };

  for (var key in this._aditionalLoginParams) {
    loginParams[key] = this._aditionalLoginParams[key];
  }

  this._loginAttempts = 0;

  this._ajax.post(this.loginUrl, loginParams).success(function(res) {
    if(++self._loginAttempts === 3) {
      return callback(-2);
    }

    if(self._utils.needToLogin.call(self, res)) {
      //we are getting form again after redirect
      //and need to login again using the new url
      //_loginChanged is set in needToLogin function
      //but if login url is not different, we are checking if there are aditional parameters
      if(self._loginChanged || (self._isNewLoginPage && !self._aditionalLoginParams)) {
        delete self._loginChanged;

        var inputs = res.responseText.match(/<input.*"hidden"[^>]*>/g);
        if(inputs) {
          inputs.forEach(function(inputStr) {
            var valueMatch = inputStr.match(/name="([^"]*)"\svalue="([^"]*)/);
            loginParams[valueMatch[1]] = valueMatch[2];
          });
        }

        var success = this.success, error = this.error;
        self._ajax.post(self.loginUrl, loginParams).success(function() {
          //we need this get request because of the sas 9.4 security checks
          self._ajax.get(self.url).success(success).error(error);
        }).error(this.error);
      } else {
        //getting form again, but it wasn't a redirect
        logs.addApplicationLog('Wrong username or password');
        callback(-1);
      }
    } else {
      callback(res.status);

      self._disableCalls = false;

      while(self._pendingCalls.length > 0) {
        var pendingCall     = self._pendingCalls.shift();
        var method          = pendingCall.method || self.call.bind(self);
        var sasProgram      = pendingCall.sasProgram;
        var callbackPending = pendingCall.callback;
        var params          = pendingCall.params;

        //update debug because it may change in the meantime
        params._debug = self.debug ? 131 : 0;

        if(self.retryAfterLogin) {
          method(sasProgram, null, callbackPending, params);
        }
      }
    }
  }).error(function(res) {
    logs.addApplicationLog('Login failed with status code: ' + res.status);
    callback(res.status);
  });
}

function handleRestLogon(user, pass, callback) {
  var self = this;

  var loginParams = {
    username: user,
    password: pass
  };

  this._ajax.post(this.RESTauthLoginUrl, loginParams).success(function(res) {
    var location = res.getResponseHeader('Location');

    self._ajax.post(location, {
      service: self.url
    }).success(function(res) {
      if(self.url.indexOf('?') === -1) {
        self.url += '?ticket=' + res.responseText;
      } else {
        if(self.url.indexOf('ticket') !== -1) {
          self.url = self.url.replace(/ticket=[^&]+/, 'ticket=' + res.responseText);
        } else {
          self.url += '&ticket=' + res.responseText;
        }
      }

      callback(res.status);
    }).error(function(res) {
      logs.addApplicationLog('Login failed with status code: ' + res.status);
      callback(res.status);
    });
  }).error(function(res) {
    if(res.responseText === 'error.authentication.credentials.bad') {
      callback(-1);
    } else {
      logs.addApplicationLog('Login failed with status code: ' + res.status);
      callback(res.status);
    }
  });
}

/*
* Logout method
*
* @param {function} callback - Callback function called when ajax call is finished
*
*/

module.exports.logout = function(callback) {
  this._ajax.get(this.url, {_action: 'logoff'}).success(function(res) {
    callback();
  }).error(function(res) {
    logs.addApplicationLog('Logout failed with status code: ' + res.status);
    callback(res.status);
  });
};

/*
* Enter debug mode
*
*/
module.exports.setDebugMode = function() {
  this.debug = true;
};

/*
* Exit debug mode
*
*/
module.exports.unsetDebugMode = function() {
  this.debug = false;
};

for(var key in logs.get) {
  if(logs.get.hasOwnProperty(key)) {
    module.exports[key] = logs.get[key];
  }
}

for(var key in logs.clear) {
  if(logs.clear.hasOwnProperty(key)) {
    module.exports[key] = logs.clear[key];
  }
}

/*
* Add callback functions executed when properties are updated with remote config
*
*@callback - callback pushed to array
*
*/
module.exports.onRemoteConfigUpdate = function(callback) {
  this.remoteConfigUpdateCallbacks.push(callback);
};

module.exports._utils = require('./utils.js');
},{"../error.js":1,"../files":2,"../logs.js":5,"../sasData.js":9,"../tables":10,"./utils.js":8}],8:[function(require,module,exports){
var logs = require('../logs.js');
var h54sError = require('../error.js');

var programNotFoundPatt = /<title>(Stored Process Error|SASStoredProcess)<\/title>[\s\S]*<h2>(Stored process not found:.*|.*not a valid stored process path.)<\/h2>/;
var responseReplace = function(res) {
  return res.replace(/(\r\n|\r|\n)/g, '').replace(/\\\\(n|r|t|f|b)/g, '\\$1').replace(/\\"\\"/g, '\\"');
};

/*
* Parse response from server
*
* @param {object} responseText - response html from the server
* @param {string} sasProgram - sas program path
* @param {object} params - params sent to sas program with addTable
*
*/
module.exports.parseRes = function(responseText, sasProgram, params) {
  var matches = responseText.match(programNotFoundPatt);
  if(matches) {
    throw new h54sError('programNotFound', 'You have not been granted permission to perform this action, or the STP is missing.');
  }
  //remove new lines in json response
  //replace \\(d) with \(d) - SAS json parser is escaping it
  return JSON.parse(responseReplace(responseText));
};

/*
* Parse response from server in debug mode
*
* @param {object} responseText - response html from the server
* @param {string} sasProgram - sas program path
* @param {object} params - params sent to sas program with addTable
*
*/
module.exports.parseDebugRes = function(responseText, sasProgram, params) {
  var matches = responseText.match(programNotFoundPatt);
  if(matches) {
    throw new h54sError('programNotFound', 'You have not been granted permission to perform this action, or the STP is missing.');
  }

  //find json
  patt              = /^(.?--h54s-data-start--)([\S\s]*?)(--h54s-data-end--)/m;
  matches           = responseText.match(patt);

  var page          = responseText.replace(patt, '');
  var htmlBodyPatt  = /<body.*>([\s\S]*)<\/body>/;
  var bodyMatches   = page.match(htmlBodyPatt);

  //remove html tags
  var debugText = bodyMatches[1].replace(/<[^>]*>/g, '');
  debugText     = this.decodeHTMLEntities(debugText);

  logs.addDebugData(bodyMatches[1], debugText, sasProgram, params);

  if(this.parseErrorResponse(responseText, sasProgram)) {
    throw new h54sError('sasError', 'Sas program completed with errors');
  }

  if(!matches) {
    throw new h54sError('parseError', 'Unable to parse response json');
  }
  //remove new lines in json response
  //replace \\(d) with \(d) - SAS json parser is escaping it
  var jsonObj = JSON.parse(responseReplace(matches[2]));

  return jsonObj;
};

/*
* Add failed response to logs - used only if debug=false
*
* @param {object} responseText - response html from the server
* @param {string} sasProgram - sas program path
*
*/
module.exports.addFailedResponse = function(responseText, sasProgram) {
  var patt      = /<script([\s\S]*)\/form>/;
  var patt2     = /display\s?:\s?none;?\s?/;
  //remove script with form for toggling the logs and "display:none" from style
  responseText  = responseText.replace(patt, '').replace(patt2, '');
  var debugText = responseText.replace(/<[^>]*>/g, '');
  debugText = this.decodeHTMLEntities(debugText);

  logs.addFailedRequest(responseText, debugText, sasProgram);
};

/*
* Unescape all string values in returned object
*
* @param {object} obj
*
*/
module.exports.unescapeValues = function(obj) {
  for (var key in obj) {
    if (typeof obj[key] === 'string') {
      obj[key] = decodeURIComponent(obj[key]);
    } else if(typeof obj === 'object') {
      this.unescapeValues(obj[key]);
    }
  }
  return obj;
};

/*
* Parse error response from server and save errors in memory
*
* @param {string} res - server response
* #param {string} sasProgram - sas program which returned the response
*
*/
module.exports.parseErrorResponse = function(res, sasProgram) {
  //capture 'ERROR: [text].' or 'ERROR xx [text].'
  var patt    = /^ERROR(:\s|\s\d\d)(.*\.|.*\n.*\.)/gm;
  var errors  = res.replace(/(<([^>]+)>)/ig, '').match(patt);
  if(!errors) {
    return;
  }

  var errMessage;
  for(var i = 0, n = errors.length; i < n; i++) {
    errMessage  = errors[i].replace(/<[^>]*>/g, '').replace(/(\n|\s{2,})/g, ' ');
    errMessage  = this.decodeHTMLEntities(errMessage);
    errors[i]   = {
      sasProgram: sasProgram,
      message:    errMessage,
      time:       new Date()
    };
  }

  logs.addSasErrors(errors);

  return true;
};

/*
* Decode HTML entities
*
* @param {string} res - server response
*
*/
module.exports.decodeHTMLEntities = function (html) {
  var tempElement = document.createElement('span');
  var str         = html.replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z]+);/gi,
    function (str) {
      tempElement.innerHTML = str;
      str                   = tempElement.textContent || tempElement.innerText;
      return str;
    }
  );
  return str;
};

/*
* Convert sas time to javascript date
*
* @param {number} sasDate - sas Tate object
*
*/
module.exports.fromSasDateTime = function (sasDate) {
  var basedate = new Date("January 1, 1960 00:00:00");
  var currdate = sasDate;

  // offsets for UTC and timezones and BST
  var baseOffset = basedate.getTimezoneOffset(); // in minutes

  // convert sas datetime to a current valid javascript date
  var basedateMs  = basedate.getTime(); // in ms
  var currdateMs  = currdate * 1000; // to ms
  var sasDatetime = currdateMs + basedateMs;
  var jsDate      = new Date();
  jsDate.setTime(sasDatetime); // first time to get offset BST daylight savings etc
  var currOffset  = jsDate.getTimezoneOffset(); // adjust for offset in minutes
  var offsetVar   = (baseOffset - currOffset) * 60 * 1000; // difference in milliseconds
  var offsetTime  = sasDatetime - offsetVar; // finding BST and daylight savings
  jsDate.setTime(offsetTime); // update with offset
  return jsDate;
};

module.exports.needToLogin = function(responseObj) {
  var patt = /<form.+action="(.*Logon[^"]*).*>/;
  var matches = patt.exec(responseObj.responseText);
  var newLoginUrl;

  if(!matches) {
    //there's no form, we are in. hooray!
    return false;
  } else {
    var actionUrl = matches[1].replace(/\?.*/, '');
    if(actionUrl.charAt(0) === '/') {
      newLoginUrl = this.hostUrl ? this.hostUrl + actionUrl : actionUrl;
      if(newLoginUrl !== this.loginUrl) {
        this._loginChanged = true;
        this.loginUrl = newLoginUrl;
      }
    } else {
      //relative path

      var lastIndOfSlash = responseObj.responseURL.lastIndexOf('/') + 1;
      //remove everything after the last slash, and everything until the first
      var relativeLoginUrl = responseObj.responseURL.substr(0, lastIndOfSlash).replace(/.*\/{2}[^\/]*/, '') + actionUrl;
      newLoginUrl = this.hostUrl ? this.hostUrl + relativeLoginUrl : relativeLoginUrl;
      if(newLoginUrl !== this.loginUrl) {
        this._loginChanged = true;
        this.loginUrl = newLoginUrl;
      }
    }

    //save parameters from hidden form fields
    var inputs = responseObj.responseText.match(/<input.*"hidden"[^>]*>/g);
    var hiddenFormParams = {};
    if(inputs) {
      //it's new login page if we have these additional parameters
      this._isNewLoginPage = true;
      inputs.forEach(function(inputStr) {
        var valueMatch = inputStr.match(/name="([^"]*)"\svalue="([^"]*)/);
        hiddenFormParams[valueMatch[1]] = valueMatch[2];
      });
      this._aditionalLoginParams = hiddenFormParams;
    }

    return true;
  }
};

/*
* Get full program path from metadata root and relative path
*
* @param {string} metadataRoot - Metadata root (path where all programs for the project are located)
* @param {string} sasProgramPath - Sas program path
*
*/
module.exports.getFullProgramPath = function(metadataRoot, sasProgramPath) {
  return metadataRoot ? metadataRoot.replace(/\/?$/, '/') + sasProgramPath.replace(/^\//, '') : sasProgramPath;
};

},{"../error.js":1,"../logs.js":5}],9:[function(require,module,exports){
var h54sError = require('./error.js');
var logs      = require('./logs.js');
var Tables    = require('./tables');
var Files     = require('./files');
var toSasDateTime = require('./tables/utils.js').toSasDateTime;

function validateMacro(macroName) {
  if(macroName.length > 32) {
    throw new h54sError('argumentError', 'Table name too long. Maximum is 32 characters');
  }

  var charCodeAt0 = macroName.charCodeAt(0);
  // validate it starts with A-Z, a-z, or _
  if((charCodeAt0 < 65 || charCodeAt0 > 90) && (charCodeAt0 < 97 || charCodeAt0 > 122) && macroName[0] !== '_') {
    throw new h54sError('argumentError', 'Table name starting with number or special characters');
  }

  for(var i = 0; i < macroName.length; i++) {
    var charCode = macroName.charCodeAt(i);

    if((charCode < 48 || charCode > 57) &&
      (charCode < 65 || charCode > 90) &&
      (charCode < 97 || charCode > 122) &&
      macroName[i] !== '_')
    {
      throw new h54sError('argumentError', 'Table name has unsupported characters');
    }
  }
}

/*
* h54s SAS data object constructor
* @constructor
*
*@param {array|file} data - Table or file added when object is created
*@param {string} macroName - macro name
*@param {number} parameterThreshold - size of data objects sent to SAS
*
*/
function SasData(data, macroName, specs) {
  if(data instanceof Array) {
    this._files = {};
    this.addTable(data, macroName, specs);
  } else if(data instanceof File || data instanceof Blob) {
    Files.call(this, data, macroName);
  } else {
    throw new h54sError('argumentError', 'Data argument wrong type or missing');
  }
}

/*
* Add table to tables object
* @param {array} table - Array of table objects
* @param {string} macroName - Sas macro name
*
*/
SasData.prototype.addTable = function(table, macroName, specs) {
  var isSpecsProvided = !!specs;
  if(table && macroName) {
    if(!(table instanceof Array)) {
      throw new h54sError('argumentError', 'First argument must be array');
    }
    if(typeof macroName !== 'string') {
      throw new h54sError('argumentError', 'Second argument must be string');
    }

    validateMacro(macroName);
  } else {
    throw new h54sError('argumentError', 'Missing arguments');
  }

  if (typeof table !== 'object' || !(table instanceof Array)) {
    throw new h54sError('argumentError', 'Table argument is not an array');
  }

  var key;
  if(specs) {
    if(specs.constructor !== Object) {
      throw new h54sError('argumentError', 'Specs data type wrong. Object expected.');
    }
    for(key in table[0]) {
      if(!specs[key]) {
        throw new h54sError('argumentError', 'Missing columns in specs data.');
      }
    }
    for(key in specs) {
      if(specs[key].constructor !== Object) {
        throw new h54sError('argumentError', 'Wrong column descriptor in specs data.');
      }
      if(!specs[key].colType || !specs[key].colLength) {
        throw new h54sError('argumentError', 'Missing columns in specs descriptor.');
      }
    }
  }

  var i, j, //counters used latter in code
      row, val, type,
      specKeys = [],
      specialChars = ['"', '\\', '/', '\n', '\t', '\f', '\r', '\b'];

  if(!specs) {
    specs = {};

    for (i = 0; i < table.length; i++) {
      row = table[i];

      if(typeof row !== 'object') {
        throw new h54sError('argumentError', 'Table item is not an object');
      }

      for(key in row) {
        if(row.hasOwnProperty(key)) {
          val  = row[key];
          type = typeof val;

          if(specs[key] === undefined) {
            specKeys.push(key);
            specs[key] = {};

            if (type === 'number') {
              if(val < Number.MIN_SAFE_INTEGER || val > Number.MAX_SAFE_INTEGER) {
                logs.addApplicationLog('Object[' + i + '].' + key + ' - This value exceeds expected numeric precision.');
              }
              specs[key].colType   = 'num';
              specs[key].colLength = 8;
            } else if (type === 'string' && !(val instanceof Date)) { // straightforward string
              specs[key].colType    = 'string';
              specs[key].colLength  = val.length;
            } else if(val instanceof Date) {
              specs[key].colType   = 'date';
              specs[key].colLength = 8;
            } else if (type === 'object') {
              specs[key].colType   = 'json';
              specs[key].colLength = JSON.stringify(val).length;
            }
          }
        }
      }
    }
  } else {
    specKeys = Object.keys(specs);
  }

  var sasCsv = '';

  // we need two loops - the first one is creating specs and validating
  for (i = 0; i < table.length; i++) {
    row = table[i];
    for(j = 0; j < specKeys.length; j++) {
      key = specKeys[j];
      if(row.hasOwnProperty(key)) {
        val  = row[key];
        type = typeof val;

        if(type === 'number' && isNaN(val)) {
          throw new h54sError('typeError', 'NaN value in one of the values (columns) is not allowed');
        }
        if(val === -Infinity || val === Infinity) {
          throw new h54sError('typeError', val.toString() + ' value in one of the values (columns) is not allowed');
        }
        if(val === true || val === false) {
          throw new h54sError('typeError', 'Boolean value in one of the values (columns) is not allowed');
        }
        if(type === 'string' && val.indexOf('\n') !== -1) {
          throw new h54sError('typeError', 'New line character is not supported');
        }

        // convert null to '.' for numbers and to '' for strings
        if(val === null) {
          if(specs[key].colType === 'string') {
            val = '';
            type = 'string';
          } else if(specs[key].colType === 'num') {
            val = '.';
            type = 'number';
          } else {
            throw new h54sError('typeError', 'Cannot convert null value');
          }
        }


        if ((type === 'number' && specs[key].colType !== 'num' && val !== '.') ||
          ((type === 'string' && !(val instanceof Date) && specs[key].colType !== 'string') &&
          (type === 'string' && specs[key].colType == 'num' && val !== '.')) ||
          (val instanceof Date && specs[key].colType !== 'date') ||
          ((type === 'object' && val.constructor !== Date) && specs[key].colType !== 'json'))
        {
          throw new h54sError('typeError', 'There is a specs type mismatch in the array between values (columns) of the same name.' +
            ' type/colType/val = ' + type +'/' + specs[key].colType + '/' + val );
        } else if(!isSpecsProvided && type === 'string' && specs[key].colLength < val.length) {
          specs[key].colLength = val.length;
        } else if((type === 'string' && specs[key].colLength < val.length) || (type !== 'string' && specs[key].colLength !== 8)) {
          throw new h54sError('typeError', 'There is a specs length mismatch in the array between values (columns) of the same name.' +
            ' type/colType/val = ' + type +'/' + specs[key].colType + '/' + val );
        }

        if (val instanceof Date) {
          val = toSasDateTime(val);
        }

        switch(specs[key].colType) {
          case 'num':
          case 'date':
            sasCsv += val;
            break;
          case 'string':
            sasCsv += '"' + val.replace(/"/g, '""') + '"';
            var colLength = val.length;
            for(var k = 0; k < val.length; k++) {
              if(specialChars.indexOf(val[k]) !== -1) {
                colLength++;
              } else {
                var code = val.charCodeAt(k);
                if(code > 0xffff) {
                  colLength += 3;
                } else if(code > 0x7ff) {
                  colLength += 2;
                } else if(code > 0x7f) {
                  colLength += 1;
                }
              }
            }
            // use maximum value between max previous, current value and 1 (first two can be 0 wich is not supported)
            specs[key].colLength = Math.max(specs[key].colLength, colLength, 1);
            break;
          case 'object':
            sasCsv += '"' + JSON.stringidy(val).replace(/"/g, '""') + '"';
            break;
        }
      }
      // do not insert if it's the last column
      if(j < specKeys.length - 1) {
        sasCsv += ',';
      }
    }
    if(i < table.length - 1) {
      sasCsv += '\n';
    }
  }

  //convert specs to csv with pipes
  var specString = specKeys.map(function(key) {
    return key + ',' + specs[key].colType + ',' + specs[key].colLength;
  }).join('|');

  this._files[macroName] = [
    specString,
    new Blob([sasCsv], {type: 'text/csv;charset=UTF-8'})
  ];
};

SasData.prototype.addFile  = function(file, macroName) {
  Files.prototype.add.call(this, file, macroName);
};

module.exports = SasData;

},{"./error.js":1,"./files":2,"./logs.js":5,"./tables":10,"./tables/utils.js":11}],10:[function(require,module,exports){
var h54sError = require('../error.js');

/*
* h54s tables object constructor
* @constructor
*
*@param {array} table - Table added when object is created
*@param {string} macroName - macro name
*@param {number} parameterThreshold - size of data objects sent to SAS
*
*/
function Tables(table, macroName, parameterThreshold) {
  this._tables = {};
  this._parameterThreshold = parameterThreshold || 30000;

  Tables.prototype.add.call(this, table, macroName);
}

/*
* Add table to tables object
* @param {array} table - Array of table objects
* @param {string} macroName - Sas macro name
*
*/
Tables.prototype.add = function(table, macroName) {
  if(table && macroName) {
    if(!(table instanceof Array)) {
      throw new h54sError('argumentError', 'First argument must be array');
    }
    if(typeof macroName !== 'string') {
      throw new h54sError('argumentError', 'Second argument must be string');
    }
    if(!isNaN(macroName[macroName.length - 1])) {
      throw new h54sError('argumentError', 'Macro name cannot have number at the end');
    }
  } else {
    throw new h54sError('argumentError', 'Missing arguments');
  }

  var result = this._utils.convertTableObject(table, this._parameterThreshold);

  var tableArray = [];
  tableArray.push(JSON.stringify(result.spec));
  for (var numberOfTables = 0; numberOfTables < result.data.length; numberOfTables++) {
    var outString = JSON.stringify(result.data[numberOfTables]);
    tableArray.push(outString);
  }
  this._tables[macroName] = tableArray;
};

Tables.prototype._utils = require('./utils.js');

module.exports = Tables;

},{"../error.js":1,"./utils.js":11}],11:[function(require,module,exports){
var h54sError = require('../error.js');
var logs = require('../logs.js');

/*
* Convert table object to Sas readable object
*
* @param {object} inObject - Object to convert
*
*/
module.exports.convertTableObject = function(inObject, chunkThreshold) {
  var self            = this;

  if(chunkThreshold > 30000) {
    console.warn('You should not set threshold larger than 30kb because of the SAS limitations');
  }

  // first check that the object is an array
  if (typeof (inObject) !== 'object') {
    throw new h54sError('argumentError', 'The parameter passed to checkAndGetTypeObject is not an object');
  }

  var arrayLength = inObject.length;
  if (typeof (arrayLength) !== 'number') {
    throw new h54sError('argumentError', 'The parameter passed to checkAndGetTypeObject does not have a valid length and is most likely not an array');
  }

  var existingCols = {}; // this is just to make lookup easier rather than traversing array each time. Will transform after

  // function checkAndSetArray - this will check an inObject current key against the existing typeArray and either return -1 if there
  // is a type mismatch or add an element and update/increment the length if needed

  function checkAndIncrement(colSpec) {
    if (typeof (existingCols[colSpec.colName]) === 'undefined') {
      existingCols[colSpec.colName]           = {};
      existingCols[colSpec.colName].colName   = colSpec.colName;
      existingCols[colSpec.colName].colType   = colSpec.colType;
      existingCols[colSpec.colName].colLength = colSpec.colLength > 0 ? colSpec.colLength : 1;
      return 0; // all ok
    }
    // check type match
    if (existingCols[colSpec.colName].colType !== colSpec.colType) {
      return -1; // there is a fudge in the typing
    }
    if (existingCols[colSpec.colName].colLength < colSpec.colLength) {
      existingCols[colSpec.colName].colLength = colSpec.colLength > 0 ? colSpec.colLength : 1; // increment the max length of this column
      return 0;
    }
  }
  var chunkArrayCount         = 0; // this is for keeping tabs on how long the current array string would be
  var targetArray             = []; // this is the array of target arrays
  var currentTarget           = 0;
  targetArray[currentTarget]  = [];
  var j                       = 0;
  for (var i = 0; i < inObject.length; i++) {
    targetArray[currentTarget][j] = {};
    var chunkRowCount             = 0;

    for (var key in inObject[i]) {
      var thisSpec  = {};
      var thisValue = inObject[i][key];

      //skip undefined values
      if(thisValue === undefined || thisValue === null) {
        continue;
      }

      //throw an error if there's NaN value
      if(typeof thisValue === 'number' && isNaN(thisValue)) {
        throw new h54sError('typeError', 'NaN value in one of the values (columns) is not allowed');
      }

      if(thisValue === -Infinity || thisValue === Infinity) {
        throw new h54sError('typeError', thisValue.toString() + ' value in one of the values (columns) is not allowed');
      }

      if(thisValue === true || thisValue === false) {
        throw new h54sError('typeError', 'Boolean value in one of the values (columns) is not allowed');
      }

      // get type... if it is an object then convert it to json and store as a string
      var thisType  = typeof (thisValue);

      if (thisType === 'number') { // straightforward number
        if(thisValue < Number.MIN_SAFE_INTEGER || thisValue > Number.MAX_SAFE_INTEGER) {
          logs.addApplicationLog('Object[' + i + '].' + key + ' - This value exceeds expected numeric precision.');
        }
        thisSpec.colName                    = key;
        thisSpec.colType                    = 'num';
        thisSpec.colLength                  = 8;
        thisSpec.encodedLength              = thisValue.toString().length;
        targetArray[currentTarget][j][key]  = thisValue;
      } else if (thisType === 'string') {
        thisSpec.colName    = key;
        thisSpec.colType    = 'string';
        thisSpec.colLength  = thisValue.length;

        if (thisValue === "") {
          targetArray[currentTarget][j][key] = " ";
        } else {
          targetArray[currentTarget][j][key] = encodeURIComponent(thisValue).replace(/'/g, '%27');
        }
        thisSpec.encodedLength = targetArray[currentTarget][j][key].length;
      } else if(thisValue instanceof Date) {
        throw new h54sError('typeError', 'Date type not supported. Please use h54s.toSasDateTime function to convert it');
      } else if (thisType == 'object') {
        thisSpec.colName                    = key;
        thisSpec.colType                    = 'json';
        thisSpec.colLength                  = JSON.stringify(thisValue).length;
        targetArray[currentTarget][j][key]  = encodeURIComponent(JSON.stringify(thisValue)).replace(/'/g, '%27');
        thisSpec.encodedLength              = targetArray[currentTarget][j][key].length;
      }

      chunkRowCount = chunkRowCount + 6 + key.length + thisSpec.encodedLength;

      if (checkAndIncrement(thisSpec) == -1) {
        throw new h54sError('typeError', 'There is a type mismatch in the array between values (columns) of the same name.');
      }
    }

    //remove last added row if it's empty
    if(Object.keys(targetArray[currentTarget][j]).length === 0) {
      targetArray[currentTarget].splice(j, 1);
      continue;
    }

    if (chunkRowCount > chunkThreshold) {
      throw new h54sError('argumentError', 'Row ' + j + ' exceeds size limit of 32kb');
    } else if(chunkArrayCount + chunkRowCount > chunkThreshold) {
      //create new array if this one is full and move the last item to the new array
      var lastRow = targetArray[currentTarget].pop(); // get rid of that last row
      currentTarget++; // move onto the next array
      targetArray[currentTarget]  = [lastRow]; // make it an array
      j                           = 0; // initialise new row counter for new array - it will be incremented at the end of the function
      chunkArrayCount             = chunkRowCount; // this is the new chunk max size
    } else {
      chunkArrayCount = chunkArrayCount + chunkRowCount;
    }
    j++;
  }

  // reformat existingCols into an array so sas can parse it;
  var specArray = [];
  for (var k in existingCols) {
    specArray.push(existingCols[k]);
  }
  return {
    spec:       specArray,
    data:       targetArray,
    jsonLength: chunkArrayCount
  }; // the spec will be the macro[0], with the data split into arrays of macro[1-n]
  // means in terms of dojo xhr object at least they need to go into the same array
};

/*
* Convert javascript date to sas time
*
* @param {object} jsDate - javascript Date object
*
*/
module.exports.toSasDateTime = function (jsDate) {
  var basedate = new Date("January 1, 1960 00:00:00");
  var currdate = jsDate;

  // offsets for UTC and timezones and BST
  var baseOffset = basedate.getTimezoneOffset(); // in minutes
  var currOffset = currdate.getTimezoneOffset(); // in minutes

  // convert currdate to a sas datetime
  var offsetSecs    = (currOffset - baseOffset) * 60; // offsetDiff is in minutes to start with
  var baseDateSecs  = basedate.getTime() / 1000; // get rid of ms
  var currdateSecs  = currdate.getTime() / 1000; // get rid of ms
  var sasDatetime   = Math.round(currdateSecs - baseDateSecs - offsetSecs); // adjust

  return sasDatetime;
};

},{"../error.js":1,"../logs.js":5}]},{},[3])(3)
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvZXJyb3IuanMiLCJzcmMvZmlsZXMvaW5kZXguanMiLCJzcmMvaDU0cy5qcyIsInNyYy9pZV9wb2x5ZmlsbHMuanMiLCJzcmMvbG9ncy5qcyIsInNyYy9tZXRob2RzL2FqYXguanMiLCJzcmMvbWV0aG9kcy9pbmRleC5qcyIsInNyYy9tZXRob2RzL3V0aWxzLmpzIiwic3JjL3Nhc0RhdGEuanMiLCJzcmMvdGFibGVzL2luZGV4LmpzIiwic3JjL3RhYmxlcy91dGlscy5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbFlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFPQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hRQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiLypcbiogaDU0cyBlcnJvciBjb25zdHJ1Y3RvclxuKiBAY29uc3RydWN0b3JcbipcbipAcGFyYW0ge3N0cmluZ30gdHlwZSAtIEVycm9yIHR5cGVcbipAcGFyYW0ge3N0cmluZ30gbWVzc2FnZSAtIEVycm9yIG1lc3NhZ2VcbipAcGFyYW0ge3N0cmluZ30gc3RhdHVzIC0gRXJyb3Igc3RhdHVzIHJldHVybmVkIGZyb20gU0FTXG4qXG4qL1xuZnVuY3Rpb24gaDU0c0Vycm9yKHR5cGUsIG1lc3NhZ2UsIHN0YXR1cykge1xuICBpZihFcnJvci5jYXB0dXJlU3RhY2tUcmFjZSkge1xuICAgIEVycm9yLmNhcHR1cmVTdGFja1RyYWNlKHRoaXMpO1xuICB9XG4gIHRoaXMubWVzc2FnZSA9IG1lc3NhZ2U7XG4gIHRoaXMudHlwZSAgICA9IHR5cGU7XG4gIHRoaXMuc3RhdHVzICA9IHN0YXR1cztcbn1cblxuaDU0c0Vycm9yLnByb3RvdHlwZSA9IE9iamVjdC5jcmVhdGUoRXJyb3IucHJvdG90eXBlLCB7XG4gIGNvbnN0cnVjdG9yOiB7XG4gICAgY29uZmlndXJhYmxlOiBmYWxzZSxcbiAgICBlbnVtZXJhYmxlOiBmYWxzZSxcbiAgICB3cml0YWJsZTogZmFsc2UsXG4gICAgdmFsdWU6IGg1NHNFcnJvclxuICB9LFxuICBuYW1lOiB7XG4gICAgY29uZmlndXJhYmxlOiBmYWxzZSxcbiAgICBlbnVtZXJhYmxlOiBmYWxzZSxcbiAgICB3cml0YWJsZTogZmFsc2UsXG4gICAgdmFsdWU6ICdoNTRzRXJyb3InXG4gIH1cbn0pO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGg1NHNFcnJvcjtcbiIsInZhciBoNTRzRXJyb3IgPSByZXF1aXJlKCcuLi9lcnJvci5qcycpO1xuXG4vKlxuKiBoNTRzIFNBUyBGaWxlcyBvYmplY3QgY29uc3RydWN0b3JcbiogQGNvbnN0cnVjdG9yXG4qXG4qQHBhcmFtIHtmaWxlfSBmaWxlIC0gRmlsZSBhZGRlZCB3aGVuIG9iamVjdCBpcyBjcmVhdGVkXG4qQHBhcmFtIHtzdHJpbmd9IG1hY3JvTmFtZSAtIG1hY3JvIG5hbWVcbipcbiovXG5mdW5jdGlvbiBGaWxlcyhmaWxlLCBtYWNyb05hbWUpIHtcbiAgdGhpcy5fZmlsZXMgPSB7fTtcblxuICBGaWxlcy5wcm90b3R5cGUuYWRkLmNhbGwodGhpcywgZmlsZSwgbWFjcm9OYW1lKTtcbn1cblxuLypcbiogQWRkIGZpbGUgdG8gZmlsZXMgb2JqZWN0XG4qIEBwYXJhbSB7ZmlsZX0gZmlsZSAtIEluc3RhbmNlIG9mIEphdmFTY3JpcHQgRmlsZSBvYmplY3RcbiogQHBhcmFtIHtzdHJpbmd9IG1hY3JvTmFtZSAtIFNhcyBtYWNybyBuYW1lXG4qXG4qL1xuRmlsZXMucHJvdG90eXBlLmFkZCA9IGZ1bmN0aW9uKGZpbGUsIG1hY3JvTmFtZSkge1xuICBpZihmaWxlICYmIG1hY3JvTmFtZSkge1xuICAgIGlmKCEoZmlsZSBpbnN0YW5jZW9mIEZpbGUgfHwgZmlsZSBpbnN0YW5jZW9mIEJsb2IpKSB7XG4gICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ0ZpcnN0IGFyZ3VtZW50IG11c3QgYmUgaW5zdGFuY2Ugb2YgRmlsZSBvYmplY3QnKTtcbiAgICB9XG4gICAgaWYodHlwZW9mIG1hY3JvTmFtZSAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnU2Vjb25kIGFyZ3VtZW50IG11c3QgYmUgc3RyaW5nJyk7XG4gICAgfVxuICAgIGlmKCFpc05hTihtYWNyb05hbWVbbWFjcm9OYW1lLmxlbmd0aCAtIDFdKSkge1xuICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdNYWNybyBuYW1lIGNhbm5vdCBoYXZlIG51bWJlciBhdCB0aGUgZW5kJyk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnTWlzc2luZyBhcmd1bWVudHMnKTtcbiAgfVxuXG4gIHRoaXMuX2ZpbGVzW21hY3JvTmFtZV0gPSBbXG4gICAgJ0ZJTEUnLFxuICAgIGZpbGVcbiAgXTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gRmlsZXM7XG4iLCJ2YXIgaDU0c0Vycm9yID0gcmVxdWlyZSgnLi9lcnJvci5qcycpO1xuXG4vKlxuKiBSZXByZXNlbnRzIGh0bWw1IGZvciBzYXMgYWRhcHRlclxuKiBAY29uc3RydWN0b3JcbipcbipAcGFyYW0ge29iamVjdH0gY29uZmlnIC0gYWRhcHRlciBjb25maWcgb2JqZWN0LCB3aXRoIGtleXMgbGlrZSB1cmwsIGRlYnVnLCBldGMuXG4qXG4qL1xudmFyIGg1NHMgPSBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKGNvbmZpZykge1xuXG4gIC8vZGVmYXVsdCBjb25maWcgdmFsdWVzXG4gIHRoaXMubWF4WGhyUmV0cmllcyAgICAgICAgPSA1O1xuICB0aGlzLnVybCAgICAgICAgICAgICAgICAgID0gXCIvU0FTU3RvcmVkUHJvY2Vzcy9kb1wiO1xuICB0aGlzLmRlYnVnICAgICAgICAgICAgICAgID0gZmFsc2U7XG4gIHRoaXMubG9naW5VcmwgICAgICAgICAgICAgPSAnL1NBU0xvZ29uL0xvZ29uLmRvJztcbiAgdGhpcy5yZXRyeUFmdGVyTG9naW4gICAgICA9IHRydWU7XG4gIHRoaXMuYWpheFRpbWVvdXQgICAgICAgICAgPSAzMDAwMDtcbiAgdGhpcy51c2VNdWx0aXBhcnRGb3JtRGF0YSA9IHRydWU7XG4gIHRoaXMuUkVTVGF1dGggICAgICAgICAgICAgPSBmYWxzZTtcbiAgdGhpcy5SRVNUYXV0aExvZ2luVXJsICAgICA9ICcvU0FTTG9nb24vdjEvdGlja2V0cyc7XG5cbiAgdGhpcy5yZW1vdGVDb25maWdVcGRhdGVDYWxsYmFja3MgPSBbXTtcbiAgdGhpcy5fcGVuZGluZ0NhbGxzID0gW107XG4gIHRoaXMuX2FqYXggPSByZXF1aXJlKCcuL21ldGhvZHMvYWpheC5qcycpKCk7XG5cbiAgX3NldENvbmZpZy5jYWxsKHRoaXMsIGNvbmZpZyk7XG5cbiAgLy9vdmVycmlkZSB3aXRoIHJlbW90ZSBpZiBzZXRcbiAgaWYoY29uZmlnICYmIGNvbmZpZy5pc1JlbW90ZUNvbmZpZykge1xuICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgIHRoaXMuX2Rpc2FibGVDYWxscyA9IHRydWU7XG5cbiAgICAvLyAnaDU0c0NvbmZpZy5qc29uJyBpcyBmb3IgdGhlIHRlc3Rpbmcgd2l0aCBrYXJtYVxuICAgIC8vcmVwbGFjZWQgd2l0aCBndWxwIGluIGRldiBidWlsZFxuICAgIHRoaXMuX2FqYXguZ2V0KCdoNTRzQ29uZmlnLmpzb24nKS5zdWNjZXNzKGZ1bmN0aW9uKHJlcykge1xuICAgICAgdmFyIHJlbW90ZUNvbmZpZyA9IEpTT04ucGFyc2UocmVzLnJlc3BvbnNlVGV4dCk7XG5cbiAgICAgIGZvcih2YXIga2V5IGluIHJlbW90ZUNvbmZpZykge1xuICAgICAgICBpZihyZW1vdGVDb25maWcuaGFzT3duUHJvcGVydHkoa2V5KSAmJiBjb25maWdba2V5XSA9PT0gdW5kZWZpbmVkICYmIGtleSAhPT0gJ2lzUmVtb3RlQ29uZmlnJykge1xuICAgICAgICAgIGNvbmZpZ1trZXldID0gcmVtb3RlQ29uZmlnW2tleV07XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgX3NldENvbmZpZy5jYWxsKHNlbGYsIGNvbmZpZyk7XG5cbiAgICAgIC8vZXhlY3V0ZSBjYWxsYmFja3Mgd2hlbiB3ZSBoYXZlIHJlbW90ZSBjb25maWdcbiAgICAgIC8vbm90ZSB0aGF0IHJlbW90ZSBjb25pZmcgaXMgbWVyZ2VkIHdpdGggaW5zdGFuY2UgY29uZmlnXG4gICAgICBmb3IodmFyIGkgPSAwLCBuID0gc2VsZi5yZW1vdGVDb25maWdVcGRhdGVDYWxsYmFja3MubGVuZ3RoOyBpIDwgbjsgaSsrKSB7XG4gICAgICAgIHZhciBmbiA9IHNlbGYucmVtb3RlQ29uZmlnVXBkYXRlQ2FsbGJhY2tzW2ldO1xuICAgICAgICBmbigpO1xuICAgICAgfVxuXG4gICAgICAvL2V4ZWN1dGUgc2FzIGNhbGxzIGRpc2FibGVkIHdoaWxlIHdhaXRpbmcgZm9yIHRoZSBjb25maWdcbiAgICAgIHNlbGYuX2Rpc2FibGVDYWxscyA9IGZhbHNlO1xuICAgICAgd2hpbGUoc2VsZi5fcGVuZGluZ0NhbGxzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgdmFyIHBlbmRpbmdDYWxsID0gc2VsZi5fcGVuZGluZ0NhbGxzLnNoaWZ0KCk7XG4gICAgICAgIHZhciBzYXNQcm9ncmFtICA9IHBlbmRpbmdDYWxsLnNhc1Byb2dyYW07XG4gICAgICAgIHZhciBjYWxsYmFjayAgICA9IHBlbmRpbmdDYWxsLmNhbGxiYWNrO1xuICAgICAgICB2YXIgcGFyYW1zICAgICAgPSBwZW5kaW5nQ2FsbC5wYXJhbXM7XG5cbiAgICAgICAgLy91cGRhdGUgcHJvZ3JhbSB3aXRoIG1ldGFkYXRhUm9vdCBpZiBpdCdzIG5vdCBzZXRcbiAgICAgICAgaWYoc2VsZi5tZXRhZGF0YVJvb3QgJiYgcGVuZGluZ0NhbGwucGFyYW1zLl9wcm9ncmFtLmluZGV4T2Yoc2VsZi5tZXRhZGF0YVJvb3QpID09PSAtMSkge1xuICAgICAgICAgIHBlbmRpbmdDYWxsLnBhcmFtcy5fcHJvZ3JhbSA9IHNlbGYubWV0YWRhdGFSb290LnJlcGxhY2UoL1xcLz8kLywgJy8nKSArIHBlbmRpbmdDYWxsLnBhcmFtcy5fcHJvZ3JhbS5yZXBsYWNlKC9eXFwvLywgJycpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy91cGRhdGUgZGVidWcgYmVjYXVzZSBpdCBtYXkgY2hhbmdlIGluIHRoZSBtZWFudGltZVxuICAgICAgICBwYXJhbXMuX2RlYnVnID0gc2VsZi5kZWJ1ZyA/IDEzMSA6IDA7XG5cbiAgICAgICAgc2VsZi5jYWxsKHNhc1Byb2dyYW0sIG51bGwsIGNhbGxiYWNrLCBwYXJhbXMpO1xuICAgICAgfVxuICAgIH0pLmVycm9yKGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FqYXhFcnJvcicsICdSZW1vdGUgY29uZmlnIGZpbGUgY2Fubm90IGJlIGxvYWRlZC4gSHR0cCBzdGF0dXMgY29kZTogJyArIGVyci5zdGF0dXMpO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gcHJpdmF0ZSBmdW5jdGlvbiB0byBzZXQgaDU0cyBpbnN0YW5jZSBwcm9wZXJ0aWVzXG4gIGZ1bmN0aW9uIF9zZXRDb25maWcoY29uZmlnKSB7XG4gICAgaWYoIWNvbmZpZykge1xuICAgICAgdGhpcy5fYWpheC5zZXRUaW1lb3V0KHRoaXMuYWpheFRpbWVvdXQpO1xuICAgICAgcmV0dXJuO1xuICAgIH0gZWxzZSBpZih0eXBlb2YgY29uZmlnICE9PSAnb2JqZWN0Jykge1xuICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdGaXJzdCBwYXJhbWV0ZXIgc2hvdWxkIGJlIGNvbmZpZyBvYmplY3QnKTtcbiAgICB9XG5cbiAgICAvL21lcmdlIGNvbmZpZyBvYmplY3QgZnJvbSBwYXJhbWV0ZXIgd2l0aCB0aGlzXG4gICAgZm9yKHZhciBrZXkgaW4gY29uZmlnKSB7XG4gICAgICBpZihjb25maWcuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuICAgICAgICBpZigoa2V5ID09PSAndXJsJyB8fCBrZXkgPT09ICdsb2dpblVybCcpICYmIGNvbmZpZ1trZXldLmNoYXJBdCgwKSAhPT0gJy8nKSB7XG4gICAgICAgICAgY29uZmlnW2tleV0gPSAnLycgKyBjb25maWdba2V5XTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzW2tleV0gPSBjb25maWdba2V5XTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvL2lmIHNlcnZlciBpcyByZW1vdGUgdXNlIHRoZSBmdWxsIHNlcnZlciB1cmxcbiAgICAvL05PVEU6IHRoaXMgaXMgbm90IHBlcm1pdGVkIGJ5IHRoZSBzYW1lLW9yaWdpbiBwb2xpY3lcbiAgICBpZihjb25maWcuaG9zdFVybCkge1xuICAgICAgaWYoY29uZmlnLmhvc3RVcmwuY2hhckF0KGNvbmZpZy5ob3N0VXJsLmxlbmd0aCAtIDEpID09PSAnLycpIHtcbiAgICAgICAgY29uZmlnLmhvc3RVcmwgPSBjb25maWcuaG9zdFVybC5zbGljZSgwLCAtMSk7XG4gICAgICB9XG4gICAgICB0aGlzLmhvc3RVcmwgICAgICAgICAgPSBjb25maWcuaG9zdFVybDtcbiAgICAgIHRoaXMudXJsICAgICAgICAgICAgICA9IGNvbmZpZy5ob3N0VXJsICsgdGhpcy51cmw7XG4gICAgICB0aGlzLmxvZ2luVXJsICAgICAgICAgPSBjb25maWcuaG9zdFVybCArIHRoaXMubG9naW5Vcmw7XG4gICAgICB0aGlzLlJFU1RhdXRoTG9naW5VcmwgPSBjb25maWcuaG9zdFVybCArIHRoaXMuUkVTVGF1dGhMb2dpblVybDtcbiAgICB9XG5cbiAgICB0aGlzLl9hamF4LnNldFRpbWVvdXQodGhpcy5hamF4VGltZW91dCk7XG4gIH1cbn07XG5cbi8vcmVwbGFjZWQgd2l0aCBndWxwXG5oNTRzLnZlcnNpb24gPSAnX192ZXJzaW9uX18nO1xuXG5cbmg1NHMucHJvdG90eXBlID0gcmVxdWlyZSgnLi9tZXRob2RzJyk7XG5cbmg1NHMuVGFibGVzID0gcmVxdWlyZSgnLi90YWJsZXMnKTtcbmg1NHMuRmlsZXMgPSByZXF1aXJlKCcuL2ZpbGVzJyk7XG5oNTRzLlNhc0RhdGEgPSByZXF1aXJlKCcuL3Nhc0RhdGEuanMnKTtcblxuaDU0cy5mcm9tU2FzRGF0ZVRpbWUgPSByZXF1aXJlKCcuL21ldGhvZHMvdXRpbHMuanMnKS5mcm9tU2FzRGF0ZVRpbWU7XG5oNTRzLnRvU2FzRGF0ZVRpbWUgPSByZXF1aXJlKCcuL3RhYmxlcy91dGlscy5qcycpLnRvU2FzRGF0ZVRpbWU7XG5cbi8vc2VsZiBpbnZva2VkIGZ1bmN0aW9uIG1vZHVsZVxucmVxdWlyZSgnLi9pZV9wb2x5ZmlsbHMuanMnKTtcbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XG4gIGlmICghT2JqZWN0LmNyZWF0ZSkge1xuICAgIE9iamVjdC5jcmVhdGUgPSBmdW5jdGlvbihwcm90bywgcHJvcHMpIHtcbiAgICAgIGlmICh0eXBlb2YgcHJvcHMgIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgICAgdGhyb3cgXCJUaGUgbXVsdGlwbGUtYXJndW1lbnQgdmVyc2lvbiBvZiBPYmplY3QuY3JlYXRlIGlzIG5vdCBwcm92aWRlZCBieSB0aGlzIGJyb3dzZXIgYW5kIGNhbm5vdCBiZSBzaGltbWVkLlwiO1xuICAgICAgfVxuICAgICAgZnVuY3Rpb24gY3RvcigpIHsgfVxuICAgICAgY3Rvci5wcm90b3R5cGUgPSBwcm90bztcbiAgICAgIHJldHVybiBuZXcgY3RvcigpO1xuICAgIH07XG4gIH1cblxuXG4gIC8vIEZyb20gaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvSmF2YVNjcmlwdC9SZWZlcmVuY2UvR2xvYmFsX09iamVjdHMvT2JqZWN0L2tleXNcbiAgaWYgKCFPYmplY3Qua2V5cykge1xuICAgIE9iamVjdC5rZXlzID0gKGZ1bmN0aW9uICgpIHtcbiAgICAgICd1c2Ugc3RyaWN0JztcbiAgICAgIHZhciBoYXNPd25Qcm9wZXJ0eSA9IE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHksXG4gICAgICAgICAgaGFzRG9udEVudW1CdWcgPSAhKHt0b1N0cmluZzogbnVsbH0pLnByb3BlcnR5SXNFbnVtZXJhYmxlKCd0b1N0cmluZycpLFxuICAgICAgICAgIGRvbnRFbnVtcyA9IFtcbiAgICAgICAgICAgICd0b1N0cmluZycsXG4gICAgICAgICAgICAndG9Mb2NhbGVTdHJpbmcnLFxuICAgICAgICAgICAgJ3ZhbHVlT2YnLFxuICAgICAgICAgICAgJ2hhc093blByb3BlcnR5JyxcbiAgICAgICAgICAgICdpc1Byb3RvdHlwZU9mJyxcbiAgICAgICAgICAgICdwcm9wZXJ0eUlzRW51bWVyYWJsZScsXG4gICAgICAgICAgICAnY29uc3RydWN0b3InXG4gICAgICAgICAgXSxcbiAgICAgICAgICBkb250RW51bXNMZW5ndGggPSBkb250RW51bXMubGVuZ3RoO1xuXG4gICAgICByZXR1cm4gZnVuY3Rpb24gKG9iaikge1xuICAgICAgICBpZiAodHlwZW9mIG9iaiAhPT0gJ29iamVjdCcgJiYgKHR5cGVvZiBvYmogIT09ICdmdW5jdGlvbicgfHwgb2JqID09PSBudWxsKSkge1xuICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ09iamVjdC5rZXlzIGNhbGxlZCBvbiBub24tb2JqZWN0Jyk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgcmVzdWx0ID0gW10sIHByb3AsIGk7XG5cbiAgICAgICAgZm9yIChwcm9wIGluIG9iaikge1xuICAgICAgICAgIGlmIChoYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwgcHJvcCkpIHtcbiAgICAgICAgICAgIHJlc3VsdC5wdXNoKHByb3ApO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChoYXNEb250RW51bUJ1Zykge1xuICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBkb250RW51bXNMZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgaWYgKGhhc093blByb3BlcnR5LmNhbGwob2JqLCBkb250RW51bXNbaV0pKSB7XG4gICAgICAgICAgICAgIHJlc3VsdC5wdXNoKGRvbnRFbnVtc1tpXSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICB9O1xuICAgIH0oKSk7XG4gIH1cblxuICAvLyBGcm9tIGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0phdmFTY3JpcHQvUmVmZXJlbmNlL0dsb2JhbF9PYmplY3RzL0FycmF5L2xhc3RJbmRleE9mXG4gIGlmICghQXJyYXkucHJvdG90eXBlLmxhc3RJbmRleE9mKSB7XG4gICAgQXJyYXkucHJvdG90eXBlLmxhc3RJbmRleE9mID0gZnVuY3Rpb24oc2VhcmNoRWxlbWVudCAvKiwgZnJvbUluZGV4Ki8pIHtcbiAgICAgICd1c2Ugc3RyaWN0JztcblxuICAgICAgaWYgKHRoaXMgPT09IHZvaWQgMCB8fCB0aGlzID09PSBudWxsKSB7XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoKTtcbiAgICAgIH1cblxuICAgICAgdmFyIG4sIGssXG4gICAgICAgIHQgPSBPYmplY3QodGhpcyksXG4gICAgICAgIGxlbiA9IHQubGVuZ3RoID4+PiAwO1xuICAgICAgaWYgKGxlbiA9PT0gMCkge1xuICAgICAgICByZXR1cm4gLTE7XG4gICAgICB9XG5cbiAgICAgIG4gPSBsZW4gLSAxO1xuICAgICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPiAxKSB7XG4gICAgICAgIG4gPSBOdW1iZXIoYXJndW1lbnRzWzFdKTtcbiAgICAgICAgaWYgKG4gIT0gbikge1xuICAgICAgICAgIG4gPSAwO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKG4gIT09IDAgJiYgbiAhPSAoMSAvIDApICYmIG4gIT0gLSgxIC8gMCkpIHtcbiAgICAgICAgICBuID0gKG4gPiAwIHx8IC0xKSAqIE1hdGguZmxvb3IoTWF0aC5hYnMobikpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGZvciAoayA9IG4gPj0gMCA/IE1hdGgubWluKG4sIGxlbiAtIDEpIDogbGVuIC0gTWF0aC5hYnMobik7IGsgPj0gMDsgay0tKSB7XG4gICAgICAgIGlmIChrIGluIHQgJiYgdFtrXSA9PT0gc2VhcmNoRWxlbWVudCkge1xuICAgICAgICAgIHJldHVybiBrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gLTE7XG4gICAgfTtcbiAgfVxufSgpO1xuIiwidmFyIGxvZ3MgPSB7XG4gIGFwcGxpY2F0aW9uTG9nczogW10sXG4gIGRlYnVnRGF0YTogW10sXG4gIHNhc0Vycm9yczogW10sXG4gIGZhaWxlZFJlcXVlc3RzOiBbXVxufTtcblxudmFyIGxpbWl0cyA9IHtcbiAgYXBwbGljYXRpb25Mb2dzOiAxMDAsXG4gIGRlYnVnRGF0YTogMjAsXG4gIGZhaWxlZFJlcXVlc3RzOiAyMCxcbiAgc2FzRXJyb3JzOiAxMDBcbn07XG5cbm1vZHVsZS5leHBvcnRzLmdldCA9IHtcbiAgZ2V0U2FzRXJyb3JzOiBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gbG9ncy5zYXNFcnJvcnM7XG4gIH0sXG4gIGdldEFwcGxpY2F0aW9uTG9nczogZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIGxvZ3MuYXBwbGljYXRpb25Mb2dzO1xuICB9LFxuICBnZXREZWJ1Z0RhdGE6IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiBsb2dzLmRlYnVnRGF0YTtcbiAgfSxcbiAgZ2V0RmFpbGVkUmVxdWVzdHM6IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiBsb2dzLmZhaWxlZFJlcXVlc3RzO1xuICB9XG59O1xuXG5tb2R1bGUuZXhwb3J0cy5jbGVhciA9IHtcbiAgY2xlYXJBcHBsaWNhdGlvbkxvZ3M6IGZ1bmN0aW9uKCkge1xuICAgIGxvZ3MuYXBwbGljYXRpb25Mb2dzLnNwbGljZSgwLCBsb2dzLmFwcGxpY2F0aW9uTG9ncy5sZW5ndGgpO1xuICB9LFxuICBjbGVhckRlYnVnRGF0YTogZnVuY3Rpb24oKSB7XG4gICAgbG9ncy5kZWJ1Z0RhdGEuc3BsaWNlKDAsIGxvZ3MuZGVidWdEYXRhLmxlbmd0aCk7XG4gIH0sXG4gIGNsZWFyU2FzRXJyb3JzOiBmdW5jdGlvbigpIHtcbiAgICBsb2dzLnNhc0Vycm9ycy5zcGxpY2UoMCwgbG9ncy5zYXNFcnJvcnMubGVuZ3RoKTtcbiAgfSxcbiAgY2xlYXJGYWlsZWRSZXF1ZXN0czogZnVuY3Rpb24oKSB7XG4gICAgbG9ncy5mYWlsZWRSZXF1ZXN0cy5zcGxpY2UoMCwgbG9ncy5mYWlsZWRSZXF1ZXN0cy5sZW5ndGgpO1xuICB9LFxuICBjbGVhckFsbExvZ3M6IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuY2xlYXJBcHBsaWNhdGlvbkxvZ3MoKTtcbiAgICB0aGlzLmNsZWFyRGVidWdEYXRhKCk7XG4gICAgdGhpcy5jbGVhclNhc0Vycm9ycygpO1xuICAgIHRoaXMuY2xlYXJGYWlsZWRSZXF1ZXN0cygpO1xuICB9XG59O1xuXG4vKlxuKiBBZGRzIGFwcGxpY2F0aW9uIGxvZ3MgdG8gYW4gYXJyYXkgb2YgbG9nc1xuKlxuKiBAcGFyYW0ge3N0cmluZ30gcmVzIC0gc2VydmVyIHJlc3BvbnNlXG4qXG4qL1xubW9kdWxlLmV4cG9ydHMuYWRkQXBwbGljYXRpb25Mb2cgPSBmdW5jdGlvbihtZXNzYWdlLCBzYXNQcm9ncmFtKSB7XG4gIGlmKG1lc3NhZ2UgPT09ICdibGFuaycpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgdmFyIGxvZyA9IHtcbiAgICBtZXNzYWdlOiAgICBtZXNzYWdlLFxuICAgIHRpbWU6ICAgICAgIG5ldyBEYXRlKCksXG4gICAgc2FzUHJvZ3JhbTogc2FzUHJvZ3JhbVxuICB9O1xuICBsb2dzLmFwcGxpY2F0aW9uTG9ncy5wdXNoKGxvZyk7XG5cbiAgaWYobG9ncy5hcHBsaWNhdGlvbkxvZ3MubGVuZ3RoID4gbGltaXRzLmFwcGxpY2F0aW9uTG9ncykge1xuICAgIGxvZ3MuYXBwbGljYXRpb25Mb2dzLnNoaWZ0KCk7XG4gIH1cbn07XG5cbi8qXG4qIEFkZHMgZGVidWcgZGF0YSB0byBhbiBhcnJheSBvZiBsb2dzXG4qXG4qIEBwYXJhbSB7c3RyaW5nfSByZXMgLSBzZXJ2ZXIgcmVzcG9uc2VcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5hZGREZWJ1Z0RhdGEgPSBmdW5jdGlvbihodG1sRGF0YSwgZGVidWdUZXh0LCBzYXNQcm9ncmFtLCBwYXJhbXMpIHtcbiAgbG9ncy5kZWJ1Z0RhdGEucHVzaCh7XG4gICAgZGVidWdIdG1sOiAgaHRtbERhdGEsXG4gICAgZGVidWdUZXh0OiAgZGVidWdUZXh0LFxuICAgIHNhc1Byb2dyYW06IHNhc1Byb2dyYW0sXG4gICAgcGFyYW1zOiAgICAgcGFyYW1zLFxuICAgIHRpbWU6ICAgICAgIG5ldyBEYXRlKClcbiAgfSk7XG5cbiAgaWYobG9ncy5kZWJ1Z0RhdGEubGVuZ3RoID4gbGltaXRzLmRlYnVnRGF0YSkge1xuICAgIGxvZ3MuZGVidWdEYXRhLnNoaWZ0KCk7XG4gIH1cbn07XG5cbi8qXG4qIEFkZHMgZmFpbGVkIHJlcXVlc3RzIHRvIGFuIGFycmF5IG9mIGxvZ3NcbipcbiogQHBhcmFtIHtzdHJpbmd9IHJlcyAtIHNlcnZlciByZXNwb25zZVxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLmFkZEZhaWxlZFJlcXVlc3QgPSBmdW5jdGlvbihyZXNwb25zZVRleHQsIGRlYnVnVGV4dCwgc2FzUHJvZ3JhbSkge1xuICBsb2dzLmZhaWxlZFJlcXVlc3RzLnB1c2goe1xuICAgIHJlc3BvbnNlSHRtbDogcmVzcG9uc2VUZXh0LFxuICAgIHJlc3BvbnNlVGV4dDogZGVidWdUZXh0LFxuICAgIHNhc1Byb2dyYW06ICAgc2FzUHJvZ3JhbSxcbiAgICB0aW1lOiAgICAgICAgIG5ldyBEYXRlKClcbiAgfSk7XG5cbiAgLy9tYXggMjAgZmFpbGVkIHJlcXVlc3RzXG4gIGlmKGxvZ3MuZmFpbGVkUmVxdWVzdHMubGVuZ3RoID4gbGltaXRzLmZhaWxlZFJlcXVlc3RzKSB7XG4gICAgbG9ncy5mYWlsZWRSZXF1ZXN0cy5zaGlmdCgpO1xuICB9XG59O1xuXG4vKlxuKiBBZGRzIFNBUyBlcnJvcnMgdG8gYW4gYXJyYXkgb2YgbG9nc1xuKlxuKiBAcGFyYW0ge3N0cmluZ30gcmVzIC0gc2VydmVyIHJlc3BvbnNlXG4qXG4qL1xubW9kdWxlLmV4cG9ydHMuYWRkU2FzRXJyb3JzID0gZnVuY3Rpb24oZXJyb3JzKSB7XG4gIGxvZ3Muc2FzRXJyb3JzID0gbG9ncy5zYXNFcnJvcnMuY29uY2F0KGVycm9ycyk7XG5cbiAgd2hpbGUobG9ncy5zYXNFcnJvcnMubGVuZ3RoID4gbGltaXRzLnNhc0Vycm9ycykge1xuICAgIGxvZ3Muc2FzRXJyb3JzLnNoaWZ0KCk7XG4gIH1cbn07XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xuICB2YXIgdGltZW91dCA9IDMwMDAwO1xuICB2YXIgdGltZW91dEhhbmRsZTtcblxuICB2YXIgeGhyID0gZnVuY3Rpb24odHlwZSwgdXJsLCBkYXRhLCBtdWx0aXBhcnRGb3JtRGF0YSkge1xuICAgIHZhciBtZXRob2RzID0ge1xuICAgICAgc3VjY2VzczogZnVuY3Rpb24oKSB7fSxcbiAgICAgIGVycm9yOiAgIGZ1bmN0aW9uKCkge31cbiAgICB9O1xuICAgIHZhciBYSFIgICAgID0gWE1MSHR0cFJlcXVlc3QgfHwgQWN0aXZlWE9iamVjdDtcbiAgICB2YXIgcmVxdWVzdCA9IG5ldyBYSFIoJ01TWE1MMi5YTUxIVFRQLjMuMCcpO1xuXG4gICAgcmVxdWVzdC5vcGVuKHR5cGUsIHVybCwgdHJ1ZSk7XG5cbiAgICAvL211bHRpcGFydC9mb3JtLWRhdGEgaXMgc2V0IGF1dG9tYXRpY2FsbHkgc28gbm8gbmVlZCBmb3IgZWxzZSBibG9ja1xuICAgIGlmKCFtdWx0aXBhcnRGb3JtRGF0YSkge1xuICAgICAgcmVxdWVzdC5zZXRSZXF1ZXN0SGVhZGVyKCdDb250ZW50LVR5cGUnLCAnYXBwbGljYXRpb24veC13d3ctZm9ybS11cmxlbmNvZGVkJyk7XG4gICAgfVxuICAgIHJlcXVlc3Qub25yZWFkeXN0YXRlY2hhbmdlID0gZnVuY3Rpb24gKCkge1xuICAgICAgaWYgKHJlcXVlc3QucmVhZHlTdGF0ZSA9PT0gNCkge1xuICAgICAgICBjbGVhclRpbWVvdXQodGltZW91dEhhbmRsZSk7XG4gICAgICAgIGlmIChyZXF1ZXN0LnN0YXR1cyA+PSAyMDAgJiYgcmVxdWVzdC5zdGF0dXMgPCAzMDApIHtcbiAgICAgICAgICBtZXRob2RzLnN1Y2Nlc3MuY2FsbChtZXRob2RzLCByZXF1ZXN0KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBtZXRob2RzLmVycm9yLmNhbGwobWV0aG9kcywgcmVxdWVzdCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9O1xuXG4gICAgaWYodGltZW91dCA+IDApIHtcbiAgICAgIHRpbWVvdXRIYW5kbGUgPSBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgICAgICByZXF1ZXN0LmFib3J0KCk7XG4gICAgICB9LCB0aW1lb3V0KTtcbiAgICB9XG5cbiAgICByZXF1ZXN0LnNlbmQoZGF0YSk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgc3VjY2VzczogZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgIG1ldGhvZHMuc3VjY2VzcyA9IGNhbGxiYWNrO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgIH0sXG4gICAgICBlcnJvcjogZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgIG1ldGhvZHMuZXJyb3IgPSBjYWxsYmFjaztcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICB9XG4gICAgfTtcbiAgfTtcblxuICB2YXIgc2VyaWFsaXplID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgdmFyIHN0ciA9IFtdO1xuICAgIGZvcih2YXIgcCBpbiBvYmopIHtcbiAgICAgIGlmIChvYmouaGFzT3duUHJvcGVydHkocCkpIHtcbiAgICAgICAgaWYob2JqW3BdIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgICAgICBmb3IodmFyIGkgPSAwLCBuID0gb2JqW3BdLmxlbmd0aDsgaSA8IG47IGkrKykge1xuICAgICAgICAgICAgc3RyLnB1c2goZW5jb2RlVVJJQ29tcG9uZW50KHApICsgXCI9XCIgKyBlbmNvZGVVUklDb21wb25lbnQob2JqW3BdW2ldKSk7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHN0ci5wdXNoKGVuY29kZVVSSUNvbXBvbmVudChwKSArIFwiPVwiICsgZW5jb2RlVVJJQ29tcG9uZW50KG9ialtwXSkpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBzdHIuam9pbihcIiZcIik7XG4gIH07XG5cbiAgdmFyIGNyZWF0ZU11bHRpcGFydEZvcm1EYXRhUGF5bG9hZCA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHZhciBkYXRhID0gbmV3IEZvcm1EYXRhKCk7XG4gICAgZm9yKHZhciBwIGluIG9iaikge1xuICAgICAgaWYob2JqLmhhc093blByb3BlcnR5KHApKSB7XG4gICAgICAgIGlmKG9ialtwXSBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgICAgICAgZm9yKHZhciBpID0gMCwgbiA9IG9ialtwXS5sZW5ndGg7IGkgPCBuOyBpKyspIHtcbiAgICAgICAgICAgIGRhdGEuYXBwZW5kKHAsIG9ialtwXVtpXSk7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGRhdGEuYXBwZW5kKHAsIG9ialtwXSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGRhdGE7XG4gIH07XG5cbiAgcmV0dXJuIHtcbiAgICBnZXQ6IGZ1bmN0aW9uKHVybCwgZGF0YSkge1xuICAgICAgdmFyIGRhdGFTdHI7XG4gICAgICBpZih0eXBlb2YgZGF0YSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgZGF0YVN0ciA9IHNlcmlhbGl6ZShkYXRhKTtcbiAgICAgIH1cbiAgICAgIHZhciB1cmxXaXRoUGFyYW1zID0gZGF0YVN0ciA/ICh1cmwgKyAnPycgKyBkYXRhU3RyKSA6IHVybDtcbiAgICAgIHJldHVybiB4aHIoJ0dFVCcsIHVybFdpdGhQYXJhbXMpO1xuICAgIH0sXG4gICAgcG9zdDogZnVuY3Rpb24odXJsLCBkYXRhLCBtdWx0aXBhcnRGb3JtRGF0YSkge1xuICAgICAgdmFyIHBheWxvYWQ7XG4gICAgICBpZih0eXBlb2YgZGF0YSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgaWYobXVsdGlwYXJ0Rm9ybURhdGEpIHtcbiAgICAgICAgICBwYXlsb2FkID0gY3JlYXRlTXVsdGlwYXJ0Rm9ybURhdGFQYXlsb2FkKGRhdGEpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHBheWxvYWQgPSBzZXJpYWxpemUoZGF0YSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiB4aHIoJ1BPU1QnLCB1cmwsIHBheWxvYWQsIG11bHRpcGFydEZvcm1EYXRhKTtcbiAgICB9LFxuICAgIHNldFRpbWVvdXQ6IGZ1bmN0aW9uKHQpIHtcbiAgICAgIHRpbWVvdXQgPSB0O1xuICAgIH1cbiAgfTtcbn07XG4iLCJ2YXIgaDU0c0Vycm9yID0gcmVxdWlyZSgnLi4vZXJyb3IuanMnKTtcbnZhciBsb2dzID0gcmVxdWlyZSgnLi4vbG9ncy5qcycpO1xudmFyIFRhYmxlcyA9IHJlcXVpcmUoJy4uL3RhYmxlcycpO1xudmFyIFNhc0RhdGEgPSByZXF1aXJlKCcuLi9zYXNEYXRhLmpzJyk7XG52YXIgRmlsZXMgPSByZXF1aXJlKCcuLi9maWxlcycpO1xuXG4vKlxuKiBDYWxsIFNhcyBwcm9ncmFtXG4qXG4qIEBwYXJhbSB7c3RyaW5nfSBzYXNQcm9ncmFtIC0gUGF0aCBvZiB0aGUgc2FzIHByb2dyYW1cbiogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgLSBDYWxsYmFjayBmdW5jdGlvbiBjYWxsZWQgd2hlbiBhamF4IGNhbGwgaXMgZmluaXNoZWRcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5jYWxsID0gZnVuY3Rpb24oc2FzUHJvZ3JhbSwgZGF0YU9iaiwgY2FsbGJhY2ssIHBhcmFtcykge1xuICB2YXIgc2VsZiAgICAgICAgPSB0aGlzO1xuICB2YXIgcmV0cnlDb3VudCAgPSAwO1xuICB2YXIgZGJnICAgICAgICAgPSB0aGlzLmRlYnVnO1xuXG4gIGlmICghY2FsbGJhY2sgfHwgdHlwZW9mIGNhbGxiYWNrICE9PSAnZnVuY3Rpb24nKXtcbiAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1lvdSBtdXN0IHByb3ZpZGUgY2FsbGJhY2snKTtcbiAgfVxuICBpZighc2FzUHJvZ3JhbSkge1xuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnWW91IG11c3QgcHJvdmlkZSBTYXMgcHJvZ3JhbSBmaWxlIHBhdGgnKTtcbiAgfVxuICBpZih0eXBlb2Ygc2FzUHJvZ3JhbSAhPT0gJ3N0cmluZycpIHtcbiAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ0ZpcnN0IHBhcmFtZXRlciBzaG91bGQgYmUgc3RyaW5nJyk7XG4gIH1cbiAgaWYodGhpcy51c2VNdWx0aXBhcnRGb3JtRGF0YSA9PT0gZmFsc2UgJiYgIShkYXRhT2JqIGluc3RhbmNlb2YgVGFibGVzKSkge1xuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnQ2Fubm90IHNlbmQgZmlsZXMgdXNpbmcgYXBwbGljYXRpb24veC13d3ctZm9ybS11cmxlbmNvZGVkLiBQbGVhc2UgdXNlIFRhYmxlcyBvciBkZWZhdWx0IHZhbHVlIGZvciB1c2VNdWx0aXBhcnRGb3JtRGF0YScpO1xuICB9XG5cbiAgaWYoIXBhcmFtcykge1xuICAgIHBhcmFtcyA9IHtcbiAgICAgIF9wcm9ncmFtOiB0aGlzLl91dGlscy5nZXRGdWxsUHJvZ3JhbVBhdGgodGhpcy5tZXRhZGF0YVJvb3QsIHNhc1Byb2dyYW0pLFxuICAgICAgX2RlYnVnOiAgIHRoaXMuZGVidWcgPyAxMzEgOiAwLFxuICAgICAgX3NlcnZpY2U6ICdkZWZhdWx0J1xuICAgIH07XG4gIH1cblxuICBpZihkYXRhT2JqKSB7XG4gICAgdmFyIGtleSwgZGF0YVByb3ZpZGVyO1xuICAgIGlmKGRhdGFPYmogaW5zdGFuY2VvZiBUYWJsZXMpIHtcbiAgICAgIGRhdGFQcm92aWRlciA9IGRhdGFPYmouX3RhYmxlcztcbiAgICB9IGVsc2UgaWYoZGF0YU9iaiBpbnN0YW5jZW9mIEZpbGVzIHx8IGRhdGFPYmogaW5zdGFuY2VvZiBTYXNEYXRhKXtcbiAgICAgIGRhdGFQcm92aWRlciA9IGRhdGFPYmouX2ZpbGVzO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1dyb25nIHR5cGUgb2YgdGFibGVzIG9iamVjdCcpO1xuICAgIH1cbiAgICBmb3Ioa2V5IGluIGRhdGFQcm92aWRlcikge1xuICAgICAgaWYoZGF0YVByb3ZpZGVyLmhhc093blByb3BlcnR5KGtleSkpIHtcbiAgICAgICAgcGFyYW1zW2tleV0gPSBkYXRhUHJvdmlkZXJba2V5XTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBpZih0aGlzLl9kaXNhYmxlQ2FsbHMpIHtcbiAgICB0aGlzLl9wZW5kaW5nQ2FsbHMucHVzaCh7XG4gICAgICBzYXNQcm9ncmFtOiBzYXNQcm9ncmFtLFxuICAgICAgY2FsbGJhY2s6ICAgY2FsbGJhY2ssXG4gICAgICBwYXJhbXM6ICAgICBwYXJhbXNcbiAgICB9KTtcbiAgICByZXR1cm47XG4gIH1cblxuICB0aGlzLl9hamF4LnBvc3QodGhpcy51cmwsIHBhcmFtcywgdGhpcy51c2VNdWx0aXBhcnRGb3JtRGF0YSkuc3VjY2VzcyhmdW5jdGlvbihyZXMpIHtcbiAgICBpZihzZWxmLl91dGlscy5uZWVkVG9Mb2dpbi5jYWxsKHNlbGYsIHJlcykpIHtcbiAgICAgIC8vcmVtZW1iZXIgdGhlIGNhbGwgZm9yIGxhdHRlciB1c2VcbiAgICAgIHNlbGYuX3BlbmRpbmdDYWxscy5wdXNoKHtcbiAgICAgICAgc2FzUHJvZ3JhbTogc2FzUHJvZ3JhbSxcbiAgICAgICAgY2FsbGJhY2s6ICAgY2FsbGJhY2ssXG4gICAgICAgIHBhcmFtczogICAgIHBhcmFtc1xuICAgICAgfSk7XG5cbiAgICAgIC8vdGhlcmUncyBubyBuZWVkIHRvIGNvbnRpbnVlIGlmIHByZXZpb3VzIGNhbGwgcmV0dXJuZWQgbG9naW4gZXJyb3JcbiAgICAgIGlmKHNlbGYuX2Rpc2FibGVDYWxscykge1xuICAgICAgICByZXR1cm47XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzZWxmLl9kaXNhYmxlQ2FsbHMgPSB0cnVlO1xuICAgICAgfVxuXG4gICAgICBjYWxsYmFjayhuZXcgaDU0c0Vycm9yKCdub3RMb2dnZWRpbkVycm9yJywgJ1lvdSBhcmUgbm90IGxvZ2dlZCBpbicpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIHJlc09iaiwgdW5lc2NhcGVkUmVzT2JqLCBlcnI7XG4gICAgICB2YXIgZG9uZSA9IGZhbHNlO1xuXG4gICAgICBpZighZGJnKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgcmVzT2JqID0gc2VsZi5fdXRpbHMucGFyc2VSZXMocmVzLnJlc3BvbnNlVGV4dCwgc2FzUHJvZ3JhbSwgcGFyYW1zKTtcbiAgICAgICAgICBsb2dzLmFkZEFwcGxpY2F0aW9uTG9nKHJlc09iai5sb2dtZXNzYWdlLCBzYXNQcm9ncmFtKTtcblxuICAgICAgICAgIGlmKGRhdGFPYmogaW5zdGFuY2VvZiBUYWJsZXMpIHtcbiAgICAgICAgICAgIHVuZXNjYXBlZFJlc09iaiA9IHNlbGYuX3V0aWxzLnVuZXNjYXBlVmFsdWVzKHJlc09iaik7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHVuZXNjYXBlZFJlc09iaiA9IHJlc09iajtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZihyZXNPYmouc3RhdHVzICE9PSAnc3VjY2VzcycpIHtcbiAgICAgICAgICAgIGVyciA9IG5ldyBoNTRzRXJyb3IoJ3Byb2dyYW1FcnJvcicsIHJlc09iai5lcnJvcm1lc3NhZ2UsIHJlc09iai5zdGF0dXMpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGRvbmUgPSB0cnVlO1xuICAgICAgICB9IGNhdGNoKGUpIHtcbiAgICAgICAgICBpZihlIGluc3RhbmNlb2YgU3ludGF4RXJyb3IpIHtcbiAgICAgICAgICAgIGlmKHJldHJ5Q291bnQgPCBzZWxmLm1heFhoclJldHJpZXMpIHtcbiAgICAgICAgICAgICAgZG9uZSA9IGZhbHNlO1xuICAgICAgICAgICAgICBzZWxmLl9hamF4LnBvc3Qoc2VsZi51cmwsIHBhcmFtcywgc2VsZi51c2VNdWx0aXBhcnRGb3JtRGF0YSkuc3VjY2Vzcyh0aGlzLnN1Y2Nlc3MpLmVycm9yKHRoaXMuZXJyb3IpO1xuICAgICAgICAgICAgICByZXRyeUNvdW50Kys7XG4gICAgICAgICAgICAgIGxvZ3MuYWRkQXBwbGljYXRpb25Mb2coXCJSZXRyeWluZyAjXCIgKyByZXRyeUNvdW50LCBzYXNQcm9ncmFtKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHNlbGYuX3V0aWxzLnBhcnNlRXJyb3JSZXNwb25zZShyZXMucmVzcG9uc2VUZXh0LCBzYXNQcm9ncmFtKTtcbiAgICAgICAgICAgICAgc2VsZi5fdXRpbHMuYWRkRmFpbGVkUmVzcG9uc2UocmVzLnJlc3BvbnNlVGV4dCwgc2FzUHJvZ3JhbSk7XG4gICAgICAgICAgICAgIGVyciA9IG5ldyBoNTRzRXJyb3IoJ3BhcnNlRXJyb3InLCAnVW5hYmxlIHRvIHBhcnNlIHJlc3BvbnNlIGpzb24nKTtcbiAgICAgICAgICAgICAgZG9uZSA9IHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIGlmKGUgaW5zdGFuY2VvZiBoNTRzRXJyb3IpIHtcbiAgICAgICAgICAgIHNlbGYuX3V0aWxzLnBhcnNlRXJyb3JSZXNwb25zZShyZXMucmVzcG9uc2VUZXh0LCBzYXNQcm9ncmFtKTtcbiAgICAgICAgICAgIHNlbGYuX3V0aWxzLmFkZEZhaWxlZFJlc3BvbnNlKHJlcy5yZXNwb25zZVRleHQsIHNhc1Byb2dyYW0pO1xuICAgICAgICAgICAgZXJyID0gZTtcbiAgICAgICAgICAgIGRvbmUgPSB0cnVlO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzZWxmLl91dGlscy5wYXJzZUVycm9yUmVzcG9uc2UocmVzLnJlc3BvbnNlVGV4dCwgc2FzUHJvZ3JhbSk7XG4gICAgICAgICAgICBzZWxmLl91dGlscy5hZGRGYWlsZWRSZXNwb25zZShyZXMucmVzcG9uc2VUZXh0LCBzYXNQcm9ncmFtKTtcbiAgICAgICAgICAgIGVyciA9IG5ldyBoNTRzRXJyb3IoJ3Vua25vd25FcnJvcicsIGUubWVzc2FnZSk7XG4gICAgICAgICAgICBlcnIuc3RhY2sgPSBlLnN0YWNrO1xuICAgICAgICAgICAgZG9uZSA9IHRydWU7XG4gICAgICAgICAgfVxuICAgICAgICB9IGZpbmFsbHkge1xuICAgICAgICAgIGlmKGRvbmUpIHtcbiAgICAgICAgICAgIGNhbGxiYWNrKGVyciwgdW5lc2NhcGVkUmVzT2JqKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgcmVzT2JqID0gc2VsZi5fdXRpbHMucGFyc2VEZWJ1Z1JlcyhyZXMucmVzcG9uc2VUZXh0LCBzYXNQcm9ncmFtLCBwYXJhbXMpO1xuICAgICAgICAgIGxvZ3MuYWRkQXBwbGljYXRpb25Mb2cocmVzT2JqLmxvZ21lc3NhZ2UsIHNhc1Byb2dyYW0pO1xuXG4gICAgICAgICAgaWYoZGF0YU9iaiBpbnN0YW5jZW9mIFRhYmxlcykge1xuICAgICAgICAgICAgdW5lc2NhcGVkUmVzT2JqID0gc2VsZi5fdXRpbHMudW5lc2NhcGVWYWx1ZXMocmVzT2JqKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdW5lc2NhcGVkUmVzT2JqID0gcmVzT2JqO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmKHJlc09iai5zdGF0dXMgIT09ICdzdWNjZXNzJykge1xuICAgICAgICAgICAgZXJyID0gbmV3IGg1NHNFcnJvcigncHJvZ3JhbUVycm9yJywgcmVzT2JqLmVycm9ybWVzc2FnZSwgcmVzT2JqLnN0YXR1cyk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgZG9uZSA9IHRydWU7XG4gICAgICAgIH0gY2F0Y2goZSkge1xuICAgICAgICAgIGlmKGUgaW5zdGFuY2VvZiBTeW50YXhFcnJvcikge1xuICAgICAgICAgICAgZXJyID0gbmV3IGg1NHNFcnJvcigncGFyc2VFcnJvcicsIGUubWVzc2FnZSk7XG4gICAgICAgICAgICBkb25lID0gdHJ1ZTtcbiAgICAgICAgICB9IGVsc2UgaWYoZSBpbnN0YW5jZW9mIGg1NHNFcnJvcikge1xuICAgICAgICAgICAgaWYoZS50eXBlID09PSAncGFyc2VFcnJvcicgJiYgcmV0cnlDb3VudCA8IDEpIHtcbiAgICAgICAgICAgICAgZG9uZSA9IGZhbHNlO1xuICAgICAgICAgICAgICBzZWxmLl9hamF4LnBvc3Qoc2VsZi51cmwsIHBhcmFtcywgc2VsZi51c2VNdWx0aXBhcnRGb3JtRGF0YSkuc3VjY2Vzcyh0aGlzLnN1Y2Nlc3MpLmVycm9yKHRoaXMuZXJyb3IpO1xuICAgICAgICAgICAgICByZXRyeUNvdW50Kys7XG4gICAgICAgICAgICAgIGxvZ3MuYWRkQXBwbGljYXRpb25Mb2coXCJSZXRyeWluZyAjXCIgKyByZXRyeUNvdW50LCBzYXNQcm9ncmFtKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGlmKGUgaW5zdGFuY2VvZiBoNTRzRXJyb3IpIHtcbiAgICAgICAgICAgICAgICBlcnIgPSBlO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGVyciA9IG5ldyBoNTRzRXJyb3IoJ3BhcnNlRXJyb3InLCAnVW5hYmxlIHRvIHBhcnNlIHJlc3BvbnNlIGpzb24nKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBkb25lID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZXJyID0gbmV3IGg1NHNFcnJvcigndW5rbm93bkVycm9yJywgZS5tZXNzYWdlKTtcbiAgICAgICAgICAgIGVyci5zdGFjayA9IGUuc3RhY2s7XG4gICAgICAgICAgICBkb25lID0gdHJ1ZTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgaWYoZG9uZSkge1xuICAgICAgICAgICAgY2FsbGJhY2soZXJyLCB1bmVzY2FwZWRSZXNPYmopO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfSkuZXJyb3IoZnVuY3Rpb24ocmVzKSB7XG4gICAgaWYocmVzLnN0YXR1cyA9PT0gNDAxKSB7XG4gICAgICBjYWxsYmFjayhuZXcgaDU0c0Vycm9yKCdub3RMb2dnZWRpbkVycm9yJywgJ1lvdSBhcmUgbm90IGxvZ2dlZCBpbicpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgbG9ncy5hZGRBcHBsaWNhdGlvbkxvZygnUmVxdWVzdCBmYWlsZWQgd2l0aCBzdGF0dXM6ICcgKyByZXMuc3RhdHVzLCBzYXNQcm9ncmFtKTtcbiAgICAgIGNhbGxiYWNrKG5ldyBoNTRzRXJyb3IoJ2h0dHBFcnJvcicsIHJlcy5zdGF0dXNUZXh0KSk7XG4gICAgfVxuICB9KTtcbn07XG5cbi8qXG4qIExvZ2luIG1ldGhvZFxuKlxuKiBAcGFyYW0ge3N0cmluZ30gdXNlciAtIExvZ2luIHVzZXJuYW1lXG4qIEBwYXJhbSB7c3RyaW5nfSBwYXNzIC0gTG9naW4gcGFzc3dvcmRcbiogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgLSBDYWxsYmFjayBmdW5jdGlvbiBjYWxsZWQgd2hlbiBhamF4IGNhbGwgaXMgZmluaXNoZWRcbipcbiogT1JcbipcbiogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgLSBDYWxsYmFjayBmdW5jdGlvbiBjYWxsZWQgd2hlbiBhamF4IGNhbGwgaXMgZmluaXNoZWRcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5sb2dpbiA9IGZ1bmN0aW9uKHVzZXIsIHBhc3MsIGNhbGxiYWNrKSB7XG4gIGlmKCF1c2VyIHx8ICFwYXNzKSB7XG4gICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdDcmVkZW50aWFscyBub3Qgc2V0Jyk7XG4gIH1cbiAgaWYodHlwZW9mIHVzZXIgIT09ICdzdHJpbmcnIHx8IHR5cGVvZiBwYXNzICE9PSAnc3RyaW5nJykge1xuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnVXNlciBhbmQgcGFzcyBwYXJhbWV0ZXJzIG11c3QgYmUgc3RyaW5ncycpO1xuICB9XG4gIC8vTk9URTogY2FsbGJhY2sgb3B0aW9uYWw/XG4gIGlmKCFjYWxsYmFjayB8fCB0eXBlb2YgY2FsbGJhY2sgIT09ICdmdW5jdGlvbicpIHtcbiAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1lvdSBtdXN0IHByb3ZpZGUgY2FsbGJhY2snKTtcbiAgfVxuXG4gIGlmKCF0aGlzLlJFU1RhdXRoKSB7XG4gICAgaGFuZGxlU2FzTG9nb24uY2FsbCh0aGlzLCB1c2VyLCBwYXNzLCBjYWxsYmFjayk7XG4gIH0gZWxzZSB7XG4gICAgaGFuZGxlUmVzdExvZ29uLmNhbGwodGhpcywgdXNlciwgcGFzcywgY2FsbGJhY2spO1xuICB9XG59O1xuXG5mdW5jdGlvbiBoYW5kbGVTYXNMb2dvbih1c2VyLCBwYXNzLCBjYWxsYmFjaykge1xuICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgdmFyIGxvZ2luUGFyYW1zID0ge1xuICAgIF9zZXJ2aWNlOiAnZGVmYXVsdCcsXG4gICAgdXg6IHVzZXIsXG4gICAgcHg6IHBhc3MsXG4gICAgLy9mb3IgU0FTIDkuNCxcbiAgICB1c2VybmFtZTogdXNlcixcbiAgICBwYXNzd29yZDogcGFzc1xuICB9O1xuXG4gIGZvciAodmFyIGtleSBpbiB0aGlzLl9hZGl0aW9uYWxMb2dpblBhcmFtcykge1xuICAgIGxvZ2luUGFyYW1zW2tleV0gPSB0aGlzLl9hZGl0aW9uYWxMb2dpblBhcmFtc1trZXldO1xuICB9XG5cbiAgdGhpcy5fbG9naW5BdHRlbXB0cyA9IDA7XG5cbiAgdGhpcy5fYWpheC5wb3N0KHRoaXMubG9naW5VcmwsIGxvZ2luUGFyYW1zKS5zdWNjZXNzKGZ1bmN0aW9uKHJlcykge1xuICAgIGlmKCsrc2VsZi5fbG9naW5BdHRlbXB0cyA9PT0gMykge1xuICAgICAgcmV0dXJuIGNhbGxiYWNrKC0yKTtcbiAgICB9XG5cbiAgICBpZihzZWxmLl91dGlscy5uZWVkVG9Mb2dpbi5jYWxsKHNlbGYsIHJlcykpIHtcbiAgICAgIC8vd2UgYXJlIGdldHRpbmcgZm9ybSBhZ2FpbiBhZnRlciByZWRpcmVjdFxuICAgICAgLy9hbmQgbmVlZCB0byBsb2dpbiBhZ2FpbiB1c2luZyB0aGUgbmV3IHVybFxuICAgICAgLy9fbG9naW5DaGFuZ2VkIGlzIHNldCBpbiBuZWVkVG9Mb2dpbiBmdW5jdGlvblxuICAgICAgLy9idXQgaWYgbG9naW4gdXJsIGlzIG5vdCBkaWZmZXJlbnQsIHdlIGFyZSBjaGVja2luZyBpZiB0aGVyZSBhcmUgYWRpdGlvbmFsIHBhcmFtZXRlcnNcbiAgICAgIGlmKHNlbGYuX2xvZ2luQ2hhbmdlZCB8fCAoc2VsZi5faXNOZXdMb2dpblBhZ2UgJiYgIXNlbGYuX2FkaXRpb25hbExvZ2luUGFyYW1zKSkge1xuICAgICAgICBkZWxldGUgc2VsZi5fbG9naW5DaGFuZ2VkO1xuXG4gICAgICAgIHZhciBpbnB1dHMgPSByZXMucmVzcG9uc2VUZXh0Lm1hdGNoKC88aW5wdXQuKlwiaGlkZGVuXCJbXj5dKj4vZyk7XG4gICAgICAgIGlmKGlucHV0cykge1xuICAgICAgICAgIGlucHV0cy5mb3JFYWNoKGZ1bmN0aW9uKGlucHV0U3RyKSB7XG4gICAgICAgICAgICB2YXIgdmFsdWVNYXRjaCA9IGlucHV0U3RyLm1hdGNoKC9uYW1lPVwiKFteXCJdKilcIlxcc3ZhbHVlPVwiKFteXCJdKikvKTtcbiAgICAgICAgICAgIGxvZ2luUGFyYW1zW3ZhbHVlTWF0Y2hbMV1dID0gdmFsdWVNYXRjaFsyXTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBzdWNjZXNzID0gdGhpcy5zdWNjZXNzLCBlcnJvciA9IHRoaXMuZXJyb3I7XG4gICAgICAgIHNlbGYuX2FqYXgucG9zdChzZWxmLmxvZ2luVXJsLCBsb2dpblBhcmFtcykuc3VjY2VzcyhmdW5jdGlvbigpIHtcbiAgICAgICAgICAvL3dlIG5lZWQgdGhpcyBnZXQgcmVxdWVzdCBiZWNhdXNlIG9mIHRoZSBzYXMgOS40IHNlY3VyaXR5IGNoZWNrc1xuICAgICAgICAgIHNlbGYuX2FqYXguZ2V0KHNlbGYudXJsKS5zdWNjZXNzKHN1Y2Nlc3MpLmVycm9yKGVycm9yKTtcbiAgICAgICAgfSkuZXJyb3IodGhpcy5lcnJvcik7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvL2dldHRpbmcgZm9ybSBhZ2FpbiwgYnV0IGl0IHdhc24ndCBhIHJlZGlyZWN0XG4gICAgICAgIGxvZ3MuYWRkQXBwbGljYXRpb25Mb2coJ1dyb25nIHVzZXJuYW1lIG9yIHBhc3N3b3JkJyk7XG4gICAgICAgIGNhbGxiYWNrKC0xKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgY2FsbGJhY2socmVzLnN0YXR1cyk7XG5cbiAgICAgIHNlbGYuX2Rpc2FibGVDYWxscyA9IGZhbHNlO1xuXG4gICAgICB3aGlsZShzZWxmLl9wZW5kaW5nQ2FsbHMubGVuZ3RoID4gMCkge1xuICAgICAgICB2YXIgcGVuZGluZ0NhbGwgICAgID0gc2VsZi5fcGVuZGluZ0NhbGxzLnNoaWZ0KCk7XG4gICAgICAgIHZhciBtZXRob2QgICAgICAgICAgPSBwZW5kaW5nQ2FsbC5tZXRob2QgfHwgc2VsZi5jYWxsLmJpbmQoc2VsZik7XG4gICAgICAgIHZhciBzYXNQcm9ncmFtICAgICAgPSBwZW5kaW5nQ2FsbC5zYXNQcm9ncmFtO1xuICAgICAgICB2YXIgY2FsbGJhY2tQZW5kaW5nID0gcGVuZGluZ0NhbGwuY2FsbGJhY2s7XG4gICAgICAgIHZhciBwYXJhbXMgICAgICAgICAgPSBwZW5kaW5nQ2FsbC5wYXJhbXM7XG5cbiAgICAgICAgLy91cGRhdGUgZGVidWcgYmVjYXVzZSBpdCBtYXkgY2hhbmdlIGluIHRoZSBtZWFudGltZVxuICAgICAgICBwYXJhbXMuX2RlYnVnID0gc2VsZi5kZWJ1ZyA/IDEzMSA6IDA7XG5cbiAgICAgICAgaWYoc2VsZi5yZXRyeUFmdGVyTG9naW4pIHtcbiAgICAgICAgICBtZXRob2Qoc2FzUHJvZ3JhbSwgbnVsbCwgY2FsbGJhY2tQZW5kaW5nLCBwYXJhbXMpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9KS5lcnJvcihmdW5jdGlvbihyZXMpIHtcbiAgICBsb2dzLmFkZEFwcGxpY2F0aW9uTG9nKCdMb2dpbiBmYWlsZWQgd2l0aCBzdGF0dXMgY29kZTogJyArIHJlcy5zdGF0dXMpO1xuICAgIGNhbGxiYWNrKHJlcy5zdGF0dXMpO1xuICB9KTtcbn1cblxuZnVuY3Rpb24gaGFuZGxlUmVzdExvZ29uKHVzZXIsIHBhc3MsIGNhbGxiYWNrKSB7XG4gIHZhciBzZWxmID0gdGhpcztcblxuICB2YXIgbG9naW5QYXJhbXMgPSB7XG4gICAgdXNlcm5hbWU6IHVzZXIsXG4gICAgcGFzc3dvcmQ6IHBhc3NcbiAgfTtcblxuICB0aGlzLl9hamF4LnBvc3QodGhpcy5SRVNUYXV0aExvZ2luVXJsLCBsb2dpblBhcmFtcykuc3VjY2VzcyhmdW5jdGlvbihyZXMpIHtcbiAgICB2YXIgbG9jYXRpb24gPSByZXMuZ2V0UmVzcG9uc2VIZWFkZXIoJ0xvY2F0aW9uJyk7XG5cbiAgICBzZWxmLl9hamF4LnBvc3QobG9jYXRpb24sIHtcbiAgICAgIHNlcnZpY2U6IHNlbGYudXJsXG4gICAgfSkuc3VjY2VzcyhmdW5jdGlvbihyZXMpIHtcbiAgICAgIGlmKHNlbGYudXJsLmluZGV4T2YoJz8nKSA9PT0gLTEpIHtcbiAgICAgICAgc2VsZi51cmwgKz0gJz90aWNrZXQ9JyArIHJlcy5yZXNwb25zZVRleHQ7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZihzZWxmLnVybC5pbmRleE9mKCd0aWNrZXQnKSAhPT0gLTEpIHtcbiAgICAgICAgICBzZWxmLnVybCA9IHNlbGYudXJsLnJlcGxhY2UoL3RpY2tldD1bXiZdKy8sICd0aWNrZXQ9JyArIHJlcy5yZXNwb25zZVRleHQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHNlbGYudXJsICs9ICcmdGlja2V0PScgKyByZXMucmVzcG9uc2VUZXh0O1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGNhbGxiYWNrKHJlcy5zdGF0dXMpO1xuICAgIH0pLmVycm9yKGZ1bmN0aW9uKHJlcykge1xuICAgICAgbG9ncy5hZGRBcHBsaWNhdGlvbkxvZygnTG9naW4gZmFpbGVkIHdpdGggc3RhdHVzIGNvZGU6ICcgKyByZXMuc3RhdHVzKTtcbiAgICAgIGNhbGxiYWNrKHJlcy5zdGF0dXMpO1xuICAgIH0pO1xuICB9KS5lcnJvcihmdW5jdGlvbihyZXMpIHtcbiAgICBpZihyZXMucmVzcG9uc2VUZXh0ID09PSAnZXJyb3IuYXV0aGVudGljYXRpb24uY3JlZGVudGlhbHMuYmFkJykge1xuICAgICAgY2FsbGJhY2soLTEpO1xuICAgIH0gZWxzZSB7XG4gICAgICBsb2dzLmFkZEFwcGxpY2F0aW9uTG9nKCdMb2dpbiBmYWlsZWQgd2l0aCBzdGF0dXMgY29kZTogJyArIHJlcy5zdGF0dXMpO1xuICAgICAgY2FsbGJhY2socmVzLnN0YXR1cyk7XG4gICAgfVxuICB9KTtcbn1cblxuLypcbiogTG9nb3V0IG1ldGhvZFxuKlxuKiBAcGFyYW0ge2Z1bmN0aW9ufSBjYWxsYmFjayAtIENhbGxiYWNrIGZ1bmN0aW9uIGNhbGxlZCB3aGVuIGFqYXggY2FsbCBpcyBmaW5pc2hlZFxuKlxuKi9cblxubW9kdWxlLmV4cG9ydHMubG9nb3V0ID0gZnVuY3Rpb24oY2FsbGJhY2spIHtcbiAgdGhpcy5fYWpheC5nZXQodGhpcy51cmwsIHtfYWN0aW9uOiAnbG9nb2ZmJ30pLnN1Y2Nlc3MoZnVuY3Rpb24ocmVzKSB7XG4gICAgY2FsbGJhY2soKTtcbiAgfSkuZXJyb3IoZnVuY3Rpb24ocmVzKSB7XG4gICAgbG9ncy5hZGRBcHBsaWNhdGlvbkxvZygnTG9nb3V0IGZhaWxlZCB3aXRoIHN0YXR1cyBjb2RlOiAnICsgcmVzLnN0YXR1cyk7XG4gICAgY2FsbGJhY2socmVzLnN0YXR1cyk7XG4gIH0pO1xufTtcblxuLypcbiogRW50ZXIgZGVidWcgbW9kZVxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLnNldERlYnVnTW9kZSA9IGZ1bmN0aW9uKCkge1xuICB0aGlzLmRlYnVnID0gdHJ1ZTtcbn07XG5cbi8qXG4qIEV4aXQgZGVidWcgbW9kZVxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLnVuc2V0RGVidWdNb2RlID0gZnVuY3Rpb24oKSB7XG4gIHRoaXMuZGVidWcgPSBmYWxzZTtcbn07XG5cbmZvcih2YXIga2V5IGluIGxvZ3MuZ2V0KSB7XG4gIGlmKGxvZ3MuZ2V0Lmhhc093blByb3BlcnR5KGtleSkpIHtcbiAgICBtb2R1bGUuZXhwb3J0c1trZXldID0gbG9ncy5nZXRba2V5XTtcbiAgfVxufVxuXG5mb3IodmFyIGtleSBpbiBsb2dzLmNsZWFyKSB7XG4gIGlmKGxvZ3MuY2xlYXIuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuICAgIG1vZHVsZS5leHBvcnRzW2tleV0gPSBsb2dzLmNsZWFyW2tleV07XG4gIH1cbn1cblxuLypcbiogQWRkIGNhbGxiYWNrIGZ1bmN0aW9ucyBleGVjdXRlZCB3aGVuIHByb3BlcnRpZXMgYXJlIHVwZGF0ZWQgd2l0aCByZW1vdGUgY29uZmlnXG4qXG4qQGNhbGxiYWNrIC0gY2FsbGJhY2sgcHVzaGVkIHRvIGFycmF5XG4qXG4qL1xubW9kdWxlLmV4cG9ydHMub25SZW1vdGVDb25maWdVcGRhdGUgPSBmdW5jdGlvbihjYWxsYmFjaykge1xuICB0aGlzLnJlbW90ZUNvbmZpZ1VwZGF0ZUNhbGxiYWNrcy5wdXNoKGNhbGxiYWNrKTtcbn07XG5cbm1vZHVsZS5leHBvcnRzLl91dGlscyA9IHJlcXVpcmUoJy4vdXRpbHMuanMnKTsiLCJ2YXIgbG9ncyA9IHJlcXVpcmUoJy4uL2xvZ3MuanMnKTtcbnZhciBoNTRzRXJyb3IgPSByZXF1aXJlKCcuLi9lcnJvci5qcycpO1xuXG52YXIgcHJvZ3JhbU5vdEZvdW5kUGF0dCA9IC88dGl0bGU+KFN0b3JlZCBQcm9jZXNzIEVycm9yfFNBU1N0b3JlZFByb2Nlc3MpPFxcL3RpdGxlPltcXHNcXFNdKjxoMj4oU3RvcmVkIHByb2Nlc3Mgbm90IGZvdW5kOi4qfC4qbm90IGEgdmFsaWQgc3RvcmVkIHByb2Nlc3MgcGF0aC4pPFxcL2gyPi87XG52YXIgcmVzcG9uc2VSZXBsYWNlID0gZnVuY3Rpb24ocmVzKSB7XG4gIHJldHVybiByZXMucmVwbGFjZSgvKFxcclxcbnxcXHJ8XFxuKS9nLCAnJykucmVwbGFjZSgvXFxcXFxcXFwobnxyfHR8ZnxiKS9nLCAnXFxcXCQxJykucmVwbGFjZSgvXFxcXFwiXFxcXFwiL2csICdcXFxcXCInKTtcbn07XG5cbi8qXG4qIFBhcnNlIHJlc3BvbnNlIGZyb20gc2VydmVyXG4qXG4qIEBwYXJhbSB7b2JqZWN0fSByZXNwb25zZVRleHQgLSByZXNwb25zZSBodG1sIGZyb20gdGhlIHNlcnZlclxuKiBAcGFyYW0ge3N0cmluZ30gc2FzUHJvZ3JhbSAtIHNhcyBwcm9ncmFtIHBhdGhcbiogQHBhcmFtIHtvYmplY3R9IHBhcmFtcyAtIHBhcmFtcyBzZW50IHRvIHNhcyBwcm9ncmFtIHdpdGggYWRkVGFibGVcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5wYXJzZVJlcyA9IGZ1bmN0aW9uKHJlc3BvbnNlVGV4dCwgc2FzUHJvZ3JhbSwgcGFyYW1zKSB7XG4gIHZhciBtYXRjaGVzID0gcmVzcG9uc2VUZXh0Lm1hdGNoKHByb2dyYW1Ob3RGb3VuZFBhdHQpO1xuICBpZihtYXRjaGVzKSB7XG4gICAgdGhyb3cgbmV3IGg1NHNFcnJvcigncHJvZ3JhbU5vdEZvdW5kJywgJ1lvdSBoYXZlIG5vdCBiZWVuIGdyYW50ZWQgcGVybWlzc2lvbiB0byBwZXJmb3JtIHRoaXMgYWN0aW9uLCBvciB0aGUgU1RQIGlzIG1pc3NpbmcuJyk7XG4gIH1cbiAgLy9yZW1vdmUgbmV3IGxpbmVzIGluIGpzb24gcmVzcG9uc2VcbiAgLy9yZXBsYWNlIFxcXFwoZCkgd2l0aCBcXChkKSAtIFNBUyBqc29uIHBhcnNlciBpcyBlc2NhcGluZyBpdFxuICByZXR1cm4gSlNPTi5wYXJzZShyZXNwb25zZVJlcGxhY2UocmVzcG9uc2VUZXh0KSk7XG59O1xuXG4vKlxuKiBQYXJzZSByZXNwb25zZSBmcm9tIHNlcnZlciBpbiBkZWJ1ZyBtb2RlXG4qXG4qIEBwYXJhbSB7b2JqZWN0fSByZXNwb25zZVRleHQgLSByZXNwb25zZSBodG1sIGZyb20gdGhlIHNlcnZlclxuKiBAcGFyYW0ge3N0cmluZ30gc2FzUHJvZ3JhbSAtIHNhcyBwcm9ncmFtIHBhdGhcbiogQHBhcmFtIHtvYmplY3R9IHBhcmFtcyAtIHBhcmFtcyBzZW50IHRvIHNhcyBwcm9ncmFtIHdpdGggYWRkVGFibGVcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5wYXJzZURlYnVnUmVzID0gZnVuY3Rpb24ocmVzcG9uc2VUZXh0LCBzYXNQcm9ncmFtLCBwYXJhbXMpIHtcbiAgdmFyIG1hdGNoZXMgPSByZXNwb25zZVRleHQubWF0Y2gocHJvZ3JhbU5vdEZvdW5kUGF0dCk7XG4gIGlmKG1hdGNoZXMpIHtcbiAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdwcm9ncmFtTm90Rm91bmQnLCAnWW91IGhhdmUgbm90IGJlZW4gZ3JhbnRlZCBwZXJtaXNzaW9uIHRvIHBlcmZvcm0gdGhpcyBhY3Rpb24sIG9yIHRoZSBTVFAgaXMgbWlzc2luZy4nKTtcbiAgfVxuXG4gIC8vZmluZCBqc29uXG4gIHBhdHQgICAgICAgICAgICAgID0gL14oLj8tLWg1NHMtZGF0YS1zdGFydC0tKShbXFxTXFxzXSo/KSgtLWg1NHMtZGF0YS1lbmQtLSkvbTtcbiAgbWF0Y2hlcyAgICAgICAgICAgPSByZXNwb25zZVRleHQubWF0Y2gocGF0dCk7XG5cbiAgdmFyIHBhZ2UgICAgICAgICAgPSByZXNwb25zZVRleHQucmVwbGFjZShwYXR0LCAnJyk7XG4gIHZhciBodG1sQm9keVBhdHQgID0gLzxib2R5Lio+KFtcXHNcXFNdKik8XFwvYm9keT4vO1xuICB2YXIgYm9keU1hdGNoZXMgICA9IHBhZ2UubWF0Y2goaHRtbEJvZHlQYXR0KTtcblxuICAvL3JlbW92ZSBodG1sIHRhZ3NcbiAgdmFyIGRlYnVnVGV4dCA9IGJvZHlNYXRjaGVzWzFdLnJlcGxhY2UoLzxbXj5dKj4vZywgJycpO1xuICBkZWJ1Z1RleHQgICAgID0gdGhpcy5kZWNvZGVIVE1MRW50aXRpZXMoZGVidWdUZXh0KTtcblxuICBsb2dzLmFkZERlYnVnRGF0YShib2R5TWF0Y2hlc1sxXSwgZGVidWdUZXh0LCBzYXNQcm9ncmFtLCBwYXJhbXMpO1xuXG4gIGlmKHRoaXMucGFyc2VFcnJvclJlc3BvbnNlKHJlc3BvbnNlVGV4dCwgc2FzUHJvZ3JhbSkpIHtcbiAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdzYXNFcnJvcicsICdTYXMgcHJvZ3JhbSBjb21wbGV0ZWQgd2l0aCBlcnJvcnMnKTtcbiAgfVxuXG4gIGlmKCFtYXRjaGVzKSB7XG4gICAgdGhyb3cgbmV3IGg1NHNFcnJvcigncGFyc2VFcnJvcicsICdVbmFibGUgdG8gcGFyc2UgcmVzcG9uc2UganNvbicpO1xuICB9XG4gIC8vcmVtb3ZlIG5ldyBsaW5lcyBpbiBqc29uIHJlc3BvbnNlXG4gIC8vcmVwbGFjZSBcXFxcKGQpIHdpdGggXFwoZCkgLSBTQVMganNvbiBwYXJzZXIgaXMgZXNjYXBpbmcgaXRcbiAgdmFyIGpzb25PYmogPSBKU09OLnBhcnNlKHJlc3BvbnNlUmVwbGFjZShtYXRjaGVzWzJdKSk7XG5cbiAgcmV0dXJuIGpzb25PYmo7XG59O1xuXG4vKlxuKiBBZGQgZmFpbGVkIHJlc3BvbnNlIHRvIGxvZ3MgLSB1c2VkIG9ubHkgaWYgZGVidWc9ZmFsc2VcbipcbiogQHBhcmFtIHtvYmplY3R9IHJlc3BvbnNlVGV4dCAtIHJlc3BvbnNlIGh0bWwgZnJvbSB0aGUgc2VydmVyXG4qIEBwYXJhbSB7c3RyaW5nfSBzYXNQcm9ncmFtIC0gc2FzIHByb2dyYW0gcGF0aFxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLmFkZEZhaWxlZFJlc3BvbnNlID0gZnVuY3Rpb24ocmVzcG9uc2VUZXh0LCBzYXNQcm9ncmFtKSB7XG4gIHZhciBwYXR0ICAgICAgPSAvPHNjcmlwdChbXFxzXFxTXSopXFwvZm9ybT4vO1xuICB2YXIgcGF0dDIgICAgID0gL2Rpc3BsYXlcXHM/Olxccz9ub25lOz9cXHM/LztcbiAgLy9yZW1vdmUgc2NyaXB0IHdpdGggZm9ybSBmb3IgdG9nZ2xpbmcgdGhlIGxvZ3MgYW5kIFwiZGlzcGxheTpub25lXCIgZnJvbSBzdHlsZVxuICByZXNwb25zZVRleHQgID0gcmVzcG9uc2VUZXh0LnJlcGxhY2UocGF0dCwgJycpLnJlcGxhY2UocGF0dDIsICcnKTtcbiAgdmFyIGRlYnVnVGV4dCA9IHJlc3BvbnNlVGV4dC5yZXBsYWNlKC88W14+XSo+L2csICcnKTtcbiAgZGVidWdUZXh0ID0gdGhpcy5kZWNvZGVIVE1MRW50aXRpZXMoZGVidWdUZXh0KTtcblxuICBsb2dzLmFkZEZhaWxlZFJlcXVlc3QocmVzcG9uc2VUZXh0LCBkZWJ1Z1RleHQsIHNhc1Byb2dyYW0pO1xufTtcblxuLypcbiogVW5lc2NhcGUgYWxsIHN0cmluZyB2YWx1ZXMgaW4gcmV0dXJuZWQgb2JqZWN0XG4qXG4qIEBwYXJhbSB7b2JqZWN0fSBvYmpcbipcbiovXG5tb2R1bGUuZXhwb3J0cy51bmVzY2FwZVZhbHVlcyA9IGZ1bmN0aW9uKG9iaikge1xuICBmb3IgKHZhciBrZXkgaW4gb2JqKSB7XG4gICAgaWYgKHR5cGVvZiBvYmpba2V5XSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIG9ialtrZXldID0gZGVjb2RlVVJJQ29tcG9uZW50KG9ialtrZXldKTtcbiAgICB9IGVsc2UgaWYodHlwZW9mIG9iaiA9PT0gJ29iamVjdCcpIHtcbiAgICAgIHRoaXMudW5lc2NhcGVWYWx1ZXMob2JqW2tleV0pO1xuICAgIH1cbiAgfVxuICByZXR1cm4gb2JqO1xufTtcblxuLypcbiogUGFyc2UgZXJyb3IgcmVzcG9uc2UgZnJvbSBzZXJ2ZXIgYW5kIHNhdmUgZXJyb3JzIGluIG1lbW9yeVxuKlxuKiBAcGFyYW0ge3N0cmluZ30gcmVzIC0gc2VydmVyIHJlc3BvbnNlXG4qICNwYXJhbSB7c3RyaW5nfSBzYXNQcm9ncmFtIC0gc2FzIHByb2dyYW0gd2hpY2ggcmV0dXJuZWQgdGhlIHJlc3BvbnNlXG4qXG4qL1xubW9kdWxlLmV4cG9ydHMucGFyc2VFcnJvclJlc3BvbnNlID0gZnVuY3Rpb24ocmVzLCBzYXNQcm9ncmFtKSB7XG4gIC8vY2FwdHVyZSAnRVJST1I6IFt0ZXh0XS4nIG9yICdFUlJPUiB4eCBbdGV4dF0uJ1xuICB2YXIgcGF0dCAgICA9IC9eRVJST1IoOlxcc3xcXHNcXGRcXGQpKC4qXFwufC4qXFxuLipcXC4pL2dtO1xuICB2YXIgZXJyb3JzICA9IHJlcy5yZXBsYWNlKC8oPChbXj5dKyk+KS9pZywgJycpLm1hdGNoKHBhdHQpO1xuICBpZighZXJyb3JzKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgdmFyIGVyck1lc3NhZ2U7XG4gIGZvcih2YXIgaSA9IDAsIG4gPSBlcnJvcnMubGVuZ3RoOyBpIDwgbjsgaSsrKSB7XG4gICAgZXJyTWVzc2FnZSAgPSBlcnJvcnNbaV0ucmVwbGFjZSgvPFtePl0qPi9nLCAnJykucmVwbGFjZSgvKFxcbnxcXHN7Mix9KS9nLCAnICcpO1xuICAgIGVyck1lc3NhZ2UgID0gdGhpcy5kZWNvZGVIVE1MRW50aXRpZXMoZXJyTWVzc2FnZSk7XG4gICAgZXJyb3JzW2ldICAgPSB7XG4gICAgICBzYXNQcm9ncmFtOiBzYXNQcm9ncmFtLFxuICAgICAgbWVzc2FnZTogICAgZXJyTWVzc2FnZSxcbiAgICAgIHRpbWU6ICAgICAgIG5ldyBEYXRlKClcbiAgICB9O1xuICB9XG5cbiAgbG9ncy5hZGRTYXNFcnJvcnMoZXJyb3JzKTtcblxuICByZXR1cm4gdHJ1ZTtcbn07XG5cbi8qXG4qIERlY29kZSBIVE1MIGVudGl0aWVzXG4qXG4qIEBwYXJhbSB7c3RyaW5nfSByZXMgLSBzZXJ2ZXIgcmVzcG9uc2VcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5kZWNvZGVIVE1MRW50aXRpZXMgPSBmdW5jdGlvbiAoaHRtbCkge1xuICB2YXIgdGVtcEVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XG4gIHZhciBzdHIgICAgICAgICA9IGh0bWwucmVwbGFjZSgvJigjKD86eFswLTlhLWZdK3xcXGQrKXxbYS16XSspOy9naSxcbiAgICBmdW5jdGlvbiAoc3RyKSB7XG4gICAgICB0ZW1wRWxlbWVudC5pbm5lckhUTUwgPSBzdHI7XG4gICAgICBzdHIgICAgICAgICAgICAgICAgICAgPSB0ZW1wRWxlbWVudC50ZXh0Q29udGVudCB8fCB0ZW1wRWxlbWVudC5pbm5lclRleHQ7XG4gICAgICByZXR1cm4gc3RyO1xuICAgIH1cbiAgKTtcbiAgcmV0dXJuIHN0cjtcbn07XG5cbi8qXG4qIENvbnZlcnQgc2FzIHRpbWUgdG8gamF2YXNjcmlwdCBkYXRlXG4qXG4qIEBwYXJhbSB7bnVtYmVyfSBzYXNEYXRlIC0gc2FzIFRhdGUgb2JqZWN0XG4qXG4qL1xubW9kdWxlLmV4cG9ydHMuZnJvbVNhc0RhdGVUaW1lID0gZnVuY3Rpb24gKHNhc0RhdGUpIHtcbiAgdmFyIGJhc2VkYXRlID0gbmV3IERhdGUoXCJKYW51YXJ5IDEsIDE5NjAgMDA6MDA6MDBcIik7XG4gIHZhciBjdXJyZGF0ZSA9IHNhc0RhdGU7XG5cbiAgLy8gb2Zmc2V0cyBmb3IgVVRDIGFuZCB0aW1lem9uZXMgYW5kIEJTVFxuICB2YXIgYmFzZU9mZnNldCA9IGJhc2VkYXRlLmdldFRpbWV6b25lT2Zmc2V0KCk7IC8vIGluIG1pbnV0ZXNcblxuICAvLyBjb252ZXJ0IHNhcyBkYXRldGltZSB0byBhIGN1cnJlbnQgdmFsaWQgamF2YXNjcmlwdCBkYXRlXG4gIHZhciBiYXNlZGF0ZU1zICA9IGJhc2VkYXRlLmdldFRpbWUoKTsgLy8gaW4gbXNcbiAgdmFyIGN1cnJkYXRlTXMgID0gY3VycmRhdGUgKiAxMDAwOyAvLyB0byBtc1xuICB2YXIgc2FzRGF0ZXRpbWUgPSBjdXJyZGF0ZU1zICsgYmFzZWRhdGVNcztcbiAgdmFyIGpzRGF0ZSAgICAgID0gbmV3IERhdGUoKTtcbiAganNEYXRlLnNldFRpbWUoc2FzRGF0ZXRpbWUpOyAvLyBmaXJzdCB0aW1lIHRvIGdldCBvZmZzZXQgQlNUIGRheWxpZ2h0IHNhdmluZ3MgZXRjXG4gIHZhciBjdXJyT2Zmc2V0ICA9IGpzRGF0ZS5nZXRUaW1lem9uZU9mZnNldCgpOyAvLyBhZGp1c3QgZm9yIG9mZnNldCBpbiBtaW51dGVzXG4gIHZhciBvZmZzZXRWYXIgICA9IChiYXNlT2Zmc2V0IC0gY3Vyck9mZnNldCkgKiA2MCAqIDEwMDA7IC8vIGRpZmZlcmVuY2UgaW4gbWlsbGlzZWNvbmRzXG4gIHZhciBvZmZzZXRUaW1lICA9IHNhc0RhdGV0aW1lIC0gb2Zmc2V0VmFyOyAvLyBmaW5kaW5nIEJTVCBhbmQgZGF5bGlnaHQgc2F2aW5nc1xuICBqc0RhdGUuc2V0VGltZShvZmZzZXRUaW1lKTsgLy8gdXBkYXRlIHdpdGggb2Zmc2V0XG4gIHJldHVybiBqc0RhdGU7XG59O1xuXG5tb2R1bGUuZXhwb3J0cy5uZWVkVG9Mb2dpbiA9IGZ1bmN0aW9uKHJlc3BvbnNlT2JqKSB7XG4gIHZhciBwYXR0ID0gLzxmb3JtLithY3Rpb249XCIoLipMb2dvblteXCJdKikuKj4vO1xuICB2YXIgbWF0Y2hlcyA9IHBhdHQuZXhlYyhyZXNwb25zZU9iai5yZXNwb25zZVRleHQpO1xuICB2YXIgbmV3TG9naW5Vcmw7XG5cbiAgaWYoIW1hdGNoZXMpIHtcbiAgICAvL3RoZXJlJ3Mgbm8gZm9ybSwgd2UgYXJlIGluLiBob29yYXkhXG4gICAgcmV0dXJuIGZhbHNlO1xuICB9IGVsc2Uge1xuICAgIHZhciBhY3Rpb25VcmwgPSBtYXRjaGVzWzFdLnJlcGxhY2UoL1xcPy4qLywgJycpO1xuICAgIGlmKGFjdGlvblVybC5jaGFyQXQoMCkgPT09ICcvJykge1xuICAgICAgbmV3TG9naW5VcmwgPSB0aGlzLmhvc3RVcmwgPyB0aGlzLmhvc3RVcmwgKyBhY3Rpb25VcmwgOiBhY3Rpb25Vcmw7XG4gICAgICBpZihuZXdMb2dpblVybCAhPT0gdGhpcy5sb2dpblVybCkge1xuICAgICAgICB0aGlzLl9sb2dpbkNoYW5nZWQgPSB0cnVlO1xuICAgICAgICB0aGlzLmxvZ2luVXJsID0gbmV3TG9naW5Vcmw7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vcmVsYXRpdmUgcGF0aFxuXG4gICAgICB2YXIgbGFzdEluZE9mU2xhc2ggPSByZXNwb25zZU9iai5yZXNwb25zZVVSTC5sYXN0SW5kZXhPZignLycpICsgMTtcbiAgICAgIC8vcmVtb3ZlIGV2ZXJ5dGhpbmcgYWZ0ZXIgdGhlIGxhc3Qgc2xhc2gsIGFuZCBldmVyeXRoaW5nIHVudGlsIHRoZSBmaXJzdFxuICAgICAgdmFyIHJlbGF0aXZlTG9naW5VcmwgPSByZXNwb25zZU9iai5yZXNwb25zZVVSTC5zdWJzdHIoMCwgbGFzdEluZE9mU2xhc2gpLnJlcGxhY2UoLy4qXFwvezJ9W15cXC9dKi8sICcnKSArIGFjdGlvblVybDtcbiAgICAgIG5ld0xvZ2luVXJsID0gdGhpcy5ob3N0VXJsID8gdGhpcy5ob3N0VXJsICsgcmVsYXRpdmVMb2dpblVybCA6IHJlbGF0aXZlTG9naW5Vcmw7XG4gICAgICBpZihuZXdMb2dpblVybCAhPT0gdGhpcy5sb2dpblVybCkge1xuICAgICAgICB0aGlzLl9sb2dpbkNoYW5nZWQgPSB0cnVlO1xuICAgICAgICB0aGlzLmxvZ2luVXJsID0gbmV3TG9naW5Vcmw7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy9zYXZlIHBhcmFtZXRlcnMgZnJvbSBoaWRkZW4gZm9ybSBmaWVsZHNcbiAgICB2YXIgaW5wdXRzID0gcmVzcG9uc2VPYmoucmVzcG9uc2VUZXh0Lm1hdGNoKC88aW5wdXQuKlwiaGlkZGVuXCJbXj5dKj4vZyk7XG4gICAgdmFyIGhpZGRlbkZvcm1QYXJhbXMgPSB7fTtcbiAgICBpZihpbnB1dHMpIHtcbiAgICAgIC8vaXQncyBuZXcgbG9naW4gcGFnZSBpZiB3ZSBoYXZlIHRoZXNlIGFkZGl0aW9uYWwgcGFyYW1ldGVyc1xuICAgICAgdGhpcy5faXNOZXdMb2dpblBhZ2UgPSB0cnVlO1xuICAgICAgaW5wdXRzLmZvckVhY2goZnVuY3Rpb24oaW5wdXRTdHIpIHtcbiAgICAgICAgdmFyIHZhbHVlTWF0Y2ggPSBpbnB1dFN0ci5tYXRjaCgvbmFtZT1cIihbXlwiXSopXCJcXHN2YWx1ZT1cIihbXlwiXSopLyk7XG4gICAgICAgIGhpZGRlbkZvcm1QYXJhbXNbdmFsdWVNYXRjaFsxXV0gPSB2YWx1ZU1hdGNoWzJdO1xuICAgICAgfSk7XG4gICAgICB0aGlzLl9hZGl0aW9uYWxMb2dpblBhcmFtcyA9IGhpZGRlbkZvcm1QYXJhbXM7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRydWU7XG4gIH1cbn07XG5cbi8qXG4qIEdldCBmdWxsIHByb2dyYW0gcGF0aCBmcm9tIG1ldGFkYXRhIHJvb3QgYW5kIHJlbGF0aXZlIHBhdGhcbipcbiogQHBhcmFtIHtzdHJpbmd9IG1ldGFkYXRhUm9vdCAtIE1ldGFkYXRhIHJvb3QgKHBhdGggd2hlcmUgYWxsIHByb2dyYW1zIGZvciB0aGUgcHJvamVjdCBhcmUgbG9jYXRlZClcbiogQHBhcmFtIHtzdHJpbmd9IHNhc1Byb2dyYW1QYXRoIC0gU2FzIHByb2dyYW0gcGF0aFxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLmdldEZ1bGxQcm9ncmFtUGF0aCA9IGZ1bmN0aW9uKG1ldGFkYXRhUm9vdCwgc2FzUHJvZ3JhbVBhdGgpIHtcbiAgcmV0dXJuIG1ldGFkYXRhUm9vdCA/IG1ldGFkYXRhUm9vdC5yZXBsYWNlKC9cXC8/JC8sICcvJykgKyBzYXNQcm9ncmFtUGF0aC5yZXBsYWNlKC9eXFwvLywgJycpIDogc2FzUHJvZ3JhbVBhdGg7XG59O1xuIiwidmFyIGg1NHNFcnJvciA9IHJlcXVpcmUoJy4vZXJyb3IuanMnKTtcbnZhciBsb2dzICAgICAgPSByZXF1aXJlKCcuL2xvZ3MuanMnKTtcbnZhciBUYWJsZXMgICAgPSByZXF1aXJlKCcuL3RhYmxlcycpO1xudmFyIEZpbGVzICAgICA9IHJlcXVpcmUoJy4vZmlsZXMnKTtcbnZhciB0b1Nhc0RhdGVUaW1lID0gcmVxdWlyZSgnLi90YWJsZXMvdXRpbHMuanMnKS50b1Nhc0RhdGVUaW1lO1xuXG5mdW5jdGlvbiB2YWxpZGF0ZU1hY3JvKG1hY3JvTmFtZSkge1xuICBpZihtYWNyb05hbWUubGVuZ3RoID4gMzIpIHtcbiAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1RhYmxlIG5hbWUgdG9vIGxvbmcuIE1heGltdW0gaXMgMzIgY2hhcmFjdGVycycpO1xuICB9XG5cbiAgdmFyIGNoYXJDb2RlQXQwID0gbWFjcm9OYW1lLmNoYXJDb2RlQXQoMCk7XG4gIC8vIHZhbGlkYXRlIGl0IHN0YXJ0cyB3aXRoIEEtWiwgYS16LCBvciBfXG4gIGlmKChjaGFyQ29kZUF0MCA8IDY1IHx8IGNoYXJDb2RlQXQwID4gOTApICYmIChjaGFyQ29kZUF0MCA8IDk3IHx8IGNoYXJDb2RlQXQwID4gMTIyKSAmJiBtYWNyb05hbWVbMF0gIT09ICdfJykge1xuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnVGFibGUgbmFtZSBzdGFydGluZyB3aXRoIG51bWJlciBvciBzcGVjaWFsIGNoYXJhY3RlcnMnKTtcbiAgfVxuXG4gIGZvcih2YXIgaSA9IDA7IGkgPCBtYWNyb05hbWUubGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgY2hhckNvZGUgPSBtYWNyb05hbWUuY2hhckNvZGVBdChpKTtcblxuICAgIGlmKChjaGFyQ29kZSA8IDQ4IHx8IGNoYXJDb2RlID4gNTcpICYmXG4gICAgICAoY2hhckNvZGUgPCA2NSB8fCBjaGFyQ29kZSA+IDkwKSAmJlxuICAgICAgKGNoYXJDb2RlIDwgOTcgfHwgY2hhckNvZGUgPiAxMjIpICYmXG4gICAgICBtYWNyb05hbWVbaV0gIT09ICdfJylcbiAgICB7XG4gICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1RhYmxlIG5hbWUgaGFzIHVuc3VwcG9ydGVkIGNoYXJhY3RlcnMnKTtcbiAgICB9XG4gIH1cbn1cblxuLypcbiogaDU0cyBTQVMgZGF0YSBvYmplY3QgY29uc3RydWN0b3JcbiogQGNvbnN0cnVjdG9yXG4qXG4qQHBhcmFtIHthcnJheXxmaWxlfSBkYXRhIC0gVGFibGUgb3IgZmlsZSBhZGRlZCB3aGVuIG9iamVjdCBpcyBjcmVhdGVkXG4qQHBhcmFtIHtzdHJpbmd9IG1hY3JvTmFtZSAtIG1hY3JvIG5hbWVcbipAcGFyYW0ge251bWJlcn0gcGFyYW1ldGVyVGhyZXNob2xkIC0gc2l6ZSBvZiBkYXRhIG9iamVjdHMgc2VudCB0byBTQVNcbipcbiovXG5mdW5jdGlvbiBTYXNEYXRhKGRhdGEsIG1hY3JvTmFtZSwgc3BlY3MpIHtcbiAgaWYoZGF0YSBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgdGhpcy5fZmlsZXMgPSB7fTtcbiAgICB0aGlzLmFkZFRhYmxlKGRhdGEsIG1hY3JvTmFtZSwgc3BlY3MpO1xuICB9IGVsc2UgaWYoZGF0YSBpbnN0YW5jZW9mIEZpbGUgfHwgZGF0YSBpbnN0YW5jZW9mIEJsb2IpIHtcbiAgICBGaWxlcy5jYWxsKHRoaXMsIGRhdGEsIG1hY3JvTmFtZSk7XG4gIH0gZWxzZSB7XG4gICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdEYXRhIGFyZ3VtZW50IHdyb25nIHR5cGUgb3IgbWlzc2luZycpO1xuICB9XG59XG5cbi8qXG4qIEFkZCB0YWJsZSB0byB0YWJsZXMgb2JqZWN0XG4qIEBwYXJhbSB7YXJyYXl9IHRhYmxlIC0gQXJyYXkgb2YgdGFibGUgb2JqZWN0c1xuKiBAcGFyYW0ge3N0cmluZ30gbWFjcm9OYW1lIC0gU2FzIG1hY3JvIG5hbWVcbipcbiovXG5TYXNEYXRhLnByb3RvdHlwZS5hZGRUYWJsZSA9IGZ1bmN0aW9uKHRhYmxlLCBtYWNyb05hbWUsIHNwZWNzKSB7XG4gIHZhciBpc1NwZWNzUHJvdmlkZWQgPSAhIXNwZWNzO1xuICBpZih0YWJsZSAmJiBtYWNyb05hbWUpIHtcbiAgICBpZighKHRhYmxlIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ0ZpcnN0IGFyZ3VtZW50IG11c3QgYmUgYXJyYXknKTtcbiAgICB9XG4gICAgaWYodHlwZW9mIG1hY3JvTmFtZSAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnU2Vjb25kIGFyZ3VtZW50IG11c3QgYmUgc3RyaW5nJyk7XG4gICAgfVxuXG4gICAgdmFsaWRhdGVNYWNybyhtYWNyb05hbWUpO1xuICB9IGVsc2Uge1xuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnTWlzc2luZyBhcmd1bWVudHMnKTtcbiAgfVxuXG4gIGlmICh0eXBlb2YgdGFibGUgIT09ICdvYmplY3QnIHx8ICEodGFibGUgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1RhYmxlIGFyZ3VtZW50IGlzIG5vdCBhbiBhcnJheScpO1xuICB9XG5cbiAgdmFyIGtleTtcbiAgaWYoc3BlY3MpIHtcbiAgICBpZihzcGVjcy5jb25zdHJ1Y3RvciAhPT0gT2JqZWN0KSB7XG4gICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1NwZWNzIGRhdGEgdHlwZSB3cm9uZy4gT2JqZWN0IGV4cGVjdGVkLicpO1xuICAgIH1cbiAgICBmb3Ioa2V5IGluIHRhYmxlWzBdKSB7XG4gICAgICBpZighc3BlY3Nba2V5XSkge1xuICAgICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ01pc3NpbmcgY29sdW1ucyBpbiBzcGVjcyBkYXRhLicpO1xuICAgICAgfVxuICAgIH1cbiAgICBmb3Ioa2V5IGluIHNwZWNzKSB7XG4gICAgICBpZihzcGVjc1trZXldLmNvbnN0cnVjdG9yICE9PSBPYmplY3QpIHtcbiAgICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdXcm9uZyBjb2x1bW4gZGVzY3JpcHRvciBpbiBzcGVjcyBkYXRhLicpO1xuICAgICAgfVxuICAgICAgaWYoIXNwZWNzW2tleV0uY29sVHlwZSB8fCAhc3BlY3Nba2V5XS5jb2xMZW5ndGgpIHtcbiAgICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdNaXNzaW5nIGNvbHVtbnMgaW4gc3BlY3MgZGVzY3JpcHRvci4nKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICB2YXIgaSwgaiwgLy9jb3VudGVycyB1c2VkIGxhdHRlciBpbiBjb2RlXG4gICAgICByb3csIHZhbCwgdHlwZSxcbiAgICAgIHNwZWNLZXlzID0gW10sXG4gICAgICBzcGVjaWFsQ2hhcnMgPSBbJ1wiJywgJ1xcXFwnLCAnLycsICdcXG4nLCAnXFx0JywgJ1xcZicsICdcXHInLCAnXFxiJ107XG5cbiAgaWYoIXNwZWNzKSB7XG4gICAgc3BlY3MgPSB7fTtcblxuICAgIGZvciAoaSA9IDA7IGkgPCB0YWJsZS5sZW5ndGg7IGkrKykge1xuICAgICAgcm93ID0gdGFibGVbaV07XG5cbiAgICAgIGlmKHR5cGVvZiByb3cgIT09ICdvYmplY3QnKSB7XG4gICAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnVGFibGUgaXRlbSBpcyBub3QgYW4gb2JqZWN0Jyk7XG4gICAgICB9XG5cbiAgICAgIGZvcihrZXkgaW4gcm93KSB7XG4gICAgICAgIGlmKHJvdy5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG4gICAgICAgICAgdmFsICA9IHJvd1trZXldO1xuICAgICAgICAgIHR5cGUgPSB0eXBlb2YgdmFsO1xuXG4gICAgICAgICAgaWYoc3BlY3Nba2V5XSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBzcGVjS2V5cy5wdXNoKGtleSk7XG4gICAgICAgICAgICBzcGVjc1trZXldID0ge307XG5cbiAgICAgICAgICAgIGlmICh0eXBlID09PSAnbnVtYmVyJykge1xuICAgICAgICAgICAgICBpZih2YWwgPCBOdW1iZXIuTUlOX1NBRkVfSU5URUdFUiB8fCB2YWwgPiBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUikge1xuICAgICAgICAgICAgICAgIGxvZ3MuYWRkQXBwbGljYXRpb25Mb2coJ09iamVjdFsnICsgaSArICddLicgKyBrZXkgKyAnIC0gVGhpcyB2YWx1ZSBleGNlZWRzIGV4cGVjdGVkIG51bWVyaWMgcHJlY2lzaW9uLicpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHNwZWNzW2tleV0uY29sVHlwZSAgID0gJ251bSc7XG4gICAgICAgICAgICAgIHNwZWNzW2tleV0uY29sTGVuZ3RoID0gODtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ3N0cmluZycgJiYgISh2YWwgaW5zdGFuY2VvZiBEYXRlKSkgeyAvLyBzdHJhaWdodGZvcndhcmQgc3RyaW5nXG4gICAgICAgICAgICAgIHNwZWNzW2tleV0uY29sVHlwZSAgICA9ICdzdHJpbmcnO1xuICAgICAgICAgICAgICBzcGVjc1trZXldLmNvbExlbmd0aCAgPSB2YWwubGVuZ3RoO1xuICAgICAgICAgICAgfSBlbHNlIGlmKHZhbCBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICAgICAgICAgICAgc3BlY3Nba2V5XS5jb2xUeXBlICAgPSAnZGF0ZSc7XG4gICAgICAgICAgICAgIHNwZWNzW2tleV0uY29sTGVuZ3RoID0gODtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgICAgc3BlY3Nba2V5XS5jb2xUeXBlICAgPSAnanNvbic7XG4gICAgICAgICAgICAgIHNwZWNzW2tleV0uY29sTGVuZ3RoID0gSlNPTi5zdHJpbmdpZnkodmFsKS5sZW5ndGg7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHNwZWNLZXlzID0gT2JqZWN0LmtleXMoc3BlY3MpO1xuICB9XG5cbiAgdmFyIHNhc0NzdiA9ICcnO1xuXG4gIC8vIHdlIG5lZWQgdHdvIGxvb3BzIC0gdGhlIGZpcnN0IG9uZSBpcyBjcmVhdGluZyBzcGVjcyBhbmQgdmFsaWRhdGluZ1xuICBmb3IgKGkgPSAwOyBpIDwgdGFibGUubGVuZ3RoOyBpKyspIHtcbiAgICByb3cgPSB0YWJsZVtpXTtcbiAgICBmb3IoaiA9IDA7IGogPCBzcGVjS2V5cy5sZW5ndGg7IGorKykge1xuICAgICAga2V5ID0gc3BlY0tleXNbal07XG4gICAgICBpZihyb3cuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuICAgICAgICB2YWwgID0gcm93W2tleV07XG4gICAgICAgIHR5cGUgPSB0eXBlb2YgdmFsO1xuXG4gICAgICAgIGlmKHR5cGUgPT09ICdudW1iZXInICYmIGlzTmFOKHZhbCkpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCd0eXBlRXJyb3InLCAnTmFOIHZhbHVlIGluIG9uZSBvZiB0aGUgdmFsdWVzIChjb2x1bW5zKSBpcyBub3QgYWxsb3dlZCcpO1xuICAgICAgICB9XG4gICAgICAgIGlmKHZhbCA9PT0gLUluZmluaXR5IHx8IHZhbCA9PT0gSW5maW5pdHkpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCd0eXBlRXJyb3InLCB2YWwudG9TdHJpbmcoKSArICcgdmFsdWUgaW4gb25lIG9mIHRoZSB2YWx1ZXMgKGNvbHVtbnMpIGlzIG5vdCBhbGxvd2VkJyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYodmFsID09PSB0cnVlIHx8IHZhbCA9PT0gZmFsc2UpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCd0eXBlRXJyb3InLCAnQm9vbGVhbiB2YWx1ZSBpbiBvbmUgb2YgdGhlIHZhbHVlcyAoY29sdW1ucykgaXMgbm90IGFsbG93ZWQnKTtcbiAgICAgICAgfVxuICAgICAgICBpZih0eXBlID09PSAnc3RyaW5nJyAmJiB2YWwuaW5kZXhPZignXFxuJykgIT09IC0xKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcigndHlwZUVycm9yJywgJ05ldyBsaW5lIGNoYXJhY3RlciBpcyBub3Qgc3VwcG9ydGVkJyk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBjb252ZXJ0IG51bGwgdG8gJy4nIGZvciBudW1iZXJzIGFuZCB0byAnJyBmb3Igc3RyaW5nc1xuICAgICAgICBpZih2YWwgPT09IG51bGwpIHtcbiAgICAgICAgICBpZihzcGVjc1trZXldLmNvbFR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICB2YWwgPSAnJztcbiAgICAgICAgICAgIHR5cGUgPSAnc3RyaW5nJztcbiAgICAgICAgICB9IGVsc2UgaWYoc3BlY3Nba2V5XS5jb2xUeXBlID09PSAnbnVtJykge1xuICAgICAgICAgICAgdmFsID0gJy4nO1xuICAgICAgICAgICAgdHlwZSA9ICdudW1iZXInO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCd0eXBlRXJyb3InLCAnQ2Fubm90IGNvbnZlcnQgbnVsbCB2YWx1ZScpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG5cbiAgICAgICAgaWYgKCh0eXBlID09PSAnbnVtYmVyJyAmJiBzcGVjc1trZXldLmNvbFR5cGUgIT09ICdudW0nICYmIHZhbCAhPT0gJy4nKSB8fFxuICAgICAgICAgICgodHlwZSA9PT0gJ3N0cmluZycgJiYgISh2YWwgaW5zdGFuY2VvZiBEYXRlKSAmJiBzcGVjc1trZXldLmNvbFR5cGUgIT09ICdzdHJpbmcnKSAmJlxuICAgICAgICAgICh0eXBlID09PSAnc3RyaW5nJyAmJiBzcGVjc1trZXldLmNvbFR5cGUgPT0gJ251bScgJiYgdmFsICE9PSAnLicpKSB8fFxuICAgICAgICAgICh2YWwgaW5zdGFuY2VvZiBEYXRlICYmIHNwZWNzW2tleV0uY29sVHlwZSAhPT0gJ2RhdGUnKSB8fFxuICAgICAgICAgICgodHlwZSA9PT0gJ29iamVjdCcgJiYgdmFsLmNvbnN0cnVjdG9yICE9PSBEYXRlKSAmJiBzcGVjc1trZXldLmNvbFR5cGUgIT09ICdqc29uJykpXG4gICAgICAgIHtcbiAgICAgICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCd0eXBlRXJyb3InLCAnVGhlcmUgaXMgYSBzcGVjcyB0eXBlIG1pc21hdGNoIGluIHRoZSBhcnJheSBiZXR3ZWVuIHZhbHVlcyAoY29sdW1ucykgb2YgdGhlIHNhbWUgbmFtZS4nICtcbiAgICAgICAgICAgICcgdHlwZS9jb2xUeXBlL3ZhbCA9ICcgKyB0eXBlICsnLycgKyBzcGVjc1trZXldLmNvbFR5cGUgKyAnLycgKyB2YWwgKTtcbiAgICAgICAgfSBlbHNlIGlmKCFpc1NwZWNzUHJvdmlkZWQgJiYgdHlwZSA9PT0gJ3N0cmluZycgJiYgc3BlY3Nba2V5XS5jb2xMZW5ndGggPCB2YWwubGVuZ3RoKSB7XG4gICAgICAgICAgc3BlY3Nba2V5XS5jb2xMZW5ndGggPSB2YWwubGVuZ3RoO1xuICAgICAgICB9IGVsc2UgaWYoKHR5cGUgPT09ICdzdHJpbmcnICYmIHNwZWNzW2tleV0uY29sTGVuZ3RoIDwgdmFsLmxlbmd0aCkgfHwgKHR5cGUgIT09ICdzdHJpbmcnICYmIHNwZWNzW2tleV0uY29sTGVuZ3RoICE9PSA4KSkge1xuICAgICAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ3R5cGVFcnJvcicsICdUaGVyZSBpcyBhIHNwZWNzIGxlbmd0aCBtaXNtYXRjaCBpbiB0aGUgYXJyYXkgYmV0d2VlbiB2YWx1ZXMgKGNvbHVtbnMpIG9mIHRoZSBzYW1lIG5hbWUuJyArXG4gICAgICAgICAgICAnIHR5cGUvY29sVHlwZS92YWwgPSAnICsgdHlwZSArJy8nICsgc3BlY3Nba2V5XS5jb2xUeXBlICsgJy8nICsgdmFsICk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodmFsIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgICAgICAgIHZhbCA9IHRvU2FzRGF0ZVRpbWUodmFsKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHN3aXRjaChzcGVjc1trZXldLmNvbFR5cGUpIHtcbiAgICAgICAgICBjYXNlICdudW0nOlxuICAgICAgICAgIGNhc2UgJ2RhdGUnOlxuICAgICAgICAgICAgc2FzQ3N2ICs9IHZhbDtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgJ3N0cmluZyc6XG4gICAgICAgICAgICBzYXNDc3YgKz0gJ1wiJyArIHZhbC5yZXBsYWNlKC9cIi9nLCAnXCJcIicpICsgJ1wiJztcbiAgICAgICAgICAgIHZhciBjb2xMZW5ndGggPSB2YWwubGVuZ3RoO1xuICAgICAgICAgICAgZm9yKHZhciBrID0gMDsgayA8IHZhbC5sZW5ndGg7IGsrKykge1xuICAgICAgICAgICAgICBpZihzcGVjaWFsQ2hhcnMuaW5kZXhPZih2YWxba10pICE9PSAtMSkge1xuICAgICAgICAgICAgICAgIGNvbExlbmd0aCsrO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHZhciBjb2RlID0gdmFsLmNoYXJDb2RlQXQoayk7XG4gICAgICAgICAgICAgICAgaWYoY29kZSA+IDB4ZmZmZikge1xuICAgICAgICAgICAgICAgICAgY29sTGVuZ3RoICs9IDM7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmKGNvZGUgPiAweDdmZikge1xuICAgICAgICAgICAgICAgICAgY29sTGVuZ3RoICs9IDI7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmKGNvZGUgPiAweDdmKSB7XG4gICAgICAgICAgICAgICAgICBjb2xMZW5ndGggKz0gMTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIHVzZSBtYXhpbXVtIHZhbHVlIGJldHdlZW4gbWF4IHByZXZpb3VzLCBjdXJyZW50IHZhbHVlIGFuZCAxIChmaXJzdCB0d28gY2FuIGJlIDAgd2ljaCBpcyBub3Qgc3VwcG9ydGVkKVxuICAgICAgICAgICAgc3BlY3Nba2V5XS5jb2xMZW5ndGggPSBNYXRoLm1heChzcGVjc1trZXldLmNvbExlbmd0aCwgY29sTGVuZ3RoLCAxKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgJ29iamVjdCc6XG4gICAgICAgICAgICBzYXNDc3YgKz0gJ1wiJyArIEpTT04uc3RyaW5naWR5KHZhbCkucmVwbGFjZSgvXCIvZywgJ1wiXCInKSArICdcIic7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgLy8gZG8gbm90IGluc2VydCBpZiBpdCdzIHRoZSBsYXN0IGNvbHVtblxuICAgICAgaWYoaiA8IHNwZWNLZXlzLmxlbmd0aCAtIDEpIHtcbiAgICAgICAgc2FzQ3N2ICs9ICcsJztcbiAgICAgIH1cbiAgICB9XG4gICAgaWYoaSA8IHRhYmxlLmxlbmd0aCAtIDEpIHtcbiAgICAgIHNhc0NzdiArPSAnXFxuJztcbiAgICB9XG4gIH1cblxuICAvL2NvbnZlcnQgc3BlY3MgdG8gY3N2IHdpdGggcGlwZXNcbiAgdmFyIHNwZWNTdHJpbmcgPSBzcGVjS2V5cy5tYXAoZnVuY3Rpb24oa2V5KSB7XG4gICAgcmV0dXJuIGtleSArICcsJyArIHNwZWNzW2tleV0uY29sVHlwZSArICcsJyArIHNwZWNzW2tleV0uY29sTGVuZ3RoO1xuICB9KS5qb2luKCd8Jyk7XG5cbiAgdGhpcy5fZmlsZXNbbWFjcm9OYW1lXSA9IFtcbiAgICBzcGVjU3RyaW5nLFxuICAgIG5ldyBCbG9iKFtzYXNDc3ZdLCB7dHlwZTogJ3RleHQvY3N2O2NoYXJzZXQ9VVRGLTgnfSlcbiAgXTtcbn07XG5cblNhc0RhdGEucHJvdG90eXBlLmFkZEZpbGUgID0gZnVuY3Rpb24oZmlsZSwgbWFjcm9OYW1lKSB7XG4gIEZpbGVzLnByb3RvdHlwZS5hZGQuY2FsbCh0aGlzLCBmaWxlLCBtYWNyb05hbWUpO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBTYXNEYXRhO1xuIiwidmFyIGg1NHNFcnJvciA9IHJlcXVpcmUoJy4uL2Vycm9yLmpzJyk7XG5cbi8qXG4qIGg1NHMgdGFibGVzIG9iamVjdCBjb25zdHJ1Y3RvclxuKiBAY29uc3RydWN0b3JcbipcbipAcGFyYW0ge2FycmF5fSB0YWJsZSAtIFRhYmxlIGFkZGVkIHdoZW4gb2JqZWN0IGlzIGNyZWF0ZWRcbipAcGFyYW0ge3N0cmluZ30gbWFjcm9OYW1lIC0gbWFjcm8gbmFtZVxuKkBwYXJhbSB7bnVtYmVyfSBwYXJhbWV0ZXJUaHJlc2hvbGQgLSBzaXplIG9mIGRhdGEgb2JqZWN0cyBzZW50IHRvIFNBU1xuKlxuKi9cbmZ1bmN0aW9uIFRhYmxlcyh0YWJsZSwgbWFjcm9OYW1lLCBwYXJhbWV0ZXJUaHJlc2hvbGQpIHtcbiAgdGhpcy5fdGFibGVzID0ge307XG4gIHRoaXMuX3BhcmFtZXRlclRocmVzaG9sZCA9IHBhcmFtZXRlclRocmVzaG9sZCB8fCAzMDAwMDtcblxuICBUYWJsZXMucHJvdG90eXBlLmFkZC5jYWxsKHRoaXMsIHRhYmxlLCBtYWNyb05hbWUpO1xufVxuXG4vKlxuKiBBZGQgdGFibGUgdG8gdGFibGVzIG9iamVjdFxuKiBAcGFyYW0ge2FycmF5fSB0YWJsZSAtIEFycmF5IG9mIHRhYmxlIG9iamVjdHNcbiogQHBhcmFtIHtzdHJpbmd9IG1hY3JvTmFtZSAtIFNhcyBtYWNybyBuYW1lXG4qXG4qL1xuVGFibGVzLnByb3RvdHlwZS5hZGQgPSBmdW5jdGlvbih0YWJsZSwgbWFjcm9OYW1lKSB7XG4gIGlmKHRhYmxlICYmIG1hY3JvTmFtZSkge1xuICAgIGlmKCEodGFibGUgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnRmlyc3QgYXJndW1lbnQgbXVzdCBiZSBhcnJheScpO1xuICAgIH1cbiAgICBpZih0eXBlb2YgbWFjcm9OYW1lICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdTZWNvbmQgYXJndW1lbnQgbXVzdCBiZSBzdHJpbmcnKTtcbiAgICB9XG4gICAgaWYoIWlzTmFOKG1hY3JvTmFtZVttYWNyb05hbWUubGVuZ3RoIC0gMV0pKSB7XG4gICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ01hY3JvIG5hbWUgY2Fubm90IGhhdmUgbnVtYmVyIGF0IHRoZSBlbmQnKTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdNaXNzaW5nIGFyZ3VtZW50cycpO1xuICB9XG5cbiAgdmFyIHJlc3VsdCA9IHRoaXMuX3V0aWxzLmNvbnZlcnRUYWJsZU9iamVjdCh0YWJsZSwgdGhpcy5fcGFyYW1ldGVyVGhyZXNob2xkKTtcblxuICB2YXIgdGFibGVBcnJheSA9IFtdO1xuICB0YWJsZUFycmF5LnB1c2goSlNPTi5zdHJpbmdpZnkocmVzdWx0LnNwZWMpKTtcbiAgZm9yICh2YXIgbnVtYmVyT2ZUYWJsZXMgPSAwOyBudW1iZXJPZlRhYmxlcyA8IHJlc3VsdC5kYXRhLmxlbmd0aDsgbnVtYmVyT2ZUYWJsZXMrKykge1xuICAgIHZhciBvdXRTdHJpbmcgPSBKU09OLnN0cmluZ2lmeShyZXN1bHQuZGF0YVtudW1iZXJPZlRhYmxlc10pO1xuICAgIHRhYmxlQXJyYXkucHVzaChvdXRTdHJpbmcpO1xuICB9XG4gIHRoaXMuX3RhYmxlc1ttYWNyb05hbWVdID0gdGFibGVBcnJheTtcbn07XG5cblRhYmxlcy5wcm90b3R5cGUuX3V0aWxzID0gcmVxdWlyZSgnLi91dGlscy5qcycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IFRhYmxlcztcbiIsInZhciBoNTRzRXJyb3IgPSByZXF1aXJlKCcuLi9lcnJvci5qcycpO1xudmFyIGxvZ3MgPSByZXF1aXJlKCcuLi9sb2dzLmpzJyk7XG5cbi8qXG4qIENvbnZlcnQgdGFibGUgb2JqZWN0IHRvIFNhcyByZWFkYWJsZSBvYmplY3RcbipcbiogQHBhcmFtIHtvYmplY3R9IGluT2JqZWN0IC0gT2JqZWN0IHRvIGNvbnZlcnRcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5jb252ZXJ0VGFibGVPYmplY3QgPSBmdW5jdGlvbihpbk9iamVjdCwgY2h1bmtUaHJlc2hvbGQpIHtcbiAgdmFyIHNlbGYgICAgICAgICAgICA9IHRoaXM7XG5cbiAgaWYoY2h1bmtUaHJlc2hvbGQgPiAzMDAwMCkge1xuICAgIGNvbnNvbGUud2FybignWW91IHNob3VsZCBub3Qgc2V0IHRocmVzaG9sZCBsYXJnZXIgdGhhbiAzMGtiIGJlY2F1c2Ugb2YgdGhlIFNBUyBsaW1pdGF0aW9ucycpO1xuICB9XG5cbiAgLy8gZmlyc3QgY2hlY2sgdGhhdCB0aGUgb2JqZWN0IGlzIGFuIGFycmF5XG4gIGlmICh0eXBlb2YgKGluT2JqZWN0KSAhPT0gJ29iamVjdCcpIHtcbiAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1RoZSBwYXJhbWV0ZXIgcGFzc2VkIHRvIGNoZWNrQW5kR2V0VHlwZU9iamVjdCBpcyBub3QgYW4gb2JqZWN0Jyk7XG4gIH1cblxuICB2YXIgYXJyYXlMZW5ndGggPSBpbk9iamVjdC5sZW5ndGg7XG4gIGlmICh0eXBlb2YgKGFycmF5TGVuZ3RoKSAhPT0gJ251bWJlcicpIHtcbiAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1RoZSBwYXJhbWV0ZXIgcGFzc2VkIHRvIGNoZWNrQW5kR2V0VHlwZU9iamVjdCBkb2VzIG5vdCBoYXZlIGEgdmFsaWQgbGVuZ3RoIGFuZCBpcyBtb3N0IGxpa2VseSBub3QgYW4gYXJyYXknKTtcbiAgfVxuXG4gIHZhciBleGlzdGluZ0NvbHMgPSB7fTsgLy8gdGhpcyBpcyBqdXN0IHRvIG1ha2UgbG9va3VwIGVhc2llciByYXRoZXIgdGhhbiB0cmF2ZXJzaW5nIGFycmF5IGVhY2ggdGltZS4gV2lsbCB0cmFuc2Zvcm0gYWZ0ZXJcblxuICAvLyBmdW5jdGlvbiBjaGVja0FuZFNldEFycmF5IC0gdGhpcyB3aWxsIGNoZWNrIGFuIGluT2JqZWN0IGN1cnJlbnQga2V5IGFnYWluc3QgdGhlIGV4aXN0aW5nIHR5cGVBcnJheSBhbmQgZWl0aGVyIHJldHVybiAtMSBpZiB0aGVyZVxuICAvLyBpcyBhIHR5cGUgbWlzbWF0Y2ggb3IgYWRkIGFuIGVsZW1lbnQgYW5kIHVwZGF0ZS9pbmNyZW1lbnQgdGhlIGxlbmd0aCBpZiBuZWVkZWRcblxuICBmdW5jdGlvbiBjaGVja0FuZEluY3JlbWVudChjb2xTcGVjKSB7XG4gICAgaWYgKHR5cGVvZiAoZXhpc3RpbmdDb2xzW2NvbFNwZWMuY29sTmFtZV0pID09PSAndW5kZWZpbmVkJykge1xuICAgICAgZXhpc3RpbmdDb2xzW2NvbFNwZWMuY29sTmFtZV0gICAgICAgICAgID0ge307XG4gICAgICBleGlzdGluZ0NvbHNbY29sU3BlYy5jb2xOYW1lXS5jb2xOYW1lICAgPSBjb2xTcGVjLmNvbE5hbWU7XG4gICAgICBleGlzdGluZ0NvbHNbY29sU3BlYy5jb2xOYW1lXS5jb2xUeXBlICAgPSBjb2xTcGVjLmNvbFR5cGU7XG4gICAgICBleGlzdGluZ0NvbHNbY29sU3BlYy5jb2xOYW1lXS5jb2xMZW5ndGggPSBjb2xTcGVjLmNvbExlbmd0aCA+IDAgPyBjb2xTcGVjLmNvbExlbmd0aCA6IDE7XG4gICAgICByZXR1cm4gMDsgLy8gYWxsIG9rXG4gICAgfVxuICAgIC8vIGNoZWNrIHR5cGUgbWF0Y2hcbiAgICBpZiAoZXhpc3RpbmdDb2xzW2NvbFNwZWMuY29sTmFtZV0uY29sVHlwZSAhPT0gY29sU3BlYy5jb2xUeXBlKSB7XG4gICAgICByZXR1cm4gLTE7IC8vIHRoZXJlIGlzIGEgZnVkZ2UgaW4gdGhlIHR5cGluZ1xuICAgIH1cbiAgICBpZiAoZXhpc3RpbmdDb2xzW2NvbFNwZWMuY29sTmFtZV0uY29sTGVuZ3RoIDwgY29sU3BlYy5jb2xMZW5ndGgpIHtcbiAgICAgIGV4aXN0aW5nQ29sc1tjb2xTcGVjLmNvbE5hbWVdLmNvbExlbmd0aCA9IGNvbFNwZWMuY29sTGVuZ3RoID4gMCA/IGNvbFNwZWMuY29sTGVuZ3RoIDogMTsgLy8gaW5jcmVtZW50IHRoZSBtYXggbGVuZ3RoIG9mIHRoaXMgY29sdW1uXG4gICAgICByZXR1cm4gMDtcbiAgICB9XG4gIH1cbiAgdmFyIGNodW5rQXJyYXlDb3VudCAgICAgICAgID0gMDsgLy8gdGhpcyBpcyBmb3Iga2VlcGluZyB0YWJzIG9uIGhvdyBsb25nIHRoZSBjdXJyZW50IGFycmF5IHN0cmluZyB3b3VsZCBiZVxuICB2YXIgdGFyZ2V0QXJyYXkgICAgICAgICAgICAgPSBbXTsgLy8gdGhpcyBpcyB0aGUgYXJyYXkgb2YgdGFyZ2V0IGFycmF5c1xuICB2YXIgY3VycmVudFRhcmdldCAgICAgICAgICAgPSAwO1xuICB0YXJnZXRBcnJheVtjdXJyZW50VGFyZ2V0XSAgPSBbXTtcbiAgdmFyIGogICAgICAgICAgICAgICAgICAgICAgID0gMDtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBpbk9iamVjdC5sZW5ndGg7IGkrKykge1xuICAgIHRhcmdldEFycmF5W2N1cnJlbnRUYXJnZXRdW2pdID0ge307XG4gICAgdmFyIGNodW5rUm93Q291bnQgICAgICAgICAgICAgPSAwO1xuXG4gICAgZm9yICh2YXIga2V5IGluIGluT2JqZWN0W2ldKSB7XG4gICAgICB2YXIgdGhpc1NwZWMgID0ge307XG4gICAgICB2YXIgdGhpc1ZhbHVlID0gaW5PYmplY3RbaV1ba2V5XTtcblxuICAgICAgLy9za2lwIHVuZGVmaW5lZCB2YWx1ZXNcbiAgICAgIGlmKHRoaXNWYWx1ZSA9PT0gdW5kZWZpbmVkIHx8IHRoaXNWYWx1ZSA9PT0gbnVsbCkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgLy90aHJvdyBhbiBlcnJvciBpZiB0aGVyZSdzIE5hTiB2YWx1ZVxuICAgICAgaWYodHlwZW9mIHRoaXNWYWx1ZSA9PT0gJ251bWJlcicgJiYgaXNOYU4odGhpc1ZhbHVlKSkge1xuICAgICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCd0eXBlRXJyb3InLCAnTmFOIHZhbHVlIGluIG9uZSBvZiB0aGUgdmFsdWVzIChjb2x1bW5zKSBpcyBub3QgYWxsb3dlZCcpO1xuICAgICAgfVxuXG4gICAgICBpZih0aGlzVmFsdWUgPT09IC1JbmZpbml0eSB8fCB0aGlzVmFsdWUgPT09IEluZmluaXR5KSB7XG4gICAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ3R5cGVFcnJvcicsIHRoaXNWYWx1ZS50b1N0cmluZygpICsgJyB2YWx1ZSBpbiBvbmUgb2YgdGhlIHZhbHVlcyAoY29sdW1ucykgaXMgbm90IGFsbG93ZWQnKTtcbiAgICAgIH1cblxuICAgICAgaWYodGhpc1ZhbHVlID09PSB0cnVlIHx8IHRoaXNWYWx1ZSA9PT0gZmFsc2UpIHtcbiAgICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcigndHlwZUVycm9yJywgJ0Jvb2xlYW4gdmFsdWUgaW4gb25lIG9mIHRoZSB2YWx1ZXMgKGNvbHVtbnMpIGlzIG5vdCBhbGxvd2VkJyk7XG4gICAgICB9XG5cbiAgICAgIC8vIGdldCB0eXBlLi4uIGlmIGl0IGlzIGFuIG9iamVjdCB0aGVuIGNvbnZlcnQgaXQgdG8ganNvbiBhbmQgc3RvcmUgYXMgYSBzdHJpbmdcbiAgICAgIHZhciB0aGlzVHlwZSAgPSB0eXBlb2YgKHRoaXNWYWx1ZSk7XG5cbiAgICAgIGlmICh0aGlzVHlwZSA9PT0gJ251bWJlcicpIHsgLy8gc3RyYWlnaHRmb3J3YXJkIG51bWJlclxuICAgICAgICBpZih0aGlzVmFsdWUgPCBOdW1iZXIuTUlOX1NBRkVfSU5URUdFUiB8fCB0aGlzVmFsdWUgPiBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUikge1xuICAgICAgICAgIGxvZ3MuYWRkQXBwbGljYXRpb25Mb2coJ09iamVjdFsnICsgaSArICddLicgKyBrZXkgKyAnIC0gVGhpcyB2YWx1ZSBleGNlZWRzIGV4cGVjdGVkIG51bWVyaWMgcHJlY2lzaW9uLicpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXNTcGVjLmNvbE5hbWUgICAgICAgICAgICAgICAgICAgID0ga2V5O1xuICAgICAgICB0aGlzU3BlYy5jb2xUeXBlICAgICAgICAgICAgICAgICAgICA9ICdudW0nO1xuICAgICAgICB0aGlzU3BlYy5jb2xMZW5ndGggICAgICAgICAgICAgICAgICA9IDg7XG4gICAgICAgIHRoaXNTcGVjLmVuY29kZWRMZW5ndGggICAgICAgICAgICAgID0gdGhpc1ZhbHVlLnRvU3RyaW5nKCkubGVuZ3RoO1xuICAgICAgICB0YXJnZXRBcnJheVtjdXJyZW50VGFyZ2V0XVtqXVtrZXldICA9IHRoaXNWYWx1ZTtcbiAgICAgIH0gZWxzZSBpZiAodGhpc1R5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHRoaXNTcGVjLmNvbE5hbWUgICAgPSBrZXk7XG4gICAgICAgIHRoaXNTcGVjLmNvbFR5cGUgICAgPSAnc3RyaW5nJztcbiAgICAgICAgdGhpc1NwZWMuY29sTGVuZ3RoICA9IHRoaXNWYWx1ZS5sZW5ndGg7XG5cbiAgICAgICAgaWYgKHRoaXNWYWx1ZSA9PT0gXCJcIikge1xuICAgICAgICAgIHRhcmdldEFycmF5W2N1cnJlbnRUYXJnZXRdW2pdW2tleV0gPSBcIiBcIjtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0YXJnZXRBcnJheVtjdXJyZW50VGFyZ2V0XVtqXVtrZXldID0gZW5jb2RlVVJJQ29tcG9uZW50KHRoaXNWYWx1ZSkucmVwbGFjZSgvJy9nLCAnJTI3Jyk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpc1NwZWMuZW5jb2RlZExlbmd0aCA9IHRhcmdldEFycmF5W2N1cnJlbnRUYXJnZXRdW2pdW2tleV0ubGVuZ3RoO1xuICAgICAgfSBlbHNlIGlmKHRoaXNWYWx1ZSBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcigndHlwZUVycm9yJywgJ0RhdGUgdHlwZSBub3Qgc3VwcG9ydGVkLiBQbGVhc2UgdXNlIGg1NHMudG9TYXNEYXRlVGltZSBmdW5jdGlvbiB0byBjb252ZXJ0IGl0Jyk7XG4gICAgICB9IGVsc2UgaWYgKHRoaXNUeXBlID09ICdvYmplY3QnKSB7XG4gICAgICAgIHRoaXNTcGVjLmNvbE5hbWUgICAgICAgICAgICAgICAgICAgID0ga2V5O1xuICAgICAgICB0aGlzU3BlYy5jb2xUeXBlICAgICAgICAgICAgICAgICAgICA9ICdqc29uJztcbiAgICAgICAgdGhpc1NwZWMuY29sTGVuZ3RoICAgICAgICAgICAgICAgICAgPSBKU09OLnN0cmluZ2lmeSh0aGlzVmFsdWUpLmxlbmd0aDtcbiAgICAgICAgdGFyZ2V0QXJyYXlbY3VycmVudFRhcmdldF1bal1ba2V5XSAgPSBlbmNvZGVVUklDb21wb25lbnQoSlNPTi5zdHJpbmdpZnkodGhpc1ZhbHVlKSkucmVwbGFjZSgvJy9nLCAnJTI3Jyk7XG4gICAgICAgIHRoaXNTcGVjLmVuY29kZWRMZW5ndGggICAgICAgICAgICAgID0gdGFyZ2V0QXJyYXlbY3VycmVudFRhcmdldF1bal1ba2V5XS5sZW5ndGg7XG4gICAgICB9XG5cbiAgICAgIGNodW5rUm93Q291bnQgPSBjaHVua1Jvd0NvdW50ICsgNiArIGtleS5sZW5ndGggKyB0aGlzU3BlYy5lbmNvZGVkTGVuZ3RoO1xuXG4gICAgICBpZiAoY2hlY2tBbmRJbmNyZW1lbnQodGhpc1NwZWMpID09IC0xKSB7XG4gICAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ3R5cGVFcnJvcicsICdUaGVyZSBpcyBhIHR5cGUgbWlzbWF0Y2ggaW4gdGhlIGFycmF5IGJldHdlZW4gdmFsdWVzIChjb2x1bW5zKSBvZiB0aGUgc2FtZSBuYW1lLicpO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vcmVtb3ZlIGxhc3QgYWRkZWQgcm93IGlmIGl0J3MgZW1wdHlcbiAgICBpZihPYmplY3Qua2V5cyh0YXJnZXRBcnJheVtjdXJyZW50VGFyZ2V0XVtqXSkubGVuZ3RoID09PSAwKSB7XG4gICAgICB0YXJnZXRBcnJheVtjdXJyZW50VGFyZ2V0XS5zcGxpY2UoaiwgMSk7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICBpZiAoY2h1bmtSb3dDb3VudCA+IGNodW5rVGhyZXNob2xkKSB7XG4gICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1JvdyAnICsgaiArICcgZXhjZWVkcyBzaXplIGxpbWl0IG9mIDMya2InKTtcbiAgICB9IGVsc2UgaWYoY2h1bmtBcnJheUNvdW50ICsgY2h1bmtSb3dDb3VudCA+IGNodW5rVGhyZXNob2xkKSB7XG4gICAgICAvL2NyZWF0ZSBuZXcgYXJyYXkgaWYgdGhpcyBvbmUgaXMgZnVsbCBhbmQgbW92ZSB0aGUgbGFzdCBpdGVtIHRvIHRoZSBuZXcgYXJyYXlcbiAgICAgIHZhciBsYXN0Um93ID0gdGFyZ2V0QXJyYXlbY3VycmVudFRhcmdldF0ucG9wKCk7IC8vIGdldCByaWQgb2YgdGhhdCBsYXN0IHJvd1xuICAgICAgY3VycmVudFRhcmdldCsrOyAvLyBtb3ZlIG9udG8gdGhlIG5leHQgYXJyYXlcbiAgICAgIHRhcmdldEFycmF5W2N1cnJlbnRUYXJnZXRdICA9IFtsYXN0Um93XTsgLy8gbWFrZSBpdCBhbiBhcnJheVxuICAgICAgaiAgICAgICAgICAgICAgICAgICAgICAgICAgID0gMDsgLy8gaW5pdGlhbGlzZSBuZXcgcm93IGNvdW50ZXIgZm9yIG5ldyBhcnJheSAtIGl0IHdpbGwgYmUgaW5jcmVtZW50ZWQgYXQgdGhlIGVuZCBvZiB0aGUgZnVuY3Rpb25cbiAgICAgIGNodW5rQXJyYXlDb3VudCAgICAgICAgICAgICA9IGNodW5rUm93Q291bnQ7IC8vIHRoaXMgaXMgdGhlIG5ldyBjaHVuayBtYXggc2l6ZVxuICAgIH0gZWxzZSB7XG4gICAgICBjaHVua0FycmF5Q291bnQgPSBjaHVua0FycmF5Q291bnQgKyBjaHVua1Jvd0NvdW50O1xuICAgIH1cbiAgICBqKys7XG4gIH1cblxuICAvLyByZWZvcm1hdCBleGlzdGluZ0NvbHMgaW50byBhbiBhcnJheSBzbyBzYXMgY2FuIHBhcnNlIGl0O1xuICB2YXIgc3BlY0FycmF5ID0gW107XG4gIGZvciAodmFyIGsgaW4gZXhpc3RpbmdDb2xzKSB7XG4gICAgc3BlY0FycmF5LnB1c2goZXhpc3RpbmdDb2xzW2tdKTtcbiAgfVxuICByZXR1cm4ge1xuICAgIHNwZWM6ICAgICAgIHNwZWNBcnJheSxcbiAgICBkYXRhOiAgICAgICB0YXJnZXRBcnJheSxcbiAgICBqc29uTGVuZ3RoOiBjaHVua0FycmF5Q291bnRcbiAgfTsgLy8gdGhlIHNwZWMgd2lsbCBiZSB0aGUgbWFjcm9bMF0sIHdpdGggdGhlIGRhdGEgc3BsaXQgaW50byBhcnJheXMgb2YgbWFjcm9bMS1uXVxuICAvLyBtZWFucyBpbiB0ZXJtcyBvZiBkb2pvIHhociBvYmplY3QgYXQgbGVhc3QgdGhleSBuZWVkIHRvIGdvIGludG8gdGhlIHNhbWUgYXJyYXlcbn07XG5cbi8qXG4qIENvbnZlcnQgamF2YXNjcmlwdCBkYXRlIHRvIHNhcyB0aW1lXG4qXG4qIEBwYXJhbSB7b2JqZWN0fSBqc0RhdGUgLSBqYXZhc2NyaXB0IERhdGUgb2JqZWN0XG4qXG4qL1xubW9kdWxlLmV4cG9ydHMudG9TYXNEYXRlVGltZSA9IGZ1bmN0aW9uIChqc0RhdGUpIHtcbiAgdmFyIGJhc2VkYXRlID0gbmV3IERhdGUoXCJKYW51YXJ5IDEsIDE5NjAgMDA6MDA6MDBcIik7XG4gIHZhciBjdXJyZGF0ZSA9IGpzRGF0ZTtcblxuICAvLyBvZmZzZXRzIGZvciBVVEMgYW5kIHRpbWV6b25lcyBhbmQgQlNUXG4gIHZhciBiYXNlT2Zmc2V0ID0gYmFzZWRhdGUuZ2V0VGltZXpvbmVPZmZzZXQoKTsgLy8gaW4gbWludXRlc1xuICB2YXIgY3Vyck9mZnNldCA9IGN1cnJkYXRlLmdldFRpbWV6b25lT2Zmc2V0KCk7IC8vIGluIG1pbnV0ZXNcblxuICAvLyBjb252ZXJ0IGN1cnJkYXRlIHRvIGEgc2FzIGRhdGV0aW1lXG4gIHZhciBvZmZzZXRTZWNzICAgID0gKGN1cnJPZmZzZXQgLSBiYXNlT2Zmc2V0KSAqIDYwOyAvLyBvZmZzZXREaWZmIGlzIGluIG1pbnV0ZXMgdG8gc3RhcnQgd2l0aFxuICB2YXIgYmFzZURhdGVTZWNzICA9IGJhc2VkYXRlLmdldFRpbWUoKSAvIDEwMDA7IC8vIGdldCByaWQgb2YgbXNcbiAgdmFyIGN1cnJkYXRlU2VjcyAgPSBjdXJyZGF0ZS5nZXRUaW1lKCkgLyAxMDAwOyAvLyBnZXQgcmlkIG9mIG1zXG4gIHZhciBzYXNEYXRldGltZSAgID0gTWF0aC5yb3VuZChjdXJyZGF0ZVNlY3MgLSBiYXNlRGF0ZVNlY3MgLSBvZmZzZXRTZWNzKTsgLy8gYWRqdXN0XG5cbiAgcmV0dXJuIHNhc0RhdGV0aW1lO1xufTtcbiJdfQ==
