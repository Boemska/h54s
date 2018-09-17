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
h54s.version = '0.11.3';


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
      _service: 'default',
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvZXJyb3IuanMiLCJzcmMvZmlsZXMvaW5kZXguanMiLCJzcmMvaDU0cy5qcyIsInNyYy9pZV9wb2x5ZmlsbHMuanMiLCJzcmMvbG9ncy5qcyIsInNyYy9tZXRob2RzL2FqYXguanMiLCJzcmMvbWV0aG9kcy9pbmRleC5qcyIsInNyYy9tZXRob2RzL3V0aWxzLmpzIiwic3JjL3Nhc0RhdGEuanMiLCJzcmMvdGFibGVzL2luZGV4LmpzIiwic3JjL3RhYmxlcy91dGlscy5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsWUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMU9BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaFFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIvKlxuKiBoNTRzIGVycm9yIGNvbnN0cnVjdG9yXG4qIEBjb25zdHJ1Y3RvclxuKlxuKkBwYXJhbSB7c3RyaW5nfSB0eXBlIC0gRXJyb3IgdHlwZVxuKkBwYXJhbSB7c3RyaW5nfSBtZXNzYWdlIC0gRXJyb3IgbWVzc2FnZVxuKkBwYXJhbSB7c3RyaW5nfSBzdGF0dXMgLSBFcnJvciBzdGF0dXMgcmV0dXJuZWQgZnJvbSBTQVNcbipcbiovXG5mdW5jdGlvbiBoNTRzRXJyb3IodHlwZSwgbWVzc2FnZSwgc3RhdHVzKSB7XG4gIGlmKEVycm9yLmNhcHR1cmVTdGFja1RyYWNlKSB7XG4gICAgRXJyb3IuY2FwdHVyZVN0YWNrVHJhY2UodGhpcyk7XG4gIH1cbiAgdGhpcy5tZXNzYWdlID0gbWVzc2FnZTtcbiAgdGhpcy50eXBlICAgID0gdHlwZTtcbiAgdGhpcy5zdGF0dXMgID0gc3RhdHVzO1xufVxuXG5oNTRzRXJyb3IucHJvdG90eXBlID0gT2JqZWN0LmNyZWF0ZShFcnJvci5wcm90b3R5cGUsIHtcbiAgY29uc3RydWN0b3I6IHtcbiAgICBjb25maWd1cmFibGU6IGZhbHNlLFxuICAgIGVudW1lcmFibGU6IGZhbHNlLFxuICAgIHdyaXRhYmxlOiBmYWxzZSxcbiAgICB2YWx1ZTogaDU0c0Vycm9yXG4gIH0sXG4gIG5hbWU6IHtcbiAgICBjb25maWd1cmFibGU6IGZhbHNlLFxuICAgIGVudW1lcmFibGU6IGZhbHNlLFxuICAgIHdyaXRhYmxlOiBmYWxzZSxcbiAgICB2YWx1ZTogJ2g1NHNFcnJvcidcbiAgfVxufSk7XG5cbm1vZHVsZS5leHBvcnRzID0gaDU0c0Vycm9yOyIsInZhciBoNTRzRXJyb3IgPSByZXF1aXJlKCcuLi9lcnJvci5qcycpO1xuXG4vKlxuKiBoNTRzIFNBUyBGaWxlcyBvYmplY3QgY29uc3RydWN0b3JcbiogQGNvbnN0cnVjdG9yXG4qXG4qQHBhcmFtIHtmaWxlfSBmaWxlIC0gRmlsZSBhZGRlZCB3aGVuIG9iamVjdCBpcyBjcmVhdGVkXG4qQHBhcmFtIHtzdHJpbmd9IG1hY3JvTmFtZSAtIG1hY3JvIG5hbWVcbipcbiovXG5mdW5jdGlvbiBGaWxlcyhmaWxlLCBtYWNyb05hbWUpIHtcbiAgdGhpcy5fZmlsZXMgPSB7fTtcblxuICBGaWxlcy5wcm90b3R5cGUuYWRkLmNhbGwodGhpcywgZmlsZSwgbWFjcm9OYW1lKTtcbn1cblxuLypcbiogQWRkIGZpbGUgdG8gZmlsZXMgb2JqZWN0XG4qIEBwYXJhbSB7ZmlsZX0gZmlsZSAtIEluc3RhbmNlIG9mIEphdmFTY3JpcHQgRmlsZSBvYmplY3RcbiogQHBhcmFtIHtzdHJpbmd9IG1hY3JvTmFtZSAtIFNhcyBtYWNybyBuYW1lXG4qXG4qL1xuRmlsZXMucHJvdG90eXBlLmFkZCA9IGZ1bmN0aW9uKGZpbGUsIG1hY3JvTmFtZSkge1xuICBpZihmaWxlICYmIG1hY3JvTmFtZSkge1xuICAgIGlmKCEoZmlsZSBpbnN0YW5jZW9mIEZpbGUgfHwgZmlsZSBpbnN0YW5jZW9mIEJsb2IpKSB7XG4gICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ0ZpcnN0IGFyZ3VtZW50IG11c3QgYmUgaW5zdGFuY2Ugb2YgRmlsZSBvYmplY3QnKTtcbiAgICB9XG4gICAgaWYodHlwZW9mIG1hY3JvTmFtZSAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnU2Vjb25kIGFyZ3VtZW50IG11c3QgYmUgc3RyaW5nJyk7XG4gICAgfVxuICAgIGlmKCFpc05hTihtYWNyb05hbWVbbWFjcm9OYW1lLmxlbmd0aCAtIDFdKSkge1xuICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdNYWNybyBuYW1lIGNhbm5vdCBoYXZlIG51bWJlciBhdCB0aGUgZW5kJyk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnTWlzc2luZyBhcmd1bWVudHMnKTtcbiAgfVxuXG4gIHRoaXMuX2ZpbGVzW21hY3JvTmFtZV0gPSBbXG4gICAgJ0ZJTEUnLFxuICAgIGZpbGVcbiAgXTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gRmlsZXM7XG4iLCJ2YXIgaDU0c0Vycm9yID0gcmVxdWlyZSgnLi9lcnJvci5qcycpO1xuXG4vKlxuKiBSZXByZXNlbnRzIGh0bWw1IGZvciBzYXMgYWRhcHRlclxuKiBAY29uc3RydWN0b3JcbipcbipAcGFyYW0ge29iamVjdH0gY29uZmlnIC0gYWRhcHRlciBjb25maWcgb2JqZWN0LCB3aXRoIGtleXMgbGlrZSB1cmwsIGRlYnVnLCBldGMuXG4qXG4qL1xudmFyIGg1NHMgPSBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKGNvbmZpZykge1xuXG4gIC8vZGVmYXVsdCBjb25maWcgdmFsdWVzXG4gIHRoaXMubWF4WGhyUmV0cmllcyAgICAgICAgPSA1O1xuICB0aGlzLnVybCAgICAgICAgICAgICAgICAgID0gXCIvU0FTU3RvcmVkUHJvY2Vzcy9kb1wiO1xuICB0aGlzLmRlYnVnICAgICAgICAgICAgICAgID0gZmFsc2U7XG4gIHRoaXMubG9naW5VcmwgICAgICAgICAgICAgPSAnL1NBU0xvZ29uL0xvZ29uLmRvJztcbiAgdGhpcy5yZXRyeUFmdGVyTG9naW4gICAgICA9IHRydWU7XG4gIHRoaXMuYWpheFRpbWVvdXQgICAgICAgICAgPSAzMDAwMDtcbiAgdGhpcy51c2VNdWx0aXBhcnRGb3JtRGF0YSA9IHRydWU7XG4gIHRoaXMuUkVTVGF1dGggICAgICAgICAgICAgPSBmYWxzZTtcbiAgdGhpcy5SRVNUYXV0aExvZ2luVXJsICAgICA9ICcvU0FTTG9nb24vdjEvdGlja2V0cyc7XG5cbiAgdGhpcy5yZW1vdGVDb25maWdVcGRhdGVDYWxsYmFja3MgPSBbXTtcbiAgdGhpcy5fcGVuZGluZ0NhbGxzID0gW107XG4gIHRoaXMuX2FqYXggPSByZXF1aXJlKCcuL21ldGhvZHMvYWpheC5qcycpKCk7XG5cbiAgX3NldENvbmZpZy5jYWxsKHRoaXMsIGNvbmZpZyk7XG5cbiAgLy9vdmVycmlkZSB3aXRoIHJlbW90ZSBpZiBzZXRcbiAgaWYoY29uZmlnICYmIGNvbmZpZy5pc1JlbW90ZUNvbmZpZykge1xuICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgIHRoaXMuX2Rpc2FibGVDYWxscyA9IHRydWU7XG5cbiAgICAvLyAnaDU0c0NvbmZpZy5qc29uJyBpcyBmb3IgdGhlIHRlc3Rpbmcgd2l0aCBrYXJtYVxuICAgIC8vcmVwbGFjZWQgd2l0aCBndWxwIGluIGRldiBidWlsZFxuICAgIHRoaXMuX2FqYXguZ2V0KCdoNTRzQ29uZmlnLmpzb24nKS5zdWNjZXNzKGZ1bmN0aW9uKHJlcykge1xuICAgICAgdmFyIHJlbW90ZUNvbmZpZyA9IEpTT04ucGFyc2UocmVzLnJlc3BvbnNlVGV4dCk7XG5cbiAgICAgIGZvcih2YXIga2V5IGluIHJlbW90ZUNvbmZpZykge1xuICAgICAgICBpZihyZW1vdGVDb25maWcuaGFzT3duUHJvcGVydHkoa2V5KSAmJiBjb25maWdba2V5XSA9PT0gdW5kZWZpbmVkICYmIGtleSAhPT0gJ2lzUmVtb3RlQ29uZmlnJykge1xuICAgICAgICAgIGNvbmZpZ1trZXldID0gcmVtb3RlQ29uZmlnW2tleV07XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgX3NldENvbmZpZy5jYWxsKHNlbGYsIGNvbmZpZyk7XG5cbiAgICAgIC8vZXhlY3V0ZSBjYWxsYmFja3Mgd2hlbiB3ZSBoYXZlIHJlbW90ZSBjb25maWdcbiAgICAgIC8vbm90ZSB0aGF0IHJlbW90ZSBjb25pZmcgaXMgbWVyZ2VkIHdpdGggaW5zdGFuY2UgY29uZmlnXG4gICAgICBmb3IodmFyIGkgPSAwLCBuID0gc2VsZi5yZW1vdGVDb25maWdVcGRhdGVDYWxsYmFja3MubGVuZ3RoOyBpIDwgbjsgaSsrKSB7XG4gICAgICAgIHZhciBmbiA9IHNlbGYucmVtb3RlQ29uZmlnVXBkYXRlQ2FsbGJhY2tzW2ldO1xuICAgICAgICBmbigpO1xuICAgICAgfVxuXG4gICAgICAvL2V4ZWN1dGUgc2FzIGNhbGxzIGRpc2FibGVkIHdoaWxlIHdhaXRpbmcgZm9yIHRoZSBjb25maWdcbiAgICAgIHNlbGYuX2Rpc2FibGVDYWxscyA9IGZhbHNlO1xuICAgICAgd2hpbGUoc2VsZi5fcGVuZGluZ0NhbGxzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgdmFyIHBlbmRpbmdDYWxsID0gc2VsZi5fcGVuZGluZ0NhbGxzLnNoaWZ0KCk7XG4gICAgICAgIHZhciBzYXNQcm9ncmFtICA9IHBlbmRpbmdDYWxsLnNhc1Byb2dyYW07XG4gICAgICAgIHZhciBjYWxsYmFjayAgICA9IHBlbmRpbmdDYWxsLmNhbGxiYWNrO1xuICAgICAgICB2YXIgcGFyYW1zICAgICAgPSBwZW5kaW5nQ2FsbC5wYXJhbXM7XG5cbiAgICAgICAgLy91cGRhdGUgcHJvZ3JhbSB3aXRoIG1ldGFkYXRhUm9vdCBpZiBpdCdzIG5vdCBzZXRcbiAgICAgICAgaWYoc2VsZi5tZXRhZGF0YVJvb3QgJiYgcGVuZGluZ0NhbGwucGFyYW1zLl9wcm9ncmFtLmluZGV4T2Yoc2VsZi5tZXRhZGF0YVJvb3QpID09PSAtMSkge1xuICAgICAgICAgIHBlbmRpbmdDYWxsLnBhcmFtcy5fcHJvZ3JhbSA9IHNlbGYubWV0YWRhdGFSb290LnJlcGxhY2UoL1xcLz8kLywgJy8nKSArIHBlbmRpbmdDYWxsLnBhcmFtcy5fcHJvZ3JhbS5yZXBsYWNlKC9eXFwvLywgJycpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy91cGRhdGUgZGVidWcgYmVjYXVzZSBpdCBtYXkgY2hhbmdlIGluIHRoZSBtZWFudGltZVxuICAgICAgICBwYXJhbXMuX2RlYnVnID0gc2VsZi5kZWJ1ZyA/IDEzMSA6IDA7XG5cbiAgICAgICAgc2VsZi5jYWxsKHNhc1Byb2dyYW0sIG51bGwsIGNhbGxiYWNrLCBwYXJhbXMpO1xuICAgICAgfVxuICAgIH0pLmVycm9yKGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FqYXhFcnJvcicsICdSZW1vdGUgY29uZmlnIGZpbGUgY2Fubm90IGJlIGxvYWRlZC4gSHR0cCBzdGF0dXMgY29kZTogJyArIGVyci5zdGF0dXMpO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gcHJpdmF0ZSBmdW5jdGlvbiB0byBzZXQgaDU0cyBpbnN0YW5jZSBwcm9wZXJ0aWVzXG4gIGZ1bmN0aW9uIF9zZXRDb25maWcoY29uZmlnKSB7XG4gICAgaWYoIWNvbmZpZykge1xuICAgICAgdGhpcy5fYWpheC5zZXRUaW1lb3V0KHRoaXMuYWpheFRpbWVvdXQpO1xuICAgICAgcmV0dXJuO1xuICAgIH0gZWxzZSBpZih0eXBlb2YgY29uZmlnICE9PSAnb2JqZWN0Jykge1xuICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdGaXJzdCBwYXJhbWV0ZXIgc2hvdWxkIGJlIGNvbmZpZyBvYmplY3QnKTtcbiAgICB9XG5cbiAgICAvL21lcmdlIGNvbmZpZyBvYmplY3QgZnJvbSBwYXJhbWV0ZXIgd2l0aCB0aGlzXG4gICAgZm9yKHZhciBrZXkgaW4gY29uZmlnKSB7XG4gICAgICBpZihjb25maWcuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuICAgICAgICBpZigoa2V5ID09PSAndXJsJyB8fCBrZXkgPT09ICdsb2dpblVybCcpICYmIGNvbmZpZ1trZXldLmNoYXJBdCgwKSAhPT0gJy8nKSB7XG4gICAgICAgICAgY29uZmlnW2tleV0gPSAnLycgKyBjb25maWdba2V5XTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzW2tleV0gPSBjb25maWdba2V5XTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvL2lmIHNlcnZlciBpcyByZW1vdGUgdXNlIHRoZSBmdWxsIHNlcnZlciB1cmxcbiAgICAvL05PVEU6IHRoaXMgaXMgbm90IHBlcm1pdGVkIGJ5IHRoZSBzYW1lLW9yaWdpbiBwb2xpY3lcbiAgICBpZihjb25maWcuaG9zdFVybCkge1xuICAgICAgaWYoY29uZmlnLmhvc3RVcmwuY2hhckF0KGNvbmZpZy5ob3N0VXJsLmxlbmd0aCAtIDEpID09PSAnLycpIHtcbiAgICAgICAgY29uZmlnLmhvc3RVcmwgPSBjb25maWcuaG9zdFVybC5zbGljZSgwLCAtMSk7XG4gICAgICB9XG4gICAgICB0aGlzLmhvc3RVcmwgICAgICAgICAgPSBjb25maWcuaG9zdFVybDtcbiAgICAgIHRoaXMudXJsICAgICAgICAgICAgICA9IGNvbmZpZy5ob3N0VXJsICsgdGhpcy51cmw7XG4gICAgICB0aGlzLmxvZ2luVXJsICAgICAgICAgPSBjb25maWcuaG9zdFVybCArIHRoaXMubG9naW5Vcmw7XG4gICAgICB0aGlzLlJFU1RhdXRoTG9naW5VcmwgPSBjb25maWcuaG9zdFVybCArIHRoaXMuUkVTVGF1dGhMb2dpblVybDtcbiAgICB9XG5cbiAgICB0aGlzLl9hamF4LnNldFRpbWVvdXQodGhpcy5hamF4VGltZW91dCk7XG4gIH1cbn07XG5cbi8vcmVwbGFjZWQgd2l0aCBndWxwXG5oNTRzLnZlcnNpb24gPSAnX192ZXJzaW9uX18nO1xuXG5cbmg1NHMucHJvdG90eXBlID0gcmVxdWlyZSgnLi9tZXRob2RzJyk7XG5cbmg1NHMuVGFibGVzID0gcmVxdWlyZSgnLi90YWJsZXMnKTtcbmg1NHMuRmlsZXMgPSByZXF1aXJlKCcuL2ZpbGVzJyk7XG5oNTRzLlNhc0RhdGEgPSByZXF1aXJlKCcuL3Nhc0RhdGEuanMnKTtcblxuaDU0cy5mcm9tU2FzRGF0ZVRpbWUgPSByZXF1aXJlKCcuL21ldGhvZHMvdXRpbHMuanMnKS5mcm9tU2FzRGF0ZVRpbWU7XG5oNTRzLnRvU2FzRGF0ZVRpbWUgPSByZXF1aXJlKCcuL3RhYmxlcy91dGlscy5qcycpLnRvU2FzRGF0ZVRpbWU7XG5cbi8vc2VsZiBpbnZva2VkIGZ1bmN0aW9uIG1vZHVsZVxucmVxdWlyZSgnLi9pZV9wb2x5ZmlsbHMuanMnKTsiLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xuICBpZiAoIU9iamVjdC5jcmVhdGUpIHtcbiAgICBPYmplY3QuY3JlYXRlID0gZnVuY3Rpb24ocHJvdG8sIHByb3BzKSB7XG4gICAgICBpZiAodHlwZW9mIHByb3BzICE9PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgICAgIHRocm93IFwiVGhlIG11bHRpcGxlLWFyZ3VtZW50IHZlcnNpb24gb2YgT2JqZWN0LmNyZWF0ZSBpcyBub3QgcHJvdmlkZWQgYnkgdGhpcyBicm93c2VyIGFuZCBjYW5ub3QgYmUgc2hpbW1lZC5cIjtcbiAgICAgIH1cbiAgICAgIGZ1bmN0aW9uIGN0b3IoKSB7IH1cbiAgICAgIGN0b3IucHJvdG90eXBlID0gcHJvdG87XG4gICAgICByZXR1cm4gbmV3IGN0b3IoKTtcbiAgICB9O1xuICB9XG5cblxuICAvLyBGcm9tIGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0phdmFTY3JpcHQvUmVmZXJlbmNlL0dsb2JhbF9PYmplY3RzL09iamVjdC9rZXlzXG4gIGlmICghT2JqZWN0LmtleXMpIHtcbiAgICBPYmplY3Qua2V5cyA9IChmdW5jdGlvbiAoKSB7XG4gICAgICAndXNlIHN0cmljdCc7XG4gICAgICB2YXIgaGFzT3duUHJvcGVydHkgPSBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LFxuICAgICAgICAgIGhhc0RvbnRFbnVtQnVnID0gISh7dG9TdHJpbmc6IG51bGx9KS5wcm9wZXJ0eUlzRW51bWVyYWJsZSgndG9TdHJpbmcnKSxcbiAgICAgICAgICBkb250RW51bXMgPSBbXG4gICAgICAgICAgICAndG9TdHJpbmcnLFxuICAgICAgICAgICAgJ3RvTG9jYWxlU3RyaW5nJyxcbiAgICAgICAgICAgICd2YWx1ZU9mJyxcbiAgICAgICAgICAgICdoYXNPd25Qcm9wZXJ0eScsXG4gICAgICAgICAgICAnaXNQcm90b3R5cGVPZicsXG4gICAgICAgICAgICAncHJvcGVydHlJc0VudW1lcmFibGUnLFxuICAgICAgICAgICAgJ2NvbnN0cnVjdG9yJ1xuICAgICAgICAgIF0sXG4gICAgICAgICAgZG9udEVudW1zTGVuZ3RoID0gZG9udEVudW1zLmxlbmd0aDtcblxuICAgICAgcmV0dXJuIGZ1bmN0aW9uIChvYmopIHtcbiAgICAgICAgaWYgKHR5cGVvZiBvYmogIT09ICdvYmplY3QnICYmICh0eXBlb2Ygb2JqICE9PSAnZnVuY3Rpb24nIHx8IG9iaiA9PT0gbnVsbCkpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdPYmplY3Qua2V5cyBjYWxsZWQgb24gbm9uLW9iamVjdCcpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHJlc3VsdCA9IFtdLCBwcm9wLCBpO1xuXG4gICAgICAgIGZvciAocHJvcCBpbiBvYmopIHtcbiAgICAgICAgICBpZiAoaGFzT3duUHJvcGVydHkuY2FsbChvYmosIHByb3ApKSB7XG4gICAgICAgICAgICByZXN1bHQucHVzaChwcm9wKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoaGFzRG9udEVudW1CdWcpIHtcbiAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgZG9udEVudW1zTGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGlmIChoYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwgZG9udEVudW1zW2ldKSkge1xuICAgICAgICAgICAgICByZXN1bHQucHVzaChkb250RW51bXNbaV0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgfTtcbiAgICB9KCkpO1xuICB9XG5cbiAgLy8gRnJvbSBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9KYXZhU2NyaXB0L1JlZmVyZW5jZS9HbG9iYWxfT2JqZWN0cy9BcnJheS9sYXN0SW5kZXhPZlxuICBpZiAoIUFycmF5LnByb3RvdHlwZS5sYXN0SW5kZXhPZikge1xuICAgIEFycmF5LnByb3RvdHlwZS5sYXN0SW5kZXhPZiA9IGZ1bmN0aW9uKHNlYXJjaEVsZW1lbnQgLyosIGZyb21JbmRleCovKSB7XG4gICAgICAndXNlIHN0cmljdCc7XG5cbiAgICAgIGlmICh0aGlzID09PSB2b2lkIDAgfHwgdGhpcyA9PT0gbnVsbCkge1xuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCk7XG4gICAgICB9XG5cbiAgICAgIHZhciBuLCBrLFxuICAgICAgICB0ID0gT2JqZWN0KHRoaXMpLFxuICAgICAgICBsZW4gPSB0Lmxlbmd0aCA+Pj4gMDtcbiAgICAgIGlmIChsZW4gPT09IDApIHtcbiAgICAgICAgcmV0dXJuIC0xO1xuICAgICAgfVxuXG4gICAgICBuID0gbGVuIC0gMTtcbiAgICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID4gMSkge1xuICAgICAgICBuID0gTnVtYmVyKGFyZ3VtZW50c1sxXSk7XG4gICAgICAgIGlmIChuICE9IG4pIHtcbiAgICAgICAgICBuID0gMDtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChuICE9PSAwICYmIG4gIT0gKDEgLyAwKSAmJiBuICE9IC0oMSAvIDApKSB7XG4gICAgICAgICAgbiA9IChuID4gMCB8fCAtMSkgKiBNYXRoLmZsb29yKE1hdGguYWJzKG4pKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBmb3IgKGsgPSBuID49IDAgPyBNYXRoLm1pbihuLCBsZW4gLSAxKSA6IGxlbiAtIE1hdGguYWJzKG4pOyBrID49IDA7IGstLSkge1xuICAgICAgICBpZiAoayBpbiB0ICYmIHRba10gPT09IHNlYXJjaEVsZW1lbnQpIHtcbiAgICAgICAgICByZXR1cm4gaztcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIC0xO1xuICAgIH07XG4gIH1cbn0oKTtcbiIsInZhciBsb2dzID0ge1xuICBhcHBsaWNhdGlvbkxvZ3M6IFtdLFxuICBkZWJ1Z0RhdGE6IFtdLFxuICBzYXNFcnJvcnM6IFtdLFxuICBmYWlsZWRSZXF1ZXN0czogW11cbn07XG5cbnZhciBsaW1pdHMgPSB7XG4gIGFwcGxpY2F0aW9uTG9nczogMTAwLFxuICBkZWJ1Z0RhdGE6IDIwLFxuICBmYWlsZWRSZXF1ZXN0czogMjAsXG4gIHNhc0Vycm9yczogMTAwXG59O1xuXG5tb2R1bGUuZXhwb3J0cy5nZXQgPSB7XG4gIGdldFNhc0Vycm9yczogZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIGxvZ3Muc2FzRXJyb3JzO1xuICB9LFxuICBnZXRBcHBsaWNhdGlvbkxvZ3M6IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiBsb2dzLmFwcGxpY2F0aW9uTG9ncztcbiAgfSxcbiAgZ2V0RGVidWdEYXRhOiBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gbG9ncy5kZWJ1Z0RhdGE7XG4gIH0sXG4gIGdldEZhaWxlZFJlcXVlc3RzOiBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gbG9ncy5mYWlsZWRSZXF1ZXN0cztcbiAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMuY2xlYXIgPSB7XG4gIGNsZWFyQXBwbGljYXRpb25Mb2dzOiBmdW5jdGlvbigpIHtcbiAgICBsb2dzLmFwcGxpY2F0aW9uTG9ncy5zcGxpY2UoMCwgbG9ncy5hcHBsaWNhdGlvbkxvZ3MubGVuZ3RoKTtcbiAgfSxcbiAgY2xlYXJEZWJ1Z0RhdGE6IGZ1bmN0aW9uKCkge1xuICAgIGxvZ3MuZGVidWdEYXRhLnNwbGljZSgwLCBsb2dzLmRlYnVnRGF0YS5sZW5ndGgpO1xuICB9LFxuICBjbGVhclNhc0Vycm9yczogZnVuY3Rpb24oKSB7XG4gICAgbG9ncy5zYXNFcnJvcnMuc3BsaWNlKDAsIGxvZ3Muc2FzRXJyb3JzLmxlbmd0aCk7XG4gIH0sXG4gIGNsZWFyRmFpbGVkUmVxdWVzdHM6IGZ1bmN0aW9uKCkge1xuICAgIGxvZ3MuZmFpbGVkUmVxdWVzdHMuc3BsaWNlKDAsIGxvZ3MuZmFpbGVkUmVxdWVzdHMubGVuZ3RoKTtcbiAgfSxcbiAgY2xlYXJBbGxMb2dzOiBmdW5jdGlvbigpIHtcbiAgICB0aGlzLmNsZWFyQXBwbGljYXRpb25Mb2dzKCk7XG4gICAgdGhpcy5jbGVhckRlYnVnRGF0YSgpO1xuICAgIHRoaXMuY2xlYXJTYXNFcnJvcnMoKTtcbiAgICB0aGlzLmNsZWFyRmFpbGVkUmVxdWVzdHMoKTtcbiAgfVxufTtcblxuLypcbiogQWRkcyBhcHBsaWNhdGlvbiBsb2dzIHRvIGFuIGFycmF5IG9mIGxvZ3NcbipcbiogQHBhcmFtIHtzdHJpbmd9IHJlcyAtIHNlcnZlciByZXNwb25zZVxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLmFkZEFwcGxpY2F0aW9uTG9nID0gZnVuY3Rpb24obWVzc2FnZSwgc2FzUHJvZ3JhbSkge1xuICBpZihtZXNzYWdlID09PSAnYmxhbmsnKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHZhciBsb2cgPSB7XG4gICAgbWVzc2FnZTogICAgbWVzc2FnZSxcbiAgICB0aW1lOiAgICAgICBuZXcgRGF0ZSgpLFxuICAgIHNhc1Byb2dyYW06IHNhc1Byb2dyYW1cbiAgfTtcbiAgbG9ncy5hcHBsaWNhdGlvbkxvZ3MucHVzaChsb2cpO1xuXG4gIGlmKGxvZ3MuYXBwbGljYXRpb25Mb2dzLmxlbmd0aCA+IGxpbWl0cy5hcHBsaWNhdGlvbkxvZ3MpIHtcbiAgICBsb2dzLmFwcGxpY2F0aW9uTG9ncy5zaGlmdCgpO1xuICB9XG59O1xuXG4vKlxuKiBBZGRzIGRlYnVnIGRhdGEgdG8gYW4gYXJyYXkgb2YgbG9nc1xuKlxuKiBAcGFyYW0ge3N0cmluZ30gcmVzIC0gc2VydmVyIHJlc3BvbnNlXG4qXG4qL1xubW9kdWxlLmV4cG9ydHMuYWRkRGVidWdEYXRhID0gZnVuY3Rpb24oaHRtbERhdGEsIGRlYnVnVGV4dCwgc2FzUHJvZ3JhbSwgcGFyYW1zKSB7XG4gIGxvZ3MuZGVidWdEYXRhLnB1c2goe1xuICAgIGRlYnVnSHRtbDogIGh0bWxEYXRhLFxuICAgIGRlYnVnVGV4dDogIGRlYnVnVGV4dCxcbiAgICBzYXNQcm9ncmFtOiBzYXNQcm9ncmFtLFxuICAgIHBhcmFtczogICAgIHBhcmFtcyxcbiAgICB0aW1lOiAgICAgICBuZXcgRGF0ZSgpXG4gIH0pO1xuXG4gIGlmKGxvZ3MuZGVidWdEYXRhLmxlbmd0aCA+IGxpbWl0cy5kZWJ1Z0RhdGEpIHtcbiAgICBsb2dzLmRlYnVnRGF0YS5zaGlmdCgpO1xuICB9XG59O1xuXG4vKlxuKiBBZGRzIGZhaWxlZCByZXF1ZXN0cyB0byBhbiBhcnJheSBvZiBsb2dzXG4qXG4qIEBwYXJhbSB7c3RyaW5nfSByZXMgLSBzZXJ2ZXIgcmVzcG9uc2VcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5hZGRGYWlsZWRSZXF1ZXN0ID0gZnVuY3Rpb24ocmVzcG9uc2VUZXh0LCBkZWJ1Z1RleHQsIHNhc1Byb2dyYW0pIHtcbiAgbG9ncy5mYWlsZWRSZXF1ZXN0cy5wdXNoKHtcbiAgICByZXNwb25zZUh0bWw6IHJlc3BvbnNlVGV4dCxcbiAgICByZXNwb25zZVRleHQ6IGRlYnVnVGV4dCxcbiAgICBzYXNQcm9ncmFtOiAgIHNhc1Byb2dyYW0sXG4gICAgdGltZTogICAgICAgICBuZXcgRGF0ZSgpXG4gIH0pO1xuXG4gIC8vbWF4IDIwIGZhaWxlZCByZXF1ZXN0c1xuICBpZihsb2dzLmZhaWxlZFJlcXVlc3RzLmxlbmd0aCA+IGxpbWl0cy5mYWlsZWRSZXF1ZXN0cykge1xuICAgIGxvZ3MuZmFpbGVkUmVxdWVzdHMuc2hpZnQoKTtcbiAgfVxufTtcblxuLypcbiogQWRkcyBTQVMgZXJyb3JzIHRvIGFuIGFycmF5IG9mIGxvZ3NcbipcbiogQHBhcmFtIHtzdHJpbmd9IHJlcyAtIHNlcnZlciByZXNwb25zZVxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLmFkZFNhc0Vycm9ycyA9IGZ1bmN0aW9uKGVycm9ycykge1xuICBsb2dzLnNhc0Vycm9ycyA9IGxvZ3Muc2FzRXJyb3JzLmNvbmNhdChlcnJvcnMpO1xuXG4gIHdoaWxlKGxvZ3Muc2FzRXJyb3JzLmxlbmd0aCA+IGxpbWl0cy5zYXNFcnJvcnMpIHtcbiAgICBsb2dzLnNhc0Vycm9ycy5zaGlmdCgpO1xuICB9XG59O1xuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbigpIHtcbiAgdmFyIHRpbWVvdXQgPSAzMDAwMDtcbiAgdmFyIHRpbWVvdXRIYW5kbGU7XG5cbiAgdmFyIHhociA9IGZ1bmN0aW9uKHR5cGUsIHVybCwgZGF0YSwgbXVsdGlwYXJ0Rm9ybURhdGEpIHtcbiAgICB2YXIgbWV0aG9kcyA9IHtcbiAgICAgIHN1Y2Nlc3M6IGZ1bmN0aW9uKCkge30sXG4gICAgICBlcnJvcjogICBmdW5jdGlvbigpIHt9XG4gICAgfTtcbiAgICB2YXIgWEhSICAgICA9IFhNTEh0dHBSZXF1ZXN0IHx8IEFjdGl2ZVhPYmplY3Q7XG4gICAgdmFyIHJlcXVlc3QgPSBuZXcgWEhSKCdNU1hNTDIuWE1MSFRUUC4zLjAnKTtcblxuICAgIHJlcXVlc3Qub3Blbih0eXBlLCB1cmwsIHRydWUpO1xuXG4gICAgLy9tdWx0aXBhcnQvZm9ybS1kYXRhIGlzIHNldCBhdXRvbWF0aWNhbGx5IHNvIG5vIG5lZWQgZm9yIGVsc2UgYmxvY2tcbiAgICBpZighbXVsdGlwYXJ0Rm9ybURhdGEpIHtcbiAgICAgIHJlcXVlc3Quc2V0UmVxdWVzdEhlYWRlcignQ29udGVudC1UeXBlJywgJ2FwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZCcpO1xuICAgIH1cbiAgICByZXF1ZXN0Lm9ucmVhZHlzdGF0ZWNoYW5nZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIGlmIChyZXF1ZXN0LnJlYWR5U3RhdGUgPT09IDQpIHtcbiAgICAgICAgY2xlYXJUaW1lb3V0KHRpbWVvdXRIYW5kbGUpO1xuICAgICAgICBpZiAocmVxdWVzdC5zdGF0dXMgPj0gMjAwICYmIHJlcXVlc3Quc3RhdHVzIDwgMzAwKSB7XG4gICAgICAgICAgbWV0aG9kcy5zdWNjZXNzLmNhbGwobWV0aG9kcywgcmVxdWVzdCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgbWV0aG9kcy5lcnJvci5jYWxsKG1ldGhvZHMsIHJlcXVlc3QpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfTtcblxuICAgIGlmKHRpbWVvdXQgPiAwKSB7XG4gICAgICB0aW1lb3V0SGFuZGxlID0gc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgICAgcmVxdWVzdC5hYm9ydCgpO1xuICAgICAgfSwgdGltZW91dCk7XG4gICAgfVxuXG4gICAgcmVxdWVzdC5zZW5kKGRhdGEpO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHN1Y2Nlc3M6IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICBtZXRob2RzLnN1Y2Nlc3MgPSBjYWxsYmFjaztcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICB9LFxuICAgICAgZXJyb3I6IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICBtZXRob2RzLmVycm9yID0gY2FsbGJhY2s7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgfVxuICAgIH07XG4gIH07XG5cbiAgdmFyIHNlcmlhbGl6ZSA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHZhciBzdHIgPSBbXTtcbiAgICBmb3IodmFyIHAgaW4gb2JqKSB7XG4gICAgICBpZiAob2JqLmhhc093blByb3BlcnR5KHApKSB7XG4gICAgICAgIGlmKG9ialtwXSBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgICAgICAgZm9yKHZhciBpID0gMCwgbiA9IG9ialtwXS5sZW5ndGg7IGkgPCBuOyBpKyspIHtcbiAgICAgICAgICAgIHN0ci5wdXNoKGVuY29kZVVSSUNvbXBvbmVudChwKSArIFwiPVwiICsgZW5jb2RlVVJJQ29tcG9uZW50KG9ialtwXVtpXSkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBzdHIucHVzaChlbmNvZGVVUklDb21wb25lbnQocCkgKyBcIj1cIiArIGVuY29kZVVSSUNvbXBvbmVudChvYmpbcF0pKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gc3RyLmpvaW4oXCImXCIpO1xuICB9O1xuXG4gIHZhciBjcmVhdGVNdWx0aXBhcnRGb3JtRGF0YVBheWxvYWQgPSBmdW5jdGlvbihvYmopIHtcbiAgICB2YXIgZGF0YSA9IG5ldyBGb3JtRGF0YSgpO1xuICAgIGZvcih2YXIgcCBpbiBvYmopIHtcbiAgICAgIGlmKG9iai5oYXNPd25Qcm9wZXJ0eShwKSkge1xuICAgICAgICBpZihvYmpbcF0gaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgICAgIGZvcih2YXIgaSA9IDAsIG4gPSBvYmpbcF0ubGVuZ3RoOyBpIDwgbjsgaSsrKSB7XG4gICAgICAgICAgICBkYXRhLmFwcGVuZChwLCBvYmpbcF1baV0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBkYXRhLmFwcGVuZChwLCBvYmpbcF0pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBkYXRhO1xuICB9O1xuXG4gIHJldHVybiB7XG4gICAgZ2V0OiBmdW5jdGlvbih1cmwsIGRhdGEpIHtcbiAgICAgIHZhciBkYXRhU3RyO1xuICAgICAgaWYodHlwZW9mIGRhdGEgPT09ICdvYmplY3QnKSB7XG4gICAgICAgIGRhdGFTdHIgPSBzZXJpYWxpemUoZGF0YSk7XG4gICAgICB9XG4gICAgICB2YXIgdXJsV2l0aFBhcmFtcyA9IGRhdGFTdHIgPyAodXJsICsgJz8nICsgZGF0YVN0cikgOiB1cmw7XG4gICAgICByZXR1cm4geGhyKCdHRVQnLCB1cmxXaXRoUGFyYW1zKTtcbiAgICB9LFxuICAgIHBvc3Q6IGZ1bmN0aW9uKHVybCwgZGF0YSwgbXVsdGlwYXJ0Rm9ybURhdGEpIHtcbiAgICAgIHZhciBwYXlsb2FkO1xuICAgICAgaWYodHlwZW9mIGRhdGEgPT09ICdvYmplY3QnKSB7XG4gICAgICAgIGlmKG11bHRpcGFydEZvcm1EYXRhKSB7XG4gICAgICAgICAgcGF5bG9hZCA9IGNyZWF0ZU11bHRpcGFydEZvcm1EYXRhUGF5bG9hZChkYXRhKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBwYXlsb2FkID0gc2VyaWFsaXplKGRhdGEpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4geGhyKCdQT1NUJywgdXJsLCBwYXlsb2FkLCBtdWx0aXBhcnRGb3JtRGF0YSk7XG4gICAgfSxcbiAgICBzZXRUaW1lb3V0OiBmdW5jdGlvbih0KSB7XG4gICAgICB0aW1lb3V0ID0gdDtcbiAgICB9XG4gIH07XG59O1xuIiwidmFyIGg1NHNFcnJvciA9IHJlcXVpcmUoJy4uL2Vycm9yLmpzJyk7XG52YXIgbG9ncyA9IHJlcXVpcmUoJy4uL2xvZ3MuanMnKTtcbnZhciBUYWJsZXMgPSByZXF1aXJlKCcuLi90YWJsZXMnKTtcbnZhciBTYXNEYXRhID0gcmVxdWlyZSgnLi4vc2FzRGF0YS5qcycpO1xudmFyIEZpbGVzID0gcmVxdWlyZSgnLi4vZmlsZXMnKTtcblxuLypcbiogQ2FsbCBTYXMgcHJvZ3JhbVxuKlxuKiBAcGFyYW0ge3N0cmluZ30gc2FzUHJvZ3JhbSAtIFBhdGggb2YgdGhlIHNhcyBwcm9ncmFtXG4qIEBwYXJhbSB7ZnVuY3Rpb259IGNhbGxiYWNrIC0gQ2FsbGJhY2sgZnVuY3Rpb24gY2FsbGVkIHdoZW4gYWpheCBjYWxsIGlzIGZpbmlzaGVkXG4qXG4qL1xubW9kdWxlLmV4cG9ydHMuY2FsbCA9IGZ1bmN0aW9uKHNhc1Byb2dyYW0sIGRhdGFPYmosIGNhbGxiYWNrLCBwYXJhbXMpIHtcbiAgdmFyIHNlbGYgICAgICAgID0gdGhpcztcbiAgdmFyIHJldHJ5Q291bnQgID0gMDtcbiAgdmFyIGRiZyAgICAgICAgID0gdGhpcy5kZWJ1ZztcblxuICBpZiAoIWNhbGxiYWNrIHx8IHR5cGVvZiBjYWxsYmFjayAhPT0gJ2Z1bmN0aW9uJyl7XG4gICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdZb3UgbXVzdCBwcm92aWRlIGNhbGxiYWNrJyk7XG4gIH1cbiAgaWYoIXNhc1Byb2dyYW0pIHtcbiAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1lvdSBtdXN0IHByb3ZpZGUgU2FzIHByb2dyYW0gZmlsZSBwYXRoJyk7XG4gIH1cbiAgaWYodHlwZW9mIHNhc1Byb2dyYW0gIT09ICdzdHJpbmcnKSB7XG4gICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdGaXJzdCBwYXJhbWV0ZXIgc2hvdWxkIGJlIHN0cmluZycpO1xuICB9XG4gIGlmKHRoaXMudXNlTXVsdGlwYXJ0Rm9ybURhdGEgPT09IGZhbHNlICYmICEoZGF0YU9iaiBpbnN0YW5jZW9mIFRhYmxlcykpIHtcbiAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ0Nhbm5vdCBzZW5kIGZpbGVzIHVzaW5nIGFwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZC4gUGxlYXNlIHVzZSBUYWJsZXMgb3IgZGVmYXVsdCB2YWx1ZSBmb3IgdXNlTXVsdGlwYXJ0Rm9ybURhdGEnKTtcbiAgfVxuXG4gIGlmKCFwYXJhbXMpIHtcbiAgICBwYXJhbXMgPSB7XG4gICAgICBfcHJvZ3JhbTogdGhpcy5fdXRpbHMuZ2V0RnVsbFByb2dyYW1QYXRoKHRoaXMubWV0YWRhdGFSb290LCBzYXNQcm9ncmFtKSxcbiAgICAgIF9kZWJ1ZzogICB0aGlzLmRlYnVnID8gMTMxIDogMCxcbiAgICAgIF9zZXJ2aWNlOiAnZGVmYXVsdCcsXG4gICAgfTtcbiAgfVxuXG4gIGlmKGRhdGFPYmopIHtcbiAgICB2YXIga2V5LCBkYXRhUHJvdmlkZXI7XG4gICAgaWYoZGF0YU9iaiBpbnN0YW5jZW9mIFRhYmxlcykge1xuICAgICAgZGF0YVByb3ZpZGVyID0gZGF0YU9iai5fdGFibGVzO1xuICAgIH0gZWxzZSBpZihkYXRhT2JqIGluc3RhbmNlb2YgRmlsZXMgfHwgZGF0YU9iaiBpbnN0YW5jZW9mIFNhc0RhdGEpe1xuICAgICAgZGF0YVByb3ZpZGVyID0gZGF0YU9iai5fZmlsZXM7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnV3JvbmcgdHlwZSBvZiB0YWJsZXMgb2JqZWN0Jyk7XG4gICAgfVxuICAgIGZvcihrZXkgaW4gZGF0YVByb3ZpZGVyKSB7XG4gICAgICBpZihkYXRhUHJvdmlkZXIuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuICAgICAgICBwYXJhbXNba2V5XSA9IGRhdGFQcm92aWRlcltrZXldO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGlmKHRoaXMuX2Rpc2FibGVDYWxscykge1xuICAgIHRoaXMuX3BlbmRpbmdDYWxscy5wdXNoKHtcbiAgICAgIHNhc1Byb2dyYW06IHNhc1Byb2dyYW0sXG4gICAgICBjYWxsYmFjazogICBjYWxsYmFjayxcbiAgICAgIHBhcmFtczogICAgIHBhcmFtc1xuICAgIH0pO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHRoaXMuX2FqYXgucG9zdCh0aGlzLnVybCwgcGFyYW1zLCB0aGlzLnVzZU11bHRpcGFydEZvcm1EYXRhKS5zdWNjZXNzKGZ1bmN0aW9uKHJlcykge1xuICAgIGlmKHNlbGYuX3V0aWxzLm5lZWRUb0xvZ2luLmNhbGwoc2VsZiwgcmVzKSkge1xuICAgICAgLy9yZW1lbWJlciB0aGUgY2FsbCBmb3IgbGF0dGVyIHVzZVxuICAgICAgc2VsZi5fcGVuZGluZ0NhbGxzLnB1c2goe1xuICAgICAgICBzYXNQcm9ncmFtOiBzYXNQcm9ncmFtLFxuICAgICAgICBjYWxsYmFjazogICBjYWxsYmFjayxcbiAgICAgICAgcGFyYW1zOiAgICAgcGFyYW1zXG4gICAgICB9KTtcblxuICAgICAgLy90aGVyZSdzIG5vIG5lZWQgdG8gY29udGludWUgaWYgcHJldmlvdXMgY2FsbCByZXR1cm5lZCBsb2dpbiBlcnJvclxuICAgICAgaWYoc2VsZi5fZGlzYWJsZUNhbGxzKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHNlbGYuX2Rpc2FibGVDYWxscyA9IHRydWU7XG4gICAgICB9XG5cbiAgICAgIGNhbGxiYWNrKG5ldyBoNTRzRXJyb3IoJ25vdExvZ2dlZGluRXJyb3InLCAnWW91IGFyZSBub3QgbG9nZ2VkIGluJykpO1xuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgcmVzT2JqLCB1bmVzY2FwZWRSZXNPYmosIGVycjtcbiAgICAgIHZhciBkb25lID0gZmFsc2U7XG5cbiAgICAgIGlmKCFkYmcpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICByZXNPYmogPSBzZWxmLl91dGlscy5wYXJzZVJlcyhyZXMucmVzcG9uc2VUZXh0LCBzYXNQcm9ncmFtLCBwYXJhbXMpO1xuICAgICAgICAgIGxvZ3MuYWRkQXBwbGljYXRpb25Mb2cocmVzT2JqLmxvZ21lc3NhZ2UsIHNhc1Byb2dyYW0pO1xuXG4gICAgICAgICAgaWYoZGF0YU9iaiBpbnN0YW5jZW9mIFRhYmxlcykge1xuICAgICAgICAgICAgdW5lc2NhcGVkUmVzT2JqID0gc2VsZi5fdXRpbHMudW5lc2NhcGVWYWx1ZXMocmVzT2JqKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdW5lc2NhcGVkUmVzT2JqID0gcmVzT2JqO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmKHJlc09iai5zdGF0dXMgIT09ICdzdWNjZXNzJykge1xuICAgICAgICAgICAgZXJyID0gbmV3IGg1NHNFcnJvcigncHJvZ3JhbUVycm9yJywgcmVzT2JqLmVycm9ybWVzc2FnZSwgcmVzT2JqLnN0YXR1cyk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgZG9uZSA9IHRydWU7XG4gICAgICAgIH0gY2F0Y2goZSkge1xuICAgICAgICAgIGlmKGUgaW5zdGFuY2VvZiBTeW50YXhFcnJvcikge1xuICAgICAgICAgICAgaWYocmV0cnlDb3VudCA8IHNlbGYubWF4WGhyUmV0cmllcykge1xuICAgICAgICAgICAgICBkb25lID0gZmFsc2U7XG4gICAgICAgICAgICAgIHNlbGYuX2FqYXgucG9zdChzZWxmLnVybCwgcGFyYW1zLCBzZWxmLnVzZU11bHRpcGFydEZvcm1EYXRhKS5zdWNjZXNzKHRoaXMuc3VjY2VzcykuZXJyb3IodGhpcy5lcnJvcik7XG4gICAgICAgICAgICAgIHJldHJ5Q291bnQrKztcbiAgICAgICAgICAgICAgbG9ncy5hZGRBcHBsaWNhdGlvbkxvZyhcIlJldHJ5aW5nICNcIiArIHJldHJ5Q291bnQsIHNhc1Byb2dyYW0pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgc2VsZi5fdXRpbHMucGFyc2VFcnJvclJlc3BvbnNlKHJlcy5yZXNwb25zZVRleHQsIHNhc1Byb2dyYW0pO1xuICAgICAgICAgICAgICBzZWxmLl91dGlscy5hZGRGYWlsZWRSZXNwb25zZShyZXMucmVzcG9uc2VUZXh0LCBzYXNQcm9ncmFtKTtcbiAgICAgICAgICAgICAgZXJyID0gbmV3IGg1NHNFcnJvcigncGFyc2VFcnJvcicsICdVbmFibGUgdG8gcGFyc2UgcmVzcG9uc2UganNvbicpO1xuICAgICAgICAgICAgICBkb25lID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2UgaWYoZSBpbnN0YW5jZW9mIGg1NHNFcnJvcikge1xuICAgICAgICAgICAgc2VsZi5fdXRpbHMucGFyc2VFcnJvclJlc3BvbnNlKHJlcy5yZXNwb25zZVRleHQsIHNhc1Byb2dyYW0pO1xuICAgICAgICAgICAgc2VsZi5fdXRpbHMuYWRkRmFpbGVkUmVzcG9uc2UocmVzLnJlc3BvbnNlVGV4dCwgc2FzUHJvZ3JhbSk7XG4gICAgICAgICAgICBlcnIgPSBlO1xuICAgICAgICAgICAgZG9uZSA9IHRydWU7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHNlbGYuX3V0aWxzLnBhcnNlRXJyb3JSZXNwb25zZShyZXMucmVzcG9uc2VUZXh0LCBzYXNQcm9ncmFtKTtcbiAgICAgICAgICAgIHNlbGYuX3V0aWxzLmFkZEZhaWxlZFJlc3BvbnNlKHJlcy5yZXNwb25zZVRleHQsIHNhc1Byb2dyYW0pO1xuICAgICAgICAgICAgZXJyID0gbmV3IGg1NHNFcnJvcigndW5rbm93bkVycm9yJywgZS5tZXNzYWdlKTtcbiAgICAgICAgICAgIGVyci5zdGFjayA9IGUuc3RhY2s7XG4gICAgICAgICAgICBkb25lID0gdHJ1ZTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgaWYoZG9uZSkge1xuICAgICAgICAgICAgY2FsbGJhY2soZXJyLCB1bmVzY2FwZWRSZXNPYmopO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICByZXNPYmogPSBzZWxmLl91dGlscy5wYXJzZURlYnVnUmVzKHJlcy5yZXNwb25zZVRleHQsIHNhc1Byb2dyYW0sIHBhcmFtcyk7XG4gICAgICAgICAgbG9ncy5hZGRBcHBsaWNhdGlvbkxvZyhyZXNPYmoubG9nbWVzc2FnZSwgc2FzUHJvZ3JhbSk7XG5cbiAgICAgICAgICBpZihkYXRhT2JqIGluc3RhbmNlb2YgVGFibGVzKSB7XG4gICAgICAgICAgICB1bmVzY2FwZWRSZXNPYmogPSBzZWxmLl91dGlscy51bmVzY2FwZVZhbHVlcyhyZXNPYmopO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB1bmVzY2FwZWRSZXNPYmogPSByZXNPYmo7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYocmVzT2JqLnN0YXR1cyAhPT0gJ3N1Y2Nlc3MnKSB7XG4gICAgICAgICAgICBlcnIgPSBuZXcgaDU0c0Vycm9yKCdwcm9ncmFtRXJyb3InLCByZXNPYmouZXJyb3JtZXNzYWdlLCByZXNPYmouc3RhdHVzKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBkb25lID0gdHJ1ZTtcbiAgICAgICAgfSBjYXRjaChlKSB7XG4gICAgICAgICAgaWYoZSBpbnN0YW5jZW9mIFN5bnRheEVycm9yKSB7XG4gICAgICAgICAgICBlcnIgPSBuZXcgaDU0c0Vycm9yKCdwYXJzZUVycm9yJywgZS5tZXNzYWdlKTtcbiAgICAgICAgICAgIGRvbmUgPSB0cnVlO1xuICAgICAgICAgIH0gZWxzZSBpZihlIGluc3RhbmNlb2YgaDU0c0Vycm9yKSB7XG4gICAgICAgICAgICBpZihlLnR5cGUgPT09ICdwYXJzZUVycm9yJyAmJiByZXRyeUNvdW50IDwgMSkge1xuICAgICAgICAgICAgICBkb25lID0gZmFsc2U7XG4gICAgICAgICAgICAgIHNlbGYuX2FqYXgucG9zdChzZWxmLnVybCwgcGFyYW1zLCBzZWxmLnVzZU11bHRpcGFydEZvcm1EYXRhKS5zdWNjZXNzKHRoaXMuc3VjY2VzcykuZXJyb3IodGhpcy5lcnJvcik7XG4gICAgICAgICAgICAgIHJldHJ5Q291bnQrKztcbiAgICAgICAgICAgICAgbG9ncy5hZGRBcHBsaWNhdGlvbkxvZyhcIlJldHJ5aW5nICNcIiArIHJldHJ5Q291bnQsIHNhc1Byb2dyYW0pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgaWYoZSBpbnN0YW5jZW9mIGg1NHNFcnJvcikge1xuICAgICAgICAgICAgICAgIGVyciA9IGU7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZXJyID0gbmV3IGg1NHNFcnJvcigncGFyc2VFcnJvcicsICdVbmFibGUgdG8gcGFyc2UgcmVzcG9uc2UganNvbicpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGRvbmUgPSB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBlcnIgPSBuZXcgaDU0c0Vycm9yKCd1bmtub3duRXJyb3InLCBlLm1lc3NhZ2UpO1xuICAgICAgICAgICAgZXJyLnN0YWNrID0gZS5zdGFjaztcbiAgICAgICAgICAgIGRvbmUgPSB0cnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICBpZihkb25lKSB7XG4gICAgICAgICAgICBjYWxsYmFjayhlcnIsIHVuZXNjYXBlZFJlc09iaik7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9KS5lcnJvcihmdW5jdGlvbihyZXMpIHtcbiAgICBpZihyZXMuc3RhdHVzID09PSA0MDEpIHtcbiAgICAgIGNhbGxiYWNrKG5ldyBoNTRzRXJyb3IoJ25vdExvZ2dlZGluRXJyb3InLCAnWW91IGFyZSBub3QgbG9nZ2VkIGluJykpO1xuICAgIH0gZWxzZSB7XG4gICAgICBsb2dzLmFkZEFwcGxpY2F0aW9uTG9nKCdSZXF1ZXN0IGZhaWxlZCB3aXRoIHN0YXR1czogJyArIHJlcy5zdGF0dXMsIHNhc1Byb2dyYW0pO1xuICAgICAgY2FsbGJhY2sobmV3IGg1NHNFcnJvcignaHR0cEVycm9yJywgcmVzLnN0YXR1c1RleHQpKTtcbiAgICB9XG4gIH0pO1xufTtcblxuLypcbiogTG9naW4gbWV0aG9kXG4qXG4qIEBwYXJhbSB7c3RyaW5nfSB1c2VyIC0gTG9naW4gdXNlcm5hbWVcbiogQHBhcmFtIHtzdHJpbmd9IHBhc3MgLSBMb2dpbiBwYXNzd29yZFxuKiBAcGFyYW0ge2Z1bmN0aW9ufSBjYWxsYmFjayAtIENhbGxiYWNrIGZ1bmN0aW9uIGNhbGxlZCB3aGVuIGFqYXggY2FsbCBpcyBmaW5pc2hlZFxuKlxuKiBPUlxuKlxuKiBAcGFyYW0ge2Z1bmN0aW9ufSBjYWxsYmFjayAtIENhbGxiYWNrIGZ1bmN0aW9uIGNhbGxlZCB3aGVuIGFqYXggY2FsbCBpcyBmaW5pc2hlZFxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLmxvZ2luID0gZnVuY3Rpb24odXNlciwgcGFzcywgY2FsbGJhY2spIHtcbiAgaWYoIXVzZXIgfHwgIXBhc3MpIHtcbiAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ0NyZWRlbnRpYWxzIG5vdCBzZXQnKTtcbiAgfVxuICBpZih0eXBlb2YgdXNlciAhPT0gJ3N0cmluZycgfHwgdHlwZW9mIHBhc3MgIT09ICdzdHJpbmcnKSB7XG4gICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdVc2VyIGFuZCBwYXNzIHBhcmFtZXRlcnMgbXVzdCBiZSBzdHJpbmdzJyk7XG4gIH1cbiAgLy9OT1RFOiBjYWxsYmFjayBvcHRpb25hbD9cbiAgaWYoIWNhbGxiYWNrIHx8IHR5cGVvZiBjYWxsYmFjayAhPT0gJ2Z1bmN0aW9uJykge1xuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnWW91IG11c3QgcHJvdmlkZSBjYWxsYmFjaycpO1xuICB9XG5cbiAgaWYoIXRoaXMuUkVTVGF1dGgpIHtcbiAgICBoYW5kbGVTYXNMb2dvbi5jYWxsKHRoaXMsIHVzZXIsIHBhc3MsIGNhbGxiYWNrKTtcbiAgfSBlbHNlIHtcbiAgICBoYW5kbGVSZXN0TG9nb24uY2FsbCh0aGlzLCB1c2VyLCBwYXNzLCBjYWxsYmFjayk7XG4gIH1cbn07XG5cbmZ1bmN0aW9uIGhhbmRsZVNhc0xvZ29uKHVzZXIsIHBhc3MsIGNhbGxiYWNrKSB7XG4gIHZhciBzZWxmID0gdGhpcztcblxuICB2YXIgbG9naW5QYXJhbXMgPSB7XG4gICAgX3NlcnZpY2U6ICdkZWZhdWx0JyxcbiAgICB1eDogdXNlcixcbiAgICBweDogcGFzcyxcbiAgICAvL2ZvciBTQVMgOS40LFxuICAgIHVzZXJuYW1lOiB1c2VyLFxuICAgIHBhc3N3b3JkOiBwYXNzXG4gIH07XG5cbiAgZm9yICh2YXIga2V5IGluIHRoaXMuX2FkaXRpb25hbExvZ2luUGFyYW1zKSB7XG4gICAgbG9naW5QYXJhbXNba2V5XSA9IHRoaXMuX2FkaXRpb25hbExvZ2luUGFyYW1zW2tleV07XG4gIH1cblxuICB0aGlzLl9sb2dpbkF0dGVtcHRzID0gMDtcblxuICB0aGlzLl9hamF4LnBvc3QodGhpcy5sb2dpblVybCwgbG9naW5QYXJhbXMpLnN1Y2Nlc3MoZnVuY3Rpb24ocmVzKSB7XG4gICAgaWYoKytzZWxmLl9sb2dpbkF0dGVtcHRzID09PSAzKSB7XG4gICAgICByZXR1cm4gY2FsbGJhY2soLTIpO1xuICAgIH1cblxuICAgIGlmKHNlbGYuX3V0aWxzLm5lZWRUb0xvZ2luLmNhbGwoc2VsZiwgcmVzKSkge1xuICAgICAgLy93ZSBhcmUgZ2V0dGluZyBmb3JtIGFnYWluIGFmdGVyIHJlZGlyZWN0XG4gICAgICAvL2FuZCBuZWVkIHRvIGxvZ2luIGFnYWluIHVzaW5nIHRoZSBuZXcgdXJsXG4gICAgICAvL19sb2dpbkNoYW5nZWQgaXMgc2V0IGluIG5lZWRUb0xvZ2luIGZ1bmN0aW9uXG4gICAgICAvL2J1dCBpZiBsb2dpbiB1cmwgaXMgbm90IGRpZmZlcmVudCwgd2UgYXJlIGNoZWNraW5nIGlmIHRoZXJlIGFyZSBhZGl0aW9uYWwgcGFyYW1ldGVyc1xuICAgICAgaWYoc2VsZi5fbG9naW5DaGFuZ2VkIHx8IChzZWxmLl9pc05ld0xvZ2luUGFnZSAmJiAhc2VsZi5fYWRpdGlvbmFsTG9naW5QYXJhbXMpKSB7XG4gICAgICAgIGRlbGV0ZSBzZWxmLl9sb2dpbkNoYW5nZWQ7XG5cbiAgICAgICAgdmFyIGlucHV0cyA9IHJlcy5yZXNwb25zZVRleHQubWF0Y2goLzxpbnB1dC4qXCJoaWRkZW5cIltePl0qPi9nKTtcbiAgICAgICAgaWYoaW5wdXRzKSB7XG4gICAgICAgICAgaW5wdXRzLmZvckVhY2goZnVuY3Rpb24oaW5wdXRTdHIpIHtcbiAgICAgICAgICAgIHZhciB2YWx1ZU1hdGNoID0gaW5wdXRTdHIubWF0Y2goL25hbWU9XCIoW15cIl0qKVwiXFxzdmFsdWU9XCIoW15cIl0qKS8pO1xuICAgICAgICAgICAgbG9naW5QYXJhbXNbdmFsdWVNYXRjaFsxXV0gPSB2YWx1ZU1hdGNoWzJdO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHN1Y2Nlc3MgPSB0aGlzLnN1Y2Nlc3MsIGVycm9yID0gdGhpcy5lcnJvcjtcbiAgICAgICAgc2VsZi5fYWpheC5wb3N0KHNlbGYubG9naW5VcmwsIGxvZ2luUGFyYW1zKS5zdWNjZXNzKGZ1bmN0aW9uKCkge1xuICAgICAgICAgIC8vd2UgbmVlZCB0aGlzIGdldCByZXF1ZXN0IGJlY2F1c2Ugb2YgdGhlIHNhcyA5LjQgc2VjdXJpdHkgY2hlY2tzXG4gICAgICAgICAgc2VsZi5fYWpheC5nZXQoc2VsZi51cmwpLnN1Y2Nlc3Moc3VjY2VzcykuZXJyb3IoZXJyb3IpO1xuICAgICAgICB9KS5lcnJvcih0aGlzLmVycm9yKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vZ2V0dGluZyBmb3JtIGFnYWluLCBidXQgaXQgd2Fzbid0IGEgcmVkaXJlY3RcbiAgICAgICAgbG9ncy5hZGRBcHBsaWNhdGlvbkxvZygnV3JvbmcgdXNlcm5hbWUgb3IgcGFzc3dvcmQnKTtcbiAgICAgICAgY2FsbGJhY2soLTEpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBjYWxsYmFjayhyZXMuc3RhdHVzKTtcblxuICAgICAgc2VsZi5fZGlzYWJsZUNhbGxzID0gZmFsc2U7XG5cbiAgICAgIHdoaWxlKHNlbGYuX3BlbmRpbmdDYWxscy5sZW5ndGggPiAwKSB7XG4gICAgICAgIHZhciBwZW5kaW5nQ2FsbCAgICAgPSBzZWxmLl9wZW5kaW5nQ2FsbHMuc2hpZnQoKTtcbiAgICAgICAgdmFyIG1ldGhvZCAgICAgICAgICA9IHBlbmRpbmdDYWxsLm1ldGhvZCB8fCBzZWxmLmNhbGwuYmluZChzZWxmKTtcbiAgICAgICAgdmFyIHNhc1Byb2dyYW0gICAgICA9IHBlbmRpbmdDYWxsLnNhc1Byb2dyYW07XG4gICAgICAgIHZhciBjYWxsYmFja1BlbmRpbmcgPSBwZW5kaW5nQ2FsbC5jYWxsYmFjaztcbiAgICAgICAgdmFyIHBhcmFtcyAgICAgICAgICA9IHBlbmRpbmdDYWxsLnBhcmFtcztcblxuICAgICAgICAvL3VwZGF0ZSBkZWJ1ZyBiZWNhdXNlIGl0IG1heSBjaGFuZ2UgaW4gdGhlIG1lYW50aW1lXG4gICAgICAgIHBhcmFtcy5fZGVidWcgPSBzZWxmLmRlYnVnID8gMTMxIDogMDtcblxuICAgICAgICBpZihzZWxmLnJldHJ5QWZ0ZXJMb2dpbikge1xuICAgICAgICAgIG1ldGhvZChzYXNQcm9ncmFtLCBudWxsLCBjYWxsYmFja1BlbmRpbmcsIHBhcmFtcyk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH0pLmVycm9yKGZ1bmN0aW9uKHJlcykge1xuICAgIGxvZ3MuYWRkQXBwbGljYXRpb25Mb2coJ0xvZ2luIGZhaWxlZCB3aXRoIHN0YXR1cyBjb2RlOiAnICsgcmVzLnN0YXR1cyk7XG4gICAgY2FsbGJhY2socmVzLnN0YXR1cyk7XG4gIH0pO1xufVxuXG5mdW5jdGlvbiBoYW5kbGVSZXN0TG9nb24odXNlciwgcGFzcywgY2FsbGJhY2spIHtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gIHZhciBsb2dpblBhcmFtcyA9IHtcbiAgICB1c2VybmFtZTogdXNlcixcbiAgICBwYXNzd29yZDogcGFzc1xuICB9O1xuXG4gIHRoaXMuX2FqYXgucG9zdCh0aGlzLlJFU1RhdXRoTG9naW5VcmwsIGxvZ2luUGFyYW1zKS5zdWNjZXNzKGZ1bmN0aW9uKHJlcykge1xuICAgIHZhciBsb2NhdGlvbiA9IHJlcy5nZXRSZXNwb25zZUhlYWRlcignTG9jYXRpb24nKTtcblxuICAgIHNlbGYuX2FqYXgucG9zdChsb2NhdGlvbiwge1xuICAgICAgc2VydmljZTogc2VsZi51cmxcbiAgICB9KS5zdWNjZXNzKGZ1bmN0aW9uKHJlcykge1xuICAgICAgaWYoc2VsZi51cmwuaW5kZXhPZignPycpID09PSAtMSkge1xuICAgICAgICBzZWxmLnVybCArPSAnP3RpY2tldD0nICsgcmVzLnJlc3BvbnNlVGV4dDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmKHNlbGYudXJsLmluZGV4T2YoJ3RpY2tldCcpICE9PSAtMSkge1xuICAgICAgICAgIHNlbGYudXJsID0gc2VsZi51cmwucmVwbGFjZSgvdGlja2V0PVteJl0rLywgJ3RpY2tldD0nICsgcmVzLnJlc3BvbnNlVGV4dCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgc2VsZi51cmwgKz0gJyZ0aWNrZXQ9JyArIHJlcy5yZXNwb25zZVRleHQ7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgY2FsbGJhY2socmVzLnN0YXR1cyk7XG4gICAgfSkuZXJyb3IoZnVuY3Rpb24ocmVzKSB7XG4gICAgICBsb2dzLmFkZEFwcGxpY2F0aW9uTG9nKCdMb2dpbiBmYWlsZWQgd2l0aCBzdGF0dXMgY29kZTogJyArIHJlcy5zdGF0dXMpO1xuICAgICAgY2FsbGJhY2socmVzLnN0YXR1cyk7XG4gICAgfSk7XG4gIH0pLmVycm9yKGZ1bmN0aW9uKHJlcykge1xuICAgIGlmKHJlcy5yZXNwb25zZVRleHQgPT09ICdlcnJvci5hdXRoZW50aWNhdGlvbi5jcmVkZW50aWFscy5iYWQnKSB7XG4gICAgICBjYWxsYmFjaygtMSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGxvZ3MuYWRkQXBwbGljYXRpb25Mb2coJ0xvZ2luIGZhaWxlZCB3aXRoIHN0YXR1cyBjb2RlOiAnICsgcmVzLnN0YXR1cyk7XG4gICAgICBjYWxsYmFjayhyZXMuc3RhdHVzKTtcbiAgICB9XG4gIH0pO1xufVxuXG4vKlxuKiBMb2dvdXQgbWV0aG9kXG4qXG4qIEBwYXJhbSB7ZnVuY3Rpb259IGNhbGxiYWNrIC0gQ2FsbGJhY2sgZnVuY3Rpb24gY2FsbGVkIHdoZW4gYWpheCBjYWxsIGlzIGZpbmlzaGVkXG4qXG4qL1xuXG5tb2R1bGUuZXhwb3J0cy5sb2dvdXQgPSBmdW5jdGlvbihjYWxsYmFjaykge1xuICB0aGlzLl9hamF4LmdldCh0aGlzLnVybCwge19hY3Rpb246ICdsb2dvZmYnfSkuc3VjY2VzcyhmdW5jdGlvbihyZXMpIHtcbiAgICBjYWxsYmFjaygpO1xuICB9KS5lcnJvcihmdW5jdGlvbihyZXMpIHtcbiAgICBsb2dzLmFkZEFwcGxpY2F0aW9uTG9nKCdMb2dvdXQgZmFpbGVkIHdpdGggc3RhdHVzIGNvZGU6ICcgKyByZXMuc3RhdHVzKTtcbiAgICBjYWxsYmFjayhyZXMuc3RhdHVzKTtcbiAgfSk7XG59O1xuXG4vKlxuKiBFbnRlciBkZWJ1ZyBtb2RlXG4qXG4qL1xubW9kdWxlLmV4cG9ydHMuc2V0RGVidWdNb2RlID0gZnVuY3Rpb24oKSB7XG4gIHRoaXMuZGVidWcgPSB0cnVlO1xufTtcblxuLypcbiogRXhpdCBkZWJ1ZyBtb2RlXG4qXG4qL1xubW9kdWxlLmV4cG9ydHMudW5zZXREZWJ1Z01vZGUgPSBmdW5jdGlvbigpIHtcbiAgdGhpcy5kZWJ1ZyA9IGZhbHNlO1xufTtcblxuZm9yKHZhciBrZXkgaW4gbG9ncy5nZXQpIHtcbiAgaWYobG9ncy5nZXQuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuICAgIG1vZHVsZS5leHBvcnRzW2tleV0gPSBsb2dzLmdldFtrZXldO1xuICB9XG59XG5cbmZvcih2YXIga2V5IGluIGxvZ3MuY2xlYXIpIHtcbiAgaWYobG9ncy5jbGVhci5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG4gICAgbW9kdWxlLmV4cG9ydHNba2V5XSA9IGxvZ3MuY2xlYXJba2V5XTtcbiAgfVxufVxuXG4vKlxuKiBBZGQgY2FsbGJhY2sgZnVuY3Rpb25zIGV4ZWN1dGVkIHdoZW4gcHJvcGVydGllcyBhcmUgdXBkYXRlZCB3aXRoIHJlbW90ZSBjb25maWdcbipcbipAY2FsbGJhY2sgLSBjYWxsYmFjayBwdXNoZWQgdG8gYXJyYXlcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5vblJlbW90ZUNvbmZpZ1VwZGF0ZSA9IGZ1bmN0aW9uKGNhbGxiYWNrKSB7XG4gIHRoaXMucmVtb3RlQ29uZmlnVXBkYXRlQ2FsbGJhY2tzLnB1c2goY2FsbGJhY2spO1xufTtcblxubW9kdWxlLmV4cG9ydHMuX3V0aWxzID0gcmVxdWlyZSgnLi91dGlscy5qcycpOyIsInZhciBsb2dzID0gcmVxdWlyZSgnLi4vbG9ncy5qcycpO1xudmFyIGg1NHNFcnJvciA9IHJlcXVpcmUoJy4uL2Vycm9yLmpzJyk7XG5cbnZhciBwcm9ncmFtTm90Rm91bmRQYXR0ID0gLzx0aXRsZT4oU3RvcmVkIFByb2Nlc3MgRXJyb3J8U0FTU3RvcmVkUHJvY2Vzcyk8XFwvdGl0bGU+W1xcc1xcU10qPGgyPihTdG9yZWQgcHJvY2VzcyBub3QgZm91bmQ6Lip8Lipub3QgYSB2YWxpZCBzdG9yZWQgcHJvY2VzcyBwYXRoLik8XFwvaDI+LztcbnZhciByZXNwb25zZVJlcGxhY2UgPSBmdW5jdGlvbihyZXMpIHtcbiAgcmV0dXJuIHJlcy5yZXBsYWNlKC8oXFxyXFxufFxccnxcXG4pL2csICcnKS5yZXBsYWNlKC9cXFxcXFxcXChufHJ8dHxmfGIpL2csICdcXFxcJDEnKS5yZXBsYWNlKC9cXFxcXCJcXFxcXCIvZywgJ1xcXFxcIicpO1xufTtcblxuLypcbiogUGFyc2UgcmVzcG9uc2UgZnJvbSBzZXJ2ZXJcbipcbiogQHBhcmFtIHtvYmplY3R9IHJlc3BvbnNlVGV4dCAtIHJlc3BvbnNlIGh0bWwgZnJvbSB0aGUgc2VydmVyXG4qIEBwYXJhbSB7c3RyaW5nfSBzYXNQcm9ncmFtIC0gc2FzIHByb2dyYW0gcGF0aFxuKiBAcGFyYW0ge29iamVjdH0gcGFyYW1zIC0gcGFyYW1zIHNlbnQgdG8gc2FzIHByb2dyYW0gd2l0aCBhZGRUYWJsZVxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLnBhcnNlUmVzID0gZnVuY3Rpb24ocmVzcG9uc2VUZXh0LCBzYXNQcm9ncmFtLCBwYXJhbXMpIHtcbiAgdmFyIG1hdGNoZXMgPSByZXNwb25zZVRleHQubWF0Y2gocHJvZ3JhbU5vdEZvdW5kUGF0dCk7XG4gIGlmKG1hdGNoZXMpIHtcbiAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdwcm9ncmFtTm90Rm91bmQnLCAnWW91IGhhdmUgbm90IGJlZW4gZ3JhbnRlZCBwZXJtaXNzaW9uIHRvIHBlcmZvcm0gdGhpcyBhY3Rpb24sIG9yIHRoZSBTVFAgaXMgbWlzc2luZy4nKTtcbiAgfVxuICAvL3JlbW92ZSBuZXcgbGluZXMgaW4ganNvbiByZXNwb25zZVxuICAvL3JlcGxhY2UgXFxcXChkKSB3aXRoIFxcKGQpIC0gU0FTIGpzb24gcGFyc2VyIGlzIGVzY2FwaW5nIGl0XG4gIHJldHVybiBKU09OLnBhcnNlKHJlc3BvbnNlUmVwbGFjZShyZXNwb25zZVRleHQpKTtcbn07XG5cbi8qXG4qIFBhcnNlIHJlc3BvbnNlIGZyb20gc2VydmVyIGluIGRlYnVnIG1vZGVcbipcbiogQHBhcmFtIHtvYmplY3R9IHJlc3BvbnNlVGV4dCAtIHJlc3BvbnNlIGh0bWwgZnJvbSB0aGUgc2VydmVyXG4qIEBwYXJhbSB7c3RyaW5nfSBzYXNQcm9ncmFtIC0gc2FzIHByb2dyYW0gcGF0aFxuKiBAcGFyYW0ge29iamVjdH0gcGFyYW1zIC0gcGFyYW1zIHNlbnQgdG8gc2FzIHByb2dyYW0gd2l0aCBhZGRUYWJsZVxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLnBhcnNlRGVidWdSZXMgPSBmdW5jdGlvbihyZXNwb25zZVRleHQsIHNhc1Byb2dyYW0sIHBhcmFtcykge1xuICB2YXIgbWF0Y2hlcyA9IHJlc3BvbnNlVGV4dC5tYXRjaChwcm9ncmFtTm90Rm91bmRQYXR0KTtcbiAgaWYobWF0Y2hlcykge1xuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ3Byb2dyYW1Ob3RGb3VuZCcsICdZb3UgaGF2ZSBub3QgYmVlbiBncmFudGVkIHBlcm1pc3Npb24gdG8gcGVyZm9ybSB0aGlzIGFjdGlvbiwgb3IgdGhlIFNUUCBpcyBtaXNzaW5nLicpO1xuICB9XG5cbiAgLy9maW5kIGpzb25cbiAgcGF0dCAgICAgICAgICAgICAgPSAvXiguPy0taDU0cy1kYXRhLXN0YXJ0LS0pKFtcXFNcXHNdKj8pKC0taDU0cy1kYXRhLWVuZC0tKS9tO1xuICBtYXRjaGVzICAgICAgICAgICA9IHJlc3BvbnNlVGV4dC5tYXRjaChwYXR0KTtcblxuICB2YXIgcGFnZSAgICAgICAgICA9IHJlc3BvbnNlVGV4dC5yZXBsYWNlKHBhdHQsICcnKTtcbiAgdmFyIGh0bWxCb2R5UGF0dCAgPSAvPGJvZHkuKj4oW1xcc1xcU10qKTxcXC9ib2R5Pi87XG4gIHZhciBib2R5TWF0Y2hlcyAgID0gcGFnZS5tYXRjaChodG1sQm9keVBhdHQpO1xuXG4gIC8vcmVtb3ZlIGh0bWwgdGFnc1xuICB2YXIgZGVidWdUZXh0ID0gYm9keU1hdGNoZXNbMV0ucmVwbGFjZSgvPFtePl0qPi9nLCAnJyk7XG4gIGRlYnVnVGV4dCAgICAgPSB0aGlzLmRlY29kZUhUTUxFbnRpdGllcyhkZWJ1Z1RleHQpO1xuXG4gIGxvZ3MuYWRkRGVidWdEYXRhKGJvZHlNYXRjaGVzWzFdLCBkZWJ1Z1RleHQsIHNhc1Byb2dyYW0sIHBhcmFtcyk7XG5cbiAgaWYodGhpcy5wYXJzZUVycm9yUmVzcG9uc2UocmVzcG9uc2VUZXh0LCBzYXNQcm9ncmFtKSkge1xuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ3Nhc0Vycm9yJywgJ1NhcyBwcm9ncmFtIGNvbXBsZXRlZCB3aXRoIGVycm9ycycpO1xuICB9XG5cbiAgaWYoIW1hdGNoZXMpIHtcbiAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdwYXJzZUVycm9yJywgJ1VuYWJsZSB0byBwYXJzZSByZXNwb25zZSBqc29uJyk7XG4gIH1cbiAgLy9yZW1vdmUgbmV3IGxpbmVzIGluIGpzb24gcmVzcG9uc2VcbiAgLy9yZXBsYWNlIFxcXFwoZCkgd2l0aCBcXChkKSAtIFNBUyBqc29uIHBhcnNlciBpcyBlc2NhcGluZyBpdFxuICB2YXIganNvbk9iaiA9IEpTT04ucGFyc2UocmVzcG9uc2VSZXBsYWNlKG1hdGNoZXNbMl0pKTtcblxuICByZXR1cm4ganNvbk9iajtcbn07XG5cbi8qXG4qIEFkZCBmYWlsZWQgcmVzcG9uc2UgdG8gbG9ncyAtIHVzZWQgb25seSBpZiBkZWJ1Zz1mYWxzZVxuKlxuKiBAcGFyYW0ge29iamVjdH0gcmVzcG9uc2VUZXh0IC0gcmVzcG9uc2UgaHRtbCBmcm9tIHRoZSBzZXJ2ZXJcbiogQHBhcmFtIHtzdHJpbmd9IHNhc1Byb2dyYW0gLSBzYXMgcHJvZ3JhbSBwYXRoXG4qXG4qL1xubW9kdWxlLmV4cG9ydHMuYWRkRmFpbGVkUmVzcG9uc2UgPSBmdW5jdGlvbihyZXNwb25zZVRleHQsIHNhc1Byb2dyYW0pIHtcbiAgdmFyIHBhdHQgICAgICA9IC88c2NyaXB0KFtcXHNcXFNdKilcXC9mb3JtPi87XG4gIHZhciBwYXR0MiAgICAgPSAvZGlzcGxheVxccz86XFxzP25vbmU7P1xccz8vO1xuICAvL3JlbW92ZSBzY3JpcHQgd2l0aCBmb3JtIGZvciB0b2dnbGluZyB0aGUgbG9ncyBhbmQgXCJkaXNwbGF5Om5vbmVcIiBmcm9tIHN0eWxlXG4gIHJlc3BvbnNlVGV4dCAgPSByZXNwb25zZVRleHQucmVwbGFjZShwYXR0LCAnJykucmVwbGFjZShwYXR0MiwgJycpO1xuICB2YXIgZGVidWdUZXh0ID0gcmVzcG9uc2VUZXh0LnJlcGxhY2UoLzxbXj5dKj4vZywgJycpO1xuICBkZWJ1Z1RleHQgPSB0aGlzLmRlY29kZUhUTUxFbnRpdGllcyhkZWJ1Z1RleHQpO1xuXG4gIGxvZ3MuYWRkRmFpbGVkUmVxdWVzdChyZXNwb25zZVRleHQsIGRlYnVnVGV4dCwgc2FzUHJvZ3JhbSk7XG59O1xuXG4vKlxuKiBVbmVzY2FwZSBhbGwgc3RyaW5nIHZhbHVlcyBpbiByZXR1cm5lZCBvYmplY3RcbipcbiogQHBhcmFtIHtvYmplY3R9IG9ialxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLnVuZXNjYXBlVmFsdWVzID0gZnVuY3Rpb24ob2JqKSB7XG4gIGZvciAodmFyIGtleSBpbiBvYmopIHtcbiAgICBpZiAodHlwZW9mIG9ialtrZXldID09PSAnc3RyaW5nJykge1xuICAgICAgb2JqW2tleV0gPSBkZWNvZGVVUklDb21wb25lbnQob2JqW2tleV0pO1xuICAgIH0gZWxzZSBpZih0eXBlb2Ygb2JqID09PSAnb2JqZWN0Jykge1xuICAgICAgdGhpcy51bmVzY2FwZVZhbHVlcyhvYmpba2V5XSk7XG4gICAgfVxuICB9XG4gIHJldHVybiBvYmo7XG59O1xuXG4vKlxuKiBQYXJzZSBlcnJvciByZXNwb25zZSBmcm9tIHNlcnZlciBhbmQgc2F2ZSBlcnJvcnMgaW4gbWVtb3J5XG4qXG4qIEBwYXJhbSB7c3RyaW5nfSByZXMgLSBzZXJ2ZXIgcmVzcG9uc2VcbiogI3BhcmFtIHtzdHJpbmd9IHNhc1Byb2dyYW0gLSBzYXMgcHJvZ3JhbSB3aGljaCByZXR1cm5lZCB0aGUgcmVzcG9uc2VcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5wYXJzZUVycm9yUmVzcG9uc2UgPSBmdW5jdGlvbihyZXMsIHNhc1Byb2dyYW0pIHtcbiAgLy9jYXB0dXJlICdFUlJPUjogW3RleHRdLicgb3IgJ0VSUk9SIHh4IFt0ZXh0XS4nXG4gIHZhciBwYXR0ICAgID0gL15FUlJPUig6XFxzfFxcc1xcZFxcZCkoLipcXC58LipcXG4uKlxcLikvZ207XG4gIHZhciBlcnJvcnMgID0gcmVzLnJlcGxhY2UoLyg8KFtePl0rKT4pL2lnLCAnJykubWF0Y2gocGF0dCk7XG4gIGlmKCFlcnJvcnMpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICB2YXIgZXJyTWVzc2FnZTtcbiAgZm9yKHZhciBpID0gMCwgbiA9IGVycm9ycy5sZW5ndGg7IGkgPCBuOyBpKyspIHtcbiAgICBlcnJNZXNzYWdlICA9IGVycm9yc1tpXS5yZXBsYWNlKC88W14+XSo+L2csICcnKS5yZXBsYWNlKC8oXFxufFxcc3syLH0pL2csICcgJyk7XG4gICAgZXJyTWVzc2FnZSAgPSB0aGlzLmRlY29kZUhUTUxFbnRpdGllcyhlcnJNZXNzYWdlKTtcbiAgICBlcnJvcnNbaV0gICA9IHtcbiAgICAgIHNhc1Byb2dyYW06IHNhc1Byb2dyYW0sXG4gICAgICBtZXNzYWdlOiAgICBlcnJNZXNzYWdlLFxuICAgICAgdGltZTogICAgICAgbmV3IERhdGUoKVxuICAgIH07XG4gIH1cblxuICBsb2dzLmFkZFNhc0Vycm9ycyhlcnJvcnMpO1xuXG4gIHJldHVybiB0cnVlO1xufTtcblxuLypcbiogRGVjb2RlIEhUTUwgZW50aXRpZXNcbipcbiogQHBhcmFtIHtzdHJpbmd9IHJlcyAtIHNlcnZlciByZXNwb25zZVxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLmRlY29kZUhUTUxFbnRpdGllcyA9IGZ1bmN0aW9uIChodG1sKSB7XG4gIHZhciB0ZW1wRWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcbiAgdmFyIHN0ciAgICAgICAgID0gaHRtbC5yZXBsYWNlKC8mKCMoPzp4WzAtOWEtZl0rfFxcZCspfFthLXpdKyk7L2dpLFxuICAgIGZ1bmN0aW9uIChzdHIpIHtcbiAgICAgIHRlbXBFbGVtZW50LmlubmVySFRNTCA9IHN0cjtcbiAgICAgIHN0ciAgICAgICAgICAgICAgICAgICA9IHRlbXBFbGVtZW50LnRleHRDb250ZW50IHx8IHRlbXBFbGVtZW50LmlubmVyVGV4dDtcbiAgICAgIHJldHVybiBzdHI7XG4gICAgfVxuICApO1xuICByZXR1cm4gc3RyO1xufTtcblxuLypcbiogQ29udmVydCBzYXMgdGltZSB0byBqYXZhc2NyaXB0IGRhdGVcbipcbiogQHBhcmFtIHtudW1iZXJ9IHNhc0RhdGUgLSBzYXMgVGF0ZSBvYmplY3RcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5mcm9tU2FzRGF0ZVRpbWUgPSBmdW5jdGlvbiAoc2FzRGF0ZSkge1xuICB2YXIgYmFzZWRhdGUgPSBuZXcgRGF0ZShcIkphbnVhcnkgMSwgMTk2MCAwMDowMDowMFwiKTtcbiAgdmFyIGN1cnJkYXRlID0gc2FzRGF0ZTtcblxuICAvLyBvZmZzZXRzIGZvciBVVEMgYW5kIHRpbWV6b25lcyBhbmQgQlNUXG4gIHZhciBiYXNlT2Zmc2V0ID0gYmFzZWRhdGUuZ2V0VGltZXpvbmVPZmZzZXQoKTsgLy8gaW4gbWludXRlc1xuXG4gIC8vIGNvbnZlcnQgc2FzIGRhdGV0aW1lIHRvIGEgY3VycmVudCB2YWxpZCBqYXZhc2NyaXB0IGRhdGVcbiAgdmFyIGJhc2VkYXRlTXMgID0gYmFzZWRhdGUuZ2V0VGltZSgpOyAvLyBpbiBtc1xuICB2YXIgY3VycmRhdGVNcyAgPSBjdXJyZGF0ZSAqIDEwMDA7IC8vIHRvIG1zXG4gIHZhciBzYXNEYXRldGltZSA9IGN1cnJkYXRlTXMgKyBiYXNlZGF0ZU1zO1xuICB2YXIganNEYXRlICAgICAgPSBuZXcgRGF0ZSgpO1xuICBqc0RhdGUuc2V0VGltZShzYXNEYXRldGltZSk7IC8vIGZpcnN0IHRpbWUgdG8gZ2V0IG9mZnNldCBCU1QgZGF5bGlnaHQgc2F2aW5ncyBldGNcbiAgdmFyIGN1cnJPZmZzZXQgID0ganNEYXRlLmdldFRpbWV6b25lT2Zmc2V0KCk7IC8vIGFkanVzdCBmb3Igb2Zmc2V0IGluIG1pbnV0ZXNcbiAgdmFyIG9mZnNldFZhciAgID0gKGJhc2VPZmZzZXQgLSBjdXJyT2Zmc2V0KSAqIDYwICogMTAwMDsgLy8gZGlmZmVyZW5jZSBpbiBtaWxsaXNlY29uZHNcbiAgdmFyIG9mZnNldFRpbWUgID0gc2FzRGF0ZXRpbWUgLSBvZmZzZXRWYXI7IC8vIGZpbmRpbmcgQlNUIGFuZCBkYXlsaWdodCBzYXZpbmdzXG4gIGpzRGF0ZS5zZXRUaW1lKG9mZnNldFRpbWUpOyAvLyB1cGRhdGUgd2l0aCBvZmZzZXRcbiAgcmV0dXJuIGpzRGF0ZTtcbn07XG5cbm1vZHVsZS5leHBvcnRzLm5lZWRUb0xvZ2luID0gZnVuY3Rpb24ocmVzcG9uc2VPYmopIHtcbiAgdmFyIHBhdHQgPSAvPGZvcm0uK2FjdGlvbj1cIiguKkxvZ29uW15cIl0qKS4qPi87XG4gIHZhciBtYXRjaGVzID0gcGF0dC5leGVjKHJlc3BvbnNlT2JqLnJlc3BvbnNlVGV4dCk7XG4gIHZhciBuZXdMb2dpblVybDtcblxuICBpZighbWF0Y2hlcykge1xuICAgIC8vdGhlcmUncyBubyBmb3JtLCB3ZSBhcmUgaW4uIGhvb3JheSFcbiAgICByZXR1cm4gZmFsc2U7XG4gIH0gZWxzZSB7XG4gICAgdmFyIGFjdGlvblVybCA9IG1hdGNoZXNbMV0ucmVwbGFjZSgvXFw/LiovLCAnJyk7XG4gICAgaWYoYWN0aW9uVXJsLmNoYXJBdCgwKSA9PT0gJy8nKSB7XG4gICAgICBuZXdMb2dpblVybCA9IHRoaXMuaG9zdFVybCA/IHRoaXMuaG9zdFVybCArIGFjdGlvblVybCA6IGFjdGlvblVybDtcbiAgICAgIGlmKG5ld0xvZ2luVXJsICE9PSB0aGlzLmxvZ2luVXJsKSB7XG4gICAgICAgIHRoaXMuX2xvZ2luQ2hhbmdlZCA9IHRydWU7XG4gICAgICAgIHRoaXMubG9naW5VcmwgPSBuZXdMb2dpblVybDtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgLy9yZWxhdGl2ZSBwYXRoXG5cbiAgICAgIHZhciBsYXN0SW5kT2ZTbGFzaCA9IHJlc3BvbnNlT2JqLnJlc3BvbnNlVVJMLmxhc3RJbmRleE9mKCcvJykgKyAxO1xuICAgICAgLy9yZW1vdmUgZXZlcnl0aGluZyBhZnRlciB0aGUgbGFzdCBzbGFzaCwgYW5kIGV2ZXJ5dGhpbmcgdW50aWwgdGhlIGZpcnN0XG4gICAgICB2YXIgcmVsYXRpdmVMb2dpblVybCA9IHJlc3BvbnNlT2JqLnJlc3BvbnNlVVJMLnN1YnN0cigwLCBsYXN0SW5kT2ZTbGFzaCkucmVwbGFjZSgvLipcXC97Mn1bXlxcL10qLywgJycpICsgYWN0aW9uVXJsO1xuICAgICAgbmV3TG9naW5VcmwgPSB0aGlzLmhvc3RVcmwgPyB0aGlzLmhvc3RVcmwgKyByZWxhdGl2ZUxvZ2luVXJsIDogcmVsYXRpdmVMb2dpblVybDtcbiAgICAgIGlmKG5ld0xvZ2luVXJsICE9PSB0aGlzLmxvZ2luVXJsKSB7XG4gICAgICAgIHRoaXMuX2xvZ2luQ2hhbmdlZCA9IHRydWU7XG4gICAgICAgIHRoaXMubG9naW5VcmwgPSBuZXdMb2dpblVybDtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvL3NhdmUgcGFyYW1ldGVycyBmcm9tIGhpZGRlbiBmb3JtIGZpZWxkc1xuICAgIHZhciBpbnB1dHMgPSByZXNwb25zZU9iai5yZXNwb25zZVRleHQubWF0Y2goLzxpbnB1dC4qXCJoaWRkZW5cIltePl0qPi9nKTtcbiAgICB2YXIgaGlkZGVuRm9ybVBhcmFtcyA9IHt9O1xuICAgIGlmKGlucHV0cykge1xuICAgICAgLy9pdCdzIG5ldyBsb2dpbiBwYWdlIGlmIHdlIGhhdmUgdGhlc2UgYWRkaXRpb25hbCBwYXJhbWV0ZXJzXG4gICAgICB0aGlzLl9pc05ld0xvZ2luUGFnZSA9IHRydWU7XG4gICAgICBpbnB1dHMuZm9yRWFjaChmdW5jdGlvbihpbnB1dFN0cikge1xuICAgICAgICB2YXIgdmFsdWVNYXRjaCA9IGlucHV0U3RyLm1hdGNoKC9uYW1lPVwiKFteXCJdKilcIlxcc3ZhbHVlPVwiKFteXCJdKikvKTtcbiAgICAgICAgaGlkZGVuRm9ybVBhcmFtc1t2YWx1ZU1hdGNoWzFdXSA9IHZhbHVlTWF0Y2hbMl07XG4gICAgICB9KTtcbiAgICAgIHRoaXMuX2FkaXRpb25hbExvZ2luUGFyYW1zID0gaGlkZGVuRm9ybVBhcmFtcztcbiAgICB9XG5cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxufTtcblxuLypcbiogR2V0IGZ1bGwgcHJvZ3JhbSBwYXRoIGZyb20gbWV0YWRhdGEgcm9vdCBhbmQgcmVsYXRpdmUgcGF0aFxuKlxuKiBAcGFyYW0ge3N0cmluZ30gbWV0YWRhdGFSb290IC0gTWV0YWRhdGEgcm9vdCAocGF0aCB3aGVyZSBhbGwgcHJvZ3JhbXMgZm9yIHRoZSBwcm9qZWN0IGFyZSBsb2NhdGVkKVxuKiBAcGFyYW0ge3N0cmluZ30gc2FzUHJvZ3JhbVBhdGggLSBTYXMgcHJvZ3JhbSBwYXRoXG4qXG4qL1xubW9kdWxlLmV4cG9ydHMuZ2V0RnVsbFByb2dyYW1QYXRoID0gZnVuY3Rpb24obWV0YWRhdGFSb290LCBzYXNQcm9ncmFtUGF0aCkge1xuICByZXR1cm4gbWV0YWRhdGFSb290ID8gbWV0YWRhdGFSb290LnJlcGxhY2UoL1xcLz8kLywgJy8nKSArIHNhc1Byb2dyYW1QYXRoLnJlcGxhY2UoL15cXC8vLCAnJykgOiBzYXNQcm9ncmFtUGF0aDtcbn07XG4iLCJ2YXIgaDU0c0Vycm9yID0gcmVxdWlyZSgnLi9lcnJvci5qcycpO1xudmFyIGxvZ3MgICAgICA9IHJlcXVpcmUoJy4vbG9ncy5qcycpO1xudmFyIFRhYmxlcyAgICA9IHJlcXVpcmUoJy4vdGFibGVzJyk7XG52YXIgRmlsZXMgICAgID0gcmVxdWlyZSgnLi9maWxlcycpO1xudmFyIHRvU2FzRGF0ZVRpbWUgPSByZXF1aXJlKCcuL3RhYmxlcy91dGlscy5qcycpLnRvU2FzRGF0ZVRpbWU7XG5cbmZ1bmN0aW9uIHZhbGlkYXRlTWFjcm8obWFjcm9OYW1lKSB7XG4gIGlmKG1hY3JvTmFtZS5sZW5ndGggPiAzMikge1xuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnVGFibGUgbmFtZSB0b28gbG9uZy4gTWF4aW11bSBpcyAzMiBjaGFyYWN0ZXJzJyk7XG4gIH1cblxuICB2YXIgY2hhckNvZGVBdDAgPSBtYWNyb05hbWUuY2hhckNvZGVBdCgwKTtcbiAgLy8gdmFsaWRhdGUgaXQgc3RhcnRzIHdpdGggQS1aLCBhLXosIG9yIF9cbiAgaWYoKGNoYXJDb2RlQXQwIDwgNjUgfHwgY2hhckNvZGVBdDAgPiA5MCkgJiYgKGNoYXJDb2RlQXQwIDwgOTcgfHwgY2hhckNvZGVBdDAgPiAxMjIpICYmIG1hY3JvTmFtZVswXSAhPT0gJ18nKSB7XG4gICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdUYWJsZSBuYW1lIHN0YXJ0aW5nIHdpdGggbnVtYmVyIG9yIHNwZWNpYWwgY2hhcmFjdGVycycpO1xuICB9XG5cbiAgZm9yKHZhciBpID0gMDsgaSA8IG1hY3JvTmFtZS5sZW5ndGg7IGkrKykge1xuICAgIHZhciBjaGFyQ29kZSA9IG1hY3JvTmFtZS5jaGFyQ29kZUF0KGkpO1xuXG4gICAgaWYoKGNoYXJDb2RlIDwgNDggfHwgY2hhckNvZGUgPiA1NykgJiZcbiAgICAgIChjaGFyQ29kZSA8IDY1IHx8IGNoYXJDb2RlID4gOTApICYmXG4gICAgICAoY2hhckNvZGUgPCA5NyB8fCBjaGFyQ29kZSA+IDEyMikgJiZcbiAgICAgIG1hY3JvTmFtZVtpXSAhPT0gJ18nKVxuICAgIHtcbiAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnVGFibGUgbmFtZSBoYXMgdW5zdXBwb3J0ZWQgY2hhcmFjdGVycycpO1xuICAgIH1cbiAgfVxufVxuXG4vKlxuKiBoNTRzIFNBUyBkYXRhIG9iamVjdCBjb25zdHJ1Y3RvclxuKiBAY29uc3RydWN0b3JcbipcbipAcGFyYW0ge2FycmF5fGZpbGV9IGRhdGEgLSBUYWJsZSBvciBmaWxlIGFkZGVkIHdoZW4gb2JqZWN0IGlzIGNyZWF0ZWRcbipAcGFyYW0ge3N0cmluZ30gbWFjcm9OYW1lIC0gbWFjcm8gbmFtZVxuKkBwYXJhbSB7bnVtYmVyfSBwYXJhbWV0ZXJUaHJlc2hvbGQgLSBzaXplIG9mIGRhdGEgb2JqZWN0cyBzZW50IHRvIFNBU1xuKlxuKi9cbmZ1bmN0aW9uIFNhc0RhdGEoZGF0YSwgbWFjcm9OYW1lLCBzcGVjcykge1xuICBpZihkYXRhIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICB0aGlzLl9maWxlcyA9IHt9O1xuICAgIHRoaXMuYWRkVGFibGUoZGF0YSwgbWFjcm9OYW1lLCBzcGVjcyk7XG4gIH0gZWxzZSBpZihkYXRhIGluc3RhbmNlb2YgRmlsZSB8fCBkYXRhIGluc3RhbmNlb2YgQmxvYikge1xuICAgIEZpbGVzLmNhbGwodGhpcywgZGF0YSwgbWFjcm9OYW1lKTtcbiAgfSBlbHNlIHtcbiAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ0RhdGEgYXJndW1lbnQgd3JvbmcgdHlwZSBvciBtaXNzaW5nJyk7XG4gIH1cbn1cblxuLypcbiogQWRkIHRhYmxlIHRvIHRhYmxlcyBvYmplY3RcbiogQHBhcmFtIHthcnJheX0gdGFibGUgLSBBcnJheSBvZiB0YWJsZSBvYmplY3RzXG4qIEBwYXJhbSB7c3RyaW5nfSBtYWNyb05hbWUgLSBTYXMgbWFjcm8gbmFtZVxuKlxuKi9cblNhc0RhdGEucHJvdG90eXBlLmFkZFRhYmxlID0gZnVuY3Rpb24odGFibGUsIG1hY3JvTmFtZSwgc3BlY3MpIHtcbiAgdmFyIGlzU3BlY3NQcm92aWRlZCA9ICEhc3BlY3M7XG4gIGlmKHRhYmxlICYmIG1hY3JvTmFtZSkge1xuICAgIGlmKCEodGFibGUgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnRmlyc3QgYXJndW1lbnQgbXVzdCBiZSBhcnJheScpO1xuICAgIH1cbiAgICBpZih0eXBlb2YgbWFjcm9OYW1lICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdTZWNvbmQgYXJndW1lbnQgbXVzdCBiZSBzdHJpbmcnKTtcbiAgICB9XG5cbiAgICB2YWxpZGF0ZU1hY3JvKG1hY3JvTmFtZSk7XG4gIH0gZWxzZSB7XG4gICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdNaXNzaW5nIGFyZ3VtZW50cycpO1xuICB9XG5cbiAgaWYgKHR5cGVvZiB0YWJsZSAhPT0gJ29iamVjdCcgfHwgISh0YWJsZSBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnVGFibGUgYXJndW1lbnQgaXMgbm90IGFuIGFycmF5Jyk7XG4gIH1cblxuICB2YXIga2V5O1xuICBpZihzcGVjcykge1xuICAgIGlmKHNwZWNzLmNvbnN0cnVjdG9yICE9PSBPYmplY3QpIHtcbiAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnU3BlY3MgZGF0YSB0eXBlIHdyb25nLiBPYmplY3QgZXhwZWN0ZWQuJyk7XG4gICAgfVxuICAgIGZvcihrZXkgaW4gdGFibGVbMF0pIHtcbiAgICAgIGlmKCFzcGVjc1trZXldKSB7XG4gICAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnTWlzc2luZyBjb2x1bW5zIGluIHNwZWNzIGRhdGEuJyk7XG4gICAgICB9XG4gICAgfVxuICAgIGZvcihrZXkgaW4gc3BlY3MpIHtcbiAgICAgIGlmKHNwZWNzW2tleV0uY29uc3RydWN0b3IgIT09IE9iamVjdCkge1xuICAgICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1dyb25nIGNvbHVtbiBkZXNjcmlwdG9yIGluIHNwZWNzIGRhdGEuJyk7XG4gICAgICB9XG4gICAgICBpZighc3BlY3Nba2V5XS5jb2xUeXBlIHx8ICFzcGVjc1trZXldLmNvbExlbmd0aCkge1xuICAgICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ01pc3NpbmcgY29sdW1ucyBpbiBzcGVjcyBkZXNjcmlwdG9yLicpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHZhciBpLCBqLCAvL2NvdW50ZXJzIHVzZWQgbGF0dGVyIGluIGNvZGVcbiAgICAgIHJvdywgdmFsLCB0eXBlLFxuICAgICAgc3BlY0tleXMgPSBbXSxcbiAgICAgIHNwZWNpYWxDaGFycyA9IFsnXCInLCAnXFxcXCcsICcvJywgJ1xcbicsICdcXHQnLCAnXFxmJywgJ1xccicsICdcXGInXTtcblxuICBpZighc3BlY3MpIHtcbiAgICBzcGVjcyA9IHt9O1xuXG4gICAgZm9yIChpID0gMDsgaSA8IHRhYmxlLmxlbmd0aDsgaSsrKSB7XG4gICAgICByb3cgPSB0YWJsZVtpXTtcblxuICAgICAgaWYodHlwZW9mIHJvdyAhPT0gJ29iamVjdCcpIHtcbiAgICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdUYWJsZSBpdGVtIGlzIG5vdCBhbiBvYmplY3QnKTtcbiAgICAgIH1cblxuICAgICAgZm9yKGtleSBpbiByb3cpIHtcbiAgICAgICAgaWYocm93Lmhhc093blByb3BlcnR5KGtleSkpIHtcbiAgICAgICAgICB2YWwgID0gcm93W2tleV07XG4gICAgICAgICAgdHlwZSA9IHR5cGVvZiB2YWw7XG5cbiAgICAgICAgICBpZihzcGVjc1trZXldID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHNwZWNLZXlzLnB1c2goa2V5KTtcbiAgICAgICAgICAgIHNwZWNzW2tleV0gPSB7fTtcblxuICAgICAgICAgICAgaWYgKHR5cGUgPT09ICdudW1iZXInKSB7XG4gICAgICAgICAgICAgIGlmKHZhbCA8IE51bWJlci5NSU5fU0FGRV9JTlRFR0VSIHx8IHZhbCA+IE51bWJlci5NQVhfU0FGRV9JTlRFR0VSKSB7XG4gICAgICAgICAgICAgICAgbG9ncy5hZGRBcHBsaWNhdGlvbkxvZygnT2JqZWN0WycgKyBpICsgJ10uJyArIGtleSArICcgLSBUaGlzIHZhbHVlIGV4Y2VlZHMgZXhwZWN0ZWQgbnVtZXJpYyBwcmVjaXNpb24uJyk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgc3BlY3Nba2V5XS5jb2xUeXBlICAgPSAnbnVtJztcbiAgICAgICAgICAgICAgc3BlY3Nba2V5XS5jb2xMZW5ndGggPSA4O1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlID09PSAnc3RyaW5nJyAmJiAhKHZhbCBpbnN0YW5jZW9mIERhdGUpKSB7IC8vIHN0cmFpZ2h0Zm9yd2FyZCBzdHJpbmdcbiAgICAgICAgICAgICAgc3BlY3Nba2V5XS5jb2xUeXBlICAgID0gJ3N0cmluZyc7XG4gICAgICAgICAgICAgIHNwZWNzW2tleV0uY29sTGVuZ3RoICA9IHZhbC5sZW5ndGg7XG4gICAgICAgICAgICB9IGVsc2UgaWYodmFsIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgICAgICAgICAgICBzcGVjc1trZXldLmNvbFR5cGUgICA9ICdkYXRlJztcbiAgICAgICAgICAgICAgc3BlY3Nba2V5XS5jb2xMZW5ndGggPSA4O1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgICBzcGVjc1trZXldLmNvbFR5cGUgICA9ICdqc29uJztcbiAgICAgICAgICAgICAgc3BlY3Nba2V5XS5jb2xMZW5ndGggPSBKU09OLnN0cmluZ2lmeSh2YWwpLmxlbmd0aDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgc3BlY0tleXMgPSBPYmplY3Qua2V5cyhzcGVjcyk7XG4gIH1cblxuICB2YXIgc2FzQ3N2ID0gJyc7XG5cbiAgLy8gd2UgbmVlZCB0d28gbG9vcHMgLSB0aGUgZmlyc3Qgb25lIGlzIGNyZWF0aW5nIHNwZWNzIGFuZCB2YWxpZGF0aW5nXG4gIGZvciAoaSA9IDA7IGkgPCB0YWJsZS5sZW5ndGg7IGkrKykge1xuICAgIHJvdyA9IHRhYmxlW2ldO1xuICAgIGZvcihqID0gMDsgaiA8IHNwZWNLZXlzLmxlbmd0aDsgaisrKSB7XG4gICAgICBrZXkgPSBzcGVjS2V5c1tqXTtcbiAgICAgIGlmKHJvdy5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG4gICAgICAgIHZhbCAgPSByb3dba2V5XTtcbiAgICAgICAgdHlwZSA9IHR5cGVvZiB2YWw7XG5cbiAgICAgICAgaWYodHlwZSA9PT0gJ251bWJlcicgJiYgaXNOYU4odmFsKSkge1xuICAgICAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ3R5cGVFcnJvcicsICdOYU4gdmFsdWUgaW4gb25lIG9mIHRoZSB2YWx1ZXMgKGNvbHVtbnMpIGlzIG5vdCBhbGxvd2VkJyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYodmFsID09PSAtSW5maW5pdHkgfHwgdmFsID09PSBJbmZpbml0eSkge1xuICAgICAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ3R5cGVFcnJvcicsIHZhbC50b1N0cmluZygpICsgJyB2YWx1ZSBpbiBvbmUgb2YgdGhlIHZhbHVlcyAoY29sdW1ucykgaXMgbm90IGFsbG93ZWQnKTtcbiAgICAgICAgfVxuICAgICAgICBpZih2YWwgPT09IHRydWUgfHwgdmFsID09PSBmYWxzZSkge1xuICAgICAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ3R5cGVFcnJvcicsICdCb29sZWFuIHZhbHVlIGluIG9uZSBvZiB0aGUgdmFsdWVzIChjb2x1bW5zKSBpcyBub3QgYWxsb3dlZCcpO1xuICAgICAgICB9XG4gICAgICAgIGlmKHR5cGUgPT09ICdzdHJpbmcnICYmIHZhbC5pbmRleE9mKCdcXG4nKSAhPT0gLTEpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCd0eXBlRXJyb3InLCAnTmV3IGxpbmUgY2hhcmFjdGVyIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGNvbnZlcnQgbnVsbCB0byAnLicgZm9yIG51bWJlcnMgYW5kIHRvICcnIGZvciBzdHJpbmdzXG4gICAgICAgIGlmKHZhbCA9PT0gbnVsbCkge1xuICAgICAgICAgIGlmKHNwZWNzW2tleV0uY29sVHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIHZhbCA9ICcnO1xuICAgICAgICAgICAgdHlwZSA9ICdzdHJpbmcnO1xuICAgICAgICAgIH0gZWxzZSBpZihzcGVjc1trZXldLmNvbFR5cGUgPT09ICdudW0nKSB7XG4gICAgICAgICAgICB2YWwgPSAnLic7XG4gICAgICAgICAgICB0eXBlID0gJ251bWJlcic7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ3R5cGVFcnJvcicsICdDYW5ub3QgY29udmVydCBudWxsIHZhbHVlJyk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cblxuICAgICAgICBpZiAoKHR5cGUgPT09ICdudW1iZXInICYmIHNwZWNzW2tleV0uY29sVHlwZSAhPT0gJ251bScgJiYgdmFsICE9PSAnLicpIHx8XG4gICAgICAgICAgKCh0eXBlID09PSAnc3RyaW5nJyAmJiAhKHZhbCBpbnN0YW5jZW9mIERhdGUpICYmIHNwZWNzW2tleV0uY29sVHlwZSAhPT0gJ3N0cmluZycpICYmXG4gICAgICAgICAgKHR5cGUgPT09ICdzdHJpbmcnICYmIHNwZWNzW2tleV0uY29sVHlwZSA9PSAnbnVtJyAmJiB2YWwgIT09ICcuJykpIHx8XG4gICAgICAgICAgKHZhbCBpbnN0YW5jZW9mIERhdGUgJiYgc3BlY3Nba2V5XS5jb2xUeXBlICE9PSAnZGF0ZScpIHx8XG4gICAgICAgICAgKCh0eXBlID09PSAnb2JqZWN0JyAmJiB2YWwuY29uc3RydWN0b3IgIT09IERhdGUpICYmIHNwZWNzW2tleV0uY29sVHlwZSAhPT0gJ2pzb24nKSlcbiAgICAgICAge1xuICAgICAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ3R5cGVFcnJvcicsICdUaGVyZSBpcyBhIHNwZWNzIHR5cGUgbWlzbWF0Y2ggaW4gdGhlIGFycmF5IGJldHdlZW4gdmFsdWVzIChjb2x1bW5zKSBvZiB0aGUgc2FtZSBuYW1lLicgK1xuICAgICAgICAgICAgJyB0eXBlL2NvbFR5cGUvdmFsID0gJyArIHR5cGUgKycvJyArIHNwZWNzW2tleV0uY29sVHlwZSArICcvJyArIHZhbCApO1xuICAgICAgICB9IGVsc2UgaWYoIWlzU3BlY3NQcm92aWRlZCAmJiB0eXBlID09PSAnc3RyaW5nJyAmJiBzcGVjc1trZXldLmNvbExlbmd0aCA8IHZhbC5sZW5ndGgpIHtcbiAgICAgICAgICBzcGVjc1trZXldLmNvbExlbmd0aCA9IHZhbC5sZW5ndGg7XG4gICAgICAgIH0gZWxzZSBpZigodHlwZSA9PT0gJ3N0cmluZycgJiYgc3BlY3Nba2V5XS5jb2xMZW5ndGggPCB2YWwubGVuZ3RoKSB8fCAodHlwZSAhPT0gJ3N0cmluZycgJiYgc3BlY3Nba2V5XS5jb2xMZW5ndGggIT09IDgpKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcigndHlwZUVycm9yJywgJ1RoZXJlIGlzIGEgc3BlY3MgbGVuZ3RoIG1pc21hdGNoIGluIHRoZSBhcnJheSBiZXR3ZWVuIHZhbHVlcyAoY29sdW1ucykgb2YgdGhlIHNhbWUgbmFtZS4nICtcbiAgICAgICAgICAgICcgdHlwZS9jb2xUeXBlL3ZhbCA9ICcgKyB0eXBlICsnLycgKyBzcGVjc1trZXldLmNvbFR5cGUgKyAnLycgKyB2YWwgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh2YWwgaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgICAgICAgdmFsID0gdG9TYXNEYXRlVGltZSh2YWwpO1xuICAgICAgICB9XG5cbiAgICAgICAgc3dpdGNoKHNwZWNzW2tleV0uY29sVHlwZSkge1xuICAgICAgICAgIGNhc2UgJ251bSc6XG4gICAgICAgICAgY2FzZSAnZGF0ZSc6XG4gICAgICAgICAgICBzYXNDc3YgKz0gdmFsO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgICAgICAgIHNhc0NzdiArPSAnXCInICsgdmFsLnJlcGxhY2UoL1wiL2csICdcIlwiJykgKyAnXCInO1xuICAgICAgICAgICAgdmFyIGNvbExlbmd0aCA9IHZhbC5sZW5ndGg7XG4gICAgICAgICAgICBmb3IodmFyIGsgPSAwOyBrIDwgdmFsLmxlbmd0aDsgaysrKSB7XG4gICAgICAgICAgICAgIGlmKHNwZWNpYWxDaGFycy5pbmRleE9mKHZhbFtrXSkgIT09IC0xKSB7XG4gICAgICAgICAgICAgICAgY29sTGVuZ3RoKys7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdmFyIGNvZGUgPSB2YWwuY2hhckNvZGVBdChrKTtcbiAgICAgICAgICAgICAgICBpZihjb2RlID4gMHhmZmZmKSB7XG4gICAgICAgICAgICAgICAgICBjb2xMZW5ndGggKz0gMztcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYoY29kZSA+IDB4N2ZmKSB7XG4gICAgICAgICAgICAgICAgICBjb2xMZW5ndGggKz0gMjtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYoY29kZSA+IDB4N2YpIHtcbiAgICAgICAgICAgICAgICAgIGNvbExlbmd0aCArPSAxO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gdXNlIG1heGltdW0gdmFsdWUgYmV0d2VlbiBtYXggcHJldmlvdXMsIGN1cnJlbnQgdmFsdWUgYW5kIDEgKGZpcnN0IHR3byBjYW4gYmUgMCB3aWNoIGlzIG5vdCBzdXBwb3J0ZWQpXG4gICAgICAgICAgICBzcGVjc1trZXldLmNvbExlbmd0aCA9IE1hdGgubWF4KHNwZWNzW2tleV0uY29sTGVuZ3RoLCBjb2xMZW5ndGgsIDEpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAnb2JqZWN0JzpcbiAgICAgICAgICAgIHNhc0NzdiArPSAnXCInICsgSlNPTi5zdHJpbmdpZHkodmFsKS5yZXBsYWNlKC9cIi9nLCAnXCJcIicpICsgJ1wiJztcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICAvLyBkbyBub3QgaW5zZXJ0IGlmIGl0J3MgdGhlIGxhc3QgY29sdW1uXG4gICAgICBpZihqIDwgc3BlY0tleXMubGVuZ3RoIC0gMSkge1xuICAgICAgICBzYXNDc3YgKz0gJywnO1xuICAgICAgfVxuICAgIH1cbiAgICBpZihpIDwgdGFibGUubGVuZ3RoIC0gMSkge1xuICAgICAgc2FzQ3N2ICs9ICdcXG4nO1xuICAgIH1cbiAgfVxuXG4gIC8vY29udmVydCBzcGVjcyB0byBjc3Ygd2l0aCBwaXBlc1xuICB2YXIgc3BlY1N0cmluZyA9IHNwZWNLZXlzLm1hcChmdW5jdGlvbihrZXkpIHtcbiAgICByZXR1cm4ga2V5ICsgJywnICsgc3BlY3Nba2V5XS5jb2xUeXBlICsgJywnICsgc3BlY3Nba2V5XS5jb2xMZW5ndGg7XG4gIH0pLmpvaW4oJ3wnKTtcblxuICB0aGlzLl9maWxlc1ttYWNyb05hbWVdID0gW1xuICAgIHNwZWNTdHJpbmcsXG4gICAgbmV3IEJsb2IoW3Nhc0Nzdl0sIHt0eXBlOiAndGV4dC9jc3Y7Y2hhcnNldD1VVEYtOCd9KVxuICBdO1xufTtcblxuU2FzRGF0YS5wcm90b3R5cGUuYWRkRmlsZSAgPSBmdW5jdGlvbihmaWxlLCBtYWNyb05hbWUpIHtcbiAgRmlsZXMucHJvdG90eXBlLmFkZC5jYWxsKHRoaXMsIGZpbGUsIG1hY3JvTmFtZSk7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IFNhc0RhdGE7XG4iLCJ2YXIgaDU0c0Vycm9yID0gcmVxdWlyZSgnLi4vZXJyb3IuanMnKTtcblxuLypcbiogaDU0cyB0YWJsZXMgb2JqZWN0IGNvbnN0cnVjdG9yXG4qIEBjb25zdHJ1Y3RvclxuKlxuKkBwYXJhbSB7YXJyYXl9IHRhYmxlIC0gVGFibGUgYWRkZWQgd2hlbiBvYmplY3QgaXMgY3JlYXRlZFxuKkBwYXJhbSB7c3RyaW5nfSBtYWNyb05hbWUgLSBtYWNybyBuYW1lXG4qQHBhcmFtIHtudW1iZXJ9IHBhcmFtZXRlclRocmVzaG9sZCAtIHNpemUgb2YgZGF0YSBvYmplY3RzIHNlbnQgdG8gU0FTXG4qXG4qL1xuZnVuY3Rpb24gVGFibGVzKHRhYmxlLCBtYWNyb05hbWUsIHBhcmFtZXRlclRocmVzaG9sZCkge1xuICB0aGlzLl90YWJsZXMgPSB7fTtcbiAgdGhpcy5fcGFyYW1ldGVyVGhyZXNob2xkID0gcGFyYW1ldGVyVGhyZXNob2xkIHx8IDMwMDAwO1xuXG4gIFRhYmxlcy5wcm90b3R5cGUuYWRkLmNhbGwodGhpcywgdGFibGUsIG1hY3JvTmFtZSk7XG59XG5cbi8qXG4qIEFkZCB0YWJsZSB0byB0YWJsZXMgb2JqZWN0XG4qIEBwYXJhbSB7YXJyYXl9IHRhYmxlIC0gQXJyYXkgb2YgdGFibGUgb2JqZWN0c1xuKiBAcGFyYW0ge3N0cmluZ30gbWFjcm9OYW1lIC0gU2FzIG1hY3JvIG5hbWVcbipcbiovXG5UYWJsZXMucHJvdG90eXBlLmFkZCA9IGZ1bmN0aW9uKHRhYmxlLCBtYWNyb05hbWUpIHtcbiAgaWYodGFibGUgJiYgbWFjcm9OYW1lKSB7XG4gICAgaWYoISh0YWJsZSBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdGaXJzdCBhcmd1bWVudCBtdXN0IGJlIGFycmF5Jyk7XG4gICAgfVxuICAgIGlmKHR5cGVvZiBtYWNyb05hbWUgIT09ICdzdHJpbmcnKSB7XG4gICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1NlY29uZCBhcmd1bWVudCBtdXN0IGJlIHN0cmluZycpO1xuICAgIH1cbiAgICBpZighaXNOYU4obWFjcm9OYW1lW21hY3JvTmFtZS5sZW5ndGggLSAxXSkpIHtcbiAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnTWFjcm8gbmFtZSBjYW5ub3QgaGF2ZSBudW1iZXIgYXQgdGhlIGVuZCcpO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ01pc3NpbmcgYXJndW1lbnRzJyk7XG4gIH1cblxuICB2YXIgcmVzdWx0ID0gdGhpcy5fdXRpbHMuY29udmVydFRhYmxlT2JqZWN0KHRhYmxlLCB0aGlzLl9wYXJhbWV0ZXJUaHJlc2hvbGQpO1xuXG4gIHZhciB0YWJsZUFycmF5ID0gW107XG4gIHRhYmxlQXJyYXkucHVzaChKU09OLnN0cmluZ2lmeShyZXN1bHQuc3BlYykpO1xuICBmb3IgKHZhciBudW1iZXJPZlRhYmxlcyA9IDA7IG51bWJlck9mVGFibGVzIDwgcmVzdWx0LmRhdGEubGVuZ3RoOyBudW1iZXJPZlRhYmxlcysrKSB7XG4gICAgdmFyIG91dFN0cmluZyA9IEpTT04uc3RyaW5naWZ5KHJlc3VsdC5kYXRhW251bWJlck9mVGFibGVzXSk7XG4gICAgdGFibGVBcnJheS5wdXNoKG91dFN0cmluZyk7XG4gIH1cbiAgdGhpcy5fdGFibGVzW21hY3JvTmFtZV0gPSB0YWJsZUFycmF5O1xufTtcblxuVGFibGVzLnByb3RvdHlwZS5fdXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzLmpzJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gVGFibGVzO1xuIiwidmFyIGg1NHNFcnJvciA9IHJlcXVpcmUoJy4uL2Vycm9yLmpzJyk7XG52YXIgbG9ncyA9IHJlcXVpcmUoJy4uL2xvZ3MuanMnKTtcblxuLypcbiogQ29udmVydCB0YWJsZSBvYmplY3QgdG8gU2FzIHJlYWRhYmxlIG9iamVjdFxuKlxuKiBAcGFyYW0ge29iamVjdH0gaW5PYmplY3QgLSBPYmplY3QgdG8gY29udmVydFxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLmNvbnZlcnRUYWJsZU9iamVjdCA9IGZ1bmN0aW9uKGluT2JqZWN0LCBjaHVua1RocmVzaG9sZCkge1xuICB2YXIgc2VsZiAgICAgICAgICAgID0gdGhpcztcblxuICBpZihjaHVua1RocmVzaG9sZCA+IDMwMDAwKSB7XG4gICAgY29uc29sZS53YXJuKCdZb3Ugc2hvdWxkIG5vdCBzZXQgdGhyZXNob2xkIGxhcmdlciB0aGFuIDMwa2IgYmVjYXVzZSBvZiB0aGUgU0FTIGxpbWl0YXRpb25zJyk7XG4gIH1cblxuICAvLyBmaXJzdCBjaGVjayB0aGF0IHRoZSBvYmplY3QgaXMgYW4gYXJyYXlcbiAgaWYgKHR5cGVvZiAoaW5PYmplY3QpICE9PSAnb2JqZWN0Jykge1xuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnVGhlIHBhcmFtZXRlciBwYXNzZWQgdG8gY2hlY2tBbmRHZXRUeXBlT2JqZWN0IGlzIG5vdCBhbiBvYmplY3QnKTtcbiAgfVxuXG4gIHZhciBhcnJheUxlbmd0aCA9IGluT2JqZWN0Lmxlbmd0aDtcbiAgaWYgKHR5cGVvZiAoYXJyYXlMZW5ndGgpICE9PSAnbnVtYmVyJykge1xuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnVGhlIHBhcmFtZXRlciBwYXNzZWQgdG8gY2hlY2tBbmRHZXRUeXBlT2JqZWN0IGRvZXMgbm90IGhhdmUgYSB2YWxpZCBsZW5ndGggYW5kIGlzIG1vc3QgbGlrZWx5IG5vdCBhbiBhcnJheScpO1xuICB9XG5cbiAgdmFyIGV4aXN0aW5nQ29scyA9IHt9OyAvLyB0aGlzIGlzIGp1c3QgdG8gbWFrZSBsb29rdXAgZWFzaWVyIHJhdGhlciB0aGFuIHRyYXZlcnNpbmcgYXJyYXkgZWFjaCB0aW1lLiBXaWxsIHRyYW5zZm9ybSBhZnRlclxuXG4gIC8vIGZ1bmN0aW9uIGNoZWNrQW5kU2V0QXJyYXkgLSB0aGlzIHdpbGwgY2hlY2sgYW4gaW5PYmplY3QgY3VycmVudCBrZXkgYWdhaW5zdCB0aGUgZXhpc3RpbmcgdHlwZUFycmF5IGFuZCBlaXRoZXIgcmV0dXJuIC0xIGlmIHRoZXJlXG4gIC8vIGlzIGEgdHlwZSBtaXNtYXRjaCBvciBhZGQgYW4gZWxlbWVudCBhbmQgdXBkYXRlL2luY3JlbWVudCB0aGUgbGVuZ3RoIGlmIG5lZWRlZFxuXG4gIGZ1bmN0aW9uIGNoZWNrQW5kSW5jcmVtZW50KGNvbFNwZWMpIHtcbiAgICBpZiAodHlwZW9mIChleGlzdGluZ0NvbHNbY29sU3BlYy5jb2xOYW1lXSkgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICBleGlzdGluZ0NvbHNbY29sU3BlYy5jb2xOYW1lXSAgICAgICAgICAgPSB7fTtcbiAgICAgIGV4aXN0aW5nQ29sc1tjb2xTcGVjLmNvbE5hbWVdLmNvbE5hbWUgICA9IGNvbFNwZWMuY29sTmFtZTtcbiAgICAgIGV4aXN0aW5nQ29sc1tjb2xTcGVjLmNvbE5hbWVdLmNvbFR5cGUgICA9IGNvbFNwZWMuY29sVHlwZTtcbiAgICAgIGV4aXN0aW5nQ29sc1tjb2xTcGVjLmNvbE5hbWVdLmNvbExlbmd0aCA9IGNvbFNwZWMuY29sTGVuZ3RoID4gMCA/IGNvbFNwZWMuY29sTGVuZ3RoIDogMTtcbiAgICAgIHJldHVybiAwOyAvLyBhbGwgb2tcbiAgICB9XG4gICAgLy8gY2hlY2sgdHlwZSBtYXRjaFxuICAgIGlmIChleGlzdGluZ0NvbHNbY29sU3BlYy5jb2xOYW1lXS5jb2xUeXBlICE9PSBjb2xTcGVjLmNvbFR5cGUpIHtcbiAgICAgIHJldHVybiAtMTsgLy8gdGhlcmUgaXMgYSBmdWRnZSBpbiB0aGUgdHlwaW5nXG4gICAgfVxuICAgIGlmIChleGlzdGluZ0NvbHNbY29sU3BlYy5jb2xOYW1lXS5jb2xMZW5ndGggPCBjb2xTcGVjLmNvbExlbmd0aCkge1xuICAgICAgZXhpc3RpbmdDb2xzW2NvbFNwZWMuY29sTmFtZV0uY29sTGVuZ3RoID0gY29sU3BlYy5jb2xMZW5ndGggPiAwID8gY29sU3BlYy5jb2xMZW5ndGggOiAxOyAvLyBpbmNyZW1lbnQgdGhlIG1heCBsZW5ndGggb2YgdGhpcyBjb2x1bW5cbiAgICAgIHJldHVybiAwO1xuICAgIH1cbiAgfVxuICB2YXIgY2h1bmtBcnJheUNvdW50ICAgICAgICAgPSAwOyAvLyB0aGlzIGlzIGZvciBrZWVwaW5nIHRhYnMgb24gaG93IGxvbmcgdGhlIGN1cnJlbnQgYXJyYXkgc3RyaW5nIHdvdWxkIGJlXG4gIHZhciB0YXJnZXRBcnJheSAgICAgICAgICAgICA9IFtdOyAvLyB0aGlzIGlzIHRoZSBhcnJheSBvZiB0YXJnZXQgYXJyYXlzXG4gIHZhciBjdXJyZW50VGFyZ2V0ICAgICAgICAgICA9IDA7XG4gIHRhcmdldEFycmF5W2N1cnJlbnRUYXJnZXRdICA9IFtdO1xuICB2YXIgaiAgICAgICAgICAgICAgICAgICAgICAgPSAwO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGluT2JqZWN0Lmxlbmd0aDsgaSsrKSB7XG4gICAgdGFyZ2V0QXJyYXlbY3VycmVudFRhcmdldF1bal0gPSB7fTtcbiAgICB2YXIgY2h1bmtSb3dDb3VudCAgICAgICAgICAgICA9IDA7XG5cbiAgICBmb3IgKHZhciBrZXkgaW4gaW5PYmplY3RbaV0pIHtcbiAgICAgIHZhciB0aGlzU3BlYyAgPSB7fTtcbiAgICAgIHZhciB0aGlzVmFsdWUgPSBpbk9iamVjdFtpXVtrZXldO1xuXG4gICAgICAvL3NraXAgdW5kZWZpbmVkIHZhbHVlc1xuICAgICAgaWYodGhpc1ZhbHVlID09PSB1bmRlZmluZWQgfHwgdGhpc1ZhbHVlID09PSBudWxsKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICAvL3Rocm93IGFuIGVycm9yIGlmIHRoZXJlJ3MgTmFOIHZhbHVlXG4gICAgICBpZih0eXBlb2YgdGhpc1ZhbHVlID09PSAnbnVtYmVyJyAmJiBpc05hTih0aGlzVmFsdWUpKSB7XG4gICAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ3R5cGVFcnJvcicsICdOYU4gdmFsdWUgaW4gb25lIG9mIHRoZSB2YWx1ZXMgKGNvbHVtbnMpIGlzIG5vdCBhbGxvd2VkJyk7XG4gICAgICB9XG5cbiAgICAgIGlmKHRoaXNWYWx1ZSA9PT0gLUluZmluaXR5IHx8IHRoaXNWYWx1ZSA9PT0gSW5maW5pdHkpIHtcbiAgICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcigndHlwZUVycm9yJywgdGhpc1ZhbHVlLnRvU3RyaW5nKCkgKyAnIHZhbHVlIGluIG9uZSBvZiB0aGUgdmFsdWVzIChjb2x1bW5zKSBpcyBub3QgYWxsb3dlZCcpO1xuICAgICAgfVxuXG4gICAgICBpZih0aGlzVmFsdWUgPT09IHRydWUgfHwgdGhpc1ZhbHVlID09PSBmYWxzZSkge1xuICAgICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCd0eXBlRXJyb3InLCAnQm9vbGVhbiB2YWx1ZSBpbiBvbmUgb2YgdGhlIHZhbHVlcyAoY29sdW1ucykgaXMgbm90IGFsbG93ZWQnKTtcbiAgICAgIH1cblxuICAgICAgLy8gZ2V0IHR5cGUuLi4gaWYgaXQgaXMgYW4gb2JqZWN0IHRoZW4gY29udmVydCBpdCB0byBqc29uIGFuZCBzdG9yZSBhcyBhIHN0cmluZ1xuICAgICAgdmFyIHRoaXNUeXBlICA9IHR5cGVvZiAodGhpc1ZhbHVlKTtcblxuICAgICAgaWYgKHRoaXNUeXBlID09PSAnbnVtYmVyJykgeyAvLyBzdHJhaWdodGZvcndhcmQgbnVtYmVyXG4gICAgICAgIGlmKHRoaXNWYWx1ZSA8IE51bWJlci5NSU5fU0FGRV9JTlRFR0VSIHx8IHRoaXNWYWx1ZSA+IE51bWJlci5NQVhfU0FGRV9JTlRFR0VSKSB7XG4gICAgICAgICAgbG9ncy5hZGRBcHBsaWNhdGlvbkxvZygnT2JqZWN0WycgKyBpICsgJ10uJyArIGtleSArICcgLSBUaGlzIHZhbHVlIGV4Y2VlZHMgZXhwZWN0ZWQgbnVtZXJpYyBwcmVjaXNpb24uJyk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpc1NwZWMuY29sTmFtZSAgICAgICAgICAgICAgICAgICAgPSBrZXk7XG4gICAgICAgIHRoaXNTcGVjLmNvbFR5cGUgICAgICAgICAgICAgICAgICAgID0gJ251bSc7XG4gICAgICAgIHRoaXNTcGVjLmNvbExlbmd0aCAgICAgICAgICAgICAgICAgID0gODtcbiAgICAgICAgdGhpc1NwZWMuZW5jb2RlZExlbmd0aCAgICAgICAgICAgICAgPSB0aGlzVmFsdWUudG9TdHJpbmcoKS5sZW5ndGg7XG4gICAgICAgIHRhcmdldEFycmF5W2N1cnJlbnRUYXJnZXRdW2pdW2tleV0gID0gdGhpc1ZhbHVlO1xuICAgICAgfSBlbHNlIGlmICh0aGlzVHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgdGhpc1NwZWMuY29sTmFtZSAgICA9IGtleTtcbiAgICAgICAgdGhpc1NwZWMuY29sVHlwZSAgICA9ICdzdHJpbmcnO1xuICAgICAgICB0aGlzU3BlYy5jb2xMZW5ndGggID0gdGhpc1ZhbHVlLmxlbmd0aDtcblxuICAgICAgICBpZiAodGhpc1ZhbHVlID09PSBcIlwiKSB7XG4gICAgICAgICAgdGFyZ2V0QXJyYXlbY3VycmVudFRhcmdldF1bal1ba2V5XSA9IFwiIFwiO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRhcmdldEFycmF5W2N1cnJlbnRUYXJnZXRdW2pdW2tleV0gPSBlbmNvZGVVUklDb21wb25lbnQodGhpc1ZhbHVlKS5yZXBsYWNlKC8nL2csICclMjcnKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzU3BlYy5lbmNvZGVkTGVuZ3RoID0gdGFyZ2V0QXJyYXlbY3VycmVudFRhcmdldF1bal1ba2V5XS5sZW5ndGg7XG4gICAgICB9IGVsc2UgaWYodGhpc1ZhbHVlIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCd0eXBlRXJyb3InLCAnRGF0ZSB0eXBlIG5vdCBzdXBwb3J0ZWQuIFBsZWFzZSB1c2UgaDU0cy50b1Nhc0RhdGVUaW1lIGZ1bmN0aW9uIHRvIGNvbnZlcnQgaXQnKTtcbiAgICAgIH0gZWxzZSBpZiAodGhpc1R5cGUgPT0gJ29iamVjdCcpIHtcbiAgICAgICAgdGhpc1NwZWMuY29sTmFtZSAgICAgICAgICAgICAgICAgICAgPSBrZXk7XG4gICAgICAgIHRoaXNTcGVjLmNvbFR5cGUgICAgICAgICAgICAgICAgICAgID0gJ2pzb24nO1xuICAgICAgICB0aGlzU3BlYy5jb2xMZW5ndGggICAgICAgICAgICAgICAgICA9IEpTT04uc3RyaW5naWZ5KHRoaXNWYWx1ZSkubGVuZ3RoO1xuICAgICAgICB0YXJnZXRBcnJheVtjdXJyZW50VGFyZ2V0XVtqXVtrZXldICA9IGVuY29kZVVSSUNvbXBvbmVudChKU09OLnN0cmluZ2lmeSh0aGlzVmFsdWUpKS5yZXBsYWNlKC8nL2csICclMjcnKTtcbiAgICAgICAgdGhpc1NwZWMuZW5jb2RlZExlbmd0aCAgICAgICAgICAgICAgPSB0YXJnZXRBcnJheVtjdXJyZW50VGFyZ2V0XVtqXVtrZXldLmxlbmd0aDtcbiAgICAgIH1cblxuICAgICAgY2h1bmtSb3dDb3VudCA9IGNodW5rUm93Q291bnQgKyA2ICsga2V5Lmxlbmd0aCArIHRoaXNTcGVjLmVuY29kZWRMZW5ndGg7XG5cbiAgICAgIGlmIChjaGVja0FuZEluY3JlbWVudCh0aGlzU3BlYykgPT0gLTEpIHtcbiAgICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcigndHlwZUVycm9yJywgJ1RoZXJlIGlzIGEgdHlwZSBtaXNtYXRjaCBpbiB0aGUgYXJyYXkgYmV0d2VlbiB2YWx1ZXMgKGNvbHVtbnMpIG9mIHRoZSBzYW1lIG5hbWUuJyk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy9yZW1vdmUgbGFzdCBhZGRlZCByb3cgaWYgaXQncyBlbXB0eVxuICAgIGlmKE9iamVjdC5rZXlzKHRhcmdldEFycmF5W2N1cnJlbnRUYXJnZXRdW2pdKS5sZW5ndGggPT09IDApIHtcbiAgICAgIHRhcmdldEFycmF5W2N1cnJlbnRUYXJnZXRdLnNwbGljZShqLCAxKTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGlmIChjaHVua1Jvd0NvdW50ID4gY2h1bmtUaHJlc2hvbGQpIHtcbiAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnUm93ICcgKyBqICsgJyBleGNlZWRzIHNpemUgbGltaXQgb2YgMzJrYicpO1xuICAgIH0gZWxzZSBpZihjaHVua0FycmF5Q291bnQgKyBjaHVua1Jvd0NvdW50ID4gY2h1bmtUaHJlc2hvbGQpIHtcbiAgICAgIC8vY3JlYXRlIG5ldyBhcnJheSBpZiB0aGlzIG9uZSBpcyBmdWxsIGFuZCBtb3ZlIHRoZSBsYXN0IGl0ZW0gdG8gdGhlIG5ldyBhcnJheVxuICAgICAgdmFyIGxhc3RSb3cgPSB0YXJnZXRBcnJheVtjdXJyZW50VGFyZ2V0XS5wb3AoKTsgLy8gZ2V0IHJpZCBvZiB0aGF0IGxhc3Qgcm93XG4gICAgICBjdXJyZW50VGFyZ2V0Kys7IC8vIG1vdmUgb250byB0aGUgbmV4dCBhcnJheVxuICAgICAgdGFyZ2V0QXJyYXlbY3VycmVudFRhcmdldF0gID0gW2xhc3RSb3ddOyAvLyBtYWtlIGl0IGFuIGFycmF5XG4gICAgICBqICAgICAgICAgICAgICAgICAgICAgICAgICAgPSAwOyAvLyBpbml0aWFsaXNlIG5ldyByb3cgY291bnRlciBmb3IgbmV3IGFycmF5IC0gaXQgd2lsbCBiZSBpbmNyZW1lbnRlZCBhdCB0aGUgZW5kIG9mIHRoZSBmdW5jdGlvblxuICAgICAgY2h1bmtBcnJheUNvdW50ICAgICAgICAgICAgID0gY2h1bmtSb3dDb3VudDsgLy8gdGhpcyBpcyB0aGUgbmV3IGNodW5rIG1heCBzaXplXG4gICAgfSBlbHNlIHtcbiAgICAgIGNodW5rQXJyYXlDb3VudCA9IGNodW5rQXJyYXlDb3VudCArIGNodW5rUm93Q291bnQ7XG4gICAgfVxuICAgIGorKztcbiAgfVxuXG4gIC8vIHJlZm9ybWF0IGV4aXN0aW5nQ29scyBpbnRvIGFuIGFycmF5IHNvIHNhcyBjYW4gcGFyc2UgaXQ7XG4gIHZhciBzcGVjQXJyYXkgPSBbXTtcbiAgZm9yICh2YXIgayBpbiBleGlzdGluZ0NvbHMpIHtcbiAgICBzcGVjQXJyYXkucHVzaChleGlzdGluZ0NvbHNba10pO1xuICB9XG4gIHJldHVybiB7XG4gICAgc3BlYzogICAgICAgc3BlY0FycmF5LFxuICAgIGRhdGE6ICAgICAgIHRhcmdldEFycmF5LFxuICAgIGpzb25MZW5ndGg6IGNodW5rQXJyYXlDb3VudFxuICB9OyAvLyB0aGUgc3BlYyB3aWxsIGJlIHRoZSBtYWNyb1swXSwgd2l0aCB0aGUgZGF0YSBzcGxpdCBpbnRvIGFycmF5cyBvZiBtYWNyb1sxLW5dXG4gIC8vIG1lYW5zIGluIHRlcm1zIG9mIGRvam8geGhyIG9iamVjdCBhdCBsZWFzdCB0aGV5IG5lZWQgdG8gZ28gaW50byB0aGUgc2FtZSBhcnJheVxufTtcblxuLypcbiogQ29udmVydCBqYXZhc2NyaXB0IGRhdGUgdG8gc2FzIHRpbWVcbipcbiogQHBhcmFtIHtvYmplY3R9IGpzRGF0ZSAtIGphdmFzY3JpcHQgRGF0ZSBvYmplY3RcbipcbiovXG5tb2R1bGUuZXhwb3J0cy50b1Nhc0RhdGVUaW1lID0gZnVuY3Rpb24gKGpzRGF0ZSkge1xuICB2YXIgYmFzZWRhdGUgPSBuZXcgRGF0ZShcIkphbnVhcnkgMSwgMTk2MCAwMDowMDowMFwiKTtcbiAgdmFyIGN1cnJkYXRlID0ganNEYXRlO1xuXG4gIC8vIG9mZnNldHMgZm9yIFVUQyBhbmQgdGltZXpvbmVzIGFuZCBCU1RcbiAgdmFyIGJhc2VPZmZzZXQgPSBiYXNlZGF0ZS5nZXRUaW1lem9uZU9mZnNldCgpOyAvLyBpbiBtaW51dGVzXG4gIHZhciBjdXJyT2Zmc2V0ID0gY3VycmRhdGUuZ2V0VGltZXpvbmVPZmZzZXQoKTsgLy8gaW4gbWludXRlc1xuXG4gIC8vIGNvbnZlcnQgY3VycmRhdGUgdG8gYSBzYXMgZGF0ZXRpbWVcbiAgdmFyIG9mZnNldFNlY3MgICAgPSAoY3Vyck9mZnNldCAtIGJhc2VPZmZzZXQpICogNjA7IC8vIG9mZnNldERpZmYgaXMgaW4gbWludXRlcyB0byBzdGFydCB3aXRoXG4gIHZhciBiYXNlRGF0ZVNlY3MgID0gYmFzZWRhdGUuZ2V0VGltZSgpIC8gMTAwMDsgLy8gZ2V0IHJpZCBvZiBtc1xuICB2YXIgY3VycmRhdGVTZWNzICA9IGN1cnJkYXRlLmdldFRpbWUoKSAvIDEwMDA7IC8vIGdldCByaWQgb2YgbXNcbiAgdmFyIHNhc0RhdGV0aW1lICAgPSBNYXRoLnJvdW5kKGN1cnJkYXRlU2VjcyAtIGJhc2VEYXRlU2VjcyAtIG9mZnNldFNlY3MpOyAvLyBhZGp1c3RcblxuICByZXR1cm4gc2FzRGF0ZXRpbWU7XG59O1xuIl19
