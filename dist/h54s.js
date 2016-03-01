(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.h54s = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/*
* h54s error constructor
* @constructor
*
*@param {string} type - Error type
*@param {string} message - Error message
*
*/
function h54sError(type, message) {
  if(Error.captureStackTrace) {
    Error.captureStackTrace(this);
  }
  this.message = message;
  this.type    = type;
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
  this.maxXhrRetries    = 5;
  this.url              = "/SASStoredProcess/do";
  this.debug            = false;
  this.loginUrl         = '/SASLogon/Logon.do';
  this.retryAfterLogin  = true;
  this.sasApp           = 'Stored Process Web App 9.3';
  this.ajaxTimeout      = 30000;

  this.remoteConfigUpdateCallbacks = [];

  this._pendingCalls    = [];

  this._ajax = require('./methods/ajax.js')();

  _setConfig.call(this, config);

  //override with remote if set
  if(config && config.isRemoteConfig) {
    var self = this;

    this._disableCalls = true;

    // '/base/test/h54sConfig.json' is for the testing with karma
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
      this.hostUrl  = config.hostUrl;
      this.url      = config.hostUrl + this.url;
      this.loginUrl = config.hostUrl + this.loginUrl;
    }

    this._ajax.setTimeout(this.ajaxTimeout);
  }
};

//replaced with gulp
h54s.version = '0.9.0';


h54s.prototype = require('./methods/methods.js');

h54s.Tables = require('./tables/tables.js');

//self invoked function module
require('./ie_polyfills.js');

},{"./error.js":1,"./ie_polyfills.js":3,"./methods/ajax.js":5,"./methods/methods.js":6,"./tables/tables.js":8}],3:[function(require,module,exports){
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

},{}],4:[function(require,module,exports){
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

},{}],5:[function(require,module,exports){
module.exports = function() {
  var timeout = 30000;
  var timeoutHandle;

  var xhr = function(type, url, data) {
    var methods = {
      success: function() {},
      error:   function() {}
    };
    var XHR     = XMLHttpRequest || ActiveXObject;
    var request = new XHR('MSXML2.XMLHTTP.3.0');

    request.open(type, url, true);
    request.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
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
    for(var p in obj)
      if (obj.hasOwnProperty(p)) {
        if(obj[p] instanceof Array) {
          for(var i = 0, n = obj[p].length; i < n; i++) {
            str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p][i]));
          }
        } else {
          str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p]));
        }
      }
    return str.join("&");
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
    post: function(url, data) {
      var dataStr;
      if(typeof data === 'object') {
        dataStr = serialize(data);
      }
      return xhr('POST', url, dataStr);
    },
    setTimeout: function(t) {
      timeout = t;
    }
  };
};

},{}],6:[function(require,module,exports){
var h54sError = require('../error.js');
var logs = require('../logs.js');

/*
* Call Sas program
*
* @param {string} sasProgram - Path of the sas program
* @param {function} callback - Callback function called when ajax call is finished
*
*/
module.exports.call = function(sasProgram, tablesObj, callback, params) {
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

  if(!params) {
    params = {
      _program: this.metadataRoot ? this.metadataRoot.replace(/\/?$/, '/') + sasProgram.replace(/^\//, '') : sasProgram,
      _debug:   this.debug ? 131 : 0,
      _service: 'default',
    };
  }

  if(tablesObj) {
    if(tablesObj instanceof h54s.Tables) {
      for(var key in tablesObj._tables) {
        if(tablesObj._tables.hasOwnProperty(key)) {
          params[key] = tablesObj._tables[key];
        }
      }
    } else {
      throw new h54sError('argumentError', 'Wrong type of tables object');
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

  this._ajax.post(this.url, params).success(function(res) {
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

      try {
        var sasAppMatches = res.responseURL.match(/_sasapp=([^&]*)/);
        self.sasApp = sasAppMatches[1].replace(/\+/g, ' ');
      } catch(e) {
        logs.addApplicationLog('Cannot extract _sasapp parameter from login URL');
      }

      callback(new h54sError('notLoggedinError', 'You are not logged in'));
    } else {
      var resObj, unescapedResObj;
      if(!dbg) {
        try {
          resObj = self._utils.parseRes(res.responseText, sasProgram, params);
          logs.addApplicationLog(resObj.logmessage, sasProgram);

          resObj          = self._utils.convertDates(resObj);
          unescapedResObj = self._utils.unescapeValues(resObj);

          callback(undefined, unescapedResObj);
        } catch(e) {
          if(e instanceof SyntaxError) {
            if(retryCount < self.maxXhrRetries) {
              self._ajax.post(self.url, params).success(this.success).error(this.error);
              retryCount++;
              logs.addApplicationLog("Retrying #" + retryCount, sasProgram);
            } else {
              self._utils.parseErrorResponse(res.responseText, sasProgram);
              self._utils.addFailedResponse(res.responseText, sasProgram);
              callback(new h54sError('parseError', 'Unable to parse response json'));
            }
          } else if(e instanceof h54sError) {
            callback(e);
          } else {
            var err = new h54sError('unknownError', e.message);
            err.stack = e.stack;
            callback(err);
          }
        }
      } else {
        try {
          resObj          = self._utils.parseDebugRes(res.responseText, sasProgram, params);
          logs.addApplicationLog(resObj.logmessage, sasProgram);

          resObj          = self._utils.convertDates(resObj);
          unescapedResObj = self._utils.unescapeValues(resObj);

          callback(undefined, unescapedResObj);
        } catch(e) {
          if(e instanceof SyntaxError) {
            callback(new h54sError('parseError', e.message));
          } else if(e instanceof h54sError) {
            callback(e);
          } else {
            var err = new h54sError('unknownError', e.message);
            err.stack = e.stack;
            callback(err);
          }
        }
      }
    }
  }).error(function(res) {
    logs.addApplicationLog('Request failed with status: ' + res.status, sasProgram);
    callback(new h54sError('httpError', res.statusText));
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
  var self = this;

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

  var loginParams = {
    _sasapp: self.sasApp,
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

  this._ajax.post(this.loginUrl, loginParams).success(function(res) {
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

        self._ajax.post(self.loginUrl, loginParams).success(this.success).error(this.error);
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
        var sasProgram      = pendingCall.sasProgram;
        var callbackPending = pendingCall.callback;
        var params          = pendingCall.params;

        //update debug because it may change in the meantime
        params._debug = self.debug ? 131 : 0;

        if(self.retryAfterLogin) {
          self.call(sasProgram, null, callbackPending, params);
        }
      }
    }
  }).error(function(res) {
    //NOTE: error 502 if sasApp parameter is wrong
    logs.addApplicationLog('Login failed with status code: ' + res.status);
    callback(res.status);
  });
};

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

},{"../error.js":1,"../logs.js":4,"./utils.js":7}],7:[function(require,module,exports){
var logs = require('../logs.js');
var h54sError = require('../error.js');

var programNotFoundPatt = /<title>(Stored Process Error|SASStoredProcess)<\/title>[\s\S]*<h2>Stored process not found:.*<\/h2>/;

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
    throw new h54sError('programNotFound', 'Sas program completed with errors');
  }
  //remove new lines in json response
  return JSON.parse(responseText.replace(/(\r\n|\r|\n)/g, ''));
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
    throw new h54sError('programNotFound', 'Sas program completed with errors');
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
  var jsonObj = JSON.parse(matches[2].replace(/(\r\n|\r|\n)/g, ''));

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
  var patt    = /ERROR(:\s|\s\d\d)(.*\.|.*\n.*\.)/gm;
  var errors  = res.match(patt);
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

/*
* Convert sas timestamps to javascript Date object
*
* @param {object} obj
*
*/
module.exports.convertDates = function(obj) {
  for (var key in obj) {
    if (typeof obj[key] === 'number' && (key.indexOf('dt_') === 0 || key.indexOf('DT_') === 0)) {
      obj[key] = this.fromSasDateTime(obj[key]);
    } else if(typeof obj === 'object') {
      this.convertDates(obj[key]);
    }
  }
  return obj;
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

},{"../error.js":1,"../logs.js":4}],8:[function(require,module,exports){
var h54sError = require('../error.js');

/*
* h54s tables object constructor
* @constructor
*
*@param {array} table - Table added when object is created
*@param {string} message - macro name
*
*/
function Tables(table, macroName) {
  this._tables = {};

  this.add(table, macroName);
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

  var result = this._utils.convertTableObject(table);

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

},{"../error.js":1,"./utils.js":9}],9:[function(require,module,exports){
var h54sError = require('../error.js');
var logs = require('../logs.js');

/*
* Convert table object to Sas readable object
*
* @param {object} inObject - Object to convert
*
*/
module.exports.convertTableObject = function(inObject) {
  var self            = this;
  var chunkThreshold  = 30000; // this goes to 30k for SAS

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
      var isDate = thisValue instanceof Date;
      if (thisType === 'number') { // straightforward number
        if(thisValue < Number.MIN_SAFE_INTEGER || thisValue > Number.MAX_SAFE_INTEGER) {
          logs.addApplicationLog('Object[' + i + '].' + key + ' - This value exceeds expected numeric precision.');
        }
        thisSpec.colName                    = key;
        thisSpec.colType                    = 'num';
        thisSpec.colLength                  = 8;
        thisSpec.encodedLength              = thisValue.toString().length;
        targetArray[currentTarget][j][key]  = thisValue;
      } else if (thisType === 'string' && !isDate) { // straightforward string
        thisSpec.colName    = key;
        thisSpec.colType    = 'string';
        thisSpec.colLength  = thisValue.length;

        if (thisValue === "") {
          targetArray[currentTarget][j][key] = " ";
        } else {
          targetArray[currentTarget][j][key] = encodeURIComponent(thisValue).replace(/'/g, '%27');
        }
        thisSpec.encodedLength = targetArray[currentTarget][j][key].length;
      } else if(isDate) {
        thisSpec.colName                    = key;
        thisSpec.colType                    = 'date';
        thisSpec.colLength                  = 8;
        targetArray[currentTarget][j][key]  = self.toSasDateTime(thisValue);
        thisSpec.encodedLength              = targetArray[currentTarget][j][key].toString().length;
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

},{"../error.js":1,"../logs.js":4}]},{},[2])(2)
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvZXJyb3IuanMiLCJzcmMvaDU0cy5qcyIsInNyYy9pZV9wb2x5ZmlsbHMuanMiLCJzcmMvbG9ncy5qcyIsInNyYy9tZXRob2RzL2FqYXguanMiLCJzcmMvbWV0aG9kcy9tZXRob2RzLmpzIiwic3JjL21ldGhvZHMvdXRpbHMuanMiLCJzcmMvdGFibGVzL3RhYmxlcy5qcyIsInNyYy90YWJsZXMvdXRpbHMuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3SEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeFJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM09BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25EQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiLypcbiogaDU0cyBlcnJvciBjb25zdHJ1Y3RvclxuKiBAY29uc3RydWN0b3JcbipcbipAcGFyYW0ge3N0cmluZ30gdHlwZSAtIEVycm9yIHR5cGVcbipAcGFyYW0ge3N0cmluZ30gbWVzc2FnZSAtIEVycm9yIG1lc3NhZ2VcbipcbiovXG5mdW5jdGlvbiBoNTRzRXJyb3IodHlwZSwgbWVzc2FnZSkge1xuICBpZihFcnJvci5jYXB0dXJlU3RhY2tUcmFjZSkge1xuICAgIEVycm9yLmNhcHR1cmVTdGFja1RyYWNlKHRoaXMpO1xuICB9XG4gIHRoaXMubWVzc2FnZSA9IG1lc3NhZ2U7XG4gIHRoaXMudHlwZSAgICA9IHR5cGU7XG59XG5cbmg1NHNFcnJvci5wcm90b3R5cGUgPSBPYmplY3QuY3JlYXRlKEVycm9yLnByb3RvdHlwZSwge1xuICBjb25zdHJ1Y3Rvcjoge1xuICAgIGNvbmZpZ3VyYWJsZTogZmFsc2UsXG4gICAgZW51bWVyYWJsZTogZmFsc2UsXG4gICAgd3JpdGFibGU6IGZhbHNlLFxuICAgIHZhbHVlOiBoNTRzRXJyb3JcbiAgfSxcbiAgbmFtZToge1xuICAgIGNvbmZpZ3VyYWJsZTogZmFsc2UsXG4gICAgZW51bWVyYWJsZTogZmFsc2UsXG4gICAgd3JpdGFibGU6IGZhbHNlLFxuICAgIHZhbHVlOiAnaDU0c0Vycm9yJ1xuICB9XG59KTtcblxubW9kdWxlLmV4cG9ydHMgPSBoNTRzRXJyb3I7XG4iLCJ2YXIgaDU0c0Vycm9yID0gcmVxdWlyZSgnLi9lcnJvci5qcycpO1xuXG4vKlxuKiBSZXByZXNlbnRzIGh0bWw1IGZvciBzYXMgYWRhcHRlclxuKiBAY29uc3RydWN0b3JcbipcbipAcGFyYW0ge29iamVjdH0gY29uZmlnIC0gYWRhcHRlciBjb25maWcgb2JqZWN0LCB3aXRoIGtleXMgbGlrZSB1cmwsIGRlYnVnLCBldGMuXG4qXG4qL1xudmFyIGg1NHMgPSBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKGNvbmZpZykge1xuXG4gIC8vZGVmYXVsdCBjb25maWcgdmFsdWVzXG4gIHRoaXMubWF4WGhyUmV0cmllcyAgICA9IDU7XG4gIHRoaXMudXJsICAgICAgICAgICAgICA9IFwiL1NBU1N0b3JlZFByb2Nlc3MvZG9cIjtcbiAgdGhpcy5kZWJ1ZyAgICAgICAgICAgID0gZmFsc2U7XG4gIHRoaXMubG9naW5VcmwgICAgICAgICA9ICcvU0FTTG9nb24vTG9nb24uZG8nO1xuICB0aGlzLnJldHJ5QWZ0ZXJMb2dpbiAgPSB0cnVlO1xuICB0aGlzLnNhc0FwcCAgICAgICAgICAgPSAnU3RvcmVkIFByb2Nlc3MgV2ViIEFwcCA5LjMnO1xuICB0aGlzLmFqYXhUaW1lb3V0ICAgICAgPSAzMDAwMDtcblxuICB0aGlzLnJlbW90ZUNvbmZpZ1VwZGF0ZUNhbGxiYWNrcyA9IFtdO1xuXG4gIHRoaXMuX3BlbmRpbmdDYWxscyAgICA9IFtdO1xuXG4gIHRoaXMuX2FqYXggPSByZXF1aXJlKCcuL21ldGhvZHMvYWpheC5qcycpKCk7XG5cbiAgX3NldENvbmZpZy5jYWxsKHRoaXMsIGNvbmZpZyk7XG5cbiAgLy9vdmVycmlkZSB3aXRoIHJlbW90ZSBpZiBzZXRcbiAgaWYoY29uZmlnICYmIGNvbmZpZy5pc1JlbW90ZUNvbmZpZykge1xuICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgIHRoaXMuX2Rpc2FibGVDYWxscyA9IHRydWU7XG5cbiAgICAvLyAnL2Jhc2UvdGVzdC9oNTRzQ29uZmlnLmpzb24nIGlzIGZvciB0aGUgdGVzdGluZyB3aXRoIGthcm1hXG4gICAgLy9yZXBsYWNlZCB3aXRoIGd1bHAgaW4gZGV2IGJ1aWxkXG4gICAgdGhpcy5fYWpheC5nZXQoJy9iYXNlL3Rlc3QvaDU0c0NvbmZpZy5qc29uJykuc3VjY2VzcyhmdW5jdGlvbihyZXMpIHtcbiAgICAgIHZhciByZW1vdGVDb25maWcgPSBKU09OLnBhcnNlKHJlcy5yZXNwb25zZVRleHQpO1xuXG4gICAgICBmb3IodmFyIGtleSBpbiByZW1vdGVDb25maWcpIHtcbiAgICAgICAgaWYocmVtb3RlQ29uZmlnLmhhc093blByb3BlcnR5KGtleSkgJiYgY29uZmlnW2tleV0gPT09IHVuZGVmaW5lZCAmJiBrZXkgIT09ICdpc1JlbW90ZUNvbmZpZycpIHtcbiAgICAgICAgICBjb25maWdba2V5XSA9IHJlbW90ZUNvbmZpZ1trZXldO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIF9zZXRDb25maWcuY2FsbChzZWxmLCBjb25maWcpO1xuXG4gICAgICAvL2V4ZWN1dGUgY2FsbGJhY2tzIHdoZW4gd2UgaGF2ZSByZW1vdGUgY29uZmlnXG4gICAgICAvL25vdGUgdGhhdCByZW1vdGUgY29uaWZnIGlzIG1lcmdlZCB3aXRoIGluc3RhbmNlIGNvbmZpZ1xuICAgICAgZm9yKHZhciBpID0gMCwgbiA9IHNlbGYucmVtb3RlQ29uZmlnVXBkYXRlQ2FsbGJhY2tzLmxlbmd0aDsgaSA8IG47IGkrKykge1xuICAgICAgICB2YXIgZm4gPSBzZWxmLnJlbW90ZUNvbmZpZ1VwZGF0ZUNhbGxiYWNrc1tpXTtcbiAgICAgICAgZm4oKTtcbiAgICAgIH1cblxuICAgICAgLy9leGVjdXRlIHNhcyBjYWxscyBkaXNhYmxlZCB3aGlsZSB3YWl0aW5nIGZvciB0aGUgY29uZmlnXG4gICAgICBzZWxmLl9kaXNhYmxlQ2FsbHMgPSBmYWxzZTtcbiAgICAgIHdoaWxlKHNlbGYuX3BlbmRpbmdDYWxscy5sZW5ndGggPiAwKSB7XG4gICAgICAgIHZhciBwZW5kaW5nQ2FsbCA9IHNlbGYuX3BlbmRpbmdDYWxscy5zaGlmdCgpO1xuICAgICAgICB2YXIgc2FzUHJvZ3JhbSAgPSBwZW5kaW5nQ2FsbC5zYXNQcm9ncmFtO1xuICAgICAgICB2YXIgY2FsbGJhY2sgICAgPSBwZW5kaW5nQ2FsbC5jYWxsYmFjaztcbiAgICAgICAgdmFyIHBhcmFtcyAgICAgID0gcGVuZGluZ0NhbGwucGFyYW1zO1xuXG4gICAgICAgIC8vdXBkYXRlIHByb2dyYW0gd2l0aCBtZXRhZGF0YVJvb3QgaWYgaXQncyBub3Qgc2V0XG4gICAgICAgIGlmKHNlbGYubWV0YWRhdGFSb290ICYmIHBlbmRpbmdDYWxsLnBhcmFtcy5fcHJvZ3JhbS5pbmRleE9mKHNlbGYubWV0YWRhdGFSb290KSA9PT0gLTEpIHtcbiAgICAgICAgICBwZW5kaW5nQ2FsbC5wYXJhbXMuX3Byb2dyYW0gPSBzZWxmLm1ldGFkYXRhUm9vdC5yZXBsYWNlKC9cXC8/JC8sICcvJykgKyBwZW5kaW5nQ2FsbC5wYXJhbXMuX3Byb2dyYW0ucmVwbGFjZSgvXlxcLy8sICcnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vdXBkYXRlIGRlYnVnIGJlY2F1c2UgaXQgbWF5IGNoYW5nZSBpbiB0aGUgbWVhbnRpbWVcbiAgICAgICAgcGFyYW1zLl9kZWJ1ZyA9IHNlbGYuZGVidWcgPyAxMzEgOiAwO1xuXG4gICAgICAgIHNlbGYuY2FsbChzYXNQcm9ncmFtLCBudWxsLCBjYWxsYmFjaywgcGFyYW1zKTtcbiAgICAgIH1cbiAgICB9KS5lcnJvcihmdW5jdGlvbiAoZXJyKSB7XG4gICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhamF4RXJyb3InLCAnUmVtb3RlIGNvbmZpZyBmaWxlIGNhbm5vdCBiZSBsb2FkZWQuIEh0dHAgc3RhdHVzIGNvZGU6ICcgKyBlcnIuc3RhdHVzKTtcbiAgICB9KTtcbiAgfVxuXG4gIC8vIHByaXZhdGUgZnVuY3Rpb24gdG8gc2V0IGg1NHMgaW5zdGFuY2UgcHJvcGVydGllc1xuICBmdW5jdGlvbiBfc2V0Q29uZmlnKGNvbmZpZykge1xuICAgIGlmKCFjb25maWcpIHtcbiAgICAgIHRoaXMuX2FqYXguc2V0VGltZW91dCh0aGlzLmFqYXhUaW1lb3V0KTtcbiAgICAgIHJldHVybjtcbiAgICB9IGVsc2UgaWYodHlwZW9mIGNvbmZpZyAhPT0gJ29iamVjdCcpIHtcbiAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnRmlyc3QgcGFyYW1ldGVyIHNob3VsZCBiZSBjb25maWcgb2JqZWN0Jyk7XG4gICAgfVxuXG4gICAgLy9tZXJnZSBjb25maWcgb2JqZWN0IGZyb20gcGFyYW1ldGVyIHdpdGggdGhpc1xuICAgIGZvcih2YXIga2V5IGluIGNvbmZpZykge1xuICAgICAgaWYoY29uZmlnLmhhc093blByb3BlcnR5KGtleSkpIHtcbiAgICAgICAgaWYoKGtleSA9PT0gJ3VybCcgfHwga2V5ID09PSAnbG9naW5VcmwnKSAmJiBjb25maWdba2V5XS5jaGFyQXQoMCkgIT09ICcvJykge1xuICAgICAgICAgIGNvbmZpZ1trZXldID0gJy8nICsgY29uZmlnW2tleV07XG4gICAgICAgIH1cbiAgICAgICAgdGhpc1trZXldID0gY29uZmlnW2tleV07XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy9pZiBzZXJ2ZXIgaXMgcmVtb3RlIHVzZSB0aGUgZnVsbCBzZXJ2ZXIgdXJsXG4gICAgLy9OT1RFOiB0aGlzIGlzIG5vdCBwZXJtaXRlZCBieSB0aGUgc2FtZS1vcmlnaW4gcG9saWN5XG4gICAgaWYoY29uZmlnLmhvc3RVcmwpIHtcbiAgICAgIGlmKGNvbmZpZy5ob3N0VXJsLmNoYXJBdChjb25maWcuaG9zdFVybC5sZW5ndGggLSAxKSA9PT0gJy8nKSB7XG4gICAgICAgIGNvbmZpZy5ob3N0VXJsID0gY29uZmlnLmhvc3RVcmwuc2xpY2UoMCwgLTEpO1xuICAgICAgfVxuICAgICAgdGhpcy5ob3N0VXJsICA9IGNvbmZpZy5ob3N0VXJsO1xuICAgICAgdGhpcy51cmwgICAgICA9IGNvbmZpZy5ob3N0VXJsICsgdGhpcy51cmw7XG4gICAgICB0aGlzLmxvZ2luVXJsID0gY29uZmlnLmhvc3RVcmwgKyB0aGlzLmxvZ2luVXJsO1xuICAgIH1cblxuICAgIHRoaXMuX2FqYXguc2V0VGltZW91dCh0aGlzLmFqYXhUaW1lb3V0KTtcbiAgfVxufTtcblxuLy9yZXBsYWNlZCB3aXRoIGd1bHBcbmg1NHMudmVyc2lvbiA9ICdfX3ZlcnNpb25fXyc7XG5cblxuaDU0cy5wcm90b3R5cGUgPSByZXF1aXJlKCcuL21ldGhvZHMvbWV0aG9kcy5qcycpO1xuXG5oNTRzLlRhYmxlcyA9IHJlcXVpcmUoJy4vdGFibGVzL3RhYmxlcy5qcycpO1xuXG4vL3NlbGYgaW52b2tlZCBmdW5jdGlvbiBtb2R1bGVcbnJlcXVpcmUoJy4vaWVfcG9seWZpbGxzLmpzJyk7XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xuICBpZiAoIU9iamVjdC5jcmVhdGUpIHtcbiAgICBPYmplY3QuY3JlYXRlID0gZnVuY3Rpb24ocHJvdG8sIHByb3BzKSB7XG4gICAgICBpZiAodHlwZW9mIHByb3BzICE9PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgICAgIHRocm93IFwiVGhlIG11bHRpcGxlLWFyZ3VtZW50IHZlcnNpb24gb2YgT2JqZWN0LmNyZWF0ZSBpcyBub3QgcHJvdmlkZWQgYnkgdGhpcyBicm93c2VyIGFuZCBjYW5ub3QgYmUgc2hpbW1lZC5cIjtcbiAgICAgIH1cbiAgICAgIGZ1bmN0aW9uIGN0b3IoKSB7IH1cbiAgICAgIGN0b3IucHJvdG90eXBlID0gcHJvdG87XG4gICAgICByZXR1cm4gbmV3IGN0b3IoKTtcbiAgICB9O1xuICB9XG5cblxuICAvLyBGcm9tIGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0phdmFTY3JpcHQvUmVmZXJlbmNlL0dsb2JhbF9PYmplY3RzL09iamVjdC9rZXlzXG4gIGlmICghT2JqZWN0LmtleXMpIHtcbiAgICBPYmplY3Qua2V5cyA9IChmdW5jdGlvbiAoKSB7XG4gICAgICAndXNlIHN0cmljdCc7XG4gICAgICB2YXIgaGFzT3duUHJvcGVydHkgPSBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LFxuICAgICAgICAgIGhhc0RvbnRFbnVtQnVnID0gISh7dG9TdHJpbmc6IG51bGx9KS5wcm9wZXJ0eUlzRW51bWVyYWJsZSgndG9TdHJpbmcnKSxcbiAgICAgICAgICBkb250RW51bXMgPSBbXG4gICAgICAgICAgICAndG9TdHJpbmcnLFxuICAgICAgICAgICAgJ3RvTG9jYWxlU3RyaW5nJyxcbiAgICAgICAgICAgICd2YWx1ZU9mJyxcbiAgICAgICAgICAgICdoYXNPd25Qcm9wZXJ0eScsXG4gICAgICAgICAgICAnaXNQcm90b3R5cGVPZicsXG4gICAgICAgICAgICAncHJvcGVydHlJc0VudW1lcmFibGUnLFxuICAgICAgICAgICAgJ2NvbnN0cnVjdG9yJ1xuICAgICAgICAgIF0sXG4gICAgICAgICAgZG9udEVudW1zTGVuZ3RoID0gZG9udEVudW1zLmxlbmd0aDtcblxuICAgICAgcmV0dXJuIGZ1bmN0aW9uIChvYmopIHtcbiAgICAgICAgaWYgKHR5cGVvZiBvYmogIT09ICdvYmplY3QnICYmICh0eXBlb2Ygb2JqICE9PSAnZnVuY3Rpb24nIHx8IG9iaiA9PT0gbnVsbCkpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdPYmplY3Qua2V5cyBjYWxsZWQgb24gbm9uLW9iamVjdCcpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHJlc3VsdCA9IFtdLCBwcm9wLCBpO1xuXG4gICAgICAgIGZvciAocHJvcCBpbiBvYmopIHtcbiAgICAgICAgICBpZiAoaGFzT3duUHJvcGVydHkuY2FsbChvYmosIHByb3ApKSB7XG4gICAgICAgICAgICByZXN1bHQucHVzaChwcm9wKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoaGFzRG9udEVudW1CdWcpIHtcbiAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgZG9udEVudW1zTGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGlmIChoYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwgZG9udEVudW1zW2ldKSkge1xuICAgICAgICAgICAgICByZXN1bHQucHVzaChkb250RW51bXNbaV0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgfTtcbiAgICB9KCkpO1xuICB9XG5cbiAgLy8gRnJvbSBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9KYXZhU2NyaXB0L1JlZmVyZW5jZS9HbG9iYWxfT2JqZWN0cy9BcnJheS9sYXN0SW5kZXhPZlxuICBpZiAoIUFycmF5LnByb3RvdHlwZS5sYXN0SW5kZXhPZikge1xuICAgIEFycmF5LnByb3RvdHlwZS5sYXN0SW5kZXhPZiA9IGZ1bmN0aW9uKHNlYXJjaEVsZW1lbnQgLyosIGZyb21JbmRleCovKSB7XG4gICAgICAndXNlIHN0cmljdCc7XG5cbiAgICAgIGlmICh0aGlzID09PSB2b2lkIDAgfHwgdGhpcyA9PT0gbnVsbCkge1xuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCk7XG4gICAgICB9XG5cbiAgICAgIHZhciBuLCBrLFxuICAgICAgICB0ID0gT2JqZWN0KHRoaXMpLFxuICAgICAgICBsZW4gPSB0Lmxlbmd0aCA+Pj4gMDtcbiAgICAgIGlmIChsZW4gPT09IDApIHtcbiAgICAgICAgcmV0dXJuIC0xO1xuICAgICAgfVxuXG4gICAgICBuID0gbGVuIC0gMTtcbiAgICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID4gMSkge1xuICAgICAgICBuID0gTnVtYmVyKGFyZ3VtZW50c1sxXSk7XG4gICAgICAgIGlmIChuICE9IG4pIHtcbiAgICAgICAgICBuID0gMDtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChuICE9PSAwICYmIG4gIT0gKDEgLyAwKSAmJiBuICE9IC0oMSAvIDApKSB7XG4gICAgICAgICAgbiA9IChuID4gMCB8fCAtMSkgKiBNYXRoLmZsb29yKE1hdGguYWJzKG4pKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBmb3IgKGsgPSBuID49IDAgPyBNYXRoLm1pbihuLCBsZW4gLSAxKSA6IGxlbiAtIE1hdGguYWJzKG4pOyBrID49IDA7IGstLSkge1xuICAgICAgICBpZiAoayBpbiB0ICYmIHRba10gPT09IHNlYXJjaEVsZW1lbnQpIHtcbiAgICAgICAgICByZXR1cm4gaztcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIC0xO1xuICAgIH07XG4gIH1cbn0oKTtcbiIsInZhciBsb2dzID0ge1xuICBhcHBsaWNhdGlvbkxvZ3M6IFtdLFxuICBkZWJ1Z0RhdGE6IFtdLFxuICBzYXNFcnJvcnM6IFtdLFxuICBmYWlsZWRSZXF1ZXN0czogW11cbn07XG5cbnZhciBsaW1pdHMgPSB7XG4gIGFwcGxpY2F0aW9uTG9nczogMTAwLFxuICBkZWJ1Z0RhdGE6IDIwLFxuICBmYWlsZWRSZXF1ZXN0czogMjAsXG4gIHNhc0Vycm9yczogMTAwXG59O1xuXG5tb2R1bGUuZXhwb3J0cy5nZXQgPSB7XG4gIGdldFNhc0Vycm9yczogZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIGxvZ3Muc2FzRXJyb3JzO1xuICB9LFxuICBnZXRBcHBsaWNhdGlvbkxvZ3M6IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiBsb2dzLmFwcGxpY2F0aW9uTG9ncztcbiAgfSxcbiAgZ2V0RGVidWdEYXRhOiBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gbG9ncy5kZWJ1Z0RhdGE7XG4gIH0sXG4gIGdldEZhaWxlZFJlcXVlc3RzOiBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gbG9ncy5mYWlsZWRSZXF1ZXN0cztcbiAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMuY2xlYXIgPSB7XG4gIGNsZWFyQXBwbGljYXRpb25Mb2dzOiBmdW5jdGlvbigpIHtcbiAgICBsb2dzLmFwcGxpY2F0aW9uTG9ncy5zcGxpY2UoMCwgbG9ncy5hcHBsaWNhdGlvbkxvZ3MubGVuZ3RoKTtcbiAgfSxcbiAgY2xlYXJEZWJ1Z0RhdGE6IGZ1bmN0aW9uKCkge1xuICAgIGxvZ3MuZGVidWdEYXRhLnNwbGljZSgwLCBsb2dzLmRlYnVnRGF0YS5sZW5ndGgpO1xuICB9LFxuICBjbGVhclNhc0Vycm9yczogZnVuY3Rpb24oKSB7XG4gICAgbG9ncy5zYXNFcnJvcnMuc3BsaWNlKDAsIGxvZ3Muc2FzRXJyb3JzLmxlbmd0aCk7XG4gIH0sXG4gIGNsZWFyRmFpbGVkUmVxdWVzdHM6IGZ1bmN0aW9uKCkge1xuICAgIGxvZ3MuZmFpbGVkUmVxdWVzdHMuc3BsaWNlKDAsIGxvZ3MuZmFpbGVkUmVxdWVzdHMubGVuZ3RoKTtcbiAgfSxcbiAgY2xlYXJBbGxMb2dzOiBmdW5jdGlvbigpIHtcbiAgICB0aGlzLmNsZWFyQXBwbGljYXRpb25Mb2dzKCk7XG4gICAgdGhpcy5jbGVhckRlYnVnRGF0YSgpO1xuICAgIHRoaXMuY2xlYXJTYXNFcnJvcnMoKTtcbiAgICB0aGlzLmNsZWFyRmFpbGVkUmVxdWVzdHMoKTtcbiAgfVxufTtcblxuLypcbiogQWRkcyBhcHBsaWNhdGlvbiBsb2dzIHRvIGFuIGFycmF5IG9mIGxvZ3NcbipcbiogQHBhcmFtIHtzdHJpbmd9IHJlcyAtIHNlcnZlciByZXNwb25zZVxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLmFkZEFwcGxpY2F0aW9uTG9nID0gZnVuY3Rpb24obWVzc2FnZSwgc2FzUHJvZ3JhbSkge1xuICBpZihtZXNzYWdlID09PSAnYmxhbmsnKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHZhciBsb2cgPSB7XG4gICAgbWVzc2FnZTogICAgbWVzc2FnZSxcbiAgICB0aW1lOiAgICAgICBuZXcgRGF0ZSgpLFxuICAgIHNhc1Byb2dyYW06IHNhc1Byb2dyYW1cbiAgfTtcbiAgbG9ncy5hcHBsaWNhdGlvbkxvZ3MucHVzaChsb2cpO1xuXG4gIGlmKGxvZ3MuYXBwbGljYXRpb25Mb2dzLmxlbmd0aCA+IGxpbWl0cy5hcHBsaWNhdGlvbkxvZ3MpIHtcbiAgICBsb2dzLmFwcGxpY2F0aW9uTG9ncy5zaGlmdCgpO1xuICB9XG59O1xuXG4vKlxuKiBBZGRzIGRlYnVnIGRhdGEgdG8gYW4gYXJyYXkgb2YgbG9nc1xuKlxuKiBAcGFyYW0ge3N0cmluZ30gcmVzIC0gc2VydmVyIHJlc3BvbnNlXG4qXG4qL1xubW9kdWxlLmV4cG9ydHMuYWRkRGVidWdEYXRhID0gZnVuY3Rpb24oaHRtbERhdGEsIGRlYnVnVGV4dCwgc2FzUHJvZ3JhbSwgcGFyYW1zKSB7XG4gIGxvZ3MuZGVidWdEYXRhLnB1c2goe1xuICAgIGRlYnVnSHRtbDogIGh0bWxEYXRhLFxuICAgIGRlYnVnVGV4dDogIGRlYnVnVGV4dCxcbiAgICBzYXNQcm9ncmFtOiBzYXNQcm9ncmFtLFxuICAgIHBhcmFtczogICAgIHBhcmFtcyxcbiAgICB0aW1lOiAgICAgICBuZXcgRGF0ZSgpXG4gIH0pO1xuXG4gIGlmKGxvZ3MuZGVidWdEYXRhLmxlbmd0aCA+IGxpbWl0cy5kZWJ1Z0RhdGEpIHtcbiAgICBsb2dzLmRlYnVnRGF0YS5zaGlmdCgpO1xuICB9XG59O1xuXG4vKlxuKiBBZGRzIGZhaWxlZCByZXF1ZXN0cyB0byBhbiBhcnJheSBvZiBsb2dzXG4qXG4qIEBwYXJhbSB7c3RyaW5nfSByZXMgLSBzZXJ2ZXIgcmVzcG9uc2VcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5hZGRGYWlsZWRSZXF1ZXN0ID0gZnVuY3Rpb24ocmVzcG9uc2VUZXh0LCBkZWJ1Z1RleHQsIHNhc1Byb2dyYW0pIHtcbiAgbG9ncy5mYWlsZWRSZXF1ZXN0cy5wdXNoKHtcbiAgICByZXNwb25zZUh0bWw6IHJlc3BvbnNlVGV4dCxcbiAgICByZXNwb25zZVRleHQ6IGRlYnVnVGV4dCxcbiAgICBzYXNQcm9ncmFtOiAgIHNhc1Byb2dyYW0sXG4gICAgdGltZTogICAgICAgICBuZXcgRGF0ZSgpXG4gIH0pO1xuXG4gIC8vbWF4IDIwIGZhaWxlZCByZXF1ZXN0c1xuICBpZihsb2dzLmZhaWxlZFJlcXVlc3RzLmxlbmd0aCA+IGxpbWl0cy5mYWlsZWRSZXF1ZXN0cykge1xuICAgIGxvZ3MuZmFpbGVkUmVxdWVzdHMuc2hpZnQoKTtcbiAgfVxufTtcblxuLypcbiogQWRkcyBTQVMgZXJyb3JzIHRvIGFuIGFycmF5IG9mIGxvZ3NcbipcbiogQHBhcmFtIHtzdHJpbmd9IHJlcyAtIHNlcnZlciByZXNwb25zZVxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLmFkZFNhc0Vycm9ycyA9IGZ1bmN0aW9uKGVycm9ycykge1xuICBsb2dzLnNhc0Vycm9ycyA9IGxvZ3Muc2FzRXJyb3JzLmNvbmNhdChlcnJvcnMpO1xuXG4gIHdoaWxlKGxvZ3Muc2FzRXJyb3JzLmxlbmd0aCA+IGxpbWl0cy5zYXNFcnJvcnMpIHtcbiAgICBsb2dzLnNhc0Vycm9ycy5zaGlmdCgpO1xuICB9XG59O1xuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbigpIHtcbiAgdmFyIHRpbWVvdXQgPSAzMDAwMDtcbiAgdmFyIHRpbWVvdXRIYW5kbGU7XG5cbiAgdmFyIHhociA9IGZ1bmN0aW9uKHR5cGUsIHVybCwgZGF0YSkge1xuICAgIHZhciBtZXRob2RzID0ge1xuICAgICAgc3VjY2VzczogZnVuY3Rpb24oKSB7fSxcbiAgICAgIGVycm9yOiAgIGZ1bmN0aW9uKCkge31cbiAgICB9O1xuICAgIHZhciBYSFIgICAgID0gWE1MSHR0cFJlcXVlc3QgfHwgQWN0aXZlWE9iamVjdDtcbiAgICB2YXIgcmVxdWVzdCA9IG5ldyBYSFIoJ01TWE1MMi5YTUxIVFRQLjMuMCcpO1xuXG4gICAgcmVxdWVzdC5vcGVuKHR5cGUsIHVybCwgdHJ1ZSk7XG4gICAgcmVxdWVzdC5zZXRSZXF1ZXN0SGVhZGVyKCdDb250ZW50LXR5cGUnLCAnYXBwbGljYXRpb24veC13d3ctZm9ybS11cmxlbmNvZGVkJyk7XG4gICAgcmVxdWVzdC5vbnJlYWR5c3RhdGVjaGFuZ2UgPSBmdW5jdGlvbiAoKSB7XG4gICAgICBpZiAocmVxdWVzdC5yZWFkeVN0YXRlID09PSA0KSB7XG4gICAgICAgIGNsZWFyVGltZW91dCh0aW1lb3V0SGFuZGxlKTtcbiAgICAgICAgaWYgKHJlcXVlc3Quc3RhdHVzID49IDIwMCAmJiByZXF1ZXN0LnN0YXR1cyA8IDMwMCkge1xuICAgICAgICAgIG1ldGhvZHMuc3VjY2Vzcy5jYWxsKG1ldGhvZHMsIHJlcXVlc3QpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIG1ldGhvZHMuZXJyb3IuY2FsbChtZXRob2RzLCByZXF1ZXN0KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH07XG5cbiAgICBpZih0aW1lb3V0ID4gMCkge1xuICAgICAgdGltZW91dEhhbmRsZSA9IHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICAgIHJlcXVlc3QuYWJvcnQoKTtcbiAgICAgIH0sIHRpbWVvdXQpO1xuICAgIH1cblxuICAgIHJlcXVlc3Quc2VuZChkYXRhKTtcblxuICAgIHJldHVybiB7XG4gICAgICBzdWNjZXNzOiBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgbWV0aG9kcy5zdWNjZXNzID0gY2FsbGJhY2s7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgfSxcbiAgICAgIGVycm9yOiBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgbWV0aG9kcy5lcnJvciA9IGNhbGxiYWNrO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgIH1cbiAgICB9O1xuICB9O1xuXG4gIHZhciBzZXJpYWxpemUgPSBmdW5jdGlvbihvYmopIHtcbiAgICB2YXIgc3RyID0gW107XG4gICAgZm9yKHZhciBwIGluIG9iailcbiAgICAgIGlmIChvYmouaGFzT3duUHJvcGVydHkocCkpIHtcbiAgICAgICAgaWYob2JqW3BdIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgICAgICBmb3IodmFyIGkgPSAwLCBuID0gb2JqW3BdLmxlbmd0aDsgaSA8IG47IGkrKykge1xuICAgICAgICAgICAgc3RyLnB1c2goZW5jb2RlVVJJQ29tcG9uZW50KHApICsgXCI9XCIgKyBlbmNvZGVVUklDb21wb25lbnQob2JqW3BdW2ldKSk7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHN0ci5wdXNoKGVuY29kZVVSSUNvbXBvbmVudChwKSArIFwiPVwiICsgZW5jb2RlVVJJQ29tcG9uZW50KG9ialtwXSkpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgcmV0dXJuIHN0ci5qb2luKFwiJlwiKTtcbiAgfTtcblxuICByZXR1cm4ge1xuICAgIGdldDogZnVuY3Rpb24odXJsLCBkYXRhKSB7XG4gICAgICB2YXIgZGF0YVN0cjtcbiAgICAgIGlmKHR5cGVvZiBkYXRhID09PSAnb2JqZWN0Jykge1xuICAgICAgICBkYXRhU3RyID0gc2VyaWFsaXplKGRhdGEpO1xuICAgICAgfVxuICAgICAgdmFyIHVybFdpdGhQYXJhbXMgPSBkYXRhU3RyID8gKHVybCArICc/JyArIGRhdGFTdHIpIDogdXJsO1xuICAgICAgcmV0dXJuIHhocignR0VUJywgdXJsV2l0aFBhcmFtcyk7XG4gICAgfSxcbiAgICBwb3N0OiBmdW5jdGlvbih1cmwsIGRhdGEpIHtcbiAgICAgIHZhciBkYXRhU3RyO1xuICAgICAgaWYodHlwZW9mIGRhdGEgPT09ICdvYmplY3QnKSB7XG4gICAgICAgIGRhdGFTdHIgPSBzZXJpYWxpemUoZGF0YSk7XG4gICAgICB9XG4gICAgICByZXR1cm4geGhyKCdQT1NUJywgdXJsLCBkYXRhU3RyKTtcbiAgICB9LFxuICAgIHNldFRpbWVvdXQ6IGZ1bmN0aW9uKHQpIHtcbiAgICAgIHRpbWVvdXQgPSB0O1xuICAgIH1cbiAgfTtcbn07XG4iLCJ2YXIgaDU0c0Vycm9yID0gcmVxdWlyZSgnLi4vZXJyb3IuanMnKTtcbnZhciBsb2dzID0gcmVxdWlyZSgnLi4vbG9ncy5qcycpO1xuXG4vKlxuKiBDYWxsIFNhcyBwcm9ncmFtXG4qXG4qIEBwYXJhbSB7c3RyaW5nfSBzYXNQcm9ncmFtIC0gUGF0aCBvZiB0aGUgc2FzIHByb2dyYW1cbiogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgLSBDYWxsYmFjayBmdW5jdGlvbiBjYWxsZWQgd2hlbiBhamF4IGNhbGwgaXMgZmluaXNoZWRcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5jYWxsID0gZnVuY3Rpb24oc2FzUHJvZ3JhbSwgdGFibGVzT2JqLCBjYWxsYmFjaywgcGFyYW1zKSB7XG4gIHZhciBzZWxmICAgICAgICA9IHRoaXM7XG4gIHZhciByZXRyeUNvdW50ICA9IDA7XG4gIHZhciBkYmcgICAgICAgICA9IHRoaXMuZGVidWc7XG5cbiAgaWYgKCFjYWxsYmFjayB8fCB0eXBlb2YgY2FsbGJhY2sgIT09ICdmdW5jdGlvbicpe1xuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnWW91IG11c3QgcHJvdmlkZSBjYWxsYmFjaycpO1xuICB9XG4gIGlmKCFzYXNQcm9ncmFtKSB7XG4gICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdZb3UgbXVzdCBwcm92aWRlIFNhcyBwcm9ncmFtIGZpbGUgcGF0aCcpO1xuICB9XG4gIGlmKHR5cGVvZiBzYXNQcm9ncmFtICE9PSAnc3RyaW5nJykge1xuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnRmlyc3QgcGFyYW1ldGVyIHNob3VsZCBiZSBzdHJpbmcnKTtcbiAgfVxuXG4gIGlmKCFwYXJhbXMpIHtcbiAgICBwYXJhbXMgPSB7XG4gICAgICBfcHJvZ3JhbTogdGhpcy5tZXRhZGF0YVJvb3QgPyB0aGlzLm1ldGFkYXRhUm9vdC5yZXBsYWNlKC9cXC8/JC8sICcvJykgKyBzYXNQcm9ncmFtLnJlcGxhY2UoL15cXC8vLCAnJykgOiBzYXNQcm9ncmFtLFxuICAgICAgX2RlYnVnOiAgIHRoaXMuZGVidWcgPyAxMzEgOiAwLFxuICAgICAgX3NlcnZpY2U6ICdkZWZhdWx0JyxcbiAgICB9O1xuICB9XG5cbiAgaWYodGFibGVzT2JqKSB7XG4gICAgaWYodGFibGVzT2JqIGluc3RhbmNlb2YgaDU0cy5UYWJsZXMpIHtcbiAgICAgIGZvcih2YXIga2V5IGluIHRhYmxlc09iai5fdGFibGVzKSB7XG4gICAgICAgIGlmKHRhYmxlc09iai5fdGFibGVzLmhhc093blByb3BlcnR5KGtleSkpIHtcbiAgICAgICAgICBwYXJhbXNba2V5XSA9IHRhYmxlc09iai5fdGFibGVzW2tleV07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdXcm9uZyB0eXBlIG9mIHRhYmxlcyBvYmplY3QnKTtcbiAgICB9XG4gIH1cblxuICBpZih0aGlzLl9kaXNhYmxlQ2FsbHMpIHtcbiAgICB0aGlzLl9wZW5kaW5nQ2FsbHMucHVzaCh7XG4gICAgICBzYXNQcm9ncmFtOiBzYXNQcm9ncmFtLFxuICAgICAgY2FsbGJhY2s6ICAgY2FsbGJhY2ssXG4gICAgICBwYXJhbXM6ICAgICBwYXJhbXNcbiAgICB9KTtcbiAgICByZXR1cm47XG4gIH1cblxuICB0aGlzLl9hamF4LnBvc3QodGhpcy51cmwsIHBhcmFtcykuc3VjY2VzcyhmdW5jdGlvbihyZXMpIHtcbiAgICBpZihzZWxmLl91dGlscy5uZWVkVG9Mb2dpbi5jYWxsKHNlbGYsIHJlcykpIHtcbiAgICAgIC8vcmVtZW1iZXIgdGhlIGNhbGwgZm9yIGxhdHRlciB1c2VcbiAgICAgIHNlbGYuX3BlbmRpbmdDYWxscy5wdXNoKHtcbiAgICAgICAgc2FzUHJvZ3JhbTogc2FzUHJvZ3JhbSxcbiAgICAgICAgY2FsbGJhY2s6ICAgY2FsbGJhY2ssXG4gICAgICAgIHBhcmFtczogICAgIHBhcmFtc1xuICAgICAgfSk7XG5cbiAgICAgIC8vdGhlcmUncyBubyBuZWVkIHRvIGNvbnRpbnVlIGlmIHByZXZpb3VzIGNhbGwgcmV0dXJuZWQgbG9naW4gZXJyb3JcbiAgICAgIGlmKHNlbGYuX2Rpc2FibGVDYWxscykge1xuICAgICAgICByZXR1cm47XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzZWxmLl9kaXNhYmxlQ2FsbHMgPSB0cnVlO1xuICAgICAgfVxuXG4gICAgICB0cnkge1xuICAgICAgICB2YXIgc2FzQXBwTWF0Y2hlcyA9IHJlcy5yZXNwb25zZVVSTC5tYXRjaCgvX3Nhc2FwcD0oW14mXSopLyk7XG4gICAgICAgIHNlbGYuc2FzQXBwID0gc2FzQXBwTWF0Y2hlc1sxXS5yZXBsYWNlKC9cXCsvZywgJyAnKTtcbiAgICAgIH0gY2F0Y2goZSkge1xuICAgICAgICBsb2dzLmFkZEFwcGxpY2F0aW9uTG9nKCdDYW5ub3QgZXh0cmFjdCBfc2FzYXBwIHBhcmFtZXRlciBmcm9tIGxvZ2luIFVSTCcpO1xuICAgICAgfVxuXG4gICAgICBjYWxsYmFjayhuZXcgaDU0c0Vycm9yKCdub3RMb2dnZWRpbkVycm9yJywgJ1lvdSBhcmUgbm90IGxvZ2dlZCBpbicpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIHJlc09iaiwgdW5lc2NhcGVkUmVzT2JqO1xuICAgICAgaWYoIWRiZykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIHJlc09iaiA9IHNlbGYuX3V0aWxzLnBhcnNlUmVzKHJlcy5yZXNwb25zZVRleHQsIHNhc1Byb2dyYW0sIHBhcmFtcyk7XG4gICAgICAgICAgbG9ncy5hZGRBcHBsaWNhdGlvbkxvZyhyZXNPYmoubG9nbWVzc2FnZSwgc2FzUHJvZ3JhbSk7XG5cbiAgICAgICAgICByZXNPYmogICAgICAgICAgPSBzZWxmLl91dGlscy5jb252ZXJ0RGF0ZXMocmVzT2JqKTtcbiAgICAgICAgICB1bmVzY2FwZWRSZXNPYmogPSBzZWxmLl91dGlscy51bmVzY2FwZVZhbHVlcyhyZXNPYmopO1xuXG4gICAgICAgICAgY2FsbGJhY2sodW5kZWZpbmVkLCB1bmVzY2FwZWRSZXNPYmopO1xuICAgICAgICB9IGNhdGNoKGUpIHtcbiAgICAgICAgICBpZihlIGluc3RhbmNlb2YgU3ludGF4RXJyb3IpIHtcbiAgICAgICAgICAgIGlmKHJldHJ5Q291bnQgPCBzZWxmLm1heFhoclJldHJpZXMpIHtcbiAgICAgICAgICAgICAgc2VsZi5fYWpheC5wb3N0KHNlbGYudXJsLCBwYXJhbXMpLnN1Y2Nlc3ModGhpcy5zdWNjZXNzKS5lcnJvcih0aGlzLmVycm9yKTtcbiAgICAgICAgICAgICAgcmV0cnlDb3VudCsrO1xuICAgICAgICAgICAgICBsb2dzLmFkZEFwcGxpY2F0aW9uTG9nKFwiUmV0cnlpbmcgI1wiICsgcmV0cnlDb3VudCwgc2FzUHJvZ3JhbSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBzZWxmLl91dGlscy5wYXJzZUVycm9yUmVzcG9uc2UocmVzLnJlc3BvbnNlVGV4dCwgc2FzUHJvZ3JhbSk7XG4gICAgICAgICAgICAgIHNlbGYuX3V0aWxzLmFkZEZhaWxlZFJlc3BvbnNlKHJlcy5yZXNwb25zZVRleHQsIHNhc1Byb2dyYW0pO1xuICAgICAgICAgICAgICBjYWxsYmFjayhuZXcgaDU0c0Vycm9yKCdwYXJzZUVycm9yJywgJ1VuYWJsZSB0byBwYXJzZSByZXNwb25zZSBqc29uJykpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSBpZihlIGluc3RhbmNlb2YgaDU0c0Vycm9yKSB7XG4gICAgICAgICAgICBjYWxsYmFjayhlKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFyIGVyciA9IG5ldyBoNTRzRXJyb3IoJ3Vua25vd25FcnJvcicsIGUubWVzc2FnZSk7XG4gICAgICAgICAgICBlcnIuc3RhY2sgPSBlLnN0YWNrO1xuICAgICAgICAgICAgY2FsbGJhY2soZXJyKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgcmVzT2JqICAgICAgICAgID0gc2VsZi5fdXRpbHMucGFyc2VEZWJ1Z1JlcyhyZXMucmVzcG9uc2VUZXh0LCBzYXNQcm9ncmFtLCBwYXJhbXMpO1xuICAgICAgICAgIGxvZ3MuYWRkQXBwbGljYXRpb25Mb2cocmVzT2JqLmxvZ21lc3NhZ2UsIHNhc1Byb2dyYW0pO1xuXG4gICAgICAgICAgcmVzT2JqICAgICAgICAgID0gc2VsZi5fdXRpbHMuY29udmVydERhdGVzKHJlc09iaik7XG4gICAgICAgICAgdW5lc2NhcGVkUmVzT2JqID0gc2VsZi5fdXRpbHMudW5lc2NhcGVWYWx1ZXMocmVzT2JqKTtcblxuICAgICAgICAgIGNhbGxiYWNrKHVuZGVmaW5lZCwgdW5lc2NhcGVkUmVzT2JqKTtcbiAgICAgICAgfSBjYXRjaChlKSB7XG4gICAgICAgICAgaWYoZSBpbnN0YW5jZW9mIFN5bnRheEVycm9yKSB7XG4gICAgICAgICAgICBjYWxsYmFjayhuZXcgaDU0c0Vycm9yKCdwYXJzZUVycm9yJywgZS5tZXNzYWdlKSk7XG4gICAgICAgICAgfSBlbHNlIGlmKGUgaW5zdGFuY2VvZiBoNTRzRXJyb3IpIHtcbiAgICAgICAgICAgIGNhbGxiYWNrKGUpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YXIgZXJyID0gbmV3IGg1NHNFcnJvcigndW5rbm93bkVycm9yJywgZS5tZXNzYWdlKTtcbiAgICAgICAgICAgIGVyci5zdGFjayA9IGUuc3RhY2s7XG4gICAgICAgICAgICBjYWxsYmFjayhlcnIpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfSkuZXJyb3IoZnVuY3Rpb24ocmVzKSB7XG4gICAgbG9ncy5hZGRBcHBsaWNhdGlvbkxvZygnUmVxdWVzdCBmYWlsZWQgd2l0aCBzdGF0dXM6ICcgKyByZXMuc3RhdHVzLCBzYXNQcm9ncmFtKTtcbiAgICBjYWxsYmFjayhuZXcgaDU0c0Vycm9yKCdodHRwRXJyb3InLCByZXMuc3RhdHVzVGV4dCkpO1xuICB9KTtcbn07XG5cbi8qXG4qIExvZ2luIG1ldGhvZFxuKlxuKiBAcGFyYW0ge3N0cmluZ30gdXNlciAtIExvZ2luIHVzZXJuYW1lXG4qIEBwYXJhbSB7c3RyaW5nfSBwYXNzIC0gTG9naW4gcGFzc3dvcmRcbiogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgLSBDYWxsYmFjayBmdW5jdGlvbiBjYWxsZWQgd2hlbiBhamF4IGNhbGwgaXMgZmluaXNoZWRcbipcbiogT1JcbipcbiogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgLSBDYWxsYmFjayBmdW5jdGlvbiBjYWxsZWQgd2hlbiBhamF4IGNhbGwgaXMgZmluaXNoZWRcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5sb2dpbiA9IGZ1bmN0aW9uKHVzZXIsIHBhc3MsIGNhbGxiYWNrKSB7XG4gIHZhciBzZWxmID0gdGhpcztcblxuICBpZighdXNlciB8fCAhcGFzcykge1xuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnQ3JlZGVudGlhbHMgbm90IHNldCcpO1xuICB9XG4gIGlmKHR5cGVvZiB1c2VyICE9PSAnc3RyaW5nJyB8fCB0eXBlb2YgcGFzcyAhPT0gJ3N0cmluZycpIHtcbiAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1VzZXIgYW5kIHBhc3MgcGFyYW1ldGVycyBtdXN0IGJlIHN0cmluZ3MnKTtcbiAgfVxuICAvL05PVEU6IGNhbGxiYWNrIG9wdGlvbmFsP1xuICBpZighY2FsbGJhY2sgfHwgdHlwZW9mIGNhbGxiYWNrICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdZb3UgbXVzdCBwcm92aWRlIGNhbGxiYWNrJyk7XG4gIH1cblxuICB2YXIgbG9naW5QYXJhbXMgPSB7XG4gICAgX3Nhc2FwcDogc2VsZi5zYXNBcHAsXG4gICAgX3NlcnZpY2U6ICdkZWZhdWx0JyxcbiAgICB1eDogdXNlcixcbiAgICBweDogcGFzcyxcbiAgICAvL2ZvciBTQVMgOS40LFxuICAgIHVzZXJuYW1lOiB1c2VyLFxuICAgIHBhc3N3b3JkOiBwYXNzXG4gIH07XG5cbiAgZm9yICh2YXIga2V5IGluIHRoaXMuX2FkaXRpb25hbExvZ2luUGFyYW1zKSB7XG4gICAgbG9naW5QYXJhbXNba2V5XSA9IHRoaXMuX2FkaXRpb25hbExvZ2luUGFyYW1zW2tleV07XG4gIH1cblxuICB0aGlzLl9hamF4LnBvc3QodGhpcy5sb2dpblVybCwgbG9naW5QYXJhbXMpLnN1Y2Nlc3MoZnVuY3Rpb24ocmVzKSB7XG4gICAgaWYoc2VsZi5fdXRpbHMubmVlZFRvTG9naW4uY2FsbChzZWxmLCByZXMpKSB7XG4gICAgICAvL3dlIGFyZSBnZXR0aW5nIGZvcm0gYWdhaW4gYWZ0ZXIgcmVkaXJlY3RcbiAgICAgIC8vYW5kIG5lZWQgdG8gbG9naW4gYWdhaW4gdXNpbmcgdGhlIG5ldyB1cmxcbiAgICAgIC8vX2xvZ2luQ2hhbmdlZCBpcyBzZXQgaW4gbmVlZFRvTG9naW4gZnVuY3Rpb25cbiAgICAgIC8vYnV0IGlmIGxvZ2luIHVybCBpcyBub3QgZGlmZmVyZW50LCB3ZSBhcmUgY2hlY2tpbmcgaWYgdGhlcmUgYXJlIGFkaXRpb25hbCBwYXJhbWV0ZXJzXG4gICAgICBpZihzZWxmLl9sb2dpbkNoYW5nZWQgfHwgKHNlbGYuX2lzTmV3TG9naW5QYWdlICYmICFzZWxmLl9hZGl0aW9uYWxMb2dpblBhcmFtcykpIHtcbiAgICAgICAgZGVsZXRlIHNlbGYuX2xvZ2luQ2hhbmdlZDtcblxuICAgICAgICB2YXIgaW5wdXRzID0gcmVzLnJlc3BvbnNlVGV4dC5tYXRjaCgvPGlucHV0LipcImhpZGRlblwiW14+XSo+L2cpO1xuICAgICAgICBpZihpbnB1dHMpIHtcbiAgICAgICAgICBpbnB1dHMuZm9yRWFjaChmdW5jdGlvbihpbnB1dFN0cikge1xuICAgICAgICAgICAgdmFyIHZhbHVlTWF0Y2ggPSBpbnB1dFN0ci5tYXRjaCgvbmFtZT1cIihbXlwiXSopXCJcXHN2YWx1ZT1cIihbXlwiXSopLyk7XG4gICAgICAgICAgICBsb2dpblBhcmFtc1t2YWx1ZU1hdGNoWzFdXSA9IHZhbHVlTWF0Y2hbMl07XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICBzZWxmLl9hamF4LnBvc3Qoc2VsZi5sb2dpblVybCwgbG9naW5QYXJhbXMpLnN1Y2Nlc3ModGhpcy5zdWNjZXNzKS5lcnJvcih0aGlzLmVycm9yKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vZ2V0dGluZyBmb3JtIGFnYWluLCBidXQgaXQgd2Fzbid0IGEgcmVkaXJlY3RcbiAgICAgICAgbG9ncy5hZGRBcHBsaWNhdGlvbkxvZygnV3JvbmcgdXNlcm5hbWUgb3IgcGFzc3dvcmQnKTtcbiAgICAgICAgY2FsbGJhY2soLTEpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBjYWxsYmFjayhyZXMuc3RhdHVzKTtcblxuICAgICAgc2VsZi5fZGlzYWJsZUNhbGxzID0gZmFsc2U7XG5cbiAgICAgIHdoaWxlKHNlbGYuX3BlbmRpbmdDYWxscy5sZW5ndGggPiAwKSB7XG4gICAgICAgIHZhciBwZW5kaW5nQ2FsbCAgICAgPSBzZWxmLl9wZW5kaW5nQ2FsbHMuc2hpZnQoKTtcbiAgICAgICAgdmFyIHNhc1Byb2dyYW0gICAgICA9IHBlbmRpbmdDYWxsLnNhc1Byb2dyYW07XG4gICAgICAgIHZhciBjYWxsYmFja1BlbmRpbmcgPSBwZW5kaW5nQ2FsbC5jYWxsYmFjaztcbiAgICAgICAgdmFyIHBhcmFtcyAgICAgICAgICA9IHBlbmRpbmdDYWxsLnBhcmFtcztcblxuICAgICAgICAvL3VwZGF0ZSBkZWJ1ZyBiZWNhdXNlIGl0IG1heSBjaGFuZ2UgaW4gdGhlIG1lYW50aW1lXG4gICAgICAgIHBhcmFtcy5fZGVidWcgPSBzZWxmLmRlYnVnID8gMTMxIDogMDtcblxuICAgICAgICBpZihzZWxmLnJldHJ5QWZ0ZXJMb2dpbikge1xuICAgICAgICAgIHNlbGYuY2FsbChzYXNQcm9ncmFtLCBudWxsLCBjYWxsYmFja1BlbmRpbmcsIHBhcmFtcyk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH0pLmVycm9yKGZ1bmN0aW9uKHJlcykge1xuICAgIC8vTk9URTogZXJyb3IgNTAyIGlmIHNhc0FwcCBwYXJhbWV0ZXIgaXMgd3JvbmdcbiAgICBsb2dzLmFkZEFwcGxpY2F0aW9uTG9nKCdMb2dpbiBmYWlsZWQgd2l0aCBzdGF0dXMgY29kZTogJyArIHJlcy5zdGF0dXMpO1xuICAgIGNhbGxiYWNrKHJlcy5zdGF0dXMpO1xuICB9KTtcbn07XG5cbi8qXG4qIExvZ291dCBtZXRob2RcbipcbiogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgLSBDYWxsYmFjayBmdW5jdGlvbiBjYWxsZWQgd2hlbiBhamF4IGNhbGwgaXMgZmluaXNoZWRcbipcbiovXG5cbm1vZHVsZS5leHBvcnRzLmxvZ291dCA9IGZ1bmN0aW9uKGNhbGxiYWNrKSB7XG4gIHRoaXMuX2FqYXguZ2V0KHRoaXMudXJsLCB7X2FjdGlvbjogJ2xvZ29mZid9KS5zdWNjZXNzKGZ1bmN0aW9uKHJlcykge1xuICAgIGNhbGxiYWNrKCk7XG4gIH0pLmVycm9yKGZ1bmN0aW9uKHJlcykge1xuICAgIGxvZ3MuYWRkQXBwbGljYXRpb25Mb2coJ0xvZ291dCBmYWlsZWQgd2l0aCBzdGF0dXMgY29kZTogJyArIHJlcy5zdGF0dXMpO1xuICAgIGNhbGxiYWNrKHJlcy5zdGF0dXMpO1xuICB9KTtcbn07XG5cbi8qXG4qIEVudGVyIGRlYnVnIG1vZGVcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5zZXREZWJ1Z01vZGUgPSBmdW5jdGlvbigpIHtcbiAgdGhpcy5kZWJ1ZyA9IHRydWU7XG59O1xuXG4vKlxuKiBFeGl0IGRlYnVnIG1vZGVcbipcbiovXG5tb2R1bGUuZXhwb3J0cy51bnNldERlYnVnTW9kZSA9IGZ1bmN0aW9uKCkge1xuICB0aGlzLmRlYnVnID0gZmFsc2U7XG59O1xuXG5mb3IodmFyIGtleSBpbiBsb2dzLmdldCkge1xuICBpZihsb2dzLmdldC5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG4gICAgbW9kdWxlLmV4cG9ydHNba2V5XSA9IGxvZ3MuZ2V0W2tleV07XG4gIH1cbn1cblxuZm9yKHZhciBrZXkgaW4gbG9ncy5jbGVhcikge1xuICBpZihsb2dzLmNsZWFyLmhhc093blByb3BlcnR5KGtleSkpIHtcbiAgICBtb2R1bGUuZXhwb3J0c1trZXldID0gbG9ncy5jbGVhcltrZXldO1xuICB9XG59XG5cbi8qXG4qIEFkZCBjYWxsYmFjayBmdW5jdGlvbnMgZXhlY3V0ZWQgd2hlbiBwcm9wZXJ0aWVzIGFyZSB1cGRhdGVkIHdpdGggcmVtb3RlIGNvbmZpZ1xuKlxuKkBjYWxsYmFjayAtIGNhbGxiYWNrIHB1c2hlZCB0byBhcnJheVxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLm9uUmVtb3RlQ29uZmlnVXBkYXRlID0gZnVuY3Rpb24oY2FsbGJhY2spIHtcbiAgdGhpcy5yZW1vdGVDb25maWdVcGRhdGVDYWxsYmFja3MucHVzaChjYWxsYmFjayk7XG59O1xuXG5tb2R1bGUuZXhwb3J0cy5fdXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzLmpzJyk7XG4iLCJ2YXIgbG9ncyA9IHJlcXVpcmUoJy4uL2xvZ3MuanMnKTtcbnZhciBoNTRzRXJyb3IgPSByZXF1aXJlKCcuLi9lcnJvci5qcycpO1xuXG52YXIgcHJvZ3JhbU5vdEZvdW5kUGF0dCA9IC88dGl0bGU+KFN0b3JlZCBQcm9jZXNzIEVycm9yfFNBU1N0b3JlZFByb2Nlc3MpPFxcL3RpdGxlPltcXHNcXFNdKjxoMj5TdG9yZWQgcHJvY2VzcyBub3QgZm91bmQ6Lio8XFwvaDI+LztcblxuLypcbiogUGFyc2UgcmVzcG9uc2UgZnJvbSBzZXJ2ZXJcbipcbiogQHBhcmFtIHtvYmplY3R9IHJlc3BvbnNlVGV4dCAtIHJlc3BvbnNlIGh0bWwgZnJvbSB0aGUgc2VydmVyXG4qIEBwYXJhbSB7c3RyaW5nfSBzYXNQcm9ncmFtIC0gc2FzIHByb2dyYW0gcGF0aFxuKiBAcGFyYW0ge29iamVjdH0gcGFyYW1zIC0gcGFyYW1zIHNlbnQgdG8gc2FzIHByb2dyYW0gd2l0aCBhZGRUYWJsZVxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLnBhcnNlUmVzID0gZnVuY3Rpb24ocmVzcG9uc2VUZXh0LCBzYXNQcm9ncmFtLCBwYXJhbXMpIHtcbiAgdmFyIG1hdGNoZXMgPSByZXNwb25zZVRleHQubWF0Y2gocHJvZ3JhbU5vdEZvdW5kUGF0dCk7XG4gIGlmKG1hdGNoZXMpIHtcbiAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdwcm9ncmFtTm90Rm91bmQnLCAnU2FzIHByb2dyYW0gY29tcGxldGVkIHdpdGggZXJyb3JzJyk7XG4gIH1cbiAgLy9yZW1vdmUgbmV3IGxpbmVzIGluIGpzb24gcmVzcG9uc2VcbiAgcmV0dXJuIEpTT04ucGFyc2UocmVzcG9uc2VUZXh0LnJlcGxhY2UoLyhcXHJcXG58XFxyfFxcbikvZywgJycpKTtcbn07XG5cbi8qXG4qIFBhcnNlIHJlc3BvbnNlIGZyb20gc2VydmVyIGluIGRlYnVnIG1vZGVcbipcbiogQHBhcmFtIHtvYmplY3R9IHJlc3BvbnNlVGV4dCAtIHJlc3BvbnNlIGh0bWwgZnJvbSB0aGUgc2VydmVyXG4qIEBwYXJhbSB7c3RyaW5nfSBzYXNQcm9ncmFtIC0gc2FzIHByb2dyYW0gcGF0aFxuKiBAcGFyYW0ge29iamVjdH0gcGFyYW1zIC0gcGFyYW1zIHNlbnQgdG8gc2FzIHByb2dyYW0gd2l0aCBhZGRUYWJsZVxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLnBhcnNlRGVidWdSZXMgPSBmdW5jdGlvbihyZXNwb25zZVRleHQsIHNhc1Byb2dyYW0sIHBhcmFtcykge1xuICB2YXIgbWF0Y2hlcyA9IHJlc3BvbnNlVGV4dC5tYXRjaChwcm9ncmFtTm90Rm91bmRQYXR0KTtcbiAgaWYobWF0Y2hlcykge1xuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ3Byb2dyYW1Ob3RGb3VuZCcsICdTYXMgcHJvZ3JhbSBjb21wbGV0ZWQgd2l0aCBlcnJvcnMnKTtcbiAgfVxuXG4gIC8vZmluZCBqc29uXG4gIHBhdHQgICAgICAgICAgICAgID0gL14oLj8tLWg1NHMtZGF0YS1zdGFydC0tKShbXFxTXFxzXSo/KSgtLWg1NHMtZGF0YS1lbmQtLSkvbTtcbiAgbWF0Y2hlcyAgICAgICAgICAgPSByZXNwb25zZVRleHQubWF0Y2gocGF0dCk7XG5cbiAgdmFyIHBhZ2UgICAgICAgICAgPSByZXNwb25zZVRleHQucmVwbGFjZShwYXR0LCAnJyk7XG4gIHZhciBodG1sQm9keVBhdHQgID0gLzxib2R5Lio+KFtcXHNcXFNdKik8XFwvYm9keT4vO1xuICB2YXIgYm9keU1hdGNoZXMgICA9IHBhZ2UubWF0Y2goaHRtbEJvZHlQYXR0KTtcblxuICAvL3JlbW92ZSBodG1sIHRhZ3NcbiAgdmFyIGRlYnVnVGV4dCA9IGJvZHlNYXRjaGVzWzFdLnJlcGxhY2UoLzxbXj5dKj4vZywgJycpO1xuICBkZWJ1Z1RleHQgICAgID0gdGhpcy5kZWNvZGVIVE1MRW50aXRpZXMoZGVidWdUZXh0KTtcblxuICBsb2dzLmFkZERlYnVnRGF0YShib2R5TWF0Y2hlc1sxXSwgZGVidWdUZXh0LCBzYXNQcm9ncmFtLCBwYXJhbXMpO1xuXG4gIGlmKHRoaXMucGFyc2VFcnJvclJlc3BvbnNlKHJlc3BvbnNlVGV4dCwgc2FzUHJvZ3JhbSkpIHtcbiAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdzYXNFcnJvcicsICdTYXMgcHJvZ3JhbSBjb21wbGV0ZWQgd2l0aCBlcnJvcnMnKTtcbiAgfVxuXG4gIGlmKCFtYXRjaGVzKSB7XG4gICAgdGhyb3cgbmV3IGg1NHNFcnJvcigncGFyc2VFcnJvcicsICdVbmFibGUgdG8gcGFyc2UgcmVzcG9uc2UganNvbicpO1xuICB9XG4gIC8vcmVtb3ZlIG5ldyBsaW5lcyBpbiBqc29uIHJlc3BvbnNlXG4gIHZhciBqc29uT2JqID0gSlNPTi5wYXJzZShtYXRjaGVzWzJdLnJlcGxhY2UoLyhcXHJcXG58XFxyfFxcbikvZywgJycpKTtcblxuICByZXR1cm4ganNvbk9iajtcbn07XG5cbi8qXG4qIEFkZCBmYWlsZWQgcmVzcG9uc2UgdG8gbG9ncyAtIHVzZWQgb25seSBpZiBkZWJ1Zz1mYWxzZVxuKlxuKiBAcGFyYW0ge29iamVjdH0gcmVzcG9uc2VUZXh0IC0gcmVzcG9uc2UgaHRtbCBmcm9tIHRoZSBzZXJ2ZXJcbiogQHBhcmFtIHtzdHJpbmd9IHNhc1Byb2dyYW0gLSBzYXMgcHJvZ3JhbSBwYXRoXG4qXG4qL1xubW9kdWxlLmV4cG9ydHMuYWRkRmFpbGVkUmVzcG9uc2UgPSBmdW5jdGlvbihyZXNwb25zZVRleHQsIHNhc1Byb2dyYW0pIHtcbiAgdmFyIHBhdHQgICAgICA9IC88c2NyaXB0KFtcXHNcXFNdKilcXC9mb3JtPi87XG4gIHZhciBwYXR0MiAgICAgPSAvZGlzcGxheVxccz86XFxzP25vbmU7P1xccz8vO1xuICAvL3JlbW92ZSBzY3JpcHQgd2l0aCBmb3JtIGZvciB0b2dnbGluZyB0aGUgbG9ncyBhbmQgXCJkaXNwbGF5Om5vbmVcIiBmcm9tIHN0eWxlXG4gIHJlc3BvbnNlVGV4dCAgPSByZXNwb25zZVRleHQucmVwbGFjZShwYXR0LCAnJykucmVwbGFjZShwYXR0MiwgJycpO1xuICB2YXIgZGVidWdUZXh0ID0gcmVzcG9uc2VUZXh0LnJlcGxhY2UoLzxbXj5dKj4vZywgJycpO1xuICBkZWJ1Z1RleHQgPSB0aGlzLmRlY29kZUhUTUxFbnRpdGllcyhkZWJ1Z1RleHQpO1xuXG4gIGxvZ3MuYWRkRmFpbGVkUmVxdWVzdChyZXNwb25zZVRleHQsIGRlYnVnVGV4dCwgc2FzUHJvZ3JhbSk7XG59O1xuXG4vKlxuKiBVbmVzY2FwZSBhbGwgc3RyaW5nIHZhbHVlcyBpbiByZXR1cm5lZCBvYmplY3RcbipcbiogQHBhcmFtIHtvYmplY3R9IG9ialxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLnVuZXNjYXBlVmFsdWVzID0gZnVuY3Rpb24ob2JqKSB7XG4gIGZvciAodmFyIGtleSBpbiBvYmopIHtcbiAgICBpZiAodHlwZW9mIG9ialtrZXldID09PSAnc3RyaW5nJykge1xuICAgICAgb2JqW2tleV0gPSBkZWNvZGVVUklDb21wb25lbnQob2JqW2tleV0pO1xuICAgIH0gZWxzZSBpZih0eXBlb2Ygb2JqID09PSAnb2JqZWN0Jykge1xuICAgICAgdGhpcy51bmVzY2FwZVZhbHVlcyhvYmpba2V5XSk7XG4gICAgfVxuICB9XG4gIHJldHVybiBvYmo7XG59O1xuXG4vKlxuKiBQYXJzZSBlcnJvciByZXNwb25zZSBmcm9tIHNlcnZlciBhbmQgc2F2ZSBlcnJvcnMgaW4gbWVtb3J5XG4qXG4qIEBwYXJhbSB7c3RyaW5nfSByZXMgLSBzZXJ2ZXIgcmVzcG9uc2VcbiogI3BhcmFtIHtzdHJpbmd9IHNhc1Byb2dyYW0gLSBzYXMgcHJvZ3JhbSB3aGljaCByZXR1cm5lZCB0aGUgcmVzcG9uc2VcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5wYXJzZUVycm9yUmVzcG9uc2UgPSBmdW5jdGlvbihyZXMsIHNhc1Byb2dyYW0pIHtcbiAgLy9jYXB0dXJlICdFUlJPUjogW3RleHRdLicgb3IgJ0VSUk9SIHh4IFt0ZXh0XS4nXG4gIHZhciBwYXR0ICAgID0gL0VSUk9SKDpcXHN8XFxzXFxkXFxkKSguKlxcLnwuKlxcbi4qXFwuKS9nbTtcbiAgdmFyIGVycm9ycyAgPSByZXMubWF0Y2gocGF0dCk7XG4gIGlmKCFlcnJvcnMpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICB2YXIgZXJyTWVzc2FnZTtcbiAgZm9yKHZhciBpID0gMCwgbiA9IGVycm9ycy5sZW5ndGg7IGkgPCBuOyBpKyspIHtcbiAgICBlcnJNZXNzYWdlICA9IGVycm9yc1tpXS5yZXBsYWNlKC88W14+XSo+L2csICcnKS5yZXBsYWNlKC8oXFxufFxcc3syLH0pL2csICcgJyk7XG4gICAgZXJyTWVzc2FnZSAgPSB0aGlzLmRlY29kZUhUTUxFbnRpdGllcyhlcnJNZXNzYWdlKTtcbiAgICBlcnJvcnNbaV0gICA9IHtcbiAgICAgIHNhc1Byb2dyYW06IHNhc1Byb2dyYW0sXG4gICAgICBtZXNzYWdlOiAgICBlcnJNZXNzYWdlLFxuICAgICAgdGltZTogICAgICAgbmV3IERhdGUoKVxuICAgIH07XG4gIH1cblxuICBsb2dzLmFkZFNhc0Vycm9ycyhlcnJvcnMpO1xuXG4gIHJldHVybiB0cnVlO1xufTtcblxuLypcbiogRGVjb2RlIEhUTUwgZW50aXRpZXNcbipcbiogQHBhcmFtIHtzdHJpbmd9IHJlcyAtIHNlcnZlciByZXNwb25zZVxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLmRlY29kZUhUTUxFbnRpdGllcyA9IGZ1bmN0aW9uIChodG1sKSB7XG4gIHZhciB0ZW1wRWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcbiAgdmFyIHN0ciAgICAgICAgID0gaHRtbC5yZXBsYWNlKC8mKCMoPzp4WzAtOWEtZl0rfFxcZCspfFthLXpdKyk7L2dpLFxuICAgIGZ1bmN0aW9uIChzdHIpIHtcbiAgICAgIHRlbXBFbGVtZW50LmlubmVySFRNTCA9IHN0cjtcbiAgICAgIHN0ciAgICAgICAgICAgICAgICAgICA9IHRlbXBFbGVtZW50LnRleHRDb250ZW50IHx8IHRlbXBFbGVtZW50LmlubmVyVGV4dDtcbiAgICAgIHJldHVybiBzdHI7XG4gICAgfVxuICApO1xuICByZXR1cm4gc3RyO1xufTtcblxuLypcbiogQ29udmVydCBzYXMgdGltZSB0byBqYXZhc2NyaXB0IGRhdGVcbipcbiogQHBhcmFtIHtudW1iZXJ9IHNhc0RhdGUgLSBzYXMgVGF0ZSBvYmplY3RcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5mcm9tU2FzRGF0ZVRpbWUgPSBmdW5jdGlvbiAoc2FzRGF0ZSkge1xuICB2YXIgYmFzZWRhdGUgPSBuZXcgRGF0ZShcIkphbnVhcnkgMSwgMTk2MCAwMDowMDowMFwiKTtcbiAgdmFyIGN1cnJkYXRlID0gc2FzRGF0ZTtcblxuICAvLyBvZmZzZXRzIGZvciBVVEMgYW5kIHRpbWV6b25lcyBhbmQgQlNUXG4gIHZhciBiYXNlT2Zmc2V0ID0gYmFzZWRhdGUuZ2V0VGltZXpvbmVPZmZzZXQoKTsgLy8gaW4gbWludXRlc1xuXG4gIC8vIGNvbnZlcnQgc2FzIGRhdGV0aW1lIHRvIGEgY3VycmVudCB2YWxpZCBqYXZhc2NyaXB0IGRhdGVcbiAgdmFyIGJhc2VkYXRlTXMgID0gYmFzZWRhdGUuZ2V0VGltZSgpOyAvLyBpbiBtc1xuICB2YXIgY3VycmRhdGVNcyAgPSBjdXJyZGF0ZSAqIDEwMDA7IC8vIHRvIG1zXG4gIHZhciBzYXNEYXRldGltZSA9IGN1cnJkYXRlTXMgKyBiYXNlZGF0ZU1zO1xuICB2YXIganNEYXRlICAgICAgPSBuZXcgRGF0ZSgpO1xuICBqc0RhdGUuc2V0VGltZShzYXNEYXRldGltZSk7IC8vIGZpcnN0IHRpbWUgdG8gZ2V0IG9mZnNldCBCU1QgZGF5bGlnaHQgc2F2aW5ncyBldGNcbiAgdmFyIGN1cnJPZmZzZXQgID0ganNEYXRlLmdldFRpbWV6b25lT2Zmc2V0KCk7IC8vIGFkanVzdCBmb3Igb2Zmc2V0IGluIG1pbnV0ZXNcbiAgdmFyIG9mZnNldFZhciAgID0gKGJhc2VPZmZzZXQgLSBjdXJyT2Zmc2V0KSAqIDYwICogMTAwMDsgLy8gZGlmZmVyZW5jZSBpbiBtaWxsaXNlY29uZHNcbiAgdmFyIG9mZnNldFRpbWUgID0gc2FzRGF0ZXRpbWUgLSBvZmZzZXRWYXI7IC8vIGZpbmRpbmcgQlNUIGFuZCBkYXlsaWdodCBzYXZpbmdzXG4gIGpzRGF0ZS5zZXRUaW1lKG9mZnNldFRpbWUpOyAvLyB1cGRhdGUgd2l0aCBvZmZzZXRcbiAgcmV0dXJuIGpzRGF0ZTtcbn07XG5cbi8qXG4qIENvbnZlcnQgc2FzIHRpbWVzdGFtcHMgdG8gamF2YXNjcmlwdCBEYXRlIG9iamVjdFxuKlxuKiBAcGFyYW0ge29iamVjdH0gb2JqXG4qXG4qL1xubW9kdWxlLmV4cG9ydHMuY29udmVydERhdGVzID0gZnVuY3Rpb24ob2JqKSB7XG4gIGZvciAodmFyIGtleSBpbiBvYmopIHtcbiAgICBpZiAodHlwZW9mIG9ialtrZXldID09PSAnbnVtYmVyJyAmJiAoa2V5LmluZGV4T2YoJ2R0XycpID09PSAwIHx8IGtleS5pbmRleE9mKCdEVF8nKSA9PT0gMCkpIHtcbiAgICAgIG9ialtrZXldID0gdGhpcy5mcm9tU2FzRGF0ZVRpbWUob2JqW2tleV0pO1xuICAgIH0gZWxzZSBpZih0eXBlb2Ygb2JqID09PSAnb2JqZWN0Jykge1xuICAgICAgdGhpcy5jb252ZXJ0RGF0ZXMob2JqW2tleV0pO1xuICAgIH1cbiAgfVxuICByZXR1cm4gb2JqO1xufTtcblxubW9kdWxlLmV4cG9ydHMubmVlZFRvTG9naW4gPSBmdW5jdGlvbihyZXNwb25zZU9iaikge1xuICB2YXIgcGF0dCA9IC88Zm9ybS4rYWN0aW9uPVwiKC4qTG9nb25bXlwiXSopLio+LztcbiAgdmFyIG1hdGNoZXMgPSBwYXR0LmV4ZWMocmVzcG9uc2VPYmoucmVzcG9uc2VUZXh0KTtcbiAgdmFyIG5ld0xvZ2luVXJsO1xuXG4gIGlmKCFtYXRjaGVzKSB7XG4gICAgLy90aGVyZSdzIG5vIGZvcm0sIHdlIGFyZSBpbi4gaG9vcmF5IVxuICAgIHJldHVybiBmYWxzZTtcbiAgfSBlbHNlIHtcbiAgICB2YXIgYWN0aW9uVXJsID0gbWF0Y2hlc1sxXS5yZXBsYWNlKC9cXD8uKi8sICcnKTtcbiAgICBpZihhY3Rpb25VcmwuY2hhckF0KDApID09PSAnLycpIHtcbiAgICAgIG5ld0xvZ2luVXJsID0gdGhpcy5ob3N0VXJsID8gdGhpcy5ob3N0VXJsICsgYWN0aW9uVXJsIDogYWN0aW9uVXJsO1xuICAgICAgaWYobmV3TG9naW5VcmwgIT09IHRoaXMubG9naW5VcmwpIHtcbiAgICAgICAgdGhpcy5fbG9naW5DaGFuZ2VkID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5sb2dpblVybCA9IG5ld0xvZ2luVXJsO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAvL3JlbGF0aXZlIHBhdGhcblxuICAgICAgdmFyIGxhc3RJbmRPZlNsYXNoID0gcmVzcG9uc2VPYmoucmVzcG9uc2VVUkwubGFzdEluZGV4T2YoJy8nKSArIDE7XG4gICAgICAvL3JlbW92ZSBldmVyeXRoaW5nIGFmdGVyIHRoZSBsYXN0IHNsYXNoLCBhbmQgZXZlcnl0aGluZyB1bnRpbCB0aGUgZmlyc3RcbiAgICAgIHZhciByZWxhdGl2ZUxvZ2luVXJsID0gcmVzcG9uc2VPYmoucmVzcG9uc2VVUkwuc3Vic3RyKDAsIGxhc3RJbmRPZlNsYXNoKS5yZXBsYWNlKC8uKlxcL3syfVteXFwvXSovLCAnJykgKyBhY3Rpb25Vcmw7XG4gICAgICBuZXdMb2dpblVybCA9IHRoaXMuaG9zdFVybCA/IHRoaXMuaG9zdFVybCArIHJlbGF0aXZlTG9naW5VcmwgOiByZWxhdGl2ZUxvZ2luVXJsO1xuICAgICAgaWYobmV3TG9naW5VcmwgIT09IHRoaXMubG9naW5VcmwpIHtcbiAgICAgICAgdGhpcy5fbG9naW5DaGFuZ2VkID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5sb2dpblVybCA9IG5ld0xvZ2luVXJsO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vc2F2ZSBwYXJhbWV0ZXJzIGZyb20gaGlkZGVuIGZvcm0gZmllbGRzXG4gICAgdmFyIGlucHV0cyA9IHJlc3BvbnNlT2JqLnJlc3BvbnNlVGV4dC5tYXRjaCgvPGlucHV0LipcImhpZGRlblwiW14+XSo+L2cpO1xuICAgIHZhciBoaWRkZW5Gb3JtUGFyYW1zID0ge307XG4gICAgaWYoaW5wdXRzKSB7XG4gICAgICAvL2l0J3MgbmV3IGxvZ2luIHBhZ2UgaWYgd2UgaGF2ZSB0aGVzZSBhZGRpdGlvbmFsIHBhcmFtZXRlcnNcbiAgICAgIHRoaXMuX2lzTmV3TG9naW5QYWdlID0gdHJ1ZTtcbiAgICAgIGlucHV0cy5mb3JFYWNoKGZ1bmN0aW9uKGlucHV0U3RyKSB7XG4gICAgICAgIHZhciB2YWx1ZU1hdGNoID0gaW5wdXRTdHIubWF0Y2goL25hbWU9XCIoW15cIl0qKVwiXFxzdmFsdWU9XCIoW15cIl0qKS8pO1xuICAgICAgICBoaWRkZW5Gb3JtUGFyYW1zW3ZhbHVlTWF0Y2hbMV1dID0gdmFsdWVNYXRjaFsyXTtcbiAgICAgIH0pO1xuICAgICAgdGhpcy5fYWRpdGlvbmFsTG9naW5QYXJhbXMgPSBoaWRkZW5Gb3JtUGFyYW1zO1xuICAgIH1cblxuICAgIHJldHVybiB0cnVlO1xuICB9XG59O1xuIiwidmFyIGg1NHNFcnJvciA9IHJlcXVpcmUoJy4uL2Vycm9yLmpzJyk7XG5cbi8qXG4qIGg1NHMgdGFibGVzIG9iamVjdCBjb25zdHJ1Y3RvclxuKiBAY29uc3RydWN0b3JcbipcbipAcGFyYW0ge2FycmF5fSB0YWJsZSAtIFRhYmxlIGFkZGVkIHdoZW4gb2JqZWN0IGlzIGNyZWF0ZWRcbipAcGFyYW0ge3N0cmluZ30gbWVzc2FnZSAtIG1hY3JvIG5hbWVcbipcbiovXG5mdW5jdGlvbiBUYWJsZXModGFibGUsIG1hY3JvTmFtZSkge1xuICB0aGlzLl90YWJsZXMgPSB7fTtcblxuICB0aGlzLmFkZCh0YWJsZSwgbWFjcm9OYW1lKTtcbn1cblxuLypcbiogQWRkIHRhYmxlIHRvIHRhYmxlcyBvYmplY3RcbiogQHBhcmFtIHthcnJheX0gdGFibGUgLSBBcnJheSBvZiB0YWJsZSBvYmplY3RzXG4qIEBwYXJhbSB7c3RyaW5nfSBtYWNyb05hbWUgLSBTYXMgbWFjcm8gbmFtZVxuKlxuKi9cblRhYmxlcy5wcm90b3R5cGUuYWRkID0gZnVuY3Rpb24odGFibGUsIG1hY3JvTmFtZSkge1xuICBpZih0YWJsZSAmJiBtYWNyb05hbWUpIHtcbiAgICBpZighKHRhYmxlIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ0ZpcnN0IGFyZ3VtZW50IG11c3QgYmUgYXJyYXknKTtcbiAgICB9XG4gICAgaWYodHlwZW9mIG1hY3JvTmFtZSAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnU2Vjb25kIGFyZ3VtZW50IG11c3QgYmUgc3RyaW5nJyk7XG4gICAgfVxuICAgIGlmKCFpc05hTihtYWNyb05hbWVbbWFjcm9OYW1lLmxlbmd0aCAtIDFdKSkge1xuICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdNYWNybyBuYW1lIGNhbm5vdCBoYXZlIG51bWJlciBhdCB0aGUgZW5kJyk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnTWlzc2luZyBhcmd1bWVudHMnKTtcbiAgfVxuXG4gIHZhciByZXN1bHQgPSB0aGlzLl91dGlscy5jb252ZXJ0VGFibGVPYmplY3QodGFibGUpO1xuXG4gIHZhciB0YWJsZUFycmF5ID0gW107XG4gIHRhYmxlQXJyYXkucHVzaChKU09OLnN0cmluZ2lmeShyZXN1bHQuc3BlYykpO1xuICBmb3IgKHZhciBudW1iZXJPZlRhYmxlcyA9IDA7IG51bWJlck9mVGFibGVzIDwgcmVzdWx0LmRhdGEubGVuZ3RoOyBudW1iZXJPZlRhYmxlcysrKSB7XG4gICAgdmFyIG91dFN0cmluZyA9IEpTT04uc3RyaW5naWZ5KHJlc3VsdC5kYXRhW251bWJlck9mVGFibGVzXSk7XG4gICAgdGFibGVBcnJheS5wdXNoKG91dFN0cmluZyk7XG4gIH1cbiAgdGhpcy5fdGFibGVzW21hY3JvTmFtZV0gPSB0YWJsZUFycmF5O1xufTtcblxuVGFibGVzLnByb3RvdHlwZS5fdXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzLmpzJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gVGFibGVzO1xuIiwidmFyIGg1NHNFcnJvciA9IHJlcXVpcmUoJy4uL2Vycm9yLmpzJyk7XG52YXIgbG9ncyA9IHJlcXVpcmUoJy4uL2xvZ3MuanMnKTtcblxuLypcbiogQ29udmVydCB0YWJsZSBvYmplY3QgdG8gU2FzIHJlYWRhYmxlIG9iamVjdFxuKlxuKiBAcGFyYW0ge29iamVjdH0gaW5PYmplY3QgLSBPYmplY3QgdG8gY29udmVydFxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLmNvbnZlcnRUYWJsZU9iamVjdCA9IGZ1bmN0aW9uKGluT2JqZWN0KSB7XG4gIHZhciBzZWxmICAgICAgICAgICAgPSB0aGlzO1xuICB2YXIgY2h1bmtUaHJlc2hvbGQgID0gMzAwMDA7IC8vIHRoaXMgZ29lcyB0byAzMGsgZm9yIFNBU1xuXG4gIC8vIGZpcnN0IGNoZWNrIHRoYXQgdGhlIG9iamVjdCBpcyBhbiBhcnJheVxuICBpZiAodHlwZW9mIChpbk9iamVjdCkgIT09ICdvYmplY3QnKSB7XG4gICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdUaGUgcGFyYW1ldGVyIHBhc3NlZCB0byBjaGVja0FuZEdldFR5cGVPYmplY3QgaXMgbm90IGFuIG9iamVjdCcpO1xuICB9XG5cbiAgdmFyIGFycmF5TGVuZ3RoID0gaW5PYmplY3QubGVuZ3RoO1xuICBpZiAodHlwZW9mIChhcnJheUxlbmd0aCkgIT09ICdudW1iZXInKSB7XG4gICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdUaGUgcGFyYW1ldGVyIHBhc3NlZCB0byBjaGVja0FuZEdldFR5cGVPYmplY3QgZG9lcyBub3QgaGF2ZSBhIHZhbGlkIGxlbmd0aCBhbmQgaXMgbW9zdCBsaWtlbHkgbm90IGFuIGFycmF5Jyk7XG4gIH1cblxuICB2YXIgZXhpc3RpbmdDb2xzID0ge307IC8vIHRoaXMgaXMganVzdCB0byBtYWtlIGxvb2t1cCBlYXNpZXIgcmF0aGVyIHRoYW4gdHJhdmVyc2luZyBhcnJheSBlYWNoIHRpbWUuIFdpbGwgdHJhbnNmb3JtIGFmdGVyXG5cbiAgLy8gZnVuY3Rpb24gY2hlY2tBbmRTZXRBcnJheSAtIHRoaXMgd2lsbCBjaGVjayBhbiBpbk9iamVjdCBjdXJyZW50IGtleSBhZ2FpbnN0IHRoZSBleGlzdGluZyB0eXBlQXJyYXkgYW5kIGVpdGhlciByZXR1cm4gLTEgaWYgdGhlcmVcbiAgLy8gaXMgYSB0eXBlIG1pc21hdGNoIG9yIGFkZCBhbiBlbGVtZW50IGFuZCB1cGRhdGUvaW5jcmVtZW50IHRoZSBsZW5ndGggaWYgbmVlZGVkXG5cbiAgZnVuY3Rpb24gY2hlY2tBbmRJbmNyZW1lbnQoY29sU3BlYykge1xuICAgIGlmICh0eXBlb2YgKGV4aXN0aW5nQ29sc1tjb2xTcGVjLmNvbE5hbWVdKSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIGV4aXN0aW5nQ29sc1tjb2xTcGVjLmNvbE5hbWVdICAgICAgICAgICA9IHt9O1xuICAgICAgZXhpc3RpbmdDb2xzW2NvbFNwZWMuY29sTmFtZV0uY29sTmFtZSAgID0gY29sU3BlYy5jb2xOYW1lO1xuICAgICAgZXhpc3RpbmdDb2xzW2NvbFNwZWMuY29sTmFtZV0uY29sVHlwZSAgID0gY29sU3BlYy5jb2xUeXBlO1xuICAgICAgZXhpc3RpbmdDb2xzW2NvbFNwZWMuY29sTmFtZV0uY29sTGVuZ3RoID0gY29sU3BlYy5jb2xMZW5ndGggPiAwID8gY29sU3BlYy5jb2xMZW5ndGggOiAxO1xuICAgICAgcmV0dXJuIDA7IC8vIGFsbCBva1xuICAgIH1cbiAgICAvLyBjaGVjayB0eXBlIG1hdGNoXG4gICAgaWYgKGV4aXN0aW5nQ29sc1tjb2xTcGVjLmNvbE5hbWVdLmNvbFR5cGUgIT09IGNvbFNwZWMuY29sVHlwZSkge1xuICAgICAgcmV0dXJuIC0xOyAvLyB0aGVyZSBpcyBhIGZ1ZGdlIGluIHRoZSB0eXBpbmdcbiAgICB9XG4gICAgaWYgKGV4aXN0aW5nQ29sc1tjb2xTcGVjLmNvbE5hbWVdLmNvbExlbmd0aCA8IGNvbFNwZWMuY29sTGVuZ3RoKSB7XG4gICAgICBleGlzdGluZ0NvbHNbY29sU3BlYy5jb2xOYW1lXS5jb2xMZW5ndGggPSBjb2xTcGVjLmNvbExlbmd0aCA+IDAgPyBjb2xTcGVjLmNvbExlbmd0aCA6IDE7IC8vIGluY3JlbWVudCB0aGUgbWF4IGxlbmd0aCBvZiB0aGlzIGNvbHVtblxuICAgICAgcmV0dXJuIDA7XG4gICAgfVxuICB9XG4gIHZhciBjaHVua0FycmF5Q291bnQgICAgICAgICA9IDA7IC8vIHRoaXMgaXMgZm9yIGtlZXBpbmcgdGFicyBvbiBob3cgbG9uZyB0aGUgY3VycmVudCBhcnJheSBzdHJpbmcgd291bGQgYmVcbiAgdmFyIHRhcmdldEFycmF5ICAgICAgICAgICAgID0gW107IC8vIHRoaXMgaXMgdGhlIGFycmF5IG9mIHRhcmdldCBhcnJheXNcbiAgdmFyIGN1cnJlbnRUYXJnZXQgICAgICAgICAgID0gMDtcbiAgdGFyZ2V0QXJyYXlbY3VycmVudFRhcmdldF0gID0gW107XG4gIHZhciBqICAgICAgICAgICAgICAgICAgICAgICA9IDA7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgaW5PYmplY3QubGVuZ3RoOyBpKyspIHtcbiAgICB0YXJnZXRBcnJheVtjdXJyZW50VGFyZ2V0XVtqXSA9IHt9O1xuICAgIHZhciBjaHVua1Jvd0NvdW50ICAgICAgICAgICAgID0gMDtcblxuICAgIGZvciAodmFyIGtleSBpbiBpbk9iamVjdFtpXSkge1xuICAgICAgdmFyIHRoaXNTcGVjICA9IHt9O1xuICAgICAgdmFyIHRoaXNWYWx1ZSA9IGluT2JqZWN0W2ldW2tleV07XG5cbiAgICAgIC8vc2tpcCB1bmRlZmluZWQgdmFsdWVzXG4gICAgICBpZih0aGlzVmFsdWUgPT09IHVuZGVmaW5lZCB8fCB0aGlzVmFsdWUgPT09IG51bGwpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIC8vdGhyb3cgYW4gZXJyb3IgaWYgdGhlcmUncyBOYU4gdmFsdWVcbiAgICAgIGlmKHR5cGVvZiB0aGlzVmFsdWUgPT09ICdudW1iZXInICYmIGlzTmFOKHRoaXNWYWx1ZSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcigndHlwZUVycm9yJywgJ05hTiB2YWx1ZSBpbiBvbmUgb2YgdGhlIHZhbHVlcyAoY29sdW1ucykgaXMgbm90IGFsbG93ZWQnKTtcbiAgICAgIH1cblxuICAgICAgaWYodGhpc1ZhbHVlID09PSAtSW5maW5pdHkgfHwgdGhpc1ZhbHVlID09PSBJbmZpbml0eSkge1xuICAgICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCd0eXBlRXJyb3InLCB0aGlzVmFsdWUudG9TdHJpbmcoKSArICcgdmFsdWUgaW4gb25lIG9mIHRoZSB2YWx1ZXMgKGNvbHVtbnMpIGlzIG5vdCBhbGxvd2VkJyk7XG4gICAgICB9XG5cbiAgICAgIGlmKHRoaXNWYWx1ZSA9PT0gdHJ1ZSB8fCB0aGlzVmFsdWUgPT09IGZhbHNlKSB7XG4gICAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ3R5cGVFcnJvcicsICdCb29sZWFuIHZhbHVlIGluIG9uZSBvZiB0aGUgdmFsdWVzIChjb2x1bW5zKSBpcyBub3QgYWxsb3dlZCcpO1xuICAgICAgfVxuXG4gICAgICAvLyBnZXQgdHlwZS4uLiBpZiBpdCBpcyBhbiBvYmplY3QgdGhlbiBjb252ZXJ0IGl0IHRvIGpzb24gYW5kIHN0b3JlIGFzIGEgc3RyaW5nXG4gICAgICB2YXIgdGhpc1R5cGUgID0gdHlwZW9mICh0aGlzVmFsdWUpO1xuICAgICAgdmFyIGlzRGF0ZSA9IHRoaXNWYWx1ZSBpbnN0YW5jZW9mIERhdGU7XG4gICAgICBpZiAodGhpc1R5cGUgPT09ICdudW1iZXInKSB7IC8vIHN0cmFpZ2h0Zm9yd2FyZCBudW1iZXJcbiAgICAgICAgaWYodGhpc1ZhbHVlIDwgTnVtYmVyLk1JTl9TQUZFX0lOVEVHRVIgfHwgdGhpc1ZhbHVlID4gTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVIpIHtcbiAgICAgICAgICBsb2dzLmFkZEFwcGxpY2F0aW9uTG9nKCdPYmplY3RbJyArIGkgKyAnXS4nICsga2V5ICsgJyAtIFRoaXMgdmFsdWUgZXhjZWVkcyBleHBlY3RlZCBudW1lcmljIHByZWNpc2lvbi4nKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzU3BlYy5jb2xOYW1lICAgICAgICAgICAgICAgICAgICA9IGtleTtcbiAgICAgICAgdGhpc1NwZWMuY29sVHlwZSAgICAgICAgICAgICAgICAgICAgPSAnbnVtJztcbiAgICAgICAgdGhpc1NwZWMuY29sTGVuZ3RoICAgICAgICAgICAgICAgICAgPSA4O1xuICAgICAgICB0aGlzU3BlYy5lbmNvZGVkTGVuZ3RoICAgICAgICAgICAgICA9IHRoaXNWYWx1ZS50b1N0cmluZygpLmxlbmd0aDtcbiAgICAgICAgdGFyZ2V0QXJyYXlbY3VycmVudFRhcmdldF1bal1ba2V5XSAgPSB0aGlzVmFsdWU7XG4gICAgICB9IGVsc2UgaWYgKHRoaXNUeXBlID09PSAnc3RyaW5nJyAmJiAhaXNEYXRlKSB7IC8vIHN0cmFpZ2h0Zm9yd2FyZCBzdHJpbmdcbiAgICAgICAgdGhpc1NwZWMuY29sTmFtZSAgICA9IGtleTtcbiAgICAgICAgdGhpc1NwZWMuY29sVHlwZSAgICA9ICdzdHJpbmcnO1xuICAgICAgICB0aGlzU3BlYy5jb2xMZW5ndGggID0gdGhpc1ZhbHVlLmxlbmd0aDtcblxuICAgICAgICBpZiAodGhpc1ZhbHVlID09PSBcIlwiKSB7XG4gICAgICAgICAgdGFyZ2V0QXJyYXlbY3VycmVudFRhcmdldF1bal1ba2V5XSA9IFwiIFwiO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRhcmdldEFycmF5W2N1cnJlbnRUYXJnZXRdW2pdW2tleV0gPSBlbmNvZGVVUklDb21wb25lbnQodGhpc1ZhbHVlKS5yZXBsYWNlKC8nL2csICclMjcnKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzU3BlYy5lbmNvZGVkTGVuZ3RoID0gdGFyZ2V0QXJyYXlbY3VycmVudFRhcmdldF1bal1ba2V5XS5sZW5ndGg7XG4gICAgICB9IGVsc2UgaWYoaXNEYXRlKSB7XG4gICAgICAgIHRoaXNTcGVjLmNvbE5hbWUgICAgICAgICAgICAgICAgICAgID0ga2V5O1xuICAgICAgICB0aGlzU3BlYy5jb2xUeXBlICAgICAgICAgICAgICAgICAgICA9ICdkYXRlJztcbiAgICAgICAgdGhpc1NwZWMuY29sTGVuZ3RoICAgICAgICAgICAgICAgICAgPSA4O1xuICAgICAgICB0YXJnZXRBcnJheVtjdXJyZW50VGFyZ2V0XVtqXVtrZXldICA9IHNlbGYudG9TYXNEYXRlVGltZSh0aGlzVmFsdWUpO1xuICAgICAgICB0aGlzU3BlYy5lbmNvZGVkTGVuZ3RoICAgICAgICAgICAgICA9IHRhcmdldEFycmF5W2N1cnJlbnRUYXJnZXRdW2pdW2tleV0udG9TdHJpbmcoKS5sZW5ndGg7XG4gICAgICB9IGVsc2UgaWYgKHRoaXNUeXBlID09ICdvYmplY3QnKSB7XG4gICAgICAgIHRoaXNTcGVjLmNvbE5hbWUgICAgICAgICAgICAgICAgICAgID0ga2V5O1xuICAgICAgICB0aGlzU3BlYy5jb2xUeXBlICAgICAgICAgICAgICAgICAgICA9ICdqc29uJztcbiAgICAgICAgdGhpc1NwZWMuY29sTGVuZ3RoICAgICAgICAgICAgICAgICAgPSBKU09OLnN0cmluZ2lmeSh0aGlzVmFsdWUpLmxlbmd0aDtcbiAgICAgICAgdGFyZ2V0QXJyYXlbY3VycmVudFRhcmdldF1bal1ba2V5XSAgPSBlbmNvZGVVUklDb21wb25lbnQoSlNPTi5zdHJpbmdpZnkodGhpc1ZhbHVlKSkucmVwbGFjZSgvJy9nLCAnJTI3Jyk7XG4gICAgICAgIHRoaXNTcGVjLmVuY29kZWRMZW5ndGggICAgICAgICAgICAgID0gdGFyZ2V0QXJyYXlbY3VycmVudFRhcmdldF1bal1ba2V5XS5sZW5ndGg7XG4gICAgICB9XG5cbiAgICAgIGNodW5rUm93Q291bnQgPSBjaHVua1Jvd0NvdW50ICsgNiArIGtleS5sZW5ndGggKyB0aGlzU3BlYy5lbmNvZGVkTGVuZ3RoO1xuXG4gICAgICBpZiAoY2hlY2tBbmRJbmNyZW1lbnQodGhpc1NwZWMpID09IC0xKSB7XG4gICAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ3R5cGVFcnJvcicsICdUaGVyZSBpcyBhIHR5cGUgbWlzbWF0Y2ggaW4gdGhlIGFycmF5IGJldHdlZW4gdmFsdWVzIChjb2x1bW5zKSBvZiB0aGUgc2FtZSBuYW1lLicpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChjaHVua1Jvd0NvdW50ID4gY2h1bmtUaHJlc2hvbGQpIHtcbiAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnUm93ICcgKyBqICsgJyBleGNlZWRzIHNpemUgbGltaXQgb2YgMzJrYicpO1xuICAgIH0gZWxzZSBpZihjaHVua0FycmF5Q291bnQgKyBjaHVua1Jvd0NvdW50ID4gY2h1bmtUaHJlc2hvbGQpIHtcbiAgICAgIC8vY3JlYXRlIG5ldyBhcnJheSBpZiB0aGlzIG9uZSBpcyBmdWxsIGFuZCBtb3ZlIHRoZSBsYXN0IGl0ZW0gdG8gdGhlIG5ldyBhcnJheVxuICAgICAgdmFyIGxhc3RSb3cgPSB0YXJnZXRBcnJheVtjdXJyZW50VGFyZ2V0XS5wb3AoKTsgLy8gZ2V0IHJpZCBvZiB0aGF0IGxhc3Qgcm93XG4gICAgICBjdXJyZW50VGFyZ2V0Kys7IC8vIG1vdmUgb250byB0aGUgbmV4dCBhcnJheVxuICAgICAgdGFyZ2V0QXJyYXlbY3VycmVudFRhcmdldF0gID0gW2xhc3RSb3ddOyAvLyBtYWtlIGl0IGFuIGFycmF5XG4gICAgICBqICAgICAgICAgICAgICAgICAgICAgICAgICAgPSAwOyAvLyBpbml0aWFsaXNlIG5ldyByb3cgY291bnRlciBmb3IgbmV3IGFycmF5IC0gaXQgd2lsbCBiZSBpbmNyZW1lbnRlZCBhdCB0aGUgZW5kIG9mIHRoZSBmdW5jdGlvblxuICAgICAgY2h1bmtBcnJheUNvdW50ICAgICAgICAgICAgID0gY2h1bmtSb3dDb3VudDsgLy8gdGhpcyBpcyB0aGUgbmV3IGNodW5rIG1heCBzaXplXG4gICAgfSBlbHNlIHtcbiAgICAgIGNodW5rQXJyYXlDb3VudCA9IGNodW5rQXJyYXlDb3VudCArIGNodW5rUm93Q291bnQ7XG4gICAgfVxuICAgIGorKztcbiAgfVxuXG4gIC8vIHJlZm9ybWF0IGV4aXN0aW5nQ29scyBpbnRvIGFuIGFycmF5IHNvIHNhcyBjYW4gcGFyc2UgaXQ7XG4gIHZhciBzcGVjQXJyYXkgPSBbXTtcbiAgZm9yICh2YXIgayBpbiBleGlzdGluZ0NvbHMpIHtcbiAgICBzcGVjQXJyYXkucHVzaChleGlzdGluZ0NvbHNba10pO1xuICB9XG4gIHJldHVybiB7XG4gICAgc3BlYzogICAgICAgc3BlY0FycmF5LFxuICAgIGRhdGE6ICAgICAgIHRhcmdldEFycmF5LFxuICAgIGpzb25MZW5ndGg6IGNodW5rQXJyYXlDb3VudFxuICB9OyAvLyB0aGUgc3BlYyB3aWxsIGJlIHRoZSBtYWNyb1swXSwgd2l0aCB0aGUgZGF0YSBzcGxpdCBpbnRvIGFycmF5cyBvZiBtYWNyb1sxLW5dXG4gIC8vIG1lYW5zIGluIHRlcm1zIG9mIGRvam8geGhyIG9iamVjdCBhdCBsZWFzdCB0aGV5IG5lZWQgdG8gZ28gaW50byB0aGUgc2FtZSBhcnJheVxufTtcblxuLypcbiogQ29udmVydCBqYXZhc2NyaXB0IGRhdGUgdG8gc2FzIHRpbWVcbipcbiogQHBhcmFtIHtvYmplY3R9IGpzRGF0ZSAtIGphdmFzY3JpcHQgRGF0ZSBvYmplY3RcbipcbiovXG5tb2R1bGUuZXhwb3J0cy50b1Nhc0RhdGVUaW1lID0gZnVuY3Rpb24gKGpzRGF0ZSkge1xuICB2YXIgYmFzZWRhdGUgPSBuZXcgRGF0ZShcIkphbnVhcnkgMSwgMTk2MCAwMDowMDowMFwiKTtcbiAgdmFyIGN1cnJkYXRlID0ganNEYXRlO1xuXG4gIC8vIG9mZnNldHMgZm9yIFVUQyBhbmQgdGltZXpvbmVzIGFuZCBCU1RcbiAgdmFyIGJhc2VPZmZzZXQgPSBiYXNlZGF0ZS5nZXRUaW1lem9uZU9mZnNldCgpOyAvLyBpbiBtaW51dGVzXG4gIHZhciBjdXJyT2Zmc2V0ID0gY3VycmRhdGUuZ2V0VGltZXpvbmVPZmZzZXQoKTsgLy8gaW4gbWludXRlc1xuXG4gIC8vIGNvbnZlcnQgY3VycmRhdGUgdG8gYSBzYXMgZGF0ZXRpbWVcbiAgdmFyIG9mZnNldFNlY3MgICAgPSAoY3Vyck9mZnNldCAtIGJhc2VPZmZzZXQpICogNjA7IC8vIG9mZnNldERpZmYgaXMgaW4gbWludXRlcyB0byBzdGFydCB3aXRoXG4gIHZhciBiYXNlRGF0ZVNlY3MgID0gYmFzZWRhdGUuZ2V0VGltZSgpIC8gMTAwMDsgLy8gZ2V0IHJpZCBvZiBtc1xuICB2YXIgY3VycmRhdGVTZWNzICA9IGN1cnJkYXRlLmdldFRpbWUoKSAvIDEwMDA7IC8vIGdldCByaWQgb2YgbXNcbiAgdmFyIHNhc0RhdGV0aW1lICAgPSBNYXRoLnJvdW5kKGN1cnJkYXRlU2VjcyAtIGJhc2VEYXRlU2VjcyAtIG9mZnNldFNlY3MpOyAvLyBhZGp1c3RcblxuICByZXR1cm4gc2FzRGF0ZXRpbWU7XG59O1xuIl19
