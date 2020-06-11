(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.h54s = f()}})(function(){var define,module,exports;return (function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
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

/** 
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

/** 
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
// TODO: can we move these into the constructor or something?
var h54sError = require('./error.js');

const sasVersionMap = {
	v9: {
    url: '/SASStoredProcess/do',
    loginUrl: '/SASLogon/login',
		logoutUrl: '/SASStoredProcess/do?_action=logoff',
    RESTAuthLoginUrl: '/SASLogon/v1/tickets'
	},
	viya: {
		url: '/SASJobExecution/',
    loginUrl: '/SASLogon/login.do',
		logoutUrl: '/SASLogon/logout.do?',
    RESTAuthLoginUrl: ''
	}
}

/** 
*
* @constructor
* // TODO: NM some of these do not override the params in the constructor, we need to decide what to include in JSDoc
* @param {Object} config - Configuration object for the H54S SAS Adapter
* @param {String} config.sasVersion - Version of SAS, either 'v9' or 'viya' 
* @param {Boolean} config.debug - Whether debug mode is enabled, sets _debug=131
* @param {String} config.metadataRoot - Base path of all project services to be prepended to _program path
* @param {String} config.url - URI of the job executor - SPWA or JES
* @param {String} config.loginUrl - URI of the SASLogon web login path - overridden by form action 
* @param {String} config.logoutUrl - URI of the logout action 
* @param {String} config.RESTauth - Boolean to toggle use of REST authentication in SAS v9
* @param {String} config.RESTauthLoginUrl - Address of SASLogon tickets endpoint for REST auth 
* @param {Boolean} config.retryAfterLogin - Whether to resume requests which were parked with login redirect after a successful re-login
* @param {Number} config.maxXhrRetries - If a program call fails, attempt to call it again N times until it succeeds
* @param {Number} config.ajaxTimeout - Number of milliseconds to wait for a response before closing the request
* @param {Boolean} config.useMultipartFormData - Whether to use multipart for POST - for legacy backend support
* @param {String} config.csrf - CSRF token for JES 
* @
*
*/
var h54s = module.exports = function(config) {

  // TODO: NM there should be a way to make this more elegant, it's the first thing anyone sees
  // Default config values, overridden by anything in the config object
	this.sasVersion           = (config && config.sasVersion) || 'v9' //use v9 as default=
  this.debug                = (config && config.debug) || false;
  this.metadataRoot					= (config && config.metadataRoot) || '';
  this.url                  = sasVersionMap[this.sasVersion].url;
  this.loginUrl             = sasVersionMap[this.sasVersion].loginUrl;
  this.logoutUrl            = sasVersionMap[this.sasVersion].logoutUrl;
  this.RESTauth             = false;
  this.RESTauthLoginUrl     = sasVersionMap[this.sasVersion].RESTAuthLoginUrl;
  this.retryAfterLogin      = true;
  this.maxXhrRetries        = 5;
  this.ajaxTimeout          = (config && config.ajaxTimeout) || 300000;
  this.useMultipartFormData = (config && config.useMultipartFormData) || true;
  this.csrf                 = ''
  this.isViya								= this.sasVersion === 'viya';

  // Initialising callback stacks for when authentication is paused
  this.remoteConfigUpdateCallbacks = [];
  this._pendingCalls = [];
  this._customPendingCalls = [];
  this._disableCalls = false
  this._ajax = require('./methods/ajax.js')();

  _setConfig.call(this, config);

  // If this instance was deployed with a standalone config external to the build use that
  if(config && config.isRemoteConfig) {
    var self = this;

    this._disableCalls = true;

    // 'h54sConfig.json' is for the testing with karma
    // TODO: figure out what this actually means, replaced with gulp in dev build
    //       does gulp displace this config with its _server_data object?
    //replaced with gulp in dev build
    this._ajax.get('h54sConfig.json').success(function(res) {
      var remoteConfig = JSON.parse(res.responseText);

      for(let key in remoteConfig) {
        if(remoteConfig.hasOwnProperty(key) && key !== 'isRemoteConfig') {
          // TODO: should we remember metadataRoot from original object here so we can
          //       look for it when we replace metadataRoot in the queued programs?
          config[key] = remoteConfig[key];
        }
      }

      _setConfig.call(self, config);

      // Execute callbacks when overrides from remote config are applied
      for(var i = 0, n = self.remoteConfigUpdateCallbacks.length; i < n; i++) {
        var fn = self.remoteConfigUpdateCallbacks[i];
        fn();
      }

      // Execute sas calls disabled while waiting for the config
      self._disableCalls = false;
      while(self._pendingCalls.length > 0) {
        const pendingCall = self._pendingCalls.shift();
				const sasProgram = pendingCall.options.sasProgram;
				const callbackPending = pendingCall.options.callback;
				const params = pendingCall.params;
				//update debug because it may change in the meantime
				params._debug = self.debug ? 131 : 0;

        // Update program path with metadataRoot if it's not set
        // TODO: does this replace make sense if we have a previous metadataRoot prepended?
        if(self.metadataRoot && params._program.indexOf(self.metadataRoot) === -1) {
          params._program = self.metadataRoot.replace(/\/?$/, '/') + params._program.replace(/^\//, '');
        }

        // Update debug because it may change in the meantime
        params._debug = self.debug ? 131 : 0;

        self.call(sasProgram, null, callbackPending, params);
      }

      // Execute custom calls that we made while waitinf for the config
       while(self._customPendingCalls.length > 0) {
      	const pendingCall = self._customPendingCalls.shift()
				const callMethod = pendingCall.callMethod
				const _url = pendingCall._url
				const options = pendingCall.options;
        ///update program with metadataRoot if it's not set
        // TODO: same as before, do we want to look for indexOf old metadata path to replace it?
        if(self.metadataRoot && options.params && options.params._program.indexOf(self.metadataRoot) === -1) {
          options.params._program = self.metadataRoot.replace(/\/?$/, '/') + options.params._program.replace(/^\//, '');
        }
        //update debug because it also may have changed from remoteConfig
				if (options.params) {
					options.params._debug = self.debug ? 131 : 0;
				}
				self.managedRequest(callMethod, _url, options);
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
    //NOTE: This requires CORS and is here for legacy support
    if(config.hostUrl) {
      if(config.hostUrl.charAt(config.hostUrl.length - 1) === '/') {
        config.hostUrl = config.hostUrl.slice(0, -1);
      }
      this.hostUrl = config.hostUrl;
      if (!this.url.includes(this.hostUrl)) {
				this.url = config.hostUrl + this.url;
			}
			if (!this.loginUrl.includes(this.hostUrl)) {
				this.loginUrl = config.hostUrl + this.loginUrl;
			}
			if (!this.RESTauthLoginUrl.includes(this.hostUrl)) {
				this.RESTauthLoginUrl = config.hostUrl + this.RESTauthLoginUrl;
			}
    }

    this._ajax.setTimeout(this.ajaxTimeout);
  }
};

// replaced by gulp with real version at build time
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
  },
  getAllLogs: function () {
    return {
      sasErrors: logs.sasErrors,
      applicationLogs: logs.applicationLogs,
      debugData: logs.debugData,
      failedRequests: logs.failedRequests
    }
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

/** 
*  Adds application logs to an array of logs
*
* @param {String} message - Message to add to applicationLogs
* @param {String} sasProgram - Header - which request did message come from
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

/** 
* Adds debug data to an array of logs
*
* @param {String} htmlData - Full html log from executor
* @param {String} debugText - Debug text that came after data output
* @param {String} sasProgram - Which program request did message come from
* @param {String} params - Web app params that were received 
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

/** 
* Adds failed requests to an array of failed request logs
*
* @param {String} responseText - Full html output from executor
* @param {String} debugText - Debug text that came after data output
* @param {String} sasProgram - Which program request did message come from
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

/** 
* Adds SAS errors to an array of logs
*
* @param {Array} errors - Array of errors to concat to main log 
*
*/
module.exports.addSasErrors = function(errors) {
  logs.sasErrors = logs.sasErrors.concat(errors);

  while(logs.sasErrors.length > limits.sasErrors) {
    logs.sasErrors.shift();
  }
};

},{}],6:[function(require,module,exports){
// TODO: NM this needs _some_ explanation probably

module.exports = function () {
  var timeout = 30000;
  var timeoutHandle;

  var xhr = function (type, url, data, multipartFormData, headers = {}) {
    var methods = {
      success: function () {
      },
      error: function () {
      }
    };

    var XHR = XMLHttpRequest;
    var request = new XHR('MSXML2.XMLHTTP.3.0');

    request.open(type, url, true);

    //multipart/form-data is set automatically so no need for else block
    // Content-Type header has to be explicitly set up
    if (!multipartFormData) {
      if (headers['Content-Type']) {
        request.setRequestHeader('Content-Type', headers['Content-Type'])
      } else {
        request.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
      }
    }
    Object.keys(headers).forEach(key => {
      if (key !== 'Content-Type') {
        request.setRequestHeader(key, headers[key])
      }
    })
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

    if (timeout > 0) {
      timeoutHandle = setTimeout(function () {
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

  const serialize = function (obj) {
    var str = [];
    for (var p in obj) {
      if (obj.hasOwnProperty(p)) {
        if (obj[p] instanceof Array) {
          for (var i = 0, n = obj[p].length; i < n; i++) {
            str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p][i]));
          }
        } else {
          str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p]));
        }
      }
    }
    return str.join("&");
  };

  var createMultipartFormDataPayload = function (obj) {
    var data = new FormData();
    for (var p in obj) {
      if (obj.hasOwnProperty(p)) {
        if (obj[p] instanceof Array && p !== 'file') {
          for (var i = 0, n = obj[p].length; i < n; i++) {
            data.append(p, obj[p][i]);
          }
        } else if (p === 'file') {
          data.append(p, obj[p][0], obj[p][1]);
        } else {
          data.append(p, obj[p]);
        }
      }
    }
    return data;
  };

  return {
    get: function (url, data, multipartFormData, headers) {
      var dataStr;
      if (typeof data === 'object') {
        dataStr = serialize(data);
      }
      var urlWithParams = dataStr ? (url + '?' + dataStr) : url;
      return xhr('GET', urlWithParams, null, multipartFormData, headers);
    },
		post: function(url, data, multipartFormData, headers) {
      let payload = data;
      if(typeof data === 'object') {
        if(multipartFormData) {
          payload = createMultipartFormDataPayload(data);
        } else {
          payload = serialize(data);
        }
      }
      return xhr('POST', url, payload, multipartFormData, headers);
    },
    put: function(url, data, multipartFormData, headers) {
      let payload = data;
      if(typeof data === 'object') {
        if(multipartFormData) {
          payload = createMultipartFormDataPayload(data);
        }
      }
      return xhr('PUT', url, payload, multipartFormData, headers);
    },
		delete: function(url, payload, multipartFormData, headers) {
    	return xhr('DELETE', url, payload, null, headers);
		},
    setTimeout: function (t) {
      timeout = t;
    },
    serialize
  };
};

},{}],7:[function(require,module,exports){
var h54sError = require('../error.js');
var logs = require('../logs.js');
var Tables = require('../tables');
var SasData = require('../sasData.js');
var Files = require('../files');

/** 
* Call Sas program
*
* @param {string} sasProgram - Path of the sas program
* @param {Object} dataObj - Instance of Tables object with data added
* @param {function} callback - Callback function called when ajax call is finished
* @param {Object} params - object containing additional program parameters
*
*/
// TODO add url as a param - it will be /SASJobExecution/ most of the time
module.exports.call = function (sasProgram, dataObj, callback, params) {
	var self = this;
	var retryCount = 0;
	var dbg = this.debug;
	var csrf = this.csrf;

	if (!callback || typeof callback !== 'function') {
		throw new h54sError('argumentError', 'You must provide a callback');
	}
	if (!sasProgram) {
		throw new h54sError('argumentError', 'You must provide Sas program file path');
	}
	if (typeof sasProgram !== 'string') {
		throw new h54sError('argumentError', 'First parameter should be string');
	}
	if (this.useMultipartFormData === false && !(dataObj instanceof Tables)) {
		throw new h54sError('argumentError', 'Cannot send files using application/x-www-form-urlencoded. Please use Tables or default value for useMultipartFormData');
	}

	if (!params) {
		params = {
			_program: this._utils.getFullProgramPath(this.metadataRoot, sasProgram),
			_debug: this.debug ? 131 : 0,
			_service: 'default',
			_csrf: csrf
		};
	} else {
		params = Object.assign({}, params, {_csrf: csrf})
	}

	if (dataObj) {
		var key, dataProvider;
		if (dataObj instanceof Tables) {
			dataProvider = dataObj._tables;
		} else if (dataObj instanceof Files || dataObj instanceof SasData) {
			dataProvider = dataObj._files;
		} else {
			console.log(new h54sError('argumentError', 'Wrong type of tables object'))
		}
		for (key in dataProvider) {
			if (dataProvider.hasOwnProperty(key)) {
				params[key] = dataProvider[key];
			}
		}
	}

	if (this._disableCalls) {
		this._pendingCalls.push({
			params,
			options: {
				sasProgram,
				dataObj,
				callback
			}
		});
		return;
	}

	this._ajax.post(this.url, params, this.useMultipartFormData).success(async function (res) {
		if (self._utils.needToLogin.call(self, res)) {
			//remember the call for latter use
			self._pendingCalls.push({
				params,
				options: {
					sasProgram,
					dataObj,
					callback
				}
			});

			//there's no need to continue if previous call returned login error
			if (self._disableCalls) {
				return;
			} else {
				self._disableCalls = true;
			}

			callback(new h54sError('notLoggedinError', 'You are not logged in'));
		} else {
			var resObj, unescapedResObj, err;
			var done = false;

			if (!dbg) {
				try {
					resObj = self._utils.parseRes(res.responseText, sasProgram, params);
					logs.addApplicationLog(resObj.logmessage, sasProgram);

					if (dataObj instanceof Tables) {
						unescapedResObj = self._utils.unescapeValues(resObj);
					} else {
						unescapedResObj = resObj;
					}

					if (resObj.status !== 'success') {
						err = new h54sError('programError', resObj.errormessage, resObj.status);
					}

					done = true;
				} catch (e) {
					if (e instanceof SyntaxError) {
						if (retryCount < self.maxXhrRetries) {
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
					} else if (e instanceof h54sError) {
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
					if (done) {
						callback(err, unescapedResObj);
					}
				}
			} else {
				try {
					resObj = await self._utils.parseDebugRes(res.responseText, sasProgram, params, self.hostUrl, self.isViya, self.managedRequest.bind(self));
					logs.addApplicationLog(resObj.logmessage, sasProgram);

					if (dataObj instanceof Tables) {
						unescapedResObj = self._utils.unescapeValues(resObj);
					} else {
						unescapedResObj = resObj;
					}

					if (resObj.status !== 'success') {
						err = new h54sError('programError', resObj.errormessage, resObj.status);
					}

					done = true;
				} catch (e) {
					if (e instanceof SyntaxError) {
						err = new h54sError('parseError', e.message);
						done = true;
					} else if (e instanceof h54sError) {
						if (e.type === 'parseError' && retryCount < 1) {
							done = false;
							self._ajax.post(self.url, params, self.useMultipartFormData).success(this.success).error(this.error);
							retryCount++;
							logs.addApplicationLog("Retrying #" + retryCount, sasProgram);
						} else {
							if (e instanceof h54sError) {
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
					if (done) {
						callback(err, unescapedResObj);
					}
				}
			}
		}
	}).error(function (res) {
		let _csrf
		if (res.status == 449 || (res.status == 403 && (res.responseText.includes('_csrf') || res.getResponseHeader('X-Forbidden-Reason') === 'CSRF') && (_csrf = res.getResponseHeader(res.getResponseHeader('X-CSRF-HEADER'))))) {
			// if ((res.status == 403 || res.status == 449) && (res.responseText.includes('_csrf') || res.getResponseHeader('X-Forbidden-Reason') === 'CSRF') && (_csrf = res.getResponseHeader(res.getResponseHeader('X-CSRF-HEADER')))) {
			params['_csrf'] = _csrf;
			self.csrf = _csrf
			if (retryCount < self.maxXhrRetries) {
				self._ajax.post(self.url, params, true).success(this.success).error(this.error);
				retryCount++;
				logs.addApplicationLog("Retrying #" + retryCount, sasProgram);
			} else {
				self._utils.parseErrorResponse(res.responseText, sasProgram);
				self._utils.addFailedResponse(res.responseText, sasProgram);
				callback(new h54sError('parseError', 'Unable to parse response json'));
			}
		} else {
			logs.addApplicationLog('Request failed with status: ' + res.status, sasProgram);
			// if request has error text else callback
			callback(new h54sError('httpError', res.statusText));
		}
	});
};

/** 
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
// TODO: what does this TODO mean
// TODO Create login function with promises for proper login feature
module.exports.login = function (user, pass, callback) {
	if (!user || !pass) {
		throw new h54sError('argumentError', 'Credentials not set');
	}
	if (typeof user !== 'string' || typeof pass !== 'string') {
		throw new h54sError('argumentError', 'User and pass parameters must be strings');
	}
	//NOTE: callback optional?
	if (!callback || typeof callback !== 'function') {
		throw new h54sError('argumentError', 'You must provide callback');
	}

	if (!this.RESTauth) {
		handleSasLogon.call(this, user, pass, callback);
	} else {
		handleRestLogon.call(this, user, pass, callback);
	}
};

/** 
* ManagedRequest method
*
* @param {string} callMethod - get, post, 
* @param {string} _url - URL to make request to
* @param {json} options - must to carry on callback function
* // TODO: what does this options comment mean, needs clarification
*/
module.exports.managedRequest = function (callMethod = 'get', _url, options = {
	callback: () => console.log('Missing callback funciton')
}) {
	const self = this;
	const csrf = this.csrf;
	let retryCount = 0;
	const {useMultipartFormData, sasProgram, dataObj, params, callback, headers} = options

	// TODO - Extend managedRequest method to accept regular call with params sasProgram and dataObj
	// TODO: is this TODO done?
	if (sasProgram) {
		return self.call(sasProgram, dataObj, callback, params)
	}

	let url = _url
	if (!_url.startsWith('http')) {
		url = self.hostUrl + _url
	}

	const _headers = Object.assign({}, headers, {
		'X-CSRF-TOKEN': csrf
	})
	const _options = Object.assign({}, options, {
		headers: _headers
	})

	if (this._disableCalls) {
		this._customPendingCalls.push({
			callMethod,
			_url,
			options: _options
		});
		return;
	}

	self._ajax[callMethod](url, params, useMultipartFormData, _headers).success(function (res) {
		if (self._utils.needToLogin.call(self, res)) {
			//remember the call for latter use
			self._customPendingCalls.push({
				callMethod,
				_url,
				options: _options
			});

			//there's no need to continue if previous call returned login error
			if (self._disableCalls) {
				return;
			} else {
				self._disableCalls = true;
			}

			callback(new h54sError('notLoggedinError', 'You are not logged in'));
		} else {
			let resObj, err;
			let done = false;

			try {
				// TODO: NM are we really publishing code with stuff like this in
				// todo: check that this returns valid json or something
				// resObj = res.responseText;
				// done = true;

				const arr = res.getAllResponseHeaders().split('\r\n');
				const resHeaders = arr.reduce(function (acc, current, i) {
					let parts = current.split(': ');
					acc[parts[0]] = parts[1];
					return acc;
				}, {});
				let body = res.responseText
				try {
					body = JSON.parse(body)
				} catch (e) {
					console.log('response is not JSON string')
				} finally {
					resObj = Object.assign({}, {
						headers: resHeaders,
						status: res.status,
						statusText: res.statusText,
						body
					})
					done = true;
				}


			} catch (e) {
				err = new h54sError('unknownError', e.message);
				err.stack = e.stack;
				done = true;

			} finally {
				if (done) {
					callback(err, resObj)
				}

			}
		}
	}).error(function (res) {
		let _csrf
		if (res.status == 449 || (res.status == 403 && (res.responseText.includes('_csrf') || res.getResponseHeader('X-Forbidden-Reason') === 'CSRF') && (_csrf = res.getResponseHeader(res.getResponseHeader('X-CSRF-HEADER'))))) {
			self.csrf = _csrf
			const _headers = Object.assign({}, headers, {[res.getResponseHeader('X-CSRF-HEADER')]: _csrf})
			if (retryCount < self.maxXhrRetries) {
				self._ajax[callMethod](url, params, useMultipartFormData, _headers).success(this.success).error(this.error);
				retryCount++;
			} else {
				// TODO: NM are we adding this fail condition before we publish
				// todo: add fail condition that is not related to data call
				callback(new h54sError('parseError', 'Unable to parse response json'));
			}
		} else {
			logs.addApplicationLog('Managed request failed with status: ' + res.status, _url);
			// if request has error text else callback
			callback(new h54sError('httpError1', res.responseText, res.status));
		}
	});
}

/**
 * Log on to SAS if we are asked to 
 * @param {String} user - Username of user
 * @param {String} pass - Password of user
 * @param {function} callback - what to do after 
 */
function handleSasLogon(user, pass, callback) {
	var self = this;

	var loginParams = {
		_service: 'default',
		//for SAS 9.4,
		username: user,
		password: pass
	};

	for (var key in this._aditionalLoginParams) {
		loginParams[key] = this._aditionalLoginParams[key];
	}

	this._loginAttempts = 0;

	this._ajax.post(this.loginUrl, loginParams)
		.success(handleSasLogonSuccess)
		.error(handleSasLogonError);

	function handleSasLogonError(res) {
		if (res.status == 449) {
			handleSasLogonSuccess(res);
			return;
		}

		logs.addApplicationLog('Login failed with status code: ' + res.status);
		callback(res.status);
	}

	function handleSasLogonSuccess(res) {
		if (++self._loginAttempts === 3) {
			return callback(-2);
		}
		if (self._utils.needToLogin.call(self, res)) {
			//we are getting form again after redirect
			//and need to login again using the new url
			//_loginChanged is set in needToLogin function
			//but if login url is not different, we are checking if there are aditional parameters
			if (self._loginChanged || (self._isNewLoginPage && !self._aditionalLoginParams)) {
				delete self._loginChanged;
				var inputs = res.responseText.match(/<input.*"hidden"[^>]*>/g);
				if (inputs) {
					inputs.forEach(function (inputStr) {
						var valueMatch = inputStr.match(/name="([^"]*)"\svalue="([^"]*)/);
						loginParams[valueMatch[1]] = valueMatch[2];
					});
				}
				self._ajax.post(self.loginUrl, loginParams).success(function () {
					//we need this get request because of the sas 9.4 security checks
					self._ajax.get(self.url).success(handleSasLogonSuccess).error(handleSasLogonError);
				}).error(handleSasLogonError);
			}
			else {
				//getting form again, but it wasn't a redirect
				logs.addApplicationLog('Wrong username or password');
				callback(-1);
			}
		}
		else {
			self._disableCalls = false;
			callback(res.status);
			while (self._pendingCalls.length > 0) {
				var pendingCall = self._pendingCalls.shift();
				var method = pendingCall.method || self.call.bind(self);
				var sasProgram = pendingCall.options.sasProgram;
				var callbackPending = pendingCall.options.callback;
				var params = pendingCall.params;
				//update debug because it may change in the meantime
				params._debug = self.debug ? 131 : 0;
				if (self.retryAfterLogin) {
					method(sasProgram, null, callbackPending, params);
				}
			}
		}
	};
}
/**
 * REST logon for 9.4 v1 ticket based auth
 * @param {String} user -
 * @param {String} pass 
 * @param {callback} callback 
 */
function handleRestLogon(user, pass, callback) {
	var self = this;

	var loginParams = {
		username: user,
		password: pass
	};

	this._ajax.post(this.RESTauthLoginUrl, loginParams).success(function (res) {
		var location = res.getResponseHeader('Location');

		self._ajax.post(location, {
			service: self.url
		}).success(function (res) {
			if (self.url.indexOf('?') === -1) {
				self.url += '?ticket=' + res.responseText;
			} else {
				if (self.url.indexOf('ticket') !== -1) {
					self.url = self.url.replace(/ticket=[^&]+/, 'ticket=' + res.responseText);
				} else {
					self.url += '&ticket=' + res.responseText;
				}
			}

			callback(res.status);
		}).error(function (res) {
			logs.addApplicationLog('Login failed with status code: ' + res.status);
			callback(res.status);
		});
	}).error(function (res) {
		if (res.responseText === 'error.authentication.credentials.bad') {
			callback(-1);
		} else {
			logs.addApplicationLog('Login failed with status code: ' + res.status);
			callback(res.status);
		}
	});
}

/** 
* Logout method
*
* @param {function} callback - Callback function called when logout is done
*
*/

module.exports.logout = function (callback) {
	var baseUrl = this.hostUrl || '';
	var url = baseUrl + this.logoutUrl;

	this._ajax.get(url).success(function (res) {
		this._disableCalls = true
		callback();
	}).error(function (res) {
		logs.addApplicationLog('Logout failed with status code: ' + res.status);
		callback(res.status);
	});
};

/*
* Enter debug mode
*
*/
module.exports.setDebugMode = function () {
	this.debug = true;
};

/*
* Exit debug mode and clear logs
*
*/
module.exports.unsetDebugMode = function () {
	this.debug = false;
};

for (var key in logs.get) {
	if (logs.get.hasOwnProperty(key)) {
		module.exports[key] = logs.get[key];
	}
}

for (var key in logs.clear) {
	if (logs.clear.hasOwnProperty(key)) {
		module.exports[key] = logs.clear[key];
	}
}

/*
* Add callback functions executed when properties are updated with remote config
*
*@callback - callback pushed to array
*
*/
module.exports.onRemoteConfigUpdate = function (callback) {
	this.remoteConfigUpdateCallbacks.push(callback);
};

module.exports._utils = require('./utils.js');

/**
 * Login call which returns a promise
 * @param {String} user - Username
 * @param {String} pass - Password
 */
module.exports.promiseLogin = function (user, pass) {
	return new Promise((resolve, reject) => {
		if (!user || !pass) {
			reject(new h54sError('argumentError', 'Credentials not set'))
		}
		if (typeof user !== 'string' || typeof pass !== 'string') {
			reject(new h54sError('argumentError', 'User and pass parameters must be strings'))
		}
		if (!this.RESTauth) {
			customHandleSasLogon.call(this, user, pass, resolve);
			// promiseHandleSasLogon.call(this, user, pass, resolve, reject);
		} else {
			customHandleRestLogon.call(this, user, pass, resolve);
			// handleRestLogon.call(this, user, pass, resolve);
		}
	})
}

/**
 * 
 * @param {String} user - Username 
 * @param {String} pass - Password
 * @param {function} callback - function to call when successful
 */
function customHandleSasLogon(user, pass, callback) {
	const self = this;
	let loginParams = {
		_service: 'default',
		//for SAS 9.4,
		username: user,
		password: pass
	};

	for (let key in this._aditionalLoginParams) {
		loginParams[key] = this._aditionalLoginParams[key];
	}

	this._loginAttempts = 0;
	loginParams = this._ajax.serialize(loginParams)

	this._ajax.post(this.loginUrl, loginParams)
		.success(handleSasLogonSuccess)
		.error(handleSasLogonError);

	function handleSasLogonError(res) {
		if (res.status == 449) {
			handleSasLogonSuccess(res);
			// resolve(res.status);
		} else {
			logs.addApplicationLog('Login failed with status code: ' + res.status);
			callback(res.status);
		}
	}

	function handleSasLogonSuccess(res) {
		if (++self._loginAttempts === 3) {
			callback(-2);
		}

		if (self._utils.needToLogin.call(self, res)) {
			//we are getting form again after redirect
			//and need to login again using the new url
			//_loginChanged is set in needToLogin function
			//but if login url is not different, we are checking if there are aditional parameters
			if (self._loginChanged || (self._isNewLoginPage && !self._aditionalLoginParams)) {
				delete self._loginChanged;
				const inputs = res.responseText.match(/<input.*"hidden"[^>]*>/g);
				if (inputs) {
					inputs.forEach(function (inputStr) {
						const valueMatch = inputStr.match(/name="([^"]*)"\svalue="([^"]*)/);
						loginParams[valueMatch[1]] = valueMatch[2];
					});
				}
				self._ajax.post(self.loginUrl, loginParams).success(function () {
					//we need this get request because of the sas 9.4 security checks
					//TODO Is this necessary ???? because all pending calls should be calld after this howerver.
					// self._ajax[callMethod](url).success(handleSasLogonSuccess).error(handleSasLogonError);
					handleSasLogonSuccess()
				}).error(handleSasLogonError);
			}
			else {
				//getting form again, but it wasn't a redirect
				logs.addApplicationLog('Wrong username or password');
				callback(-1);
			}
		}
		else {
			self._disableCalls = false;
			callback(res.status);
			while (self._customPendingCalls.length > 0) {
				const pendingCall = self._customPendingCalls.shift()
				const method = pendingCall.method || self.managedRequest.bind(self);
				const callMethod = pendingCall.callMethod
				const _url = pendingCall._url
				const options = pendingCall.options;
				//update debug because it may change in the meantime
				if (options.params) {
					options.params._debug = self.debug ? 131 : 0;
				}
				if (self.retryAfterLogin) {
					method(callMethod, _url, options);
				}
			}

			while (self._pendingCalls.length > 0) {
				const pendingCall = self._pendingCalls.shift();
				const method = pendingCall.method || self.call.bind(self);
				const sasProgram = pendingCall.options.sasProgram;
				const callbackPending = pendingCall.options.callback;
				const params = pendingCall.params;
				//update debug because it may change in the meantime
				params._debug = self.debug ? 131 : 0;
				if (self.retryAfterLogin) {
					method(sasProgram, null, callbackPending, params);
				}
			}
		}
	};
}

/**
 * To be used with future managed metadata calls 
 * @param {String} user - Username
 * @param {String} pass - Password
 * @param {function} callback - what to call after 
 * @param {String} callbackUrl - where to navigate after getting ticket
 */
function customHandleRestLogon(user, pass, callback, callbackUrl) {
	var self = this;

	var loginParams = {
		username: user,
		password: pass
	};

	this._ajax.post(this.RESTauthLoginUrl, loginParams).success(function (res) {
		var location = res.getResponseHeader('Location');

		self._ajax.post(location, {
			service: callbackUrl
		}).success(function (res) {
			if (callbackUrl.indexOf('?') === -1) {
				callbackUrl += '?ticket=' + res.responseText;
			} else {
				if (callbackUrl.indexOf('ticket') !== -1) {
					callbackUrl = callbackUrl.replace(/ticket=[^&]+/, 'ticket=' + res.responseText);
				} else {
					callbackUrl += '&ticket=' + res.responseText;
				}
			}

			callback(res.status);
		}).error(function (res) {
			logs.addApplicationLog('Login failed with status code: ' + res.status);
			callback(res.status);
		});
	}).error(function (res) {
		if (res.responseText === 'error.authentication.credentials.bad') {
			callback(-1);
		} else {
			logs.addApplicationLog('Login failed with status code: ' + res.status);
			callback(res.status);
		}
	});
}


// Utilility functions for handling files and folders on VIYA
/**
 * Returns the details of a folder from folder service
 * @param {String} folderName - Full path of folder to be found
 * @param {Object} options - Options object for managedRequest
 */
module.exports.getFolderDetails = function (folderName, options) {
	// First call to get folder's id
	let url = "/folders/folders/@item?path=" + folderName
	return this.managedRequest('get', url, options);
}

/**
 * Returns the details of a file from files service
 * @param {String} fileUri - Full path of file to be found
 * @param {Object} options - Options object for managedRequest
 */
// TODO: NM are we keeping the cachebusting if we are able to disable cache in xhr object
module.exports.getFileDetails = function (fileUri, options) {
	const cacheBust = options.cacheBust
	if (cacheBust) {
		fileUri += '?cacheBust=' + new Date().getTime()
	}
	return this.managedRequest('get', fileUri, options);
}

/**
 * Returns the contents of a file from files service
 * @param {String} fileUri - Full path of file to be downloaded
 * @param {Object} options - Options object for managedRequest
 */
// TODO: NM are we keeping the cachebusting if we are able to disable cache in xhr object
module.exports.getFileContent = function (fileUri, options) {
	const cacheBust = options.cacheBust
	let uri = fileUri + '/content'
	if (cacheBust) {
		uri += '?cacheBust=' + new Date().getTime()
	}
	return this.managedRequest('get', uri, options);
}


// Util functions for working with files and folders
/**
 * Returns details about folder it self and it's members with details
 * @param {String} folderName - Full path of folder to be found
 * @param {Object} options - Options object for managedRequest
 */
module.exports.getFolderContents = async function (folderName, options) {
	const self = this
	const {callback} = options

	// Second call to get folder's memebers
	const _callback = (err, data) => {
		let id = data.body.id
		let membersUrl = '/folders/folders/' + id + '/members' + '/?limit=10000000';
		return self.managedRequest('get', membersUrl, {callback})
	}

	// First call to get folder's id
	let url = "/folders/folders/@item?path=" + folderName
	const optionsObj = Object.assign({}, options, {
		callback: _callback
	})
	this.managedRequest('get', url, optionsObj)
}

/**
 * Creates a folder 
 * @param {String} parentUri - The uri of the folder where the new child is being created
 * @param {String} folderName - Full path of folder to be found
 * @param {Object} options - Options object for managedRequest
 */
module.exports.createNewFolder = function (parentUri, folderName, options) {
	var headers = {
		'Accept': 'application/json, text/javascript, */*; q=0.01',
		'Content-Type': 'application/json',
	}

	var url = '/folders/folders?parentFolderUri=' + parentUri;
	var data = {
		'name': folderName,
		'type': "folder"
	}

	const optionsObj = Object.assign({}, options, {
		params: JSON.stringify(data),
		headers,
		useMultipartFormData: false
	})

	return this.managedRequest('post', url, optionsObj);
}

/**
 * Deletes a folder 
 * @param {String} folderId - Full URI of folder to be deleted
 * @param {Object} options - Options object for managedRequest
 */

module.exports.deleteFolderById = function (folderId, options) {
	var url = '/folders/folders/' + folderId;
	return this.managedRequest('delete', url, options)
}

// TODO: NM what is this todo below for
// TODO module.exports.deleteFolder = functino (folderId, optins)

/**
 * Creates a new file
 * @param {String} fileName - Name of the file being created
 * @param {String} fileBlob - Content of the file
 * @param {String} parentFOlderUri - URI of the parent folder where the file is to be created
 * @param {Object} options - Options object for managedRequest
 */
module.exports.createNewFile = function (fileName, fileBlob, parentFolderUri, options) {
	let url = "/files/files#multipartUpload";
	let dataObj = {
		file: [fileBlob, fileName],
		parentFolderUri
	}

	const optionsObj = Object.assign({}, options, {
		params: dataObj,
		useMultipartFormData: true,
	})
	return this.managedRequest('post', url, optionsObj);
}

/**
 * Generic delete function that deletes by URI
 * @param {String} itemUri - Name of the item being deleted
 * @param {Object} options - Options object for managedRequest
 */
module.exports.deleteItem = function (itemUri, options) {
	return this.managedRequest('delete', itemUri, options)
}

/**
 * Updates contents of a file
 * @param {String} fileName - Name of the file being updated
 * @param {String} fileBlob - New content of the file
 * @param {String} lastModified - the last-modified header string that matches that of file being overwritten
 * @param {Object} options - Options object for managedRequest
 */
module.exports.updateFile = function (itemUri, fileBlob, lastModified, options) {
	const url = itemUri + '/content'
	console.log('URL', url)
	let headers = {
		'Content-Type': 'application/vnd.sas.file',
		'If-Unmodified-Since': lastModified
	}
	const optionsObj = Object.assign({}, options, {
		params: fileBlob,
		headers,
		useMultipartFormData: false
	})
	return this.managedRequest('put', url, optionsObj);
}


},{"../error.js":1,"../files":2,"../logs.js":5,"../sasData.js":9,"../tables":10,"./utils.js":8}],8:[function(require,module,exports){
var logs = require('../logs.js');
var h54sError = require('../error.js');

// TODO NM: we have some of these as consts, we have some of these as vars, whats the correct way of doing it?
var programNotFoundPatt = /<title>(Stored Process Error|SASStoredProcess)<\/title>[\s\S]*<h2>(Stored process not found:.*|.*not a valid stored process path.)<\/h2>/;
var badJobDefinition = "<h2>Parameter Error <br/>Unable to get job definition.</h2>";

var responseReplace = function(res) {
  return res;
};

/** 
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

/** 
* Parse response from server in debug mode
*
* @param {object} responseText - response html from the server
* @param {string} sasProgram - sas program path
* @param {object} params - params sent to sas program with addTable
* @param {string} hostUrl - same as in h54s constructor
* @param {bool} isViya - same as in h54s constructor
*
*/
module.exports.parseDebugRes = function (responseText, sasProgram, params, hostUrl, isViya) {
	let matches = responseText.match(programNotFoundPatt);
	if (matches) {
		throw new h54sError('programNotFound', 'Sas program completed with errors');
	}

	if (isViya) {
		const matchesWrongJob = responseText.match(badJobDefinition);
		if (matchesWrongJob) {
			throw new h54sError('programNotFound', 'Sas program completed with errors. Unable to get job definition.');
		}
	}

	//find the data segment of the response
	let patt = isViya ? /^(.?<iframe.*src=")([^"]+)(.*iframe>)/m : /^(.?--h54s-data-start--)([\S\s]*?)(--h54s-data-end--)/m;
	matches = responseText.match(patt);

	const page = responseText.replace(patt, '');
	const htmlBodyPatt = /<body.*>([\s\S]*)<\/body>/;
	const bodyMatches = page.match(htmlBodyPatt);
	//remove html tags
	let debugText = bodyMatches[1].replace(/<[^>]*>/g, '');
	debugText = this.decodeHTMLEntities(debugText);

	logs.addDebugData(bodyMatches[1], debugText, sasProgram, params);

  if (isViya && this.parseErrorResponse(responseText, sasProgram)) {
		throw new h54sError('sasError', 'Sas program completed with errors');
	}
	if (!matches) {
		throw new h54sError('parseError', 'Unable to parse response json');
	}

  let jsonObj
	if (isViya) {
		const xhttp = new XMLHttpRequest();
		const baseUrl = hostUrl || "";

    xhttp.open("GET", baseUrl + matches[2], false);
    // TODO: NM I thought this was made async? 
		xhttp.send();
		const response = xhttp.responseText;
		jsonObj = JSON.parse(response.replace(/(\r\n|\r|\n)/g, ''));
		return jsonObj;
	}

	// v9 support code
	try {
		jsonObj = JSON.parse(responseReplace(matches[2]));
	} catch (e) {
		throw new h54sError('parseError', 'Unable to parse response json');
	}
	if (jsonObj && jsonObj.h54sAbort) {
		return jsonObj;
	} else if (this.parseErrorResponse(responseText, sasProgram)) {
		throw new h54sError('sasError', 'Sas program completed with errors');
	} else {
		return jsonObj;
	}
};

/** 
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

/** 
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

/** 
* Parse error response from server and save errors in memory
*
* @param {string} res - server response
* @param {string} sasProgram - sas program which returned the response
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

/** 
* Decode HTML entities - old utility function
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

/**
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

/**
 * Checks whether response object is a login redirect
 * TODO: this can be changed to use xhr.Url once we know that is reliable, parses responseText now
 * @param {Object} responseObj xhr response to be checked for logon redirect
 */
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
    var parser = new DOMParser();
    var doc = parser.parseFromString(responseObj.responseText,"text/html");
    var res = doc.querySelectorAll("input[type='hidden']");
    var hiddenFormParams = {};
    if(res) {
      //it's new login page if we have these additional parameters
      this._isNewLoginPage = true;
      res.forEach(function(node) {
        hiddenFormParams[node.name] = node.value;
      });
      this._aditionalLoginParams = hiddenFormParams;
    }

    return true;
  }
};

/** 
* Get full program path from metadata root and relative path
*
* @param {string} metadataRoot - Metadata root (path where all programs for the project are located)
* @param {string} sasProgramPath - Sas program path
*
*/
module.exports.getFullProgramPath = function(metadataRoot, sasProgramPath) {
  return metadataRoot ? metadataRoot.replace(/\/?$/, '/') + sasProgramPath.replace(/^\//, '') : sasProgramPath;
};

// Returns object where table rows are groupped by key
module.exports.getObjOfTable = function (table, key, value = null) {
	const obj = {}
	table.forEach(row => {
		obj[row[key]] = value ? row[value] : row
	})
	return obj
}

// Returns self uri out of links array
module.exports.getSelfUri = function (links) {
	return links
		.filter(e => e.rel === 'self')
		.map(e => e.uri)
		.shift();
}

},{"../error.js":1,"../logs.js":5}],9:[function(require,module,exports){
var h54sError = require('./error.js');
var logs      = require('./logs.js');
var Tables    = require('./tables');
var Files     = require('./files');
var toSasDateTime = require('./tables/utils.js').toSasDateTime;

/**
 * Checks whether a given table name is a valid SAS macro name
 * @param {String} macroName The SAS macro name to be given to this table
 */
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

/** 
* h54s SAS data object constructor
* @constructor
*
* @param {array|file} data - Table or file added when object is created
* @param {String} macroName The SAS macro name to be given to this table
* @param {number} parameterThreshold - size of data objects sent to SAS (legacy)
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

/** 
* Add table to tables object
* @param {array} table - Array of table objects
* @param {String} macroName The SAS macro name to be given to this table
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
        if(type === 'string' && val.indexOf('\r\n') !== -1) {
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
            sasCsv += '"' + JSON.stringify(val).replace(/"/g, '""') + '"';
            break;
        }
      }
      // do not insert if it's the last column
      if(j < specKeys.length - 1) {
        sasCsv += ',';
      }
    }
    if(i < table.length - 1) {
      sasCsv += '\r\n';
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

/**
 * Add file as a verbatim blob file uplaod 
 * @param {Blob} file - the blob that will be uploaded as file
 * @param {String} macroName - the SAS webin name given to this file
 */
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
      	console.log("ERROR VALUE ", thisValue)
      	console.log("TYPEOF VALUE ", typeof thisValue)
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

//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvZXJyb3IuanMiLCJzcmMvZmlsZXMvaW5kZXguanMiLCJzcmMvaDU0cy5qcyIsInNyYy9pZV9wb2x5ZmlsbHMuanMiLCJzcmMvbG9ncy5qcyIsInNyYy9tZXRob2RzL2FqYXguanMiLCJzcmMvbWV0aG9kcy9pbmRleC5qcyIsInNyYy9tZXRob2RzL3V0aWxzLmpzIiwic3JjL3Nhc0RhdGEuanMiLCJzcmMvdGFibGVzL2luZGV4LmpzIiwic3JjL3RhYmxlcy91dGlscy5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwTUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4SUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMzNCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pTQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pRQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24oKXtmdW5jdGlvbiByKGUsbix0KXtmdW5jdGlvbiBvKGksZil7aWYoIW5baV0pe2lmKCFlW2ldKXt2YXIgYz1cImZ1bmN0aW9uXCI9PXR5cGVvZiByZXF1aXJlJiZyZXF1aXJlO2lmKCFmJiZjKXJldHVybiBjKGksITApO2lmKHUpcmV0dXJuIHUoaSwhMCk7dmFyIGE9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitpK1wiJ1wiKTt0aHJvdyBhLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsYX12YXIgcD1uW2ldPXtleHBvcnRzOnt9fTtlW2ldWzBdLmNhbGwocC5leHBvcnRzLGZ1bmN0aW9uKHIpe3ZhciBuPWVbaV1bMV1bcl07cmV0dXJuIG8obnx8cil9LHAscC5leHBvcnRzLHIsZSxuLHQpfXJldHVybiBuW2ldLmV4cG9ydHN9Zm9yKHZhciB1PVwiZnVuY3Rpb25cIj09dHlwZW9mIHJlcXVpcmUmJnJlcXVpcmUsaT0wO2k8dC5sZW5ndGg7aSsrKW8odFtpXSk7cmV0dXJuIG99cmV0dXJuIHJ9KSgpIiwiLypcbiogaDU0cyBlcnJvciBjb25zdHJ1Y3RvclxuKiBAY29uc3RydWN0b3JcbipcbipAcGFyYW0ge3N0cmluZ30gdHlwZSAtIEVycm9yIHR5cGVcbipAcGFyYW0ge3N0cmluZ30gbWVzc2FnZSAtIEVycm9yIG1lc3NhZ2VcbipAcGFyYW0ge3N0cmluZ30gc3RhdHVzIC0gRXJyb3Igc3RhdHVzIHJldHVybmVkIGZyb20gU0FTXG4qXG4qL1xuZnVuY3Rpb24gaDU0c0Vycm9yKHR5cGUsIG1lc3NhZ2UsIHN0YXR1cykge1xuICBpZihFcnJvci5jYXB0dXJlU3RhY2tUcmFjZSkge1xuICAgIEVycm9yLmNhcHR1cmVTdGFja1RyYWNlKHRoaXMpO1xuICB9XG4gIHRoaXMubWVzc2FnZSA9IG1lc3NhZ2U7XG4gIHRoaXMudHlwZSAgICA9IHR5cGU7XG4gIHRoaXMuc3RhdHVzICA9IHN0YXR1cztcbn1cblxuaDU0c0Vycm9yLnByb3RvdHlwZSA9IE9iamVjdC5jcmVhdGUoRXJyb3IucHJvdG90eXBlLCB7XG4gIGNvbnN0cnVjdG9yOiB7XG4gICAgY29uZmlndXJhYmxlOiBmYWxzZSxcbiAgICBlbnVtZXJhYmxlOiBmYWxzZSxcbiAgICB3cml0YWJsZTogZmFsc2UsXG4gICAgdmFsdWU6IGg1NHNFcnJvclxuICB9LFxuICBuYW1lOiB7XG4gICAgY29uZmlndXJhYmxlOiBmYWxzZSxcbiAgICBlbnVtZXJhYmxlOiBmYWxzZSxcbiAgICB3cml0YWJsZTogZmFsc2UsXG4gICAgdmFsdWU6ICdoNTRzRXJyb3InXG4gIH1cbn0pO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGg1NHNFcnJvcjtcbiIsInZhciBoNTRzRXJyb3IgPSByZXF1aXJlKCcuLi9lcnJvci5qcycpO1xuXG4vKiogXG4qIGg1NHMgU0FTIEZpbGVzIG9iamVjdCBjb25zdHJ1Y3RvclxuKiBAY29uc3RydWN0b3JcbipcbipAcGFyYW0ge2ZpbGV9IGZpbGUgLSBGaWxlIGFkZGVkIHdoZW4gb2JqZWN0IGlzIGNyZWF0ZWRcbipAcGFyYW0ge3N0cmluZ30gbWFjcm9OYW1lIC0gbWFjcm8gbmFtZVxuKlxuKi9cbmZ1bmN0aW9uIEZpbGVzKGZpbGUsIG1hY3JvTmFtZSkge1xuICB0aGlzLl9maWxlcyA9IHt9O1xuXG4gIEZpbGVzLnByb3RvdHlwZS5hZGQuY2FsbCh0aGlzLCBmaWxlLCBtYWNyb05hbWUpO1xufVxuXG4vKiogXG4qIEFkZCBmaWxlIHRvIGZpbGVzIG9iamVjdFxuKiBAcGFyYW0ge2ZpbGV9IGZpbGUgLSBJbnN0YW5jZSBvZiBKYXZhU2NyaXB0IEZpbGUgb2JqZWN0XG4qIEBwYXJhbSB7c3RyaW5nfSBtYWNyb05hbWUgLSBTYXMgbWFjcm8gbmFtZVxuKlxuKi9cbkZpbGVzLnByb3RvdHlwZS5hZGQgPSBmdW5jdGlvbihmaWxlLCBtYWNyb05hbWUpIHtcbiAgaWYoZmlsZSAmJiBtYWNyb05hbWUpIHtcbiAgICBpZighKGZpbGUgaW5zdGFuY2VvZiBGaWxlIHx8IGZpbGUgaW5zdGFuY2VvZiBCbG9iKSkge1xuICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdGaXJzdCBhcmd1bWVudCBtdXN0IGJlIGluc3RhbmNlIG9mIEZpbGUgb2JqZWN0Jyk7XG4gICAgfVxuICAgIGlmKHR5cGVvZiBtYWNyb05hbWUgIT09ICdzdHJpbmcnKSB7XG4gICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1NlY29uZCBhcmd1bWVudCBtdXN0IGJlIHN0cmluZycpO1xuICAgIH1cbiAgICBpZighaXNOYU4obWFjcm9OYW1lW21hY3JvTmFtZS5sZW5ndGggLSAxXSkpIHtcbiAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnTWFjcm8gbmFtZSBjYW5ub3QgaGF2ZSBudW1iZXIgYXQgdGhlIGVuZCcpO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ01pc3NpbmcgYXJndW1lbnRzJyk7XG4gIH1cblxuICB0aGlzLl9maWxlc1ttYWNyb05hbWVdID0gW1xuICAgICdGSUxFJyxcbiAgICBmaWxlXG4gIF07XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IEZpbGVzO1xuIiwiLy8gVE9ETzogY2FuIHdlIG1vdmUgdGhlc2UgaW50byB0aGUgY29uc3RydWN0b3Igb3Igc29tZXRoaW5nP1xudmFyIGg1NHNFcnJvciA9IHJlcXVpcmUoJy4vZXJyb3IuanMnKTtcblxuY29uc3Qgc2FzVmVyc2lvbk1hcCA9IHtcblx0djk6IHtcbiAgICB1cmw6ICcvU0FTU3RvcmVkUHJvY2Vzcy9kbycsXG4gICAgbG9naW5Vcmw6ICcvU0FTTG9nb24vbG9naW4nLFxuXHRcdGxvZ291dFVybDogJy9TQVNTdG9yZWRQcm9jZXNzL2RvP19hY3Rpb249bG9nb2ZmJyxcbiAgICBSRVNUQXV0aExvZ2luVXJsOiAnL1NBU0xvZ29uL3YxL3RpY2tldHMnXG5cdH0sXG5cdHZpeWE6IHtcblx0XHR1cmw6ICcvU0FTSm9iRXhlY3V0aW9uLycsXG4gICAgbG9naW5Vcmw6ICcvU0FTTG9nb24vbG9naW4uZG8nLFxuXHRcdGxvZ291dFVybDogJy9TQVNMb2dvbi9sb2dvdXQuZG8/JyxcbiAgICBSRVNUQXV0aExvZ2luVXJsOiAnJ1xuXHR9XG59XG5cbi8qKiBcbipcbiogQGNvbnN0cnVjdG9yXG4qIC8vIFRPRE86IE5NIHNvbWUgb2YgdGhlc2UgZG8gbm90IG92ZXJyaWRlIHRoZSBwYXJhbXMgaW4gdGhlIGNvbnN0cnVjdG9yLCB3ZSBuZWVkIHRvIGRlY2lkZSB3aGF0IHRvIGluY2x1ZGUgaW4gSlNEb2NcbiogQHBhcmFtIHtPYmplY3R9IGNvbmZpZyAtIENvbmZpZ3VyYXRpb24gb2JqZWN0IGZvciB0aGUgSDU0UyBTQVMgQWRhcHRlclxuKiBAcGFyYW0ge1N0cmluZ30gY29uZmlnLnNhc1ZlcnNpb24gLSBWZXJzaW9uIG9mIFNBUywgZWl0aGVyICd2OScgb3IgJ3ZpeWEnIFxuKiBAcGFyYW0ge0Jvb2xlYW59IGNvbmZpZy5kZWJ1ZyAtIFdoZXRoZXIgZGVidWcgbW9kZSBpcyBlbmFibGVkLCBzZXRzIF9kZWJ1Zz0xMzFcbiogQHBhcmFtIHtTdHJpbmd9IGNvbmZpZy5tZXRhZGF0YVJvb3QgLSBCYXNlIHBhdGggb2YgYWxsIHByb2plY3Qgc2VydmljZXMgdG8gYmUgcHJlcGVuZGVkIHRvIF9wcm9ncmFtIHBhdGhcbiogQHBhcmFtIHtTdHJpbmd9IGNvbmZpZy51cmwgLSBVUkkgb2YgdGhlIGpvYiBleGVjdXRvciAtIFNQV0Egb3IgSkVTXG4qIEBwYXJhbSB7U3RyaW5nfSBjb25maWcubG9naW5VcmwgLSBVUkkgb2YgdGhlIFNBU0xvZ29uIHdlYiBsb2dpbiBwYXRoIC0gb3ZlcnJpZGRlbiBieSBmb3JtIGFjdGlvbiBcbiogQHBhcmFtIHtTdHJpbmd9IGNvbmZpZy5sb2dvdXRVcmwgLSBVUkkgb2YgdGhlIGxvZ291dCBhY3Rpb24gXG4qIEBwYXJhbSB7U3RyaW5nfSBjb25maWcuUkVTVGF1dGggLSBCb29sZWFuIHRvIHRvZ2dsZSB1c2Ugb2YgUkVTVCBhdXRoZW50aWNhdGlvbiBpbiBTQVMgdjlcbiogQHBhcmFtIHtTdHJpbmd9IGNvbmZpZy5SRVNUYXV0aExvZ2luVXJsIC0gQWRkcmVzcyBvZiBTQVNMb2dvbiB0aWNrZXRzIGVuZHBvaW50IGZvciBSRVNUIGF1dGggXG4qIEBwYXJhbSB7Qm9vbGVhbn0gY29uZmlnLnJldHJ5QWZ0ZXJMb2dpbiAtIFdoZXRoZXIgdG8gcmVzdW1lIHJlcXVlc3RzIHdoaWNoIHdlcmUgcGFya2VkIHdpdGggbG9naW4gcmVkaXJlY3QgYWZ0ZXIgYSBzdWNjZXNzZnVsIHJlLWxvZ2luXG4qIEBwYXJhbSB7TnVtYmVyfSBjb25maWcubWF4WGhyUmV0cmllcyAtIElmIGEgcHJvZ3JhbSBjYWxsIGZhaWxzLCBhdHRlbXB0IHRvIGNhbGwgaXQgYWdhaW4gTiB0aW1lcyB1bnRpbCBpdCBzdWNjZWVkc1xuKiBAcGFyYW0ge051bWJlcn0gY29uZmlnLmFqYXhUaW1lb3V0IC0gTnVtYmVyIG9mIG1pbGxpc2Vjb25kcyB0byB3YWl0IGZvciBhIHJlc3BvbnNlIGJlZm9yZSBjbG9zaW5nIHRoZSByZXF1ZXN0XG4qIEBwYXJhbSB7Qm9vbGVhbn0gY29uZmlnLnVzZU11bHRpcGFydEZvcm1EYXRhIC0gV2hldGhlciB0byB1c2UgbXVsdGlwYXJ0IGZvciBQT1NUIC0gZm9yIGxlZ2FjeSBiYWNrZW5kIHN1cHBvcnRcbiogQHBhcmFtIHtTdHJpbmd9IGNvbmZpZy5jc3JmIC0gQ1NSRiB0b2tlbiBmb3IgSkVTIFxuKiBAXG4qXG4qL1xudmFyIGg1NHMgPSBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKGNvbmZpZykge1xuXG4gIC8vIFRPRE86IE5NIHRoZXJlIHNob3VsZCBiZSBhIHdheSB0byBtYWtlIHRoaXMgbW9yZSBlbGVnYW50LCBpdCdzIHRoZSBmaXJzdCB0aGluZyBhbnlvbmUgc2Vlc1xuICAvLyBEZWZhdWx0IGNvbmZpZyB2YWx1ZXMsIG92ZXJyaWRkZW4gYnkgYW55dGhpbmcgaW4gdGhlIGNvbmZpZyBvYmplY3Rcblx0dGhpcy5zYXNWZXJzaW9uICAgICAgICAgICA9IChjb25maWcgJiYgY29uZmlnLnNhc1ZlcnNpb24pIHx8ICd2OScgLy91c2UgdjkgYXMgZGVmYXVsdD1cbiAgdGhpcy5kZWJ1ZyAgICAgICAgICAgICAgICA9IChjb25maWcgJiYgY29uZmlnLmRlYnVnKSB8fCBmYWxzZTtcbiAgdGhpcy5tZXRhZGF0YVJvb3RcdFx0XHRcdFx0PSAoY29uZmlnICYmIGNvbmZpZy5tZXRhZGF0YVJvb3QpIHx8ICcnO1xuICB0aGlzLnVybCAgICAgICAgICAgICAgICAgID0gc2FzVmVyc2lvbk1hcFt0aGlzLnNhc1ZlcnNpb25dLnVybDtcbiAgdGhpcy5sb2dpblVybCAgICAgICAgICAgICA9IHNhc1ZlcnNpb25NYXBbdGhpcy5zYXNWZXJzaW9uXS5sb2dpblVybDtcbiAgdGhpcy5sb2dvdXRVcmwgICAgICAgICAgICA9IHNhc1ZlcnNpb25NYXBbdGhpcy5zYXNWZXJzaW9uXS5sb2dvdXRVcmw7XG4gIHRoaXMuUkVTVGF1dGggICAgICAgICAgICAgPSBmYWxzZTtcbiAgdGhpcy5SRVNUYXV0aExvZ2luVXJsICAgICA9IHNhc1ZlcnNpb25NYXBbdGhpcy5zYXNWZXJzaW9uXS5SRVNUQXV0aExvZ2luVXJsO1xuICB0aGlzLnJldHJ5QWZ0ZXJMb2dpbiAgICAgID0gdHJ1ZTtcbiAgdGhpcy5tYXhYaHJSZXRyaWVzICAgICAgICA9IDU7XG4gIHRoaXMuYWpheFRpbWVvdXQgICAgICAgICAgPSAoY29uZmlnICYmIGNvbmZpZy5hamF4VGltZW91dCkgfHwgMzAwMDAwO1xuICB0aGlzLnVzZU11bHRpcGFydEZvcm1EYXRhID0gKGNvbmZpZyAmJiBjb25maWcudXNlTXVsdGlwYXJ0Rm9ybURhdGEpIHx8IHRydWU7XG4gIHRoaXMuY3NyZiAgICAgICAgICAgICAgICAgPSAnJ1xuICB0aGlzLmlzVml5YVx0XHRcdFx0XHRcdFx0XHQ9IHRoaXMuc2FzVmVyc2lvbiA9PT0gJ3ZpeWEnO1xuXG4gIC8vIEluaXRpYWxpc2luZyBjYWxsYmFjayBzdGFja3MgZm9yIHdoZW4gYXV0aGVudGljYXRpb24gaXMgcGF1c2VkXG4gIHRoaXMucmVtb3RlQ29uZmlnVXBkYXRlQ2FsbGJhY2tzID0gW107XG4gIHRoaXMuX3BlbmRpbmdDYWxscyA9IFtdO1xuICB0aGlzLl9jdXN0b21QZW5kaW5nQ2FsbHMgPSBbXTtcbiAgdGhpcy5fZGlzYWJsZUNhbGxzID0gZmFsc2VcbiAgdGhpcy5fYWpheCA9IHJlcXVpcmUoJy4vbWV0aG9kcy9hamF4LmpzJykoKTtcblxuICBfc2V0Q29uZmlnLmNhbGwodGhpcywgY29uZmlnKTtcblxuICAvLyBJZiB0aGlzIGluc3RhbmNlIHdhcyBkZXBsb3llZCB3aXRoIGEgc3RhbmRhbG9uZSBjb25maWcgZXh0ZXJuYWwgdG8gdGhlIGJ1aWxkIHVzZSB0aGF0XG4gIGlmKGNvbmZpZyAmJiBjb25maWcuaXNSZW1vdGVDb25maWcpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICB0aGlzLl9kaXNhYmxlQ2FsbHMgPSB0cnVlO1xuXG4gICAgLy8gJ2g1NHNDb25maWcuanNvbicgaXMgZm9yIHRoZSB0ZXN0aW5nIHdpdGgga2FybWFcbiAgICAvLyBUT0RPOiBmaWd1cmUgb3V0IHdoYXQgdGhpcyBhY3R1YWxseSBtZWFucywgcmVwbGFjZWQgd2l0aCBndWxwIGluIGRldiBidWlsZFxuICAgIC8vICAgICAgIGRvZXMgZ3VscCBkaXNwbGFjZSB0aGlzIGNvbmZpZyB3aXRoIGl0cyBfc2VydmVyX2RhdGEgb2JqZWN0P1xuICAgIC8vcmVwbGFjZWQgd2l0aCBndWxwIGluIGRldiBidWlsZFxuICAgIHRoaXMuX2FqYXguZ2V0KCdoNTRzQ29uZmlnLmpzb24nKS5zdWNjZXNzKGZ1bmN0aW9uKHJlcykge1xuICAgICAgdmFyIHJlbW90ZUNvbmZpZyA9IEpTT04ucGFyc2UocmVzLnJlc3BvbnNlVGV4dCk7XG5cbiAgICAgIGZvcihsZXQga2V5IGluIHJlbW90ZUNvbmZpZykge1xuICAgICAgICBpZihyZW1vdGVDb25maWcuaGFzT3duUHJvcGVydHkoa2V5KSAmJiBrZXkgIT09ICdpc1JlbW90ZUNvbmZpZycpIHtcbiAgICAgICAgICAvLyBUT0RPOiBzaG91bGQgd2UgcmVtZW1iZXIgbWV0YWRhdGFSb290IGZyb20gb3JpZ2luYWwgb2JqZWN0IGhlcmUgc28gd2UgY2FuXG4gICAgICAgICAgLy8gICAgICAgbG9vayBmb3IgaXQgd2hlbiB3ZSByZXBsYWNlIG1ldGFkYXRhUm9vdCBpbiB0aGUgcXVldWVkIHByb2dyYW1zP1xuICAgICAgICAgIGNvbmZpZ1trZXldID0gcmVtb3RlQ29uZmlnW2tleV07XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgX3NldENvbmZpZy5jYWxsKHNlbGYsIGNvbmZpZyk7XG5cbiAgICAgIC8vIEV4ZWN1dGUgY2FsbGJhY2tzIHdoZW4gb3ZlcnJpZGVzIGZyb20gcmVtb3RlIGNvbmZpZyBhcmUgYXBwbGllZFxuICAgICAgZm9yKHZhciBpID0gMCwgbiA9IHNlbGYucmVtb3RlQ29uZmlnVXBkYXRlQ2FsbGJhY2tzLmxlbmd0aDsgaSA8IG47IGkrKykge1xuICAgICAgICB2YXIgZm4gPSBzZWxmLnJlbW90ZUNvbmZpZ1VwZGF0ZUNhbGxiYWNrc1tpXTtcbiAgICAgICAgZm4oKTtcbiAgICAgIH1cblxuICAgICAgLy8gRXhlY3V0ZSBzYXMgY2FsbHMgZGlzYWJsZWQgd2hpbGUgd2FpdGluZyBmb3IgdGhlIGNvbmZpZ1xuICAgICAgc2VsZi5fZGlzYWJsZUNhbGxzID0gZmFsc2U7XG4gICAgICB3aGlsZShzZWxmLl9wZW5kaW5nQ2FsbHMubGVuZ3RoID4gMCkge1xuICAgICAgICBjb25zdCBwZW5kaW5nQ2FsbCA9IHNlbGYuX3BlbmRpbmdDYWxscy5zaGlmdCgpO1xuXHRcdFx0XHRjb25zdCBzYXNQcm9ncmFtID0gcGVuZGluZ0NhbGwub3B0aW9ucy5zYXNQcm9ncmFtO1xuXHRcdFx0XHRjb25zdCBjYWxsYmFja1BlbmRpbmcgPSBwZW5kaW5nQ2FsbC5vcHRpb25zLmNhbGxiYWNrO1xuXHRcdFx0XHRjb25zdCBwYXJhbXMgPSBwZW5kaW5nQ2FsbC5wYXJhbXM7XG5cdFx0XHRcdC8vdXBkYXRlIGRlYnVnIGJlY2F1c2UgaXQgbWF5IGNoYW5nZSBpbiB0aGUgbWVhbnRpbWVcblx0XHRcdFx0cGFyYW1zLl9kZWJ1ZyA9IHNlbGYuZGVidWcgPyAxMzEgOiAwO1xuXG4gICAgICAgIC8vIFVwZGF0ZSBwcm9ncmFtIHBhdGggd2l0aCBtZXRhZGF0YVJvb3QgaWYgaXQncyBub3Qgc2V0XG4gICAgICAgIC8vIFRPRE86IGRvZXMgdGhpcyByZXBsYWNlIG1ha2Ugc2Vuc2UgaWYgd2UgaGF2ZSBhIHByZXZpb3VzIG1ldGFkYXRhUm9vdCBwcmVwZW5kZWQ/XG4gICAgICAgIGlmKHNlbGYubWV0YWRhdGFSb290ICYmIHBhcmFtcy5fcHJvZ3JhbS5pbmRleE9mKHNlbGYubWV0YWRhdGFSb290KSA9PT0gLTEpIHtcbiAgICAgICAgICBwYXJhbXMuX3Byb2dyYW0gPSBzZWxmLm1ldGFkYXRhUm9vdC5yZXBsYWNlKC9cXC8/JC8sICcvJykgKyBwYXJhbXMuX3Byb2dyYW0ucmVwbGFjZSgvXlxcLy8sICcnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFVwZGF0ZSBkZWJ1ZyBiZWNhdXNlIGl0IG1heSBjaGFuZ2UgaW4gdGhlIG1lYW50aW1lXG4gICAgICAgIHBhcmFtcy5fZGVidWcgPSBzZWxmLmRlYnVnID8gMTMxIDogMDtcblxuICAgICAgICBzZWxmLmNhbGwoc2FzUHJvZ3JhbSwgbnVsbCwgY2FsbGJhY2tQZW5kaW5nLCBwYXJhbXMpO1xuICAgICAgfVxuXG4gICAgICAvLyBFeGVjdXRlIGN1c3RvbSBjYWxscyB0aGF0IHdlIG1hZGUgd2hpbGUgd2FpdGluZiBmb3IgdGhlIGNvbmZpZ1xuICAgICAgIHdoaWxlKHNlbGYuX2N1c3RvbVBlbmRpbmdDYWxscy5sZW5ndGggPiAwKSB7XG4gICAgICBcdGNvbnN0IHBlbmRpbmdDYWxsID0gc2VsZi5fY3VzdG9tUGVuZGluZ0NhbGxzLnNoaWZ0KClcblx0XHRcdFx0Y29uc3QgY2FsbE1ldGhvZCA9IHBlbmRpbmdDYWxsLmNhbGxNZXRob2Rcblx0XHRcdFx0Y29uc3QgX3VybCA9IHBlbmRpbmdDYWxsLl91cmxcblx0XHRcdFx0Y29uc3Qgb3B0aW9ucyA9IHBlbmRpbmdDYWxsLm9wdGlvbnM7XG4gICAgICAgIC8vL3VwZGF0ZSBwcm9ncmFtIHdpdGggbWV0YWRhdGFSb290IGlmIGl0J3Mgbm90IHNldFxuICAgICAgICAvLyBUT0RPOiBzYW1lIGFzIGJlZm9yZSwgZG8gd2Ugd2FudCB0byBsb29rIGZvciBpbmRleE9mIG9sZCBtZXRhZGF0YSBwYXRoIHRvIHJlcGxhY2UgaXQ/XG4gICAgICAgIGlmKHNlbGYubWV0YWRhdGFSb290ICYmIG9wdGlvbnMucGFyYW1zICYmIG9wdGlvbnMucGFyYW1zLl9wcm9ncmFtLmluZGV4T2Yoc2VsZi5tZXRhZGF0YVJvb3QpID09PSAtMSkge1xuICAgICAgICAgIG9wdGlvbnMucGFyYW1zLl9wcm9ncmFtID0gc2VsZi5tZXRhZGF0YVJvb3QucmVwbGFjZSgvXFwvPyQvLCAnLycpICsgb3B0aW9ucy5wYXJhbXMuX3Byb2dyYW0ucmVwbGFjZSgvXlxcLy8sICcnKTtcbiAgICAgICAgfVxuICAgICAgICAvL3VwZGF0ZSBkZWJ1ZyBiZWNhdXNlIGl0IGFsc28gbWF5IGhhdmUgY2hhbmdlZCBmcm9tIHJlbW90ZUNvbmZpZ1xuXHRcdFx0XHRpZiAob3B0aW9ucy5wYXJhbXMpIHtcblx0XHRcdFx0XHRvcHRpb25zLnBhcmFtcy5fZGVidWcgPSBzZWxmLmRlYnVnID8gMTMxIDogMDtcblx0XHRcdFx0fVxuXHRcdFx0XHRzZWxmLm1hbmFnZWRSZXF1ZXN0KGNhbGxNZXRob2QsIF91cmwsIG9wdGlvbnMpO1xuICAgICAgfVxuICAgIH0pLmVycm9yKGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FqYXhFcnJvcicsICdSZW1vdGUgY29uZmlnIGZpbGUgY2Fubm90IGJlIGxvYWRlZC4gSHR0cCBzdGF0dXMgY29kZTogJyArIGVyci5zdGF0dXMpO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gcHJpdmF0ZSBmdW5jdGlvbiB0byBzZXQgaDU0cyBpbnN0YW5jZSBwcm9wZXJ0aWVzXG4gIGZ1bmN0aW9uIF9zZXRDb25maWcoY29uZmlnKSB7XG4gICAgaWYoIWNvbmZpZykge1xuICAgICAgdGhpcy5fYWpheC5zZXRUaW1lb3V0KHRoaXMuYWpheFRpbWVvdXQpO1xuICAgICAgcmV0dXJuO1xuICAgIH0gZWxzZSBpZih0eXBlb2YgY29uZmlnICE9PSAnb2JqZWN0Jykge1xuICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdGaXJzdCBwYXJhbWV0ZXIgc2hvdWxkIGJlIGNvbmZpZyBvYmplY3QnKTtcbiAgICB9XG5cbiAgICAvL21lcmdlIGNvbmZpZyBvYmplY3QgZnJvbSBwYXJhbWV0ZXIgd2l0aCB0aGlzXG4gICAgZm9yKHZhciBrZXkgaW4gY29uZmlnKSB7XG4gICAgICBpZihjb25maWcuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuICAgICAgICBpZigoa2V5ID09PSAndXJsJyB8fCBrZXkgPT09ICdsb2dpblVybCcpICYmIGNvbmZpZ1trZXldLmNoYXJBdCgwKSAhPT0gJy8nKSB7XG4gICAgICAgICAgY29uZmlnW2tleV0gPSAnLycgKyBjb25maWdba2V5XTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzW2tleV0gPSBjb25maWdba2V5XTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvL2lmIHNlcnZlciBpcyByZW1vdGUgdXNlIHRoZSBmdWxsIHNlcnZlciB1cmxcbiAgICAvL05PVEU6IFRoaXMgcmVxdWlyZXMgQ09SUyBhbmQgaXMgaGVyZSBmb3IgbGVnYWN5IHN1cHBvcnRcbiAgICBpZihjb25maWcuaG9zdFVybCkge1xuICAgICAgaWYoY29uZmlnLmhvc3RVcmwuY2hhckF0KGNvbmZpZy5ob3N0VXJsLmxlbmd0aCAtIDEpID09PSAnLycpIHtcbiAgICAgICAgY29uZmlnLmhvc3RVcmwgPSBjb25maWcuaG9zdFVybC5zbGljZSgwLCAtMSk7XG4gICAgICB9XG4gICAgICB0aGlzLmhvc3RVcmwgPSBjb25maWcuaG9zdFVybDtcbiAgICAgIGlmICghdGhpcy51cmwuaW5jbHVkZXModGhpcy5ob3N0VXJsKSkge1xuXHRcdFx0XHR0aGlzLnVybCA9IGNvbmZpZy5ob3N0VXJsICsgdGhpcy51cmw7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXRoaXMubG9naW5VcmwuaW5jbHVkZXModGhpcy5ob3N0VXJsKSkge1xuXHRcdFx0XHR0aGlzLmxvZ2luVXJsID0gY29uZmlnLmhvc3RVcmwgKyB0aGlzLmxvZ2luVXJsO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCF0aGlzLlJFU1RhdXRoTG9naW5VcmwuaW5jbHVkZXModGhpcy5ob3N0VXJsKSkge1xuXHRcdFx0XHR0aGlzLlJFU1RhdXRoTG9naW5VcmwgPSBjb25maWcuaG9zdFVybCArIHRoaXMuUkVTVGF1dGhMb2dpblVybDtcblx0XHRcdH1cbiAgICB9XG5cbiAgICB0aGlzLl9hamF4LnNldFRpbWVvdXQodGhpcy5hamF4VGltZW91dCk7XG4gIH1cbn07XG5cbi8vIHJlcGxhY2VkIGJ5IGd1bHAgd2l0aCByZWFsIHZlcnNpb24gYXQgYnVpbGQgdGltZVxuaDU0cy52ZXJzaW9uID0gJ19fdmVyc2lvbl9fJztcblxuXG5oNTRzLnByb3RvdHlwZSA9IHJlcXVpcmUoJy4vbWV0aG9kcycpO1xuXG5oNTRzLlRhYmxlcyA9IHJlcXVpcmUoJy4vdGFibGVzJyk7XG5oNTRzLkZpbGVzID0gcmVxdWlyZSgnLi9maWxlcycpO1xuaDU0cy5TYXNEYXRhID0gcmVxdWlyZSgnLi9zYXNEYXRhLmpzJyk7XG5cbmg1NHMuZnJvbVNhc0RhdGVUaW1lID0gcmVxdWlyZSgnLi9tZXRob2RzL3V0aWxzLmpzJykuZnJvbVNhc0RhdGVUaW1lO1xuaDU0cy50b1Nhc0RhdGVUaW1lID0gcmVxdWlyZSgnLi90YWJsZXMvdXRpbHMuanMnKS50b1Nhc0RhdGVUaW1lO1xuXG4vL3NlbGYgaW52b2tlZCBmdW5jdGlvbiBtb2R1bGVcbnJlcXVpcmUoJy4vaWVfcG9seWZpbGxzLmpzJyk7XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xuICBpZiAoIU9iamVjdC5jcmVhdGUpIHtcbiAgICBPYmplY3QuY3JlYXRlID0gZnVuY3Rpb24ocHJvdG8sIHByb3BzKSB7XG4gICAgICBpZiAodHlwZW9mIHByb3BzICE9PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgICAgIHRocm93IFwiVGhlIG11bHRpcGxlLWFyZ3VtZW50IHZlcnNpb24gb2YgT2JqZWN0LmNyZWF0ZSBpcyBub3QgcHJvdmlkZWQgYnkgdGhpcyBicm93c2VyIGFuZCBjYW5ub3QgYmUgc2hpbW1lZC5cIjtcbiAgICAgIH1cbiAgICAgIGZ1bmN0aW9uIGN0b3IoKSB7IH1cbiAgICAgIGN0b3IucHJvdG90eXBlID0gcHJvdG87XG4gICAgICByZXR1cm4gbmV3IGN0b3IoKTtcbiAgICB9O1xuICB9XG5cblxuICAvLyBGcm9tIGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0phdmFTY3JpcHQvUmVmZXJlbmNlL0dsb2JhbF9PYmplY3RzL09iamVjdC9rZXlzXG4gIGlmICghT2JqZWN0LmtleXMpIHtcbiAgICBPYmplY3Qua2V5cyA9IChmdW5jdGlvbiAoKSB7XG4gICAgICAndXNlIHN0cmljdCc7XG4gICAgICB2YXIgaGFzT3duUHJvcGVydHkgPSBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LFxuICAgICAgICAgIGhhc0RvbnRFbnVtQnVnID0gISh7dG9TdHJpbmc6IG51bGx9KS5wcm9wZXJ0eUlzRW51bWVyYWJsZSgndG9TdHJpbmcnKSxcbiAgICAgICAgICBkb250RW51bXMgPSBbXG4gICAgICAgICAgICAndG9TdHJpbmcnLFxuICAgICAgICAgICAgJ3RvTG9jYWxlU3RyaW5nJyxcbiAgICAgICAgICAgICd2YWx1ZU9mJyxcbiAgICAgICAgICAgICdoYXNPd25Qcm9wZXJ0eScsXG4gICAgICAgICAgICAnaXNQcm90b3R5cGVPZicsXG4gICAgICAgICAgICAncHJvcGVydHlJc0VudW1lcmFibGUnLFxuICAgICAgICAgICAgJ2NvbnN0cnVjdG9yJ1xuICAgICAgICAgIF0sXG4gICAgICAgICAgZG9udEVudW1zTGVuZ3RoID0gZG9udEVudW1zLmxlbmd0aDtcblxuICAgICAgcmV0dXJuIGZ1bmN0aW9uIChvYmopIHtcbiAgICAgICAgaWYgKHR5cGVvZiBvYmogIT09ICdvYmplY3QnICYmICh0eXBlb2Ygb2JqICE9PSAnZnVuY3Rpb24nIHx8IG9iaiA9PT0gbnVsbCkpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdPYmplY3Qua2V5cyBjYWxsZWQgb24gbm9uLW9iamVjdCcpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHJlc3VsdCA9IFtdLCBwcm9wLCBpO1xuXG4gICAgICAgIGZvciAocHJvcCBpbiBvYmopIHtcbiAgICAgICAgICBpZiAoaGFzT3duUHJvcGVydHkuY2FsbChvYmosIHByb3ApKSB7XG4gICAgICAgICAgICByZXN1bHQucHVzaChwcm9wKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoaGFzRG9udEVudW1CdWcpIHtcbiAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgZG9udEVudW1zTGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGlmIChoYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwgZG9udEVudW1zW2ldKSkge1xuICAgICAgICAgICAgICByZXN1bHQucHVzaChkb250RW51bXNbaV0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgfTtcbiAgICB9KCkpO1xuICB9XG5cbiAgLy8gRnJvbSBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9KYXZhU2NyaXB0L1JlZmVyZW5jZS9HbG9iYWxfT2JqZWN0cy9BcnJheS9sYXN0SW5kZXhPZlxuICBpZiAoIUFycmF5LnByb3RvdHlwZS5sYXN0SW5kZXhPZikge1xuICAgIEFycmF5LnByb3RvdHlwZS5sYXN0SW5kZXhPZiA9IGZ1bmN0aW9uKHNlYXJjaEVsZW1lbnQgLyosIGZyb21JbmRleCovKSB7XG4gICAgICAndXNlIHN0cmljdCc7XG5cbiAgICAgIGlmICh0aGlzID09PSB2b2lkIDAgfHwgdGhpcyA9PT0gbnVsbCkge1xuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCk7XG4gICAgICB9XG5cbiAgICAgIHZhciBuLCBrLFxuICAgICAgICB0ID0gT2JqZWN0KHRoaXMpLFxuICAgICAgICBsZW4gPSB0Lmxlbmd0aCA+Pj4gMDtcbiAgICAgIGlmIChsZW4gPT09IDApIHtcbiAgICAgICAgcmV0dXJuIC0xO1xuICAgICAgfVxuXG4gICAgICBuID0gbGVuIC0gMTtcbiAgICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID4gMSkge1xuICAgICAgICBuID0gTnVtYmVyKGFyZ3VtZW50c1sxXSk7XG4gICAgICAgIGlmIChuICE9IG4pIHtcbiAgICAgICAgICBuID0gMDtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChuICE9PSAwICYmIG4gIT0gKDEgLyAwKSAmJiBuICE9IC0oMSAvIDApKSB7XG4gICAgICAgICAgbiA9IChuID4gMCB8fCAtMSkgKiBNYXRoLmZsb29yKE1hdGguYWJzKG4pKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBmb3IgKGsgPSBuID49IDAgPyBNYXRoLm1pbihuLCBsZW4gLSAxKSA6IGxlbiAtIE1hdGguYWJzKG4pOyBrID49IDA7IGstLSkge1xuICAgICAgICBpZiAoayBpbiB0ICYmIHRba10gPT09IHNlYXJjaEVsZW1lbnQpIHtcbiAgICAgICAgICByZXR1cm4gaztcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIC0xO1xuICAgIH07XG4gIH1cbn0oKTtcbiIsInZhciBsb2dzID0ge1xuICBhcHBsaWNhdGlvbkxvZ3M6IFtdLFxuICBkZWJ1Z0RhdGE6IFtdLFxuICBzYXNFcnJvcnM6IFtdLFxuICBmYWlsZWRSZXF1ZXN0czogW11cbn07XG5cbnZhciBsaW1pdHMgPSB7XG4gIGFwcGxpY2F0aW9uTG9nczogMTAwLFxuICBkZWJ1Z0RhdGE6IDIwLFxuICBmYWlsZWRSZXF1ZXN0czogMjAsXG4gIHNhc0Vycm9yczogMTAwXG59O1xuXG5tb2R1bGUuZXhwb3J0cy5nZXQgPSB7XG4gIGdldFNhc0Vycm9yczogZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIGxvZ3Muc2FzRXJyb3JzO1xuICB9LFxuICBnZXRBcHBsaWNhdGlvbkxvZ3M6IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiBsb2dzLmFwcGxpY2F0aW9uTG9ncztcbiAgfSxcbiAgZ2V0RGVidWdEYXRhOiBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gbG9ncy5kZWJ1Z0RhdGE7XG4gIH0sXG4gIGdldEZhaWxlZFJlcXVlc3RzOiBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gbG9ncy5mYWlsZWRSZXF1ZXN0cztcbiAgfSxcbiAgZ2V0QWxsTG9nczogZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB7XG4gICAgICBzYXNFcnJvcnM6IGxvZ3Muc2FzRXJyb3JzLFxuICAgICAgYXBwbGljYXRpb25Mb2dzOiBsb2dzLmFwcGxpY2F0aW9uTG9ncyxcbiAgICAgIGRlYnVnRGF0YTogbG9ncy5kZWJ1Z0RhdGEsXG4gICAgICBmYWlsZWRSZXF1ZXN0czogbG9ncy5mYWlsZWRSZXF1ZXN0c1xuICAgIH1cbiAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMuY2xlYXIgPSB7XG4gIGNsZWFyQXBwbGljYXRpb25Mb2dzOiBmdW5jdGlvbigpIHtcbiAgICBsb2dzLmFwcGxpY2F0aW9uTG9ncy5zcGxpY2UoMCwgbG9ncy5hcHBsaWNhdGlvbkxvZ3MubGVuZ3RoKTtcbiAgfSxcbiAgY2xlYXJEZWJ1Z0RhdGE6IGZ1bmN0aW9uKCkge1xuICAgIGxvZ3MuZGVidWdEYXRhLnNwbGljZSgwLCBsb2dzLmRlYnVnRGF0YS5sZW5ndGgpO1xuICB9LFxuICBjbGVhclNhc0Vycm9yczogZnVuY3Rpb24oKSB7XG4gICAgbG9ncy5zYXNFcnJvcnMuc3BsaWNlKDAsIGxvZ3Muc2FzRXJyb3JzLmxlbmd0aCk7XG4gIH0sXG4gIGNsZWFyRmFpbGVkUmVxdWVzdHM6IGZ1bmN0aW9uKCkge1xuICAgIGxvZ3MuZmFpbGVkUmVxdWVzdHMuc3BsaWNlKDAsIGxvZ3MuZmFpbGVkUmVxdWVzdHMubGVuZ3RoKTtcbiAgfSxcbiAgY2xlYXJBbGxMb2dzOiBmdW5jdGlvbigpIHtcbiAgICB0aGlzLmNsZWFyQXBwbGljYXRpb25Mb2dzKCk7XG4gICAgdGhpcy5jbGVhckRlYnVnRGF0YSgpO1xuICAgIHRoaXMuY2xlYXJTYXNFcnJvcnMoKTtcbiAgICB0aGlzLmNsZWFyRmFpbGVkUmVxdWVzdHMoKTtcbiAgfVxufTtcblxuLyoqIFxuKiAgQWRkcyBhcHBsaWNhdGlvbiBsb2dzIHRvIGFuIGFycmF5IG9mIGxvZ3NcbipcbiogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2UgLSBNZXNzYWdlIHRvIGFkZCB0byBhcHBsaWNhdGlvbkxvZ3NcbiogQHBhcmFtIHtTdHJpbmd9IHNhc1Byb2dyYW0gLSBIZWFkZXIgLSB3aGljaCByZXF1ZXN0IGRpZCBtZXNzYWdlIGNvbWUgZnJvbVxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLmFkZEFwcGxpY2F0aW9uTG9nID0gZnVuY3Rpb24obWVzc2FnZSwgc2FzUHJvZ3JhbSkge1xuICBpZihtZXNzYWdlID09PSAnYmxhbmsnKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHZhciBsb2cgPSB7XG4gICAgbWVzc2FnZTogICAgbWVzc2FnZSxcbiAgICB0aW1lOiAgICAgICBuZXcgRGF0ZSgpLFxuICAgIHNhc1Byb2dyYW06IHNhc1Byb2dyYW1cbiAgfTtcbiAgbG9ncy5hcHBsaWNhdGlvbkxvZ3MucHVzaChsb2cpO1xuXG4gIGlmKGxvZ3MuYXBwbGljYXRpb25Mb2dzLmxlbmd0aCA+IGxpbWl0cy5hcHBsaWNhdGlvbkxvZ3MpIHtcbiAgICBsb2dzLmFwcGxpY2F0aW9uTG9ncy5zaGlmdCgpO1xuICB9XG59O1xuXG4vKiogXG4qIEFkZHMgZGVidWcgZGF0YSB0byBhbiBhcnJheSBvZiBsb2dzXG4qXG4qIEBwYXJhbSB7U3RyaW5nfSBodG1sRGF0YSAtIEZ1bGwgaHRtbCBsb2cgZnJvbSBleGVjdXRvclxuKiBAcGFyYW0ge1N0cmluZ30gZGVidWdUZXh0IC0gRGVidWcgdGV4dCB0aGF0IGNhbWUgYWZ0ZXIgZGF0YSBvdXRwdXRcbiogQHBhcmFtIHtTdHJpbmd9IHNhc1Byb2dyYW0gLSBXaGljaCBwcm9ncmFtIHJlcXVlc3QgZGlkIG1lc3NhZ2UgY29tZSBmcm9tXG4qIEBwYXJhbSB7U3RyaW5nfSBwYXJhbXMgLSBXZWIgYXBwIHBhcmFtcyB0aGF0IHdlcmUgcmVjZWl2ZWQgXG4qXG4qL1xubW9kdWxlLmV4cG9ydHMuYWRkRGVidWdEYXRhID0gZnVuY3Rpb24oaHRtbERhdGEsIGRlYnVnVGV4dCwgc2FzUHJvZ3JhbSwgcGFyYW1zKSB7XG4gIGxvZ3MuZGVidWdEYXRhLnB1c2goe1xuICAgIGRlYnVnSHRtbDogIGh0bWxEYXRhLFxuICAgIGRlYnVnVGV4dDogIGRlYnVnVGV4dCxcbiAgICBzYXNQcm9ncmFtOiBzYXNQcm9ncmFtLFxuICAgIHBhcmFtczogICAgIHBhcmFtcyxcbiAgICB0aW1lOiAgICAgICBuZXcgRGF0ZSgpXG4gIH0pO1xuXG4gIGlmKGxvZ3MuZGVidWdEYXRhLmxlbmd0aCA+IGxpbWl0cy5kZWJ1Z0RhdGEpIHtcbiAgICBsb2dzLmRlYnVnRGF0YS5zaGlmdCgpO1xuICB9XG59O1xuXG4vKiogXG4qIEFkZHMgZmFpbGVkIHJlcXVlc3RzIHRvIGFuIGFycmF5IG9mIGZhaWxlZCByZXF1ZXN0IGxvZ3NcbipcbiogQHBhcmFtIHtTdHJpbmd9IHJlc3BvbnNlVGV4dCAtIEZ1bGwgaHRtbCBvdXRwdXQgZnJvbSBleGVjdXRvclxuKiBAcGFyYW0ge1N0cmluZ30gZGVidWdUZXh0IC0gRGVidWcgdGV4dCB0aGF0IGNhbWUgYWZ0ZXIgZGF0YSBvdXRwdXRcbiogQHBhcmFtIHtTdHJpbmd9IHNhc1Byb2dyYW0gLSBXaGljaCBwcm9ncmFtIHJlcXVlc3QgZGlkIG1lc3NhZ2UgY29tZSBmcm9tXG4qXG4qL1xubW9kdWxlLmV4cG9ydHMuYWRkRmFpbGVkUmVxdWVzdCA9IGZ1bmN0aW9uKHJlc3BvbnNlVGV4dCwgZGVidWdUZXh0LCBzYXNQcm9ncmFtKSB7XG4gIGxvZ3MuZmFpbGVkUmVxdWVzdHMucHVzaCh7XG4gICAgcmVzcG9uc2VIdG1sOiByZXNwb25zZVRleHQsXG4gICAgcmVzcG9uc2VUZXh0OiBkZWJ1Z1RleHQsXG4gICAgc2FzUHJvZ3JhbTogICBzYXNQcm9ncmFtLFxuICAgIHRpbWU6ICAgICAgICAgbmV3IERhdGUoKVxuICB9KTtcblxuICAvL21heCAyMCBmYWlsZWQgcmVxdWVzdHNcbiAgaWYobG9ncy5mYWlsZWRSZXF1ZXN0cy5sZW5ndGggPiBsaW1pdHMuZmFpbGVkUmVxdWVzdHMpIHtcbiAgICBsb2dzLmZhaWxlZFJlcXVlc3RzLnNoaWZ0KCk7XG4gIH1cbn07XG5cbi8qKiBcbiogQWRkcyBTQVMgZXJyb3JzIHRvIGFuIGFycmF5IG9mIGxvZ3NcbipcbiogQHBhcmFtIHtBcnJheX0gZXJyb3JzIC0gQXJyYXkgb2YgZXJyb3JzIHRvIGNvbmNhdCB0byBtYWluIGxvZyBcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5hZGRTYXNFcnJvcnMgPSBmdW5jdGlvbihlcnJvcnMpIHtcbiAgbG9ncy5zYXNFcnJvcnMgPSBsb2dzLnNhc0Vycm9ycy5jb25jYXQoZXJyb3JzKTtcblxuICB3aGlsZShsb2dzLnNhc0Vycm9ycy5sZW5ndGggPiBsaW1pdHMuc2FzRXJyb3JzKSB7XG4gICAgbG9ncy5zYXNFcnJvcnMuc2hpZnQoKTtcbiAgfVxufTtcbiIsIi8vIFRPRE86IE5NIHRoaXMgbmVlZHMgX3NvbWVfIGV4cGxhbmF0aW9uIHByb2JhYmx5XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKCkge1xuICB2YXIgdGltZW91dCA9IDMwMDAwO1xuICB2YXIgdGltZW91dEhhbmRsZTtcblxuICB2YXIgeGhyID0gZnVuY3Rpb24gKHR5cGUsIHVybCwgZGF0YSwgbXVsdGlwYXJ0Rm9ybURhdGEsIGhlYWRlcnMgPSB7fSkge1xuICAgIHZhciBtZXRob2RzID0ge1xuICAgICAgc3VjY2VzczogZnVuY3Rpb24gKCkge1xuICAgICAgfSxcbiAgICAgIGVycm9yOiBmdW5jdGlvbiAoKSB7XG4gICAgICB9XG4gICAgfTtcblxuICAgIHZhciBYSFIgPSBYTUxIdHRwUmVxdWVzdDtcbiAgICB2YXIgcmVxdWVzdCA9IG5ldyBYSFIoJ01TWE1MMi5YTUxIVFRQLjMuMCcpO1xuXG4gICAgcmVxdWVzdC5vcGVuKHR5cGUsIHVybCwgdHJ1ZSk7XG5cbiAgICAvL211bHRpcGFydC9mb3JtLWRhdGEgaXMgc2V0IGF1dG9tYXRpY2FsbHkgc28gbm8gbmVlZCBmb3IgZWxzZSBibG9ja1xuICAgIC8vIENvbnRlbnQtVHlwZSBoZWFkZXIgaGFzIHRvIGJlIGV4cGxpY2l0bHkgc2V0IHVwXG4gICAgaWYgKCFtdWx0aXBhcnRGb3JtRGF0YSkge1xuICAgICAgaWYgKGhlYWRlcnNbJ0NvbnRlbnQtVHlwZSddKSB7XG4gICAgICAgIHJlcXVlc3Quc2V0UmVxdWVzdEhlYWRlcignQ29udGVudC1UeXBlJywgaGVhZGVyc1snQ29udGVudC1UeXBlJ10pXG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXF1ZXN0LnNldFJlcXVlc3RIZWFkZXIoJ0NvbnRlbnQtVHlwZScsICdhcHBsaWNhdGlvbi94LXd3dy1mb3JtLXVybGVuY29kZWQnKTtcbiAgICAgIH1cbiAgICB9XG4gICAgT2JqZWN0LmtleXMoaGVhZGVycykuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgaWYgKGtleSAhPT0gJ0NvbnRlbnQtVHlwZScpIHtcbiAgICAgICAgcmVxdWVzdC5zZXRSZXF1ZXN0SGVhZGVyKGtleSwgaGVhZGVyc1trZXldKVxuICAgICAgfVxuICAgIH0pXG4gICAgcmVxdWVzdC5vbnJlYWR5c3RhdGVjaGFuZ2UgPSBmdW5jdGlvbiAoKSB7XG4gICAgICBpZiAocmVxdWVzdC5yZWFkeVN0YXRlID09PSA0KSB7XG4gICAgICAgIGNsZWFyVGltZW91dCh0aW1lb3V0SGFuZGxlKTtcbiAgICAgICAgaWYgKHJlcXVlc3Quc3RhdHVzID49IDIwMCAmJiByZXF1ZXN0LnN0YXR1cyA8IDMwMCkge1xuICAgICAgICAgIG1ldGhvZHMuc3VjY2Vzcy5jYWxsKG1ldGhvZHMsIHJlcXVlc3QpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIG1ldGhvZHMuZXJyb3IuY2FsbChtZXRob2RzLCByZXF1ZXN0KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH07XG5cbiAgICBpZiAodGltZW91dCA+IDApIHtcbiAgICAgIHRpbWVvdXRIYW5kbGUgPSBzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmVxdWVzdC5hYm9ydCgpO1xuICAgICAgfSwgdGltZW91dCk7XG4gICAgfVxuXG4gICAgcmVxdWVzdC5zZW5kKGRhdGEpO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHN1Y2Nlc3M6IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICBtZXRob2RzLnN1Y2Nlc3MgPSBjYWxsYmFjaztcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICB9LFxuICAgICAgZXJyb3I6IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICBtZXRob2RzLmVycm9yID0gY2FsbGJhY2s7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgfVxuICAgIH07XG4gIH07XG5cbiAgY29uc3Qgc2VyaWFsaXplID0gZnVuY3Rpb24gKG9iaikge1xuICAgIHZhciBzdHIgPSBbXTtcbiAgICBmb3IgKHZhciBwIGluIG9iaikge1xuICAgICAgaWYgKG9iai5oYXNPd25Qcm9wZXJ0eShwKSkge1xuICAgICAgICBpZiAob2JqW3BdIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgICAgICBmb3IgKHZhciBpID0gMCwgbiA9IG9ialtwXS5sZW5ndGg7IGkgPCBuOyBpKyspIHtcbiAgICAgICAgICAgIHN0ci5wdXNoKGVuY29kZVVSSUNvbXBvbmVudChwKSArIFwiPVwiICsgZW5jb2RlVVJJQ29tcG9uZW50KG9ialtwXVtpXSkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBzdHIucHVzaChlbmNvZGVVUklDb21wb25lbnQocCkgKyBcIj1cIiArIGVuY29kZVVSSUNvbXBvbmVudChvYmpbcF0pKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gc3RyLmpvaW4oXCImXCIpO1xuICB9O1xuXG4gIHZhciBjcmVhdGVNdWx0aXBhcnRGb3JtRGF0YVBheWxvYWQgPSBmdW5jdGlvbiAob2JqKSB7XG4gICAgdmFyIGRhdGEgPSBuZXcgRm9ybURhdGEoKTtcbiAgICBmb3IgKHZhciBwIGluIG9iaikge1xuICAgICAgaWYgKG9iai5oYXNPd25Qcm9wZXJ0eShwKSkge1xuICAgICAgICBpZiAob2JqW3BdIGluc3RhbmNlb2YgQXJyYXkgJiYgcCAhPT0gJ2ZpbGUnKSB7XG4gICAgICAgICAgZm9yICh2YXIgaSA9IDAsIG4gPSBvYmpbcF0ubGVuZ3RoOyBpIDwgbjsgaSsrKSB7XG4gICAgICAgICAgICBkYXRhLmFwcGVuZChwLCBvYmpbcF1baV0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChwID09PSAnZmlsZScpIHtcbiAgICAgICAgICBkYXRhLmFwcGVuZChwLCBvYmpbcF1bMF0sIG9ialtwXVsxXSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgZGF0YS5hcHBlbmQocCwgb2JqW3BdKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gZGF0YTtcbiAgfTtcblxuICByZXR1cm4ge1xuICAgIGdldDogZnVuY3Rpb24gKHVybCwgZGF0YSwgbXVsdGlwYXJ0Rm9ybURhdGEsIGhlYWRlcnMpIHtcbiAgICAgIHZhciBkYXRhU3RyO1xuICAgICAgaWYgKHR5cGVvZiBkYXRhID09PSAnb2JqZWN0Jykge1xuICAgICAgICBkYXRhU3RyID0gc2VyaWFsaXplKGRhdGEpO1xuICAgICAgfVxuICAgICAgdmFyIHVybFdpdGhQYXJhbXMgPSBkYXRhU3RyID8gKHVybCArICc/JyArIGRhdGFTdHIpIDogdXJsO1xuICAgICAgcmV0dXJuIHhocignR0VUJywgdXJsV2l0aFBhcmFtcywgbnVsbCwgbXVsdGlwYXJ0Rm9ybURhdGEsIGhlYWRlcnMpO1xuICAgIH0sXG5cdFx0cG9zdDogZnVuY3Rpb24odXJsLCBkYXRhLCBtdWx0aXBhcnRGb3JtRGF0YSwgaGVhZGVycykge1xuICAgICAgbGV0IHBheWxvYWQgPSBkYXRhO1xuICAgICAgaWYodHlwZW9mIGRhdGEgPT09ICdvYmplY3QnKSB7XG4gICAgICAgIGlmKG11bHRpcGFydEZvcm1EYXRhKSB7XG4gICAgICAgICAgcGF5bG9hZCA9IGNyZWF0ZU11bHRpcGFydEZvcm1EYXRhUGF5bG9hZChkYXRhKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBwYXlsb2FkID0gc2VyaWFsaXplKGRhdGEpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4geGhyKCdQT1NUJywgdXJsLCBwYXlsb2FkLCBtdWx0aXBhcnRGb3JtRGF0YSwgaGVhZGVycyk7XG4gICAgfSxcbiAgICBwdXQ6IGZ1bmN0aW9uKHVybCwgZGF0YSwgbXVsdGlwYXJ0Rm9ybURhdGEsIGhlYWRlcnMpIHtcbiAgICAgIGxldCBwYXlsb2FkID0gZGF0YTtcbiAgICAgIGlmKHR5cGVvZiBkYXRhID09PSAnb2JqZWN0Jykge1xuICAgICAgICBpZihtdWx0aXBhcnRGb3JtRGF0YSkge1xuICAgICAgICAgIHBheWxvYWQgPSBjcmVhdGVNdWx0aXBhcnRGb3JtRGF0YVBheWxvYWQoZGF0YSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiB4aHIoJ1BVVCcsIHVybCwgcGF5bG9hZCwgbXVsdGlwYXJ0Rm9ybURhdGEsIGhlYWRlcnMpO1xuICAgIH0sXG5cdFx0ZGVsZXRlOiBmdW5jdGlvbih1cmwsIHBheWxvYWQsIG11bHRpcGFydEZvcm1EYXRhLCBoZWFkZXJzKSB7XG4gICAgXHRyZXR1cm4geGhyKCdERUxFVEUnLCB1cmwsIHBheWxvYWQsIG51bGwsIGhlYWRlcnMpO1xuXHRcdH0sXG4gICAgc2V0VGltZW91dDogZnVuY3Rpb24gKHQpIHtcbiAgICAgIHRpbWVvdXQgPSB0O1xuICAgIH0sXG4gICAgc2VyaWFsaXplXG4gIH07XG59O1xuIiwidmFyIGg1NHNFcnJvciA9IHJlcXVpcmUoJy4uL2Vycm9yLmpzJyk7XG52YXIgbG9ncyA9IHJlcXVpcmUoJy4uL2xvZ3MuanMnKTtcbnZhciBUYWJsZXMgPSByZXF1aXJlKCcuLi90YWJsZXMnKTtcbnZhciBTYXNEYXRhID0gcmVxdWlyZSgnLi4vc2FzRGF0YS5qcycpO1xudmFyIEZpbGVzID0gcmVxdWlyZSgnLi4vZmlsZXMnKTtcblxuLyoqIFxuKiBDYWxsIFNhcyBwcm9ncmFtXG4qXG4qIEBwYXJhbSB7c3RyaW5nfSBzYXNQcm9ncmFtIC0gUGF0aCBvZiB0aGUgc2FzIHByb2dyYW1cbiogQHBhcmFtIHtPYmplY3R9IGRhdGFPYmogLSBJbnN0YW5jZSBvZiBUYWJsZXMgb2JqZWN0IHdpdGggZGF0YSBhZGRlZFxuKiBAcGFyYW0ge2Z1bmN0aW9ufSBjYWxsYmFjayAtIENhbGxiYWNrIGZ1bmN0aW9uIGNhbGxlZCB3aGVuIGFqYXggY2FsbCBpcyBmaW5pc2hlZFxuKiBAcGFyYW0ge09iamVjdH0gcGFyYW1zIC0gb2JqZWN0IGNvbnRhaW5pbmcgYWRkaXRpb25hbCBwcm9ncmFtIHBhcmFtZXRlcnNcbipcbiovXG4vLyBUT0RPIGFkZCB1cmwgYXMgYSBwYXJhbSAtIGl0IHdpbGwgYmUgL1NBU0pvYkV4ZWN1dGlvbi8gbW9zdCBvZiB0aGUgdGltZVxubW9kdWxlLmV4cG9ydHMuY2FsbCA9IGZ1bmN0aW9uIChzYXNQcm9ncmFtLCBkYXRhT2JqLCBjYWxsYmFjaywgcGFyYW1zKSB7XG5cdHZhciBzZWxmID0gdGhpcztcblx0dmFyIHJldHJ5Q291bnQgPSAwO1xuXHR2YXIgZGJnID0gdGhpcy5kZWJ1Zztcblx0dmFyIGNzcmYgPSB0aGlzLmNzcmY7XG5cblx0aWYgKCFjYWxsYmFjayB8fCB0eXBlb2YgY2FsbGJhY2sgIT09ICdmdW5jdGlvbicpIHtcblx0XHR0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1lvdSBtdXN0IHByb3ZpZGUgYSBjYWxsYmFjaycpO1xuXHR9XG5cdGlmICghc2FzUHJvZ3JhbSkge1xuXHRcdHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnWW91IG11c3QgcHJvdmlkZSBTYXMgcHJvZ3JhbSBmaWxlIHBhdGgnKTtcblx0fVxuXHRpZiAodHlwZW9mIHNhc1Byb2dyYW0gIT09ICdzdHJpbmcnKSB7XG5cdFx0dGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdGaXJzdCBwYXJhbWV0ZXIgc2hvdWxkIGJlIHN0cmluZycpO1xuXHR9XG5cdGlmICh0aGlzLnVzZU11bHRpcGFydEZvcm1EYXRhID09PSBmYWxzZSAmJiAhKGRhdGFPYmogaW5zdGFuY2VvZiBUYWJsZXMpKSB7XG5cdFx0dGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdDYW5ub3Qgc2VuZCBmaWxlcyB1c2luZyBhcHBsaWNhdGlvbi94LXd3dy1mb3JtLXVybGVuY29kZWQuIFBsZWFzZSB1c2UgVGFibGVzIG9yIGRlZmF1bHQgdmFsdWUgZm9yIHVzZU11bHRpcGFydEZvcm1EYXRhJyk7XG5cdH1cblxuXHRpZiAoIXBhcmFtcykge1xuXHRcdHBhcmFtcyA9IHtcblx0XHRcdF9wcm9ncmFtOiB0aGlzLl91dGlscy5nZXRGdWxsUHJvZ3JhbVBhdGgodGhpcy5tZXRhZGF0YVJvb3QsIHNhc1Byb2dyYW0pLFxuXHRcdFx0X2RlYnVnOiB0aGlzLmRlYnVnID8gMTMxIDogMCxcblx0XHRcdF9zZXJ2aWNlOiAnZGVmYXVsdCcsXG5cdFx0XHRfY3NyZjogY3NyZlxuXHRcdH07XG5cdH0gZWxzZSB7XG5cdFx0cGFyYW1zID0gT2JqZWN0LmFzc2lnbih7fSwgcGFyYW1zLCB7X2NzcmY6IGNzcmZ9KVxuXHR9XG5cblx0aWYgKGRhdGFPYmopIHtcblx0XHR2YXIga2V5LCBkYXRhUHJvdmlkZXI7XG5cdFx0aWYgKGRhdGFPYmogaW5zdGFuY2VvZiBUYWJsZXMpIHtcblx0XHRcdGRhdGFQcm92aWRlciA9IGRhdGFPYmouX3RhYmxlcztcblx0XHR9IGVsc2UgaWYgKGRhdGFPYmogaW5zdGFuY2VvZiBGaWxlcyB8fCBkYXRhT2JqIGluc3RhbmNlb2YgU2FzRGF0YSkge1xuXHRcdFx0ZGF0YVByb3ZpZGVyID0gZGF0YU9iai5fZmlsZXM7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnNvbGUubG9nKG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnV3JvbmcgdHlwZSBvZiB0YWJsZXMgb2JqZWN0JykpXG5cdFx0fVxuXHRcdGZvciAoa2V5IGluIGRhdGFQcm92aWRlcikge1xuXHRcdFx0aWYgKGRhdGFQcm92aWRlci5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG5cdFx0XHRcdHBhcmFtc1trZXldID0gZGF0YVByb3ZpZGVyW2tleV07XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0aWYgKHRoaXMuX2Rpc2FibGVDYWxscykge1xuXHRcdHRoaXMuX3BlbmRpbmdDYWxscy5wdXNoKHtcblx0XHRcdHBhcmFtcyxcblx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0c2FzUHJvZ3JhbSxcblx0XHRcdFx0ZGF0YU9iaixcblx0XHRcdFx0Y2FsbGJhY2tcblx0XHRcdH1cblx0XHR9KTtcblx0XHRyZXR1cm47XG5cdH1cblxuXHR0aGlzLl9hamF4LnBvc3QodGhpcy51cmwsIHBhcmFtcywgdGhpcy51c2VNdWx0aXBhcnRGb3JtRGF0YSkuc3VjY2Vzcyhhc3luYyBmdW5jdGlvbiAocmVzKSB7XG5cdFx0aWYgKHNlbGYuX3V0aWxzLm5lZWRUb0xvZ2luLmNhbGwoc2VsZiwgcmVzKSkge1xuXHRcdFx0Ly9yZW1lbWJlciB0aGUgY2FsbCBmb3IgbGF0dGVyIHVzZVxuXHRcdFx0c2VsZi5fcGVuZGluZ0NhbGxzLnB1c2goe1xuXHRcdFx0XHRwYXJhbXMsXG5cdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRzYXNQcm9ncmFtLFxuXHRcdFx0XHRcdGRhdGFPYmosXG5cdFx0XHRcdFx0Y2FsbGJhY2tcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdC8vdGhlcmUncyBubyBuZWVkIHRvIGNvbnRpbnVlIGlmIHByZXZpb3VzIGNhbGwgcmV0dXJuZWQgbG9naW4gZXJyb3Jcblx0XHRcdGlmIChzZWxmLl9kaXNhYmxlQ2FsbHMpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0c2VsZi5fZGlzYWJsZUNhbGxzID0gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0Y2FsbGJhY2sobmV3IGg1NHNFcnJvcignbm90TG9nZ2VkaW5FcnJvcicsICdZb3UgYXJlIG5vdCBsb2dnZWQgaW4nKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHZhciByZXNPYmosIHVuZXNjYXBlZFJlc09iaiwgZXJyO1xuXHRcdFx0dmFyIGRvbmUgPSBmYWxzZTtcblxuXHRcdFx0aWYgKCFkYmcpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRyZXNPYmogPSBzZWxmLl91dGlscy5wYXJzZVJlcyhyZXMucmVzcG9uc2VUZXh0LCBzYXNQcm9ncmFtLCBwYXJhbXMpO1xuXHRcdFx0XHRcdGxvZ3MuYWRkQXBwbGljYXRpb25Mb2cocmVzT2JqLmxvZ21lc3NhZ2UsIHNhc1Byb2dyYW0pO1xuXG5cdFx0XHRcdFx0aWYgKGRhdGFPYmogaW5zdGFuY2VvZiBUYWJsZXMpIHtcblx0XHRcdFx0XHRcdHVuZXNjYXBlZFJlc09iaiA9IHNlbGYuX3V0aWxzLnVuZXNjYXBlVmFsdWVzKHJlc09iaik7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHVuZXNjYXBlZFJlc09iaiA9IHJlc09iajtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAocmVzT2JqLnN0YXR1cyAhPT0gJ3N1Y2Nlc3MnKSB7XG5cdFx0XHRcdFx0XHRlcnIgPSBuZXcgaDU0c0Vycm9yKCdwcm9ncmFtRXJyb3InLCByZXNPYmouZXJyb3JtZXNzYWdlLCByZXNPYmouc3RhdHVzKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRkb25lID0gdHJ1ZTtcblx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdGlmIChlIGluc3RhbmNlb2YgU3ludGF4RXJyb3IpIHtcblx0XHRcdFx0XHRcdGlmIChyZXRyeUNvdW50IDwgc2VsZi5tYXhYaHJSZXRyaWVzKSB7XG5cdFx0XHRcdFx0XHRcdGRvbmUgPSBmYWxzZTtcblx0XHRcdFx0XHRcdFx0c2VsZi5fYWpheC5wb3N0KHNlbGYudXJsLCBwYXJhbXMsIHNlbGYudXNlTXVsdGlwYXJ0Rm9ybURhdGEpLnN1Y2Nlc3ModGhpcy5zdWNjZXNzKS5lcnJvcih0aGlzLmVycm9yKTtcblx0XHRcdFx0XHRcdFx0cmV0cnlDb3VudCsrO1xuXHRcdFx0XHRcdFx0XHRsb2dzLmFkZEFwcGxpY2F0aW9uTG9nKFwiUmV0cnlpbmcgI1wiICsgcmV0cnlDb3VudCwgc2FzUHJvZ3JhbSk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRzZWxmLl91dGlscy5wYXJzZUVycm9yUmVzcG9uc2UocmVzLnJlc3BvbnNlVGV4dCwgc2FzUHJvZ3JhbSk7XG5cdFx0XHRcdFx0XHRcdHNlbGYuX3V0aWxzLmFkZEZhaWxlZFJlc3BvbnNlKHJlcy5yZXNwb25zZVRleHQsIHNhc1Byb2dyYW0pO1xuXHRcdFx0XHRcdFx0XHRlcnIgPSBuZXcgaDU0c0Vycm9yKCdwYXJzZUVycm9yJywgJ1VuYWJsZSB0byBwYXJzZSByZXNwb25zZSBqc29uJyk7XG5cdFx0XHRcdFx0XHRcdGRvbmUgPSB0cnVlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSBpZiAoZSBpbnN0YW5jZW9mIGg1NHNFcnJvcikge1xuXHRcdFx0XHRcdFx0c2VsZi5fdXRpbHMucGFyc2VFcnJvclJlc3BvbnNlKHJlcy5yZXNwb25zZVRleHQsIHNhc1Byb2dyYW0pO1xuXHRcdFx0XHRcdFx0c2VsZi5fdXRpbHMuYWRkRmFpbGVkUmVzcG9uc2UocmVzLnJlc3BvbnNlVGV4dCwgc2FzUHJvZ3JhbSk7XG5cdFx0XHRcdFx0XHRlcnIgPSBlO1xuXHRcdFx0XHRcdFx0ZG9uZSA9IHRydWU7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHNlbGYuX3V0aWxzLnBhcnNlRXJyb3JSZXNwb25zZShyZXMucmVzcG9uc2VUZXh0LCBzYXNQcm9ncmFtKTtcblx0XHRcdFx0XHRcdHNlbGYuX3V0aWxzLmFkZEZhaWxlZFJlc3BvbnNlKHJlcy5yZXNwb25zZVRleHQsIHNhc1Byb2dyYW0pO1xuXHRcdFx0XHRcdFx0ZXJyID0gbmV3IGg1NHNFcnJvcigndW5rbm93bkVycm9yJywgZS5tZXNzYWdlKTtcblx0XHRcdFx0XHRcdGVyci5zdGFjayA9IGUuc3RhY2s7XG5cdFx0XHRcdFx0XHRkb25lID0gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0aWYgKGRvbmUpIHtcblx0XHRcdFx0XHRcdGNhbGxiYWNrKGVyciwgdW5lc2NhcGVkUmVzT2JqKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0cmVzT2JqID0gYXdhaXQgc2VsZi5fdXRpbHMucGFyc2VEZWJ1Z1JlcyhyZXMucmVzcG9uc2VUZXh0LCBzYXNQcm9ncmFtLCBwYXJhbXMsIHNlbGYuaG9zdFVybCwgc2VsZi5pc1ZpeWEsIHNlbGYubWFuYWdlZFJlcXVlc3QuYmluZChzZWxmKSk7XG5cdFx0XHRcdFx0bG9ncy5hZGRBcHBsaWNhdGlvbkxvZyhyZXNPYmoubG9nbWVzc2FnZSwgc2FzUHJvZ3JhbSk7XG5cblx0XHRcdFx0XHRpZiAoZGF0YU9iaiBpbnN0YW5jZW9mIFRhYmxlcykge1xuXHRcdFx0XHRcdFx0dW5lc2NhcGVkUmVzT2JqID0gc2VsZi5fdXRpbHMudW5lc2NhcGVWYWx1ZXMocmVzT2JqKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dW5lc2NhcGVkUmVzT2JqID0gcmVzT2JqO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChyZXNPYmouc3RhdHVzICE9PSAnc3VjY2VzcycpIHtcblx0XHRcdFx0XHRcdGVyciA9IG5ldyBoNTRzRXJyb3IoJ3Byb2dyYW1FcnJvcicsIHJlc09iai5lcnJvcm1lc3NhZ2UsIHJlc09iai5zdGF0dXMpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGRvbmUgPSB0cnVlO1xuXHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0aWYgKGUgaW5zdGFuY2VvZiBTeW50YXhFcnJvcikge1xuXHRcdFx0XHRcdFx0ZXJyID0gbmV3IGg1NHNFcnJvcigncGFyc2VFcnJvcicsIGUubWVzc2FnZSk7XG5cdFx0XHRcdFx0XHRkb25lID0gdHJ1ZTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGUgaW5zdGFuY2VvZiBoNTRzRXJyb3IpIHtcblx0XHRcdFx0XHRcdGlmIChlLnR5cGUgPT09ICdwYXJzZUVycm9yJyAmJiByZXRyeUNvdW50IDwgMSkge1xuXHRcdFx0XHRcdFx0XHRkb25lID0gZmFsc2U7XG5cdFx0XHRcdFx0XHRcdHNlbGYuX2FqYXgucG9zdChzZWxmLnVybCwgcGFyYW1zLCBzZWxmLnVzZU11bHRpcGFydEZvcm1EYXRhKS5zdWNjZXNzKHRoaXMuc3VjY2VzcykuZXJyb3IodGhpcy5lcnJvcik7XG5cdFx0XHRcdFx0XHRcdHJldHJ5Q291bnQrKztcblx0XHRcdFx0XHRcdFx0bG9ncy5hZGRBcHBsaWNhdGlvbkxvZyhcIlJldHJ5aW5nICNcIiArIHJldHJ5Q291bnQsIHNhc1Byb2dyYW0pO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0aWYgKGUgaW5zdGFuY2VvZiBoNTRzRXJyb3IpIHtcblx0XHRcdFx0XHRcdFx0XHRlcnIgPSBlO1xuXHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdGVyciA9IG5ldyBoNTRzRXJyb3IoJ3BhcnNlRXJyb3InLCAnVW5hYmxlIHRvIHBhcnNlIHJlc3BvbnNlIGpzb24nKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRkb25lID0gdHJ1ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0ZXJyID0gbmV3IGg1NHNFcnJvcigndW5rbm93bkVycm9yJywgZS5tZXNzYWdlKTtcblx0XHRcdFx0XHRcdGVyci5zdGFjayA9IGUuc3RhY2s7XG5cdFx0XHRcdFx0XHRkb25lID0gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0aWYgKGRvbmUpIHtcblx0XHRcdFx0XHRcdGNhbGxiYWNrKGVyciwgdW5lc2NhcGVkUmVzT2JqKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH0pLmVycm9yKGZ1bmN0aW9uIChyZXMpIHtcblx0XHRsZXQgX2NzcmZcblx0XHRpZiAocmVzLnN0YXR1cyA9PSA0NDkgfHwgKHJlcy5zdGF0dXMgPT0gNDAzICYmIChyZXMucmVzcG9uc2VUZXh0LmluY2x1ZGVzKCdfY3NyZicpIHx8IHJlcy5nZXRSZXNwb25zZUhlYWRlcignWC1Gb3JiaWRkZW4tUmVhc29uJykgPT09ICdDU1JGJykgJiYgKF9jc3JmID0gcmVzLmdldFJlc3BvbnNlSGVhZGVyKHJlcy5nZXRSZXNwb25zZUhlYWRlcignWC1DU1JGLUhFQURFUicpKSkpKSB7XG5cdFx0XHQvLyBpZiAoKHJlcy5zdGF0dXMgPT0gNDAzIHx8IHJlcy5zdGF0dXMgPT0gNDQ5KSAmJiAocmVzLnJlc3BvbnNlVGV4dC5pbmNsdWRlcygnX2NzcmYnKSB8fCByZXMuZ2V0UmVzcG9uc2VIZWFkZXIoJ1gtRm9yYmlkZGVuLVJlYXNvbicpID09PSAnQ1NSRicpICYmIChfY3NyZiA9IHJlcy5nZXRSZXNwb25zZUhlYWRlcihyZXMuZ2V0UmVzcG9uc2VIZWFkZXIoJ1gtQ1NSRi1IRUFERVInKSkpKSB7XG5cdFx0XHRwYXJhbXNbJ19jc3JmJ10gPSBfY3NyZjtcblx0XHRcdHNlbGYuY3NyZiA9IF9jc3JmXG5cdFx0XHRpZiAocmV0cnlDb3VudCA8IHNlbGYubWF4WGhyUmV0cmllcykge1xuXHRcdFx0XHRzZWxmLl9hamF4LnBvc3Qoc2VsZi51cmwsIHBhcmFtcywgdHJ1ZSkuc3VjY2Vzcyh0aGlzLnN1Y2Nlc3MpLmVycm9yKHRoaXMuZXJyb3IpO1xuXHRcdFx0XHRyZXRyeUNvdW50Kys7XG5cdFx0XHRcdGxvZ3MuYWRkQXBwbGljYXRpb25Mb2coXCJSZXRyeWluZyAjXCIgKyByZXRyeUNvdW50LCBzYXNQcm9ncmFtKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHNlbGYuX3V0aWxzLnBhcnNlRXJyb3JSZXNwb25zZShyZXMucmVzcG9uc2VUZXh0LCBzYXNQcm9ncmFtKTtcblx0XHRcdFx0c2VsZi5fdXRpbHMuYWRkRmFpbGVkUmVzcG9uc2UocmVzLnJlc3BvbnNlVGV4dCwgc2FzUHJvZ3JhbSk7XG5cdFx0XHRcdGNhbGxiYWNrKG5ldyBoNTRzRXJyb3IoJ3BhcnNlRXJyb3InLCAnVW5hYmxlIHRvIHBhcnNlIHJlc3BvbnNlIGpzb24nKSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGxvZ3MuYWRkQXBwbGljYXRpb25Mb2coJ1JlcXVlc3QgZmFpbGVkIHdpdGggc3RhdHVzOiAnICsgcmVzLnN0YXR1cywgc2FzUHJvZ3JhbSk7XG5cdFx0XHQvLyBpZiByZXF1ZXN0IGhhcyBlcnJvciB0ZXh0IGVsc2UgY2FsbGJhY2tcblx0XHRcdGNhbGxiYWNrKG5ldyBoNTRzRXJyb3IoJ2h0dHBFcnJvcicsIHJlcy5zdGF0dXNUZXh0KSk7XG5cdFx0fVxuXHR9KTtcbn07XG5cbi8qKiBcbiogTG9naW4gbWV0aG9kXG4qXG4qIEBwYXJhbSB7c3RyaW5nfSB1c2VyIC0gTG9naW4gdXNlcm5hbWVcbiogQHBhcmFtIHtzdHJpbmd9IHBhc3MgLSBMb2dpbiBwYXNzd29yZFxuKiBAcGFyYW0ge2Z1bmN0aW9ufSBjYWxsYmFjayAtIENhbGxiYWNrIGZ1bmN0aW9uIGNhbGxlZCB3aGVuIGFqYXggY2FsbCBpcyBmaW5pc2hlZFxuKlxuKiBPUlxuKlxuKiBAcGFyYW0ge2Z1bmN0aW9ufSBjYWxsYmFjayAtIENhbGxiYWNrIGZ1bmN0aW9uIGNhbGxlZCB3aGVuIGFqYXggY2FsbCBpcyBmaW5pc2hlZFxuKlxuKi9cbi8vIFRPRE86IHdoYXQgZG9lcyB0aGlzIFRPRE8gbWVhblxuLy8gVE9ETyBDcmVhdGUgbG9naW4gZnVuY3Rpb24gd2l0aCBwcm9taXNlcyBmb3IgcHJvcGVyIGxvZ2luIGZlYXR1cmVcbm1vZHVsZS5leHBvcnRzLmxvZ2luID0gZnVuY3Rpb24gKHVzZXIsIHBhc3MsIGNhbGxiYWNrKSB7XG5cdGlmICghdXNlciB8fCAhcGFzcykge1xuXHRcdHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnQ3JlZGVudGlhbHMgbm90IHNldCcpO1xuXHR9XG5cdGlmICh0eXBlb2YgdXNlciAhPT0gJ3N0cmluZycgfHwgdHlwZW9mIHBhc3MgIT09ICdzdHJpbmcnKSB7XG5cdFx0dGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdVc2VyIGFuZCBwYXNzIHBhcmFtZXRlcnMgbXVzdCBiZSBzdHJpbmdzJyk7XG5cdH1cblx0Ly9OT1RFOiBjYWxsYmFjayBvcHRpb25hbD9cblx0aWYgKCFjYWxsYmFjayB8fCB0eXBlb2YgY2FsbGJhY2sgIT09ICdmdW5jdGlvbicpIHtcblx0XHR0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1lvdSBtdXN0IHByb3ZpZGUgY2FsbGJhY2snKTtcblx0fVxuXG5cdGlmICghdGhpcy5SRVNUYXV0aCkge1xuXHRcdGhhbmRsZVNhc0xvZ29uLmNhbGwodGhpcywgdXNlciwgcGFzcywgY2FsbGJhY2spO1xuXHR9IGVsc2Uge1xuXHRcdGhhbmRsZVJlc3RMb2dvbi5jYWxsKHRoaXMsIHVzZXIsIHBhc3MsIGNhbGxiYWNrKTtcblx0fVxufTtcblxuLyoqIFxuKiBNYW5hZ2VkUmVxdWVzdCBtZXRob2RcbipcbiogQHBhcmFtIHtzdHJpbmd9IGNhbGxNZXRob2QgLSBnZXQsIHBvc3QsIFxuKiBAcGFyYW0ge3N0cmluZ30gX3VybCAtIFVSTCB0byBtYWtlIHJlcXVlc3QgdG9cbiogQHBhcmFtIHtqc29ufSBvcHRpb25zIC0gbXVzdCB0byBjYXJyeSBvbiBjYWxsYmFjayBmdW5jdGlvblxuKiAvLyBUT0RPOiB3aGF0IGRvZXMgdGhpcyBvcHRpb25zIGNvbW1lbnQgbWVhbiwgbmVlZHMgY2xhcmlmaWNhdGlvblxuKi9cbm1vZHVsZS5leHBvcnRzLm1hbmFnZWRSZXF1ZXN0ID0gZnVuY3Rpb24gKGNhbGxNZXRob2QgPSAnZ2V0JywgX3VybCwgb3B0aW9ucyA9IHtcblx0Y2FsbGJhY2s6ICgpID0+IGNvbnNvbGUubG9nKCdNaXNzaW5nIGNhbGxiYWNrIGZ1bmNpdG9uJylcbn0pIHtcblx0Y29uc3Qgc2VsZiA9IHRoaXM7XG5cdGNvbnN0IGNzcmYgPSB0aGlzLmNzcmY7XG5cdGxldCByZXRyeUNvdW50ID0gMDtcblx0Y29uc3Qge3VzZU11bHRpcGFydEZvcm1EYXRhLCBzYXNQcm9ncmFtLCBkYXRhT2JqLCBwYXJhbXMsIGNhbGxiYWNrLCBoZWFkZXJzfSA9IG9wdGlvbnNcblxuXHQvLyBUT0RPIC0gRXh0ZW5kIG1hbmFnZWRSZXF1ZXN0IG1ldGhvZCB0byBhY2NlcHQgcmVndWxhciBjYWxsIHdpdGggcGFyYW1zIHNhc1Byb2dyYW0gYW5kIGRhdGFPYmpcblx0Ly8gVE9ETzogaXMgdGhpcyBUT0RPIGRvbmU/XG5cdGlmIChzYXNQcm9ncmFtKSB7XG5cdFx0cmV0dXJuIHNlbGYuY2FsbChzYXNQcm9ncmFtLCBkYXRhT2JqLCBjYWxsYmFjaywgcGFyYW1zKVxuXHR9XG5cblx0bGV0IHVybCA9IF91cmxcblx0aWYgKCFfdXJsLnN0YXJ0c1dpdGgoJ2h0dHAnKSkge1xuXHRcdHVybCA9IHNlbGYuaG9zdFVybCArIF91cmxcblx0fVxuXG5cdGNvbnN0IF9oZWFkZXJzID0gT2JqZWN0LmFzc2lnbih7fSwgaGVhZGVycywge1xuXHRcdCdYLUNTUkYtVE9LRU4nOiBjc3JmXG5cdH0pXG5cdGNvbnN0IF9vcHRpb25zID0gT2JqZWN0LmFzc2lnbih7fSwgb3B0aW9ucywge1xuXHRcdGhlYWRlcnM6IF9oZWFkZXJzXG5cdH0pXG5cblx0aWYgKHRoaXMuX2Rpc2FibGVDYWxscykge1xuXHRcdHRoaXMuX2N1c3RvbVBlbmRpbmdDYWxscy5wdXNoKHtcblx0XHRcdGNhbGxNZXRob2QsXG5cdFx0XHRfdXJsLFxuXHRcdFx0b3B0aW9uczogX29wdGlvbnNcblx0XHR9KTtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRzZWxmLl9hamF4W2NhbGxNZXRob2RdKHVybCwgcGFyYW1zLCB1c2VNdWx0aXBhcnRGb3JtRGF0YSwgX2hlYWRlcnMpLnN1Y2Nlc3MoZnVuY3Rpb24gKHJlcykge1xuXHRcdGlmIChzZWxmLl91dGlscy5uZWVkVG9Mb2dpbi5jYWxsKHNlbGYsIHJlcykpIHtcblx0XHRcdC8vcmVtZW1iZXIgdGhlIGNhbGwgZm9yIGxhdHRlciB1c2Vcblx0XHRcdHNlbGYuX2N1c3RvbVBlbmRpbmdDYWxscy5wdXNoKHtcblx0XHRcdFx0Y2FsbE1ldGhvZCxcblx0XHRcdFx0X3VybCxcblx0XHRcdFx0b3B0aW9uczogX29wdGlvbnNcblx0XHRcdH0pO1xuXG5cdFx0XHQvL3RoZXJlJ3Mgbm8gbmVlZCB0byBjb250aW51ZSBpZiBwcmV2aW91cyBjYWxsIHJldHVybmVkIGxvZ2luIGVycm9yXG5cdFx0XHRpZiAoc2VsZi5fZGlzYWJsZUNhbGxzKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHNlbGYuX2Rpc2FibGVDYWxscyA9IHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdGNhbGxiYWNrKG5ldyBoNTRzRXJyb3IoJ25vdExvZ2dlZGluRXJyb3InLCAnWW91IGFyZSBub3QgbG9nZ2VkIGluJykpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRsZXQgcmVzT2JqLCBlcnI7XG5cdFx0XHRsZXQgZG9uZSA9IGZhbHNlO1xuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHQvLyBUT0RPOiBOTSBhcmUgd2UgcmVhbGx5IHB1Ymxpc2hpbmcgY29kZSB3aXRoIHN0dWZmIGxpa2UgdGhpcyBpblxuXHRcdFx0XHQvLyB0b2RvOiBjaGVjayB0aGF0IHRoaXMgcmV0dXJucyB2YWxpZCBqc29uIG9yIHNvbWV0aGluZ1xuXHRcdFx0XHQvLyByZXNPYmogPSByZXMucmVzcG9uc2VUZXh0O1xuXHRcdFx0XHQvLyBkb25lID0gdHJ1ZTtcblxuXHRcdFx0XHRjb25zdCBhcnIgPSByZXMuZ2V0QWxsUmVzcG9uc2VIZWFkZXJzKCkuc3BsaXQoJ1xcclxcbicpO1xuXHRcdFx0XHRjb25zdCByZXNIZWFkZXJzID0gYXJyLnJlZHVjZShmdW5jdGlvbiAoYWNjLCBjdXJyZW50LCBpKSB7XG5cdFx0XHRcdFx0bGV0IHBhcnRzID0gY3VycmVudC5zcGxpdCgnOiAnKTtcblx0XHRcdFx0XHRhY2NbcGFydHNbMF1dID0gcGFydHNbMV07XG5cdFx0XHRcdFx0cmV0dXJuIGFjYztcblx0XHRcdFx0fSwge30pO1xuXHRcdFx0XHRsZXQgYm9keSA9IHJlcy5yZXNwb25zZVRleHRcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRib2R5ID0gSlNPTi5wYXJzZShib2R5KVxuXHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0Y29uc29sZS5sb2coJ3Jlc3BvbnNlIGlzIG5vdCBKU09OIHN0cmluZycpXG5cdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0cmVzT2JqID0gT2JqZWN0LmFzc2lnbih7fSwge1xuXHRcdFx0XHRcdFx0aGVhZGVyczogcmVzSGVhZGVycyxcblx0XHRcdFx0XHRcdHN0YXR1czogcmVzLnN0YXR1cyxcblx0XHRcdFx0XHRcdHN0YXR1c1RleHQ6IHJlcy5zdGF0dXNUZXh0LFxuXHRcdFx0XHRcdFx0Ym9keVxuXHRcdFx0XHRcdH0pXG5cdFx0XHRcdFx0ZG9uZSA9IHRydWU7XG5cdFx0XHRcdH1cblxuXG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdGVyciA9IG5ldyBoNTRzRXJyb3IoJ3Vua25vd25FcnJvcicsIGUubWVzc2FnZSk7XG5cdFx0XHRcdGVyci5zdGFjayA9IGUuc3RhY2s7XG5cdFx0XHRcdGRvbmUgPSB0cnVlO1xuXG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRpZiAoZG9uZSkge1xuXHRcdFx0XHRcdGNhbGxiYWNrKGVyciwgcmVzT2JqKVxuXHRcdFx0XHR9XG5cblx0XHRcdH1cblx0XHR9XG5cdH0pLmVycm9yKGZ1bmN0aW9uIChyZXMpIHtcblx0XHRsZXQgX2NzcmZcblx0XHRpZiAocmVzLnN0YXR1cyA9PSA0NDkgfHwgKHJlcy5zdGF0dXMgPT0gNDAzICYmIChyZXMucmVzcG9uc2VUZXh0LmluY2x1ZGVzKCdfY3NyZicpIHx8IHJlcy5nZXRSZXNwb25zZUhlYWRlcignWC1Gb3JiaWRkZW4tUmVhc29uJykgPT09ICdDU1JGJykgJiYgKF9jc3JmID0gcmVzLmdldFJlc3BvbnNlSGVhZGVyKHJlcy5nZXRSZXNwb25zZUhlYWRlcignWC1DU1JGLUhFQURFUicpKSkpKSB7XG5cdFx0XHRzZWxmLmNzcmYgPSBfY3NyZlxuXHRcdFx0Y29uc3QgX2hlYWRlcnMgPSBPYmplY3QuYXNzaWduKHt9LCBoZWFkZXJzLCB7W3Jlcy5nZXRSZXNwb25zZUhlYWRlcignWC1DU1JGLUhFQURFUicpXTogX2NzcmZ9KVxuXHRcdFx0aWYgKHJldHJ5Q291bnQgPCBzZWxmLm1heFhoclJldHJpZXMpIHtcblx0XHRcdFx0c2VsZi5fYWpheFtjYWxsTWV0aG9kXSh1cmwsIHBhcmFtcywgdXNlTXVsdGlwYXJ0Rm9ybURhdGEsIF9oZWFkZXJzKS5zdWNjZXNzKHRoaXMuc3VjY2VzcykuZXJyb3IodGhpcy5lcnJvcik7XG5cdFx0XHRcdHJldHJ5Q291bnQrKztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIFRPRE86IE5NIGFyZSB3ZSBhZGRpbmcgdGhpcyBmYWlsIGNvbmRpdGlvbiBiZWZvcmUgd2UgcHVibGlzaFxuXHRcdFx0XHQvLyB0b2RvOiBhZGQgZmFpbCBjb25kaXRpb24gdGhhdCBpcyBub3QgcmVsYXRlZCB0byBkYXRhIGNhbGxcblx0XHRcdFx0Y2FsbGJhY2sobmV3IGg1NHNFcnJvcigncGFyc2VFcnJvcicsICdVbmFibGUgdG8gcGFyc2UgcmVzcG9uc2UganNvbicpKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0bG9ncy5hZGRBcHBsaWNhdGlvbkxvZygnTWFuYWdlZCByZXF1ZXN0IGZhaWxlZCB3aXRoIHN0YXR1czogJyArIHJlcy5zdGF0dXMsIF91cmwpO1xuXHRcdFx0Ly8gaWYgcmVxdWVzdCBoYXMgZXJyb3IgdGV4dCBlbHNlIGNhbGxiYWNrXG5cdFx0XHRjYWxsYmFjayhuZXcgaDU0c0Vycm9yKCdodHRwRXJyb3IxJywgcmVzLnJlc3BvbnNlVGV4dCwgcmVzLnN0YXR1cykpO1xuXHRcdH1cblx0fSk7XG59XG5cbi8qKlxuICogTG9nIG9uIHRvIFNBUyBpZiB3ZSBhcmUgYXNrZWQgdG8gXG4gKiBAcGFyYW0ge1N0cmluZ30gdXNlciAtIFVzZXJuYW1lIG9mIHVzZXJcbiAqIEBwYXJhbSB7U3RyaW5nfSBwYXNzIC0gUGFzc3dvcmQgb2YgdXNlclxuICogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgLSB3aGF0IHRvIGRvIGFmdGVyIFxuICovXG5mdW5jdGlvbiBoYW5kbGVTYXNMb2dvbih1c2VyLCBwYXNzLCBjYWxsYmFjaykge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0dmFyIGxvZ2luUGFyYW1zID0ge1xuXHRcdF9zZXJ2aWNlOiAnZGVmYXVsdCcsXG5cdFx0Ly9mb3IgU0FTIDkuNCxcblx0XHR1c2VybmFtZTogdXNlcixcblx0XHRwYXNzd29yZDogcGFzc1xuXHR9O1xuXG5cdGZvciAodmFyIGtleSBpbiB0aGlzLl9hZGl0aW9uYWxMb2dpblBhcmFtcykge1xuXHRcdGxvZ2luUGFyYW1zW2tleV0gPSB0aGlzLl9hZGl0aW9uYWxMb2dpblBhcmFtc1trZXldO1xuXHR9XG5cblx0dGhpcy5fbG9naW5BdHRlbXB0cyA9IDA7XG5cblx0dGhpcy5fYWpheC5wb3N0KHRoaXMubG9naW5VcmwsIGxvZ2luUGFyYW1zKVxuXHRcdC5zdWNjZXNzKGhhbmRsZVNhc0xvZ29uU3VjY2Vzcylcblx0XHQuZXJyb3IoaGFuZGxlU2FzTG9nb25FcnJvcik7XG5cblx0ZnVuY3Rpb24gaGFuZGxlU2FzTG9nb25FcnJvcihyZXMpIHtcblx0XHRpZiAocmVzLnN0YXR1cyA9PSA0NDkpIHtcblx0XHRcdGhhbmRsZVNhc0xvZ29uU3VjY2VzcyhyZXMpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxvZ3MuYWRkQXBwbGljYXRpb25Mb2coJ0xvZ2luIGZhaWxlZCB3aXRoIHN0YXR1cyBjb2RlOiAnICsgcmVzLnN0YXR1cyk7XG5cdFx0Y2FsbGJhY2socmVzLnN0YXR1cyk7XG5cdH1cblxuXHRmdW5jdGlvbiBoYW5kbGVTYXNMb2dvblN1Y2Nlc3MocmVzKSB7XG5cdFx0aWYgKCsrc2VsZi5fbG9naW5BdHRlbXB0cyA9PT0gMykge1xuXHRcdFx0cmV0dXJuIGNhbGxiYWNrKC0yKTtcblx0XHR9XG5cdFx0aWYgKHNlbGYuX3V0aWxzLm5lZWRUb0xvZ2luLmNhbGwoc2VsZiwgcmVzKSkge1xuXHRcdFx0Ly93ZSBhcmUgZ2V0dGluZyBmb3JtIGFnYWluIGFmdGVyIHJlZGlyZWN0XG5cdFx0XHQvL2FuZCBuZWVkIHRvIGxvZ2luIGFnYWluIHVzaW5nIHRoZSBuZXcgdXJsXG5cdFx0XHQvL19sb2dpbkNoYW5nZWQgaXMgc2V0IGluIG5lZWRUb0xvZ2luIGZ1bmN0aW9uXG5cdFx0XHQvL2J1dCBpZiBsb2dpbiB1cmwgaXMgbm90IGRpZmZlcmVudCwgd2UgYXJlIGNoZWNraW5nIGlmIHRoZXJlIGFyZSBhZGl0aW9uYWwgcGFyYW1ldGVyc1xuXHRcdFx0aWYgKHNlbGYuX2xvZ2luQ2hhbmdlZCB8fCAoc2VsZi5faXNOZXdMb2dpblBhZ2UgJiYgIXNlbGYuX2FkaXRpb25hbExvZ2luUGFyYW1zKSkge1xuXHRcdFx0XHRkZWxldGUgc2VsZi5fbG9naW5DaGFuZ2VkO1xuXHRcdFx0XHR2YXIgaW5wdXRzID0gcmVzLnJlc3BvbnNlVGV4dC5tYXRjaCgvPGlucHV0LipcImhpZGRlblwiW14+XSo+L2cpO1xuXHRcdFx0XHRpZiAoaW5wdXRzKSB7XG5cdFx0XHRcdFx0aW5wdXRzLmZvckVhY2goZnVuY3Rpb24gKGlucHV0U3RyKSB7XG5cdFx0XHRcdFx0XHR2YXIgdmFsdWVNYXRjaCA9IGlucHV0U3RyLm1hdGNoKC9uYW1lPVwiKFteXCJdKilcIlxcc3ZhbHVlPVwiKFteXCJdKikvKTtcblx0XHRcdFx0XHRcdGxvZ2luUGFyYW1zW3ZhbHVlTWF0Y2hbMV1dID0gdmFsdWVNYXRjaFsyXTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRzZWxmLl9hamF4LnBvc3Qoc2VsZi5sb2dpblVybCwgbG9naW5QYXJhbXMpLnN1Y2Nlc3MoZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRcdC8vd2UgbmVlZCB0aGlzIGdldCByZXF1ZXN0IGJlY2F1c2Ugb2YgdGhlIHNhcyA5LjQgc2VjdXJpdHkgY2hlY2tzXG5cdFx0XHRcdFx0c2VsZi5fYWpheC5nZXQoc2VsZi51cmwpLnN1Y2Nlc3MoaGFuZGxlU2FzTG9nb25TdWNjZXNzKS5lcnJvcihoYW5kbGVTYXNMb2dvbkVycm9yKTtcblx0XHRcdFx0fSkuZXJyb3IoaGFuZGxlU2FzTG9nb25FcnJvcik7XG5cdFx0XHR9XG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0Ly9nZXR0aW5nIGZvcm0gYWdhaW4sIGJ1dCBpdCB3YXNuJ3QgYSByZWRpcmVjdFxuXHRcdFx0XHRsb2dzLmFkZEFwcGxpY2F0aW9uTG9nKCdXcm9uZyB1c2VybmFtZSBvciBwYXNzd29yZCcpO1xuXHRcdFx0XHRjYWxsYmFjaygtMSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGVsc2Uge1xuXHRcdFx0c2VsZi5fZGlzYWJsZUNhbGxzID0gZmFsc2U7XG5cdFx0XHRjYWxsYmFjayhyZXMuc3RhdHVzKTtcblx0XHRcdHdoaWxlIChzZWxmLl9wZW5kaW5nQ2FsbHMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHR2YXIgcGVuZGluZ0NhbGwgPSBzZWxmLl9wZW5kaW5nQ2FsbHMuc2hpZnQoKTtcblx0XHRcdFx0dmFyIG1ldGhvZCA9IHBlbmRpbmdDYWxsLm1ldGhvZCB8fCBzZWxmLmNhbGwuYmluZChzZWxmKTtcblx0XHRcdFx0dmFyIHNhc1Byb2dyYW0gPSBwZW5kaW5nQ2FsbC5vcHRpb25zLnNhc1Byb2dyYW07XG5cdFx0XHRcdHZhciBjYWxsYmFja1BlbmRpbmcgPSBwZW5kaW5nQ2FsbC5vcHRpb25zLmNhbGxiYWNrO1xuXHRcdFx0XHR2YXIgcGFyYW1zID0gcGVuZGluZ0NhbGwucGFyYW1zO1xuXHRcdFx0XHQvL3VwZGF0ZSBkZWJ1ZyBiZWNhdXNlIGl0IG1heSBjaGFuZ2UgaW4gdGhlIG1lYW50aW1lXG5cdFx0XHRcdHBhcmFtcy5fZGVidWcgPSBzZWxmLmRlYnVnID8gMTMxIDogMDtcblx0XHRcdFx0aWYgKHNlbGYucmV0cnlBZnRlckxvZ2luKSB7XG5cdFx0XHRcdFx0bWV0aG9kKHNhc1Byb2dyYW0sIG51bGwsIGNhbGxiYWNrUGVuZGluZywgcGFyYW1zKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fTtcbn1cbi8qKlxuICogUkVTVCBsb2dvbiBmb3IgOS40IHYxIHRpY2tldCBiYXNlZCBhdXRoXG4gKiBAcGFyYW0ge1N0cmluZ30gdXNlciAtXG4gKiBAcGFyYW0ge1N0cmluZ30gcGFzcyBcbiAqIEBwYXJhbSB7Y2FsbGJhY2t9IGNhbGxiYWNrIFxuICovXG5mdW5jdGlvbiBoYW5kbGVSZXN0TG9nb24odXNlciwgcGFzcywgY2FsbGJhY2spIHtcblx0dmFyIHNlbGYgPSB0aGlzO1xuXG5cdHZhciBsb2dpblBhcmFtcyA9IHtcblx0XHR1c2VybmFtZTogdXNlcixcblx0XHRwYXNzd29yZDogcGFzc1xuXHR9O1xuXG5cdHRoaXMuX2FqYXgucG9zdCh0aGlzLlJFU1RhdXRoTG9naW5VcmwsIGxvZ2luUGFyYW1zKS5zdWNjZXNzKGZ1bmN0aW9uIChyZXMpIHtcblx0XHR2YXIgbG9jYXRpb24gPSByZXMuZ2V0UmVzcG9uc2VIZWFkZXIoJ0xvY2F0aW9uJyk7XG5cblx0XHRzZWxmLl9hamF4LnBvc3QobG9jYXRpb24sIHtcblx0XHRcdHNlcnZpY2U6IHNlbGYudXJsXG5cdFx0fSkuc3VjY2VzcyhmdW5jdGlvbiAocmVzKSB7XG5cdFx0XHRpZiAoc2VsZi51cmwuaW5kZXhPZignPycpID09PSAtMSkge1xuXHRcdFx0XHRzZWxmLnVybCArPSAnP3RpY2tldD0nICsgcmVzLnJlc3BvbnNlVGV4dDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmIChzZWxmLnVybC5pbmRleE9mKCd0aWNrZXQnKSAhPT0gLTEpIHtcblx0XHRcdFx0XHRzZWxmLnVybCA9IHNlbGYudXJsLnJlcGxhY2UoL3RpY2tldD1bXiZdKy8sICd0aWNrZXQ9JyArIHJlcy5yZXNwb25zZVRleHQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHNlbGYudXJsICs9ICcmdGlja2V0PScgKyByZXMucmVzcG9uc2VUZXh0O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNhbGxiYWNrKHJlcy5zdGF0dXMpO1xuXHRcdH0pLmVycm9yKGZ1bmN0aW9uIChyZXMpIHtcblx0XHRcdGxvZ3MuYWRkQXBwbGljYXRpb25Mb2coJ0xvZ2luIGZhaWxlZCB3aXRoIHN0YXR1cyBjb2RlOiAnICsgcmVzLnN0YXR1cyk7XG5cdFx0XHRjYWxsYmFjayhyZXMuc3RhdHVzKTtcblx0XHR9KTtcblx0fSkuZXJyb3IoZnVuY3Rpb24gKHJlcykge1xuXHRcdGlmIChyZXMucmVzcG9uc2VUZXh0ID09PSAnZXJyb3IuYXV0aGVudGljYXRpb24uY3JlZGVudGlhbHMuYmFkJykge1xuXHRcdFx0Y2FsbGJhY2soLTEpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRsb2dzLmFkZEFwcGxpY2F0aW9uTG9nKCdMb2dpbiBmYWlsZWQgd2l0aCBzdGF0dXMgY29kZTogJyArIHJlcy5zdGF0dXMpO1xuXHRcdFx0Y2FsbGJhY2socmVzLnN0YXR1cyk7XG5cdFx0fVxuXHR9KTtcbn1cblxuLyoqIFxuKiBMb2dvdXQgbWV0aG9kXG4qXG4qIEBwYXJhbSB7ZnVuY3Rpb259IGNhbGxiYWNrIC0gQ2FsbGJhY2sgZnVuY3Rpb24gY2FsbGVkIHdoZW4gbG9nb3V0IGlzIGRvbmVcbipcbiovXG5cbm1vZHVsZS5leHBvcnRzLmxvZ291dCA9IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuXHR2YXIgYmFzZVVybCA9IHRoaXMuaG9zdFVybCB8fCAnJztcblx0dmFyIHVybCA9IGJhc2VVcmwgKyB0aGlzLmxvZ291dFVybDtcblxuXHR0aGlzLl9hamF4LmdldCh1cmwpLnN1Y2Nlc3MoZnVuY3Rpb24gKHJlcykge1xuXHRcdHRoaXMuX2Rpc2FibGVDYWxscyA9IHRydWVcblx0XHRjYWxsYmFjaygpO1xuXHR9KS5lcnJvcihmdW5jdGlvbiAocmVzKSB7XG5cdFx0bG9ncy5hZGRBcHBsaWNhdGlvbkxvZygnTG9nb3V0IGZhaWxlZCB3aXRoIHN0YXR1cyBjb2RlOiAnICsgcmVzLnN0YXR1cyk7XG5cdFx0Y2FsbGJhY2socmVzLnN0YXR1cyk7XG5cdH0pO1xufTtcblxuLypcbiogRW50ZXIgZGVidWcgbW9kZVxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLnNldERlYnVnTW9kZSA9IGZ1bmN0aW9uICgpIHtcblx0dGhpcy5kZWJ1ZyA9IHRydWU7XG59O1xuXG4vKlxuKiBFeGl0IGRlYnVnIG1vZGUgYW5kIGNsZWFyIGxvZ3NcbipcbiovXG5tb2R1bGUuZXhwb3J0cy51bnNldERlYnVnTW9kZSA9IGZ1bmN0aW9uICgpIHtcblx0dGhpcy5kZWJ1ZyA9IGZhbHNlO1xufTtcblxuZm9yICh2YXIga2V5IGluIGxvZ3MuZ2V0KSB7XG5cdGlmIChsb2dzLmdldC5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG5cdFx0bW9kdWxlLmV4cG9ydHNba2V5XSA9IGxvZ3MuZ2V0W2tleV07XG5cdH1cbn1cblxuZm9yICh2YXIga2V5IGluIGxvZ3MuY2xlYXIpIHtcblx0aWYgKGxvZ3MuY2xlYXIuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuXHRcdG1vZHVsZS5leHBvcnRzW2tleV0gPSBsb2dzLmNsZWFyW2tleV07XG5cdH1cbn1cblxuLypcbiogQWRkIGNhbGxiYWNrIGZ1bmN0aW9ucyBleGVjdXRlZCB3aGVuIHByb3BlcnRpZXMgYXJlIHVwZGF0ZWQgd2l0aCByZW1vdGUgY29uZmlnXG4qXG4qQGNhbGxiYWNrIC0gY2FsbGJhY2sgcHVzaGVkIHRvIGFycmF5XG4qXG4qL1xubW9kdWxlLmV4cG9ydHMub25SZW1vdGVDb25maWdVcGRhdGUgPSBmdW5jdGlvbiAoY2FsbGJhY2spIHtcblx0dGhpcy5yZW1vdGVDb25maWdVcGRhdGVDYWxsYmFja3MucHVzaChjYWxsYmFjayk7XG59O1xuXG5tb2R1bGUuZXhwb3J0cy5fdXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzLmpzJyk7XG5cbi8qKlxuICogTG9naW4gY2FsbCB3aGljaCByZXR1cm5zIGEgcHJvbWlzZVxuICogQHBhcmFtIHtTdHJpbmd9IHVzZXIgLSBVc2VybmFtZVxuICogQHBhcmFtIHtTdHJpbmd9IHBhc3MgLSBQYXNzd29yZFxuICovXG5tb2R1bGUuZXhwb3J0cy5wcm9taXNlTG9naW4gPSBmdW5jdGlvbiAodXNlciwgcGFzcykge1xuXHRyZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdGlmICghdXNlciB8fCAhcGFzcykge1xuXHRcdFx0cmVqZWN0KG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnQ3JlZGVudGlhbHMgbm90IHNldCcpKVxuXHRcdH1cblx0XHRpZiAodHlwZW9mIHVzZXIgIT09ICdzdHJpbmcnIHx8IHR5cGVvZiBwYXNzICE9PSAnc3RyaW5nJykge1xuXHRcdFx0cmVqZWN0KG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnVXNlciBhbmQgcGFzcyBwYXJhbWV0ZXJzIG11c3QgYmUgc3RyaW5ncycpKVxuXHRcdH1cblx0XHRpZiAoIXRoaXMuUkVTVGF1dGgpIHtcblx0XHRcdGN1c3RvbUhhbmRsZVNhc0xvZ29uLmNhbGwodGhpcywgdXNlciwgcGFzcywgcmVzb2x2ZSk7XG5cdFx0XHQvLyBwcm9taXNlSGFuZGxlU2FzTG9nb24uY2FsbCh0aGlzLCB1c2VyLCBwYXNzLCByZXNvbHZlLCByZWplY3QpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjdXN0b21IYW5kbGVSZXN0TG9nb24uY2FsbCh0aGlzLCB1c2VyLCBwYXNzLCByZXNvbHZlKTtcblx0XHRcdC8vIGhhbmRsZVJlc3RMb2dvbi5jYWxsKHRoaXMsIHVzZXIsIHBhc3MsIHJlc29sdmUpO1xuXHRcdH1cblx0fSlcbn1cblxuLyoqXG4gKiBcbiAqIEBwYXJhbSB7U3RyaW5nfSB1c2VyIC0gVXNlcm5hbWUgXG4gKiBAcGFyYW0ge1N0cmluZ30gcGFzcyAtIFBhc3N3b3JkXG4gKiBAcGFyYW0ge2Z1bmN0aW9ufSBjYWxsYmFjayAtIGZ1bmN0aW9uIHRvIGNhbGwgd2hlbiBzdWNjZXNzZnVsXG4gKi9cbmZ1bmN0aW9uIGN1c3RvbUhhbmRsZVNhc0xvZ29uKHVzZXIsIHBhc3MsIGNhbGxiYWNrKSB7XG5cdGNvbnN0IHNlbGYgPSB0aGlzO1xuXHRsZXQgbG9naW5QYXJhbXMgPSB7XG5cdFx0X3NlcnZpY2U6ICdkZWZhdWx0Jyxcblx0XHQvL2ZvciBTQVMgOS40LFxuXHRcdHVzZXJuYW1lOiB1c2VyLFxuXHRcdHBhc3N3b3JkOiBwYXNzXG5cdH07XG5cblx0Zm9yIChsZXQga2V5IGluIHRoaXMuX2FkaXRpb25hbExvZ2luUGFyYW1zKSB7XG5cdFx0bG9naW5QYXJhbXNba2V5XSA9IHRoaXMuX2FkaXRpb25hbExvZ2luUGFyYW1zW2tleV07XG5cdH1cblxuXHR0aGlzLl9sb2dpbkF0dGVtcHRzID0gMDtcblx0bG9naW5QYXJhbXMgPSB0aGlzLl9hamF4LnNlcmlhbGl6ZShsb2dpblBhcmFtcylcblxuXHR0aGlzLl9hamF4LnBvc3QodGhpcy5sb2dpblVybCwgbG9naW5QYXJhbXMpXG5cdFx0LnN1Y2Nlc3MoaGFuZGxlU2FzTG9nb25TdWNjZXNzKVxuXHRcdC5lcnJvcihoYW5kbGVTYXNMb2dvbkVycm9yKTtcblxuXHRmdW5jdGlvbiBoYW5kbGVTYXNMb2dvbkVycm9yKHJlcykge1xuXHRcdGlmIChyZXMuc3RhdHVzID09IDQ0OSkge1xuXHRcdFx0aGFuZGxlU2FzTG9nb25TdWNjZXNzKHJlcyk7XG5cdFx0XHQvLyByZXNvbHZlKHJlcy5zdGF0dXMpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRsb2dzLmFkZEFwcGxpY2F0aW9uTG9nKCdMb2dpbiBmYWlsZWQgd2l0aCBzdGF0dXMgY29kZTogJyArIHJlcy5zdGF0dXMpO1xuXHRcdFx0Y2FsbGJhY2socmVzLnN0YXR1cyk7XG5cdFx0fVxuXHR9XG5cblx0ZnVuY3Rpb24gaGFuZGxlU2FzTG9nb25TdWNjZXNzKHJlcykge1xuXHRcdGlmICgrK3NlbGYuX2xvZ2luQXR0ZW1wdHMgPT09IDMpIHtcblx0XHRcdGNhbGxiYWNrKC0yKTtcblx0XHR9XG5cblx0XHRpZiAoc2VsZi5fdXRpbHMubmVlZFRvTG9naW4uY2FsbChzZWxmLCByZXMpKSB7XG5cdFx0XHQvL3dlIGFyZSBnZXR0aW5nIGZvcm0gYWdhaW4gYWZ0ZXIgcmVkaXJlY3Rcblx0XHRcdC8vYW5kIG5lZWQgdG8gbG9naW4gYWdhaW4gdXNpbmcgdGhlIG5ldyB1cmxcblx0XHRcdC8vX2xvZ2luQ2hhbmdlZCBpcyBzZXQgaW4gbmVlZFRvTG9naW4gZnVuY3Rpb25cblx0XHRcdC8vYnV0IGlmIGxvZ2luIHVybCBpcyBub3QgZGlmZmVyZW50LCB3ZSBhcmUgY2hlY2tpbmcgaWYgdGhlcmUgYXJlIGFkaXRpb25hbCBwYXJhbWV0ZXJzXG5cdFx0XHRpZiAoc2VsZi5fbG9naW5DaGFuZ2VkIHx8IChzZWxmLl9pc05ld0xvZ2luUGFnZSAmJiAhc2VsZi5fYWRpdGlvbmFsTG9naW5QYXJhbXMpKSB7XG5cdFx0XHRcdGRlbGV0ZSBzZWxmLl9sb2dpbkNoYW5nZWQ7XG5cdFx0XHRcdGNvbnN0IGlucHV0cyA9IHJlcy5yZXNwb25zZVRleHQubWF0Y2goLzxpbnB1dC4qXCJoaWRkZW5cIltePl0qPi9nKTtcblx0XHRcdFx0aWYgKGlucHV0cykge1xuXHRcdFx0XHRcdGlucHV0cy5mb3JFYWNoKGZ1bmN0aW9uIChpbnB1dFN0cikge1xuXHRcdFx0XHRcdFx0Y29uc3QgdmFsdWVNYXRjaCA9IGlucHV0U3RyLm1hdGNoKC9uYW1lPVwiKFteXCJdKilcIlxcc3ZhbHVlPVwiKFteXCJdKikvKTtcblx0XHRcdFx0XHRcdGxvZ2luUGFyYW1zW3ZhbHVlTWF0Y2hbMV1dID0gdmFsdWVNYXRjaFsyXTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRzZWxmLl9hamF4LnBvc3Qoc2VsZi5sb2dpblVybCwgbG9naW5QYXJhbXMpLnN1Y2Nlc3MoZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRcdC8vd2UgbmVlZCB0aGlzIGdldCByZXF1ZXN0IGJlY2F1c2Ugb2YgdGhlIHNhcyA5LjQgc2VjdXJpdHkgY2hlY2tzXG5cdFx0XHRcdFx0Ly9UT0RPIElzIHRoaXMgbmVjZXNzYXJ5ID8/Pz8gYmVjYXVzZSBhbGwgcGVuZGluZyBjYWxscyBzaG91bGQgYmUgY2FsbGQgYWZ0ZXIgdGhpcyBob3dlcnZlci5cblx0XHRcdFx0XHQvLyBzZWxmLl9hamF4W2NhbGxNZXRob2RdKHVybCkuc3VjY2VzcyhoYW5kbGVTYXNMb2dvblN1Y2Nlc3MpLmVycm9yKGhhbmRsZVNhc0xvZ29uRXJyb3IpO1xuXHRcdFx0XHRcdGhhbmRsZVNhc0xvZ29uU3VjY2VzcygpXG5cdFx0XHRcdH0pLmVycm9yKGhhbmRsZVNhc0xvZ29uRXJyb3IpO1xuXHRcdFx0fVxuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdC8vZ2V0dGluZyBmb3JtIGFnYWluLCBidXQgaXQgd2Fzbid0IGEgcmVkaXJlY3Rcblx0XHRcdFx0bG9ncy5hZGRBcHBsaWNhdGlvbkxvZygnV3JvbmcgdXNlcm5hbWUgb3IgcGFzc3dvcmQnKTtcblx0XHRcdFx0Y2FsbGJhY2soLTEpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRlbHNlIHtcblx0XHRcdHNlbGYuX2Rpc2FibGVDYWxscyA9IGZhbHNlO1xuXHRcdFx0Y2FsbGJhY2socmVzLnN0YXR1cyk7XG5cdFx0XHR3aGlsZSAoc2VsZi5fY3VzdG9tUGVuZGluZ0NhbGxzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Y29uc3QgcGVuZGluZ0NhbGwgPSBzZWxmLl9jdXN0b21QZW5kaW5nQ2FsbHMuc2hpZnQoKVxuXHRcdFx0XHRjb25zdCBtZXRob2QgPSBwZW5kaW5nQ2FsbC5tZXRob2QgfHwgc2VsZi5tYW5hZ2VkUmVxdWVzdC5iaW5kKHNlbGYpO1xuXHRcdFx0XHRjb25zdCBjYWxsTWV0aG9kID0gcGVuZGluZ0NhbGwuY2FsbE1ldGhvZFxuXHRcdFx0XHRjb25zdCBfdXJsID0gcGVuZGluZ0NhbGwuX3VybFxuXHRcdFx0XHRjb25zdCBvcHRpb25zID0gcGVuZGluZ0NhbGwub3B0aW9ucztcblx0XHRcdFx0Ly91cGRhdGUgZGVidWcgYmVjYXVzZSBpdCBtYXkgY2hhbmdlIGluIHRoZSBtZWFudGltZVxuXHRcdFx0XHRpZiAob3B0aW9ucy5wYXJhbXMpIHtcblx0XHRcdFx0XHRvcHRpb25zLnBhcmFtcy5fZGVidWcgPSBzZWxmLmRlYnVnID8gMTMxIDogMDtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoc2VsZi5yZXRyeUFmdGVyTG9naW4pIHtcblx0XHRcdFx0XHRtZXRob2QoY2FsbE1ldGhvZCwgX3VybCwgb3B0aW9ucyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0d2hpbGUgKHNlbGYuX3BlbmRpbmdDYWxscy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGNvbnN0IHBlbmRpbmdDYWxsID0gc2VsZi5fcGVuZGluZ0NhbGxzLnNoaWZ0KCk7XG5cdFx0XHRcdGNvbnN0IG1ldGhvZCA9IHBlbmRpbmdDYWxsLm1ldGhvZCB8fCBzZWxmLmNhbGwuYmluZChzZWxmKTtcblx0XHRcdFx0Y29uc3Qgc2FzUHJvZ3JhbSA9IHBlbmRpbmdDYWxsLm9wdGlvbnMuc2FzUHJvZ3JhbTtcblx0XHRcdFx0Y29uc3QgY2FsbGJhY2tQZW5kaW5nID0gcGVuZGluZ0NhbGwub3B0aW9ucy5jYWxsYmFjaztcblx0XHRcdFx0Y29uc3QgcGFyYW1zID0gcGVuZGluZ0NhbGwucGFyYW1zO1xuXHRcdFx0XHQvL3VwZGF0ZSBkZWJ1ZyBiZWNhdXNlIGl0IG1heSBjaGFuZ2UgaW4gdGhlIG1lYW50aW1lXG5cdFx0XHRcdHBhcmFtcy5fZGVidWcgPSBzZWxmLmRlYnVnID8gMTMxIDogMDtcblx0XHRcdFx0aWYgKHNlbGYucmV0cnlBZnRlckxvZ2luKSB7XG5cdFx0XHRcdFx0bWV0aG9kKHNhc1Byb2dyYW0sIG51bGwsIGNhbGxiYWNrUGVuZGluZywgcGFyYW1zKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fTtcbn1cblxuLyoqXG4gKiBUbyBiZSB1c2VkIHdpdGggZnV0dXJlIG1hbmFnZWQgbWV0YWRhdGEgY2FsbHMgXG4gKiBAcGFyYW0ge1N0cmluZ30gdXNlciAtIFVzZXJuYW1lXG4gKiBAcGFyYW0ge1N0cmluZ30gcGFzcyAtIFBhc3N3b3JkXG4gKiBAcGFyYW0ge2Z1bmN0aW9ufSBjYWxsYmFjayAtIHdoYXQgdG8gY2FsbCBhZnRlciBcbiAqIEBwYXJhbSB7U3RyaW5nfSBjYWxsYmFja1VybCAtIHdoZXJlIHRvIG5hdmlnYXRlIGFmdGVyIGdldHRpbmcgdGlja2V0XG4gKi9cbmZ1bmN0aW9uIGN1c3RvbUhhbmRsZVJlc3RMb2dvbih1c2VyLCBwYXNzLCBjYWxsYmFjaywgY2FsbGJhY2tVcmwpIHtcblx0dmFyIHNlbGYgPSB0aGlzO1xuXG5cdHZhciBsb2dpblBhcmFtcyA9IHtcblx0XHR1c2VybmFtZTogdXNlcixcblx0XHRwYXNzd29yZDogcGFzc1xuXHR9O1xuXG5cdHRoaXMuX2FqYXgucG9zdCh0aGlzLlJFU1RhdXRoTG9naW5VcmwsIGxvZ2luUGFyYW1zKS5zdWNjZXNzKGZ1bmN0aW9uIChyZXMpIHtcblx0XHR2YXIgbG9jYXRpb24gPSByZXMuZ2V0UmVzcG9uc2VIZWFkZXIoJ0xvY2F0aW9uJyk7XG5cblx0XHRzZWxmLl9hamF4LnBvc3QobG9jYXRpb24sIHtcblx0XHRcdHNlcnZpY2U6IGNhbGxiYWNrVXJsXG5cdFx0fSkuc3VjY2VzcyhmdW5jdGlvbiAocmVzKSB7XG5cdFx0XHRpZiAoY2FsbGJhY2tVcmwuaW5kZXhPZignPycpID09PSAtMSkge1xuXHRcdFx0XHRjYWxsYmFja1VybCArPSAnP3RpY2tldD0nICsgcmVzLnJlc3BvbnNlVGV4dDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmIChjYWxsYmFja1VybC5pbmRleE9mKCd0aWNrZXQnKSAhPT0gLTEpIHtcblx0XHRcdFx0XHRjYWxsYmFja1VybCA9IGNhbGxiYWNrVXJsLnJlcGxhY2UoL3RpY2tldD1bXiZdKy8sICd0aWNrZXQ9JyArIHJlcy5yZXNwb25zZVRleHQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNhbGxiYWNrVXJsICs9ICcmdGlja2V0PScgKyByZXMucmVzcG9uc2VUZXh0O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNhbGxiYWNrKHJlcy5zdGF0dXMpO1xuXHRcdH0pLmVycm9yKGZ1bmN0aW9uIChyZXMpIHtcblx0XHRcdGxvZ3MuYWRkQXBwbGljYXRpb25Mb2coJ0xvZ2luIGZhaWxlZCB3aXRoIHN0YXR1cyBjb2RlOiAnICsgcmVzLnN0YXR1cyk7XG5cdFx0XHRjYWxsYmFjayhyZXMuc3RhdHVzKTtcblx0XHR9KTtcblx0fSkuZXJyb3IoZnVuY3Rpb24gKHJlcykge1xuXHRcdGlmIChyZXMucmVzcG9uc2VUZXh0ID09PSAnZXJyb3IuYXV0aGVudGljYXRpb24uY3JlZGVudGlhbHMuYmFkJykge1xuXHRcdFx0Y2FsbGJhY2soLTEpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRsb2dzLmFkZEFwcGxpY2F0aW9uTG9nKCdMb2dpbiBmYWlsZWQgd2l0aCBzdGF0dXMgY29kZTogJyArIHJlcy5zdGF0dXMpO1xuXHRcdFx0Y2FsbGJhY2socmVzLnN0YXR1cyk7XG5cdFx0fVxuXHR9KTtcbn1cblxuXG4vLyBVdGlsaWxpdHkgZnVuY3Rpb25zIGZvciBoYW5kbGluZyBmaWxlcyBhbmQgZm9sZGVycyBvbiBWSVlBXG4vKipcbiAqIFJldHVybnMgdGhlIGRldGFpbHMgb2YgYSBmb2xkZXIgZnJvbSBmb2xkZXIgc2VydmljZVxuICogQHBhcmFtIHtTdHJpbmd9IGZvbGRlck5hbWUgLSBGdWxsIHBhdGggb2YgZm9sZGVyIHRvIGJlIGZvdW5kXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyAtIE9wdGlvbnMgb2JqZWN0IGZvciBtYW5hZ2VkUmVxdWVzdFxuICovXG5tb2R1bGUuZXhwb3J0cy5nZXRGb2xkZXJEZXRhaWxzID0gZnVuY3Rpb24gKGZvbGRlck5hbWUsIG9wdGlvbnMpIHtcblx0Ly8gRmlyc3QgY2FsbCB0byBnZXQgZm9sZGVyJ3MgaWRcblx0bGV0IHVybCA9IFwiL2ZvbGRlcnMvZm9sZGVycy9AaXRlbT9wYXRoPVwiICsgZm9sZGVyTmFtZVxuXHRyZXR1cm4gdGhpcy5tYW5hZ2VkUmVxdWVzdCgnZ2V0JywgdXJsLCBvcHRpb25zKTtcbn1cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBkZXRhaWxzIG9mIGEgZmlsZSBmcm9tIGZpbGVzIHNlcnZpY2VcbiAqIEBwYXJhbSB7U3RyaW5nfSBmaWxlVXJpIC0gRnVsbCBwYXRoIG9mIGZpbGUgdG8gYmUgZm91bmRcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIC0gT3B0aW9ucyBvYmplY3QgZm9yIG1hbmFnZWRSZXF1ZXN0XG4gKi9cbi8vIFRPRE86IE5NIGFyZSB3ZSBrZWVwaW5nIHRoZSBjYWNoZWJ1c3RpbmcgaWYgd2UgYXJlIGFibGUgdG8gZGlzYWJsZSBjYWNoZSBpbiB4aHIgb2JqZWN0XG5tb2R1bGUuZXhwb3J0cy5nZXRGaWxlRGV0YWlscyA9IGZ1bmN0aW9uIChmaWxlVXJpLCBvcHRpb25zKSB7XG5cdGNvbnN0IGNhY2hlQnVzdCA9IG9wdGlvbnMuY2FjaGVCdXN0XG5cdGlmIChjYWNoZUJ1c3QpIHtcblx0XHRmaWxlVXJpICs9ICc/Y2FjaGVCdXN0PScgKyBuZXcgRGF0ZSgpLmdldFRpbWUoKVxuXHR9XG5cdHJldHVybiB0aGlzLm1hbmFnZWRSZXF1ZXN0KCdnZXQnLCBmaWxlVXJpLCBvcHRpb25zKTtcbn1cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBjb250ZW50cyBvZiBhIGZpbGUgZnJvbSBmaWxlcyBzZXJ2aWNlXG4gKiBAcGFyYW0ge1N0cmluZ30gZmlsZVVyaSAtIEZ1bGwgcGF0aCBvZiBmaWxlIHRvIGJlIGRvd25sb2FkZWRcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIC0gT3B0aW9ucyBvYmplY3QgZm9yIG1hbmFnZWRSZXF1ZXN0XG4gKi9cbi8vIFRPRE86IE5NIGFyZSB3ZSBrZWVwaW5nIHRoZSBjYWNoZWJ1c3RpbmcgaWYgd2UgYXJlIGFibGUgdG8gZGlzYWJsZSBjYWNoZSBpbiB4aHIgb2JqZWN0XG5tb2R1bGUuZXhwb3J0cy5nZXRGaWxlQ29udGVudCA9IGZ1bmN0aW9uIChmaWxlVXJpLCBvcHRpb25zKSB7XG5cdGNvbnN0IGNhY2hlQnVzdCA9IG9wdGlvbnMuY2FjaGVCdXN0XG5cdGxldCB1cmkgPSBmaWxlVXJpICsgJy9jb250ZW50J1xuXHRpZiAoY2FjaGVCdXN0KSB7XG5cdFx0dXJpICs9ICc/Y2FjaGVCdXN0PScgKyBuZXcgRGF0ZSgpLmdldFRpbWUoKVxuXHR9XG5cdHJldHVybiB0aGlzLm1hbmFnZWRSZXF1ZXN0KCdnZXQnLCB1cmksIG9wdGlvbnMpO1xufVxuXG5cbi8vIFV0aWwgZnVuY3Rpb25zIGZvciB3b3JraW5nIHdpdGggZmlsZXMgYW5kIGZvbGRlcnNcbi8qKlxuICogUmV0dXJucyBkZXRhaWxzIGFib3V0IGZvbGRlciBpdCBzZWxmIGFuZCBpdCdzIG1lbWJlcnMgd2l0aCBkZXRhaWxzXG4gKiBAcGFyYW0ge1N0cmluZ30gZm9sZGVyTmFtZSAtIEZ1bGwgcGF0aCBvZiBmb2xkZXIgdG8gYmUgZm91bmRcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIC0gT3B0aW9ucyBvYmplY3QgZm9yIG1hbmFnZWRSZXF1ZXN0XG4gKi9cbm1vZHVsZS5leHBvcnRzLmdldEZvbGRlckNvbnRlbnRzID0gYXN5bmMgZnVuY3Rpb24gKGZvbGRlck5hbWUsIG9wdGlvbnMpIHtcblx0Y29uc3Qgc2VsZiA9IHRoaXNcblx0Y29uc3Qge2NhbGxiYWNrfSA9IG9wdGlvbnNcblxuXHQvLyBTZWNvbmQgY2FsbCB0byBnZXQgZm9sZGVyJ3MgbWVtZWJlcnNcblx0Y29uc3QgX2NhbGxiYWNrID0gKGVyciwgZGF0YSkgPT4ge1xuXHRcdGxldCBpZCA9IGRhdGEuYm9keS5pZFxuXHRcdGxldCBtZW1iZXJzVXJsID0gJy9mb2xkZXJzL2ZvbGRlcnMvJyArIGlkICsgJy9tZW1iZXJzJyArICcvP2xpbWl0PTEwMDAwMDAwJztcblx0XHRyZXR1cm4gc2VsZi5tYW5hZ2VkUmVxdWVzdCgnZ2V0JywgbWVtYmVyc1VybCwge2NhbGxiYWNrfSlcblx0fVxuXG5cdC8vIEZpcnN0IGNhbGwgdG8gZ2V0IGZvbGRlcidzIGlkXG5cdGxldCB1cmwgPSBcIi9mb2xkZXJzL2ZvbGRlcnMvQGl0ZW0/cGF0aD1cIiArIGZvbGRlck5hbWVcblx0Y29uc3Qgb3B0aW9uc09iaiA9IE9iamVjdC5hc3NpZ24oe30sIG9wdGlvbnMsIHtcblx0XHRjYWxsYmFjazogX2NhbGxiYWNrXG5cdH0pXG5cdHRoaXMubWFuYWdlZFJlcXVlc3QoJ2dldCcsIHVybCwgb3B0aW9uc09iailcbn1cblxuLyoqXG4gKiBDcmVhdGVzIGEgZm9sZGVyIFxuICogQHBhcmFtIHtTdHJpbmd9IHBhcmVudFVyaSAtIFRoZSB1cmkgb2YgdGhlIGZvbGRlciB3aGVyZSB0aGUgbmV3IGNoaWxkIGlzIGJlaW5nIGNyZWF0ZWRcbiAqIEBwYXJhbSB7U3RyaW5nfSBmb2xkZXJOYW1lIC0gRnVsbCBwYXRoIG9mIGZvbGRlciB0byBiZSBmb3VuZFxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgLSBPcHRpb25zIG9iamVjdCBmb3IgbWFuYWdlZFJlcXVlc3RcbiAqL1xubW9kdWxlLmV4cG9ydHMuY3JlYXRlTmV3Rm9sZGVyID0gZnVuY3Rpb24gKHBhcmVudFVyaSwgZm9sZGVyTmFtZSwgb3B0aW9ucykge1xuXHR2YXIgaGVhZGVycyA9IHtcblx0XHQnQWNjZXB0JzogJ2FwcGxpY2F0aW9uL2pzb24sIHRleHQvamF2YXNjcmlwdCwgKi8qOyBxPTAuMDEnLFxuXHRcdCdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG5cdH1cblxuXHR2YXIgdXJsID0gJy9mb2xkZXJzL2ZvbGRlcnM/cGFyZW50Rm9sZGVyVXJpPScgKyBwYXJlbnRVcmk7XG5cdHZhciBkYXRhID0ge1xuXHRcdCduYW1lJzogZm9sZGVyTmFtZSxcblx0XHQndHlwZSc6IFwiZm9sZGVyXCJcblx0fVxuXG5cdGNvbnN0IG9wdGlvbnNPYmogPSBPYmplY3QuYXNzaWduKHt9LCBvcHRpb25zLCB7XG5cdFx0cGFyYW1zOiBKU09OLnN0cmluZ2lmeShkYXRhKSxcblx0XHRoZWFkZXJzLFxuXHRcdHVzZU11bHRpcGFydEZvcm1EYXRhOiBmYWxzZVxuXHR9KVxuXG5cdHJldHVybiB0aGlzLm1hbmFnZWRSZXF1ZXN0KCdwb3N0JywgdXJsLCBvcHRpb25zT2JqKTtcbn1cblxuLyoqXG4gKiBEZWxldGVzIGEgZm9sZGVyIFxuICogQHBhcmFtIHtTdHJpbmd9IGZvbGRlcklkIC0gRnVsbCBVUkkgb2YgZm9sZGVyIHRvIGJlIGRlbGV0ZWRcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIC0gT3B0aW9ucyBvYmplY3QgZm9yIG1hbmFnZWRSZXF1ZXN0XG4gKi9cblxubW9kdWxlLmV4cG9ydHMuZGVsZXRlRm9sZGVyQnlJZCA9IGZ1bmN0aW9uIChmb2xkZXJJZCwgb3B0aW9ucykge1xuXHR2YXIgdXJsID0gJy9mb2xkZXJzL2ZvbGRlcnMvJyArIGZvbGRlcklkO1xuXHRyZXR1cm4gdGhpcy5tYW5hZ2VkUmVxdWVzdCgnZGVsZXRlJywgdXJsLCBvcHRpb25zKVxufVxuXG4vLyBUT0RPOiBOTSB3aGF0IGlzIHRoaXMgdG9kbyBiZWxvdyBmb3Jcbi8vIFRPRE8gbW9kdWxlLmV4cG9ydHMuZGVsZXRlRm9sZGVyID0gZnVuY3Rpbm8gKGZvbGRlcklkLCBvcHRpbnMpXG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBmaWxlXG4gKiBAcGFyYW0ge1N0cmluZ30gZmlsZU5hbWUgLSBOYW1lIG9mIHRoZSBmaWxlIGJlaW5nIGNyZWF0ZWRcbiAqIEBwYXJhbSB7U3RyaW5nfSBmaWxlQmxvYiAtIENvbnRlbnQgb2YgdGhlIGZpbGVcbiAqIEBwYXJhbSB7U3RyaW5nfSBwYXJlbnRGT2xkZXJVcmkgLSBVUkkgb2YgdGhlIHBhcmVudCBmb2xkZXIgd2hlcmUgdGhlIGZpbGUgaXMgdG8gYmUgY3JlYXRlZFxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgLSBPcHRpb25zIG9iamVjdCBmb3IgbWFuYWdlZFJlcXVlc3RcbiAqL1xubW9kdWxlLmV4cG9ydHMuY3JlYXRlTmV3RmlsZSA9IGZ1bmN0aW9uIChmaWxlTmFtZSwgZmlsZUJsb2IsIHBhcmVudEZvbGRlclVyaSwgb3B0aW9ucykge1xuXHRsZXQgdXJsID0gXCIvZmlsZXMvZmlsZXMjbXVsdGlwYXJ0VXBsb2FkXCI7XG5cdGxldCBkYXRhT2JqID0ge1xuXHRcdGZpbGU6IFtmaWxlQmxvYiwgZmlsZU5hbWVdLFxuXHRcdHBhcmVudEZvbGRlclVyaVxuXHR9XG5cblx0Y29uc3Qgb3B0aW9uc09iaiA9IE9iamVjdC5hc3NpZ24oe30sIG9wdGlvbnMsIHtcblx0XHRwYXJhbXM6IGRhdGFPYmosXG5cdFx0dXNlTXVsdGlwYXJ0Rm9ybURhdGE6IHRydWUsXG5cdH0pXG5cdHJldHVybiB0aGlzLm1hbmFnZWRSZXF1ZXN0KCdwb3N0JywgdXJsLCBvcHRpb25zT2JqKTtcbn1cblxuLyoqXG4gKiBHZW5lcmljIGRlbGV0ZSBmdW5jdGlvbiB0aGF0IGRlbGV0ZXMgYnkgVVJJXG4gKiBAcGFyYW0ge1N0cmluZ30gaXRlbVVyaSAtIE5hbWUgb2YgdGhlIGl0ZW0gYmVpbmcgZGVsZXRlZFxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgLSBPcHRpb25zIG9iamVjdCBmb3IgbWFuYWdlZFJlcXVlc3RcbiAqL1xubW9kdWxlLmV4cG9ydHMuZGVsZXRlSXRlbSA9IGZ1bmN0aW9uIChpdGVtVXJpLCBvcHRpb25zKSB7XG5cdHJldHVybiB0aGlzLm1hbmFnZWRSZXF1ZXN0KCdkZWxldGUnLCBpdGVtVXJpLCBvcHRpb25zKVxufVxuXG4vKipcbiAqIFVwZGF0ZXMgY29udGVudHMgb2YgYSBmaWxlXG4gKiBAcGFyYW0ge1N0cmluZ30gZmlsZU5hbWUgLSBOYW1lIG9mIHRoZSBmaWxlIGJlaW5nIHVwZGF0ZWRcbiAqIEBwYXJhbSB7U3RyaW5nfSBmaWxlQmxvYiAtIE5ldyBjb250ZW50IG9mIHRoZSBmaWxlXG4gKiBAcGFyYW0ge1N0cmluZ30gbGFzdE1vZGlmaWVkIC0gdGhlIGxhc3QtbW9kaWZpZWQgaGVhZGVyIHN0cmluZyB0aGF0IG1hdGNoZXMgdGhhdCBvZiBmaWxlIGJlaW5nIG92ZXJ3cml0dGVuXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyAtIE9wdGlvbnMgb2JqZWN0IGZvciBtYW5hZ2VkUmVxdWVzdFxuICovXG5tb2R1bGUuZXhwb3J0cy51cGRhdGVGaWxlID0gZnVuY3Rpb24gKGl0ZW1VcmksIGZpbGVCbG9iLCBsYXN0TW9kaWZpZWQsIG9wdGlvbnMpIHtcblx0Y29uc3QgdXJsID0gaXRlbVVyaSArICcvY29udGVudCdcblx0Y29uc29sZS5sb2coJ1VSTCcsIHVybClcblx0bGV0IGhlYWRlcnMgPSB7XG5cdFx0J0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi92bmQuc2FzLmZpbGUnLFxuXHRcdCdJZi1Vbm1vZGlmaWVkLVNpbmNlJzogbGFzdE1vZGlmaWVkXG5cdH1cblx0Y29uc3Qgb3B0aW9uc09iaiA9IE9iamVjdC5hc3NpZ24oe30sIG9wdGlvbnMsIHtcblx0XHRwYXJhbXM6IGZpbGVCbG9iLFxuXHRcdGhlYWRlcnMsXG5cdFx0dXNlTXVsdGlwYXJ0Rm9ybURhdGE6IGZhbHNlXG5cdH0pXG5cdHJldHVybiB0aGlzLm1hbmFnZWRSZXF1ZXN0KCdwdXQnLCB1cmwsIG9wdGlvbnNPYmopO1xufVxuXG4iLCJ2YXIgbG9ncyA9IHJlcXVpcmUoJy4uL2xvZ3MuanMnKTtcbnZhciBoNTRzRXJyb3IgPSByZXF1aXJlKCcuLi9lcnJvci5qcycpO1xuXG4vLyBUT0RPIE5NOiB3ZSBoYXZlIHNvbWUgb2YgdGhlc2UgYXMgY29uc3RzLCB3ZSBoYXZlIHNvbWUgb2YgdGhlc2UgYXMgdmFycywgd2hhdHMgdGhlIGNvcnJlY3Qgd2F5IG9mIGRvaW5nIGl0P1xudmFyIHByb2dyYW1Ob3RGb3VuZFBhdHQgPSAvPHRpdGxlPihTdG9yZWQgUHJvY2VzcyBFcnJvcnxTQVNTdG9yZWRQcm9jZXNzKTxcXC90aXRsZT5bXFxzXFxTXSo8aDI+KFN0b3JlZCBwcm9jZXNzIG5vdCBmb3VuZDouKnwuKm5vdCBhIHZhbGlkIHN0b3JlZCBwcm9jZXNzIHBhdGguKTxcXC9oMj4vO1xudmFyIGJhZEpvYkRlZmluaXRpb24gPSBcIjxoMj5QYXJhbWV0ZXIgRXJyb3IgPGJyLz5VbmFibGUgdG8gZ2V0IGpvYiBkZWZpbml0aW9uLjwvaDI+XCI7XG5cbnZhciByZXNwb25zZVJlcGxhY2UgPSBmdW5jdGlvbihyZXMpIHtcbiAgcmV0dXJuIHJlcztcbn07XG5cbi8qKiBcbiogUGFyc2UgcmVzcG9uc2UgZnJvbSBzZXJ2ZXJcbipcbiogQHBhcmFtIHtvYmplY3R9IHJlc3BvbnNlVGV4dCAtIHJlc3BvbnNlIGh0bWwgZnJvbSB0aGUgc2VydmVyXG4qIEBwYXJhbSB7c3RyaW5nfSBzYXNQcm9ncmFtIC0gc2FzIHByb2dyYW0gcGF0aFxuKiBAcGFyYW0ge29iamVjdH0gcGFyYW1zIC0gcGFyYW1zIHNlbnQgdG8gc2FzIHByb2dyYW0gd2l0aCBhZGRUYWJsZVxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLnBhcnNlUmVzID0gZnVuY3Rpb24ocmVzcG9uc2VUZXh0LCBzYXNQcm9ncmFtLCBwYXJhbXMpIHtcbiAgdmFyIG1hdGNoZXMgPSByZXNwb25zZVRleHQubWF0Y2gocHJvZ3JhbU5vdEZvdW5kUGF0dCk7XG4gIGlmKG1hdGNoZXMpIHtcbiAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdwcm9ncmFtTm90Rm91bmQnLCAnWW91IGhhdmUgbm90IGJlZW4gZ3JhbnRlZCBwZXJtaXNzaW9uIHRvIHBlcmZvcm0gdGhpcyBhY3Rpb24sIG9yIHRoZSBTVFAgaXMgbWlzc2luZy4nKTtcbiAgfVxuICAvL3JlbW92ZSBuZXcgbGluZXMgaW4ganNvbiByZXNwb25zZVxuICAvL3JlcGxhY2UgXFxcXChkKSB3aXRoIFxcKGQpIC0gU0FTIGpzb24gcGFyc2VyIGlzIGVzY2FwaW5nIGl0XG4gIHJldHVybiBKU09OLnBhcnNlKHJlc3BvbnNlUmVwbGFjZShyZXNwb25zZVRleHQpKTtcbn07XG5cbi8qKiBcbiogUGFyc2UgcmVzcG9uc2UgZnJvbSBzZXJ2ZXIgaW4gZGVidWcgbW9kZVxuKlxuKiBAcGFyYW0ge29iamVjdH0gcmVzcG9uc2VUZXh0IC0gcmVzcG9uc2UgaHRtbCBmcm9tIHRoZSBzZXJ2ZXJcbiogQHBhcmFtIHtzdHJpbmd9IHNhc1Byb2dyYW0gLSBzYXMgcHJvZ3JhbSBwYXRoXG4qIEBwYXJhbSB7b2JqZWN0fSBwYXJhbXMgLSBwYXJhbXMgc2VudCB0byBzYXMgcHJvZ3JhbSB3aXRoIGFkZFRhYmxlXG4qIEBwYXJhbSB7c3RyaW5nfSBob3N0VXJsIC0gc2FtZSBhcyBpbiBoNTRzIGNvbnN0cnVjdG9yXG4qIEBwYXJhbSB7Ym9vbH0gaXNWaXlhIC0gc2FtZSBhcyBpbiBoNTRzIGNvbnN0cnVjdG9yXG4qXG4qL1xubW9kdWxlLmV4cG9ydHMucGFyc2VEZWJ1Z1JlcyA9IGZ1bmN0aW9uIChyZXNwb25zZVRleHQsIHNhc1Byb2dyYW0sIHBhcmFtcywgaG9zdFVybCwgaXNWaXlhKSB7XG5cdGxldCBtYXRjaGVzID0gcmVzcG9uc2VUZXh0Lm1hdGNoKHByb2dyYW1Ob3RGb3VuZFBhdHQpO1xuXHRpZiAobWF0Y2hlcykge1xuXHRcdHRocm93IG5ldyBoNTRzRXJyb3IoJ3Byb2dyYW1Ob3RGb3VuZCcsICdTYXMgcHJvZ3JhbSBjb21wbGV0ZWQgd2l0aCBlcnJvcnMnKTtcblx0fVxuXG5cdGlmIChpc1ZpeWEpIHtcblx0XHRjb25zdCBtYXRjaGVzV3JvbmdKb2IgPSByZXNwb25zZVRleHQubWF0Y2goYmFkSm9iRGVmaW5pdGlvbik7XG5cdFx0aWYgKG1hdGNoZXNXcm9uZ0pvYikge1xuXHRcdFx0dGhyb3cgbmV3IGg1NHNFcnJvcigncHJvZ3JhbU5vdEZvdW5kJywgJ1NhcyBwcm9ncmFtIGNvbXBsZXRlZCB3aXRoIGVycm9ycy4gVW5hYmxlIHRvIGdldCBqb2IgZGVmaW5pdGlvbi4nKTtcblx0XHR9XG5cdH1cblxuXHQvL2ZpbmQgdGhlIGRhdGEgc2VnbWVudCBvZiB0aGUgcmVzcG9uc2Vcblx0bGV0IHBhdHQgPSBpc1ZpeWEgPyAvXiguPzxpZnJhbWUuKnNyYz1cIikoW15cIl0rKSguKmlmcmFtZT4pL20gOiAvXiguPy0taDU0cy1kYXRhLXN0YXJ0LS0pKFtcXFNcXHNdKj8pKC0taDU0cy1kYXRhLWVuZC0tKS9tO1xuXHRtYXRjaGVzID0gcmVzcG9uc2VUZXh0Lm1hdGNoKHBhdHQpO1xuXG5cdGNvbnN0IHBhZ2UgPSByZXNwb25zZVRleHQucmVwbGFjZShwYXR0LCAnJyk7XG5cdGNvbnN0IGh0bWxCb2R5UGF0dCA9IC88Ym9keS4qPihbXFxzXFxTXSopPFxcL2JvZHk+Lztcblx0Y29uc3QgYm9keU1hdGNoZXMgPSBwYWdlLm1hdGNoKGh0bWxCb2R5UGF0dCk7XG5cdC8vcmVtb3ZlIGh0bWwgdGFnc1xuXHRsZXQgZGVidWdUZXh0ID0gYm9keU1hdGNoZXNbMV0ucmVwbGFjZSgvPFtePl0qPi9nLCAnJyk7XG5cdGRlYnVnVGV4dCA9IHRoaXMuZGVjb2RlSFRNTEVudGl0aWVzKGRlYnVnVGV4dCk7XG5cblx0bG9ncy5hZGREZWJ1Z0RhdGEoYm9keU1hdGNoZXNbMV0sIGRlYnVnVGV4dCwgc2FzUHJvZ3JhbSwgcGFyYW1zKTtcblxuICBpZiAoaXNWaXlhICYmIHRoaXMucGFyc2VFcnJvclJlc3BvbnNlKHJlc3BvbnNlVGV4dCwgc2FzUHJvZ3JhbSkpIHtcblx0XHR0aHJvdyBuZXcgaDU0c0Vycm9yKCdzYXNFcnJvcicsICdTYXMgcHJvZ3JhbSBjb21wbGV0ZWQgd2l0aCBlcnJvcnMnKTtcblx0fVxuXHRpZiAoIW1hdGNoZXMpIHtcblx0XHR0aHJvdyBuZXcgaDU0c0Vycm9yKCdwYXJzZUVycm9yJywgJ1VuYWJsZSB0byBwYXJzZSByZXNwb25zZSBqc29uJyk7XG5cdH1cblxuICBsZXQganNvbk9ialxuXHRpZiAoaXNWaXlhKSB7XG5cdFx0Y29uc3QgeGh0dHAgPSBuZXcgWE1MSHR0cFJlcXVlc3QoKTtcblx0XHRjb25zdCBiYXNlVXJsID0gaG9zdFVybCB8fCBcIlwiO1xuXG4gICAgeGh0dHAub3BlbihcIkdFVFwiLCBiYXNlVXJsICsgbWF0Y2hlc1syXSwgZmFsc2UpO1xuICAgIC8vIFRPRE86IE5NIEkgdGhvdWdodCB0aGlzIHdhcyBtYWRlIGFzeW5jPyBcblx0XHR4aHR0cC5zZW5kKCk7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSB4aHR0cC5yZXNwb25zZVRleHQ7XG5cdFx0anNvbk9iaiA9IEpTT04ucGFyc2UocmVzcG9uc2UucmVwbGFjZSgvKFxcclxcbnxcXHJ8XFxuKS9nLCAnJykpO1xuXHRcdHJldHVybiBqc29uT2JqO1xuXHR9XG5cblx0Ly8gdjkgc3VwcG9ydCBjb2RlXG5cdHRyeSB7XG5cdFx0anNvbk9iaiA9IEpTT04ucGFyc2UocmVzcG9uc2VSZXBsYWNlKG1hdGNoZXNbMl0pKTtcblx0fSBjYXRjaCAoZSkge1xuXHRcdHRocm93IG5ldyBoNTRzRXJyb3IoJ3BhcnNlRXJyb3InLCAnVW5hYmxlIHRvIHBhcnNlIHJlc3BvbnNlIGpzb24nKTtcblx0fVxuXHRpZiAoanNvbk9iaiAmJiBqc29uT2JqLmg1NHNBYm9ydCkge1xuXHRcdHJldHVybiBqc29uT2JqO1xuXHR9IGVsc2UgaWYgKHRoaXMucGFyc2VFcnJvclJlc3BvbnNlKHJlc3BvbnNlVGV4dCwgc2FzUHJvZ3JhbSkpIHtcblx0XHR0aHJvdyBuZXcgaDU0c0Vycm9yKCdzYXNFcnJvcicsICdTYXMgcHJvZ3JhbSBjb21wbGV0ZWQgd2l0aCBlcnJvcnMnKTtcblx0fSBlbHNlIHtcblx0XHRyZXR1cm4ganNvbk9iajtcblx0fVxufTtcblxuLyoqIFxuKiBBZGQgZmFpbGVkIHJlc3BvbnNlIHRvIGxvZ3MgLSB1c2VkIG9ubHkgaWYgZGVidWc9ZmFsc2VcbipcbiogQHBhcmFtIHtvYmplY3R9IHJlc3BvbnNlVGV4dCAtIHJlc3BvbnNlIGh0bWwgZnJvbSB0aGUgc2VydmVyXG4qIEBwYXJhbSB7c3RyaW5nfSBzYXNQcm9ncmFtIC0gc2FzIHByb2dyYW0gcGF0aFxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLmFkZEZhaWxlZFJlc3BvbnNlID0gZnVuY3Rpb24ocmVzcG9uc2VUZXh0LCBzYXNQcm9ncmFtKSB7XG4gIHZhciBwYXR0ICAgICAgPSAvPHNjcmlwdChbXFxzXFxTXSopXFwvZm9ybT4vO1xuICB2YXIgcGF0dDIgICAgID0gL2Rpc3BsYXlcXHM/Olxccz9ub25lOz9cXHM/LztcbiAgLy9yZW1vdmUgc2NyaXB0IHdpdGggZm9ybSBmb3IgdG9nZ2xpbmcgdGhlIGxvZ3MgYW5kIFwiZGlzcGxheTpub25lXCIgZnJvbSBzdHlsZVxuICByZXNwb25zZVRleHQgID0gcmVzcG9uc2VUZXh0LnJlcGxhY2UocGF0dCwgJycpLnJlcGxhY2UocGF0dDIsICcnKTtcbiAgdmFyIGRlYnVnVGV4dCA9IHJlc3BvbnNlVGV4dC5yZXBsYWNlKC88W14+XSo+L2csICcnKTtcbiAgZGVidWdUZXh0ID0gdGhpcy5kZWNvZGVIVE1MRW50aXRpZXMoZGVidWdUZXh0KTtcblxuICBsb2dzLmFkZEZhaWxlZFJlcXVlc3QocmVzcG9uc2VUZXh0LCBkZWJ1Z1RleHQsIHNhc1Byb2dyYW0pO1xufTtcblxuLyoqIFxuKiBVbmVzY2FwZSBhbGwgc3RyaW5nIHZhbHVlcyBpbiByZXR1cm5lZCBvYmplY3RcbipcbiogQHBhcmFtIHtvYmplY3R9IG9ialxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLnVuZXNjYXBlVmFsdWVzID0gZnVuY3Rpb24ob2JqKSB7XG4gIGZvciAodmFyIGtleSBpbiBvYmopIHtcbiAgICBpZiAodHlwZW9mIG9ialtrZXldID09PSAnc3RyaW5nJykge1xuICAgICAgb2JqW2tleV0gPSBkZWNvZGVVUklDb21wb25lbnQob2JqW2tleV0pO1xuICAgIH0gZWxzZSBpZih0eXBlb2Ygb2JqID09PSAnb2JqZWN0Jykge1xuICAgICAgdGhpcy51bmVzY2FwZVZhbHVlcyhvYmpba2V5XSk7XG4gICAgfVxuICB9XG4gIHJldHVybiBvYmo7XG59O1xuXG4vKiogXG4qIFBhcnNlIGVycm9yIHJlc3BvbnNlIGZyb20gc2VydmVyIGFuZCBzYXZlIGVycm9ycyBpbiBtZW1vcnlcbipcbiogQHBhcmFtIHtzdHJpbmd9IHJlcyAtIHNlcnZlciByZXNwb25zZVxuKiBAcGFyYW0ge3N0cmluZ30gc2FzUHJvZ3JhbSAtIHNhcyBwcm9ncmFtIHdoaWNoIHJldHVybmVkIHRoZSByZXNwb25zZVxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLnBhcnNlRXJyb3JSZXNwb25zZSA9IGZ1bmN0aW9uKHJlcywgc2FzUHJvZ3JhbSkge1xuICAvL2NhcHR1cmUgJ0VSUk9SOiBbdGV4dF0uJyBvciAnRVJST1IgeHggW3RleHRdLidcbiAgdmFyIHBhdHQgICAgPSAvXkVSUk9SKDpcXHN8XFxzXFxkXFxkKSguKlxcLnwuKlxcbi4qXFwuKS9nbTtcbiAgdmFyIGVycm9ycyAgPSByZXMucmVwbGFjZSgvKDwoW14+XSspPikvaWcsICcnKS5tYXRjaChwYXR0KTtcbiAgaWYoIWVycm9ycykge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHZhciBlcnJNZXNzYWdlO1xuICBmb3IodmFyIGkgPSAwLCBuID0gZXJyb3JzLmxlbmd0aDsgaSA8IG47IGkrKykge1xuICAgIGVyck1lc3NhZ2UgID0gZXJyb3JzW2ldLnJlcGxhY2UoLzxbXj5dKj4vZywgJycpLnJlcGxhY2UoLyhcXG58XFxzezIsfSkvZywgJyAnKTtcbiAgICBlcnJNZXNzYWdlICA9IHRoaXMuZGVjb2RlSFRNTEVudGl0aWVzKGVyck1lc3NhZ2UpO1xuICAgIGVycm9yc1tpXSAgID0ge1xuICAgICAgc2FzUHJvZ3JhbTogc2FzUHJvZ3JhbSxcbiAgICAgIG1lc3NhZ2U6ICAgIGVyck1lc3NhZ2UsXG4gICAgICB0aW1lOiAgICAgICBuZXcgRGF0ZSgpXG4gICAgfTtcbiAgfVxuXG4gIGxvZ3MuYWRkU2FzRXJyb3JzKGVycm9ycyk7XG5cbiAgcmV0dXJuIHRydWU7XG59O1xuXG4vKiogXG4qIERlY29kZSBIVE1MIGVudGl0aWVzIC0gb2xkIHV0aWxpdHkgZnVuY3Rpb25cbipcbiogQHBhcmFtIHtzdHJpbmd9IHJlcyAtIHNlcnZlciByZXNwb25zZVxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLmRlY29kZUhUTUxFbnRpdGllcyA9IGZ1bmN0aW9uIChodG1sKSB7XG4gIHZhciB0ZW1wRWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcbiAgdmFyIHN0ciAgICAgICAgID0gaHRtbC5yZXBsYWNlKC8mKCMoPzp4WzAtOWEtZl0rfFxcZCspfFthLXpdKyk7L2dpLFxuICAgIGZ1bmN0aW9uIChzdHIpIHtcbiAgICAgIHRlbXBFbGVtZW50LmlubmVySFRNTCA9IHN0cjtcbiAgICAgIHN0ciAgICAgICAgICAgICAgICAgICA9IHRlbXBFbGVtZW50LnRleHRDb250ZW50IHx8IHRlbXBFbGVtZW50LmlubmVyVGV4dDtcbiAgICAgIHJldHVybiBzdHI7XG4gICAgfVxuICApO1xuICByZXR1cm4gc3RyO1xufTtcblxuLyoqXG4qIENvbnZlcnQgc2FzIHRpbWUgdG8gamF2YXNjcmlwdCBkYXRlXG4qXG4qIEBwYXJhbSB7bnVtYmVyfSBzYXNEYXRlIC0gc2FzIFRhdGUgb2JqZWN0XG4qXG4qL1xubW9kdWxlLmV4cG9ydHMuZnJvbVNhc0RhdGVUaW1lID0gZnVuY3Rpb24gKHNhc0RhdGUpIHtcbiAgdmFyIGJhc2VkYXRlID0gbmV3IERhdGUoXCJKYW51YXJ5IDEsIDE5NjAgMDA6MDA6MDBcIik7XG4gIHZhciBjdXJyZGF0ZSA9IHNhc0RhdGU7XG5cbiAgLy8gb2Zmc2V0cyBmb3IgVVRDIGFuZCB0aW1lem9uZXMgYW5kIEJTVFxuICB2YXIgYmFzZU9mZnNldCA9IGJhc2VkYXRlLmdldFRpbWV6b25lT2Zmc2V0KCk7IC8vIGluIG1pbnV0ZXNcblxuICAvLyBjb252ZXJ0IHNhcyBkYXRldGltZSB0byBhIGN1cnJlbnQgdmFsaWQgamF2YXNjcmlwdCBkYXRlXG4gIHZhciBiYXNlZGF0ZU1zICA9IGJhc2VkYXRlLmdldFRpbWUoKTsgLy8gaW4gbXNcbiAgdmFyIGN1cnJkYXRlTXMgID0gY3VycmRhdGUgKiAxMDAwOyAvLyB0byBtc1xuICB2YXIgc2FzRGF0ZXRpbWUgPSBjdXJyZGF0ZU1zICsgYmFzZWRhdGVNcztcbiAgdmFyIGpzRGF0ZSAgICAgID0gbmV3IERhdGUoKTtcbiAganNEYXRlLnNldFRpbWUoc2FzRGF0ZXRpbWUpOyAvLyBmaXJzdCB0aW1lIHRvIGdldCBvZmZzZXQgQlNUIGRheWxpZ2h0IHNhdmluZ3MgZXRjXG4gIHZhciBjdXJyT2Zmc2V0ICA9IGpzRGF0ZS5nZXRUaW1lem9uZU9mZnNldCgpOyAvLyBhZGp1c3QgZm9yIG9mZnNldCBpbiBtaW51dGVzXG4gIHZhciBvZmZzZXRWYXIgICA9IChiYXNlT2Zmc2V0IC0gY3Vyck9mZnNldCkgKiA2MCAqIDEwMDA7IC8vIGRpZmZlcmVuY2UgaW4gbWlsbGlzZWNvbmRzXG4gIHZhciBvZmZzZXRUaW1lICA9IHNhc0RhdGV0aW1lIC0gb2Zmc2V0VmFyOyAvLyBmaW5kaW5nIEJTVCBhbmQgZGF5bGlnaHQgc2F2aW5nc1xuICBqc0RhdGUuc2V0VGltZShvZmZzZXRUaW1lKTsgLy8gdXBkYXRlIHdpdGggb2Zmc2V0XG4gIHJldHVybiBqc0RhdGU7XG59O1xuXG4vKipcbiAqIENoZWNrcyB3aGV0aGVyIHJlc3BvbnNlIG9iamVjdCBpcyBhIGxvZ2luIHJlZGlyZWN0XG4gKiBUT0RPOiB0aGlzIGNhbiBiZSBjaGFuZ2VkIHRvIHVzZSB4aHIuVXJsIG9uY2Ugd2Uga25vdyB0aGF0IGlzIHJlbGlhYmxlLCBwYXJzZXMgcmVzcG9uc2VUZXh0IG5vd1xuICogQHBhcmFtIHtPYmplY3R9IHJlc3BvbnNlT2JqIHhociByZXNwb25zZSB0byBiZSBjaGVja2VkIGZvciBsb2dvbiByZWRpcmVjdFxuICovXG5tb2R1bGUuZXhwb3J0cy5uZWVkVG9Mb2dpbiA9IGZ1bmN0aW9uKHJlc3BvbnNlT2JqKSB7XG4gIHZhciBwYXR0ID0gLzxmb3JtLithY3Rpb249XCIoLipMb2dvblteXCJdKikuKj4vO1xuICB2YXIgbWF0Y2hlcyA9IHBhdHQuZXhlYyhyZXNwb25zZU9iai5yZXNwb25zZVRleHQpO1xuICB2YXIgbmV3TG9naW5Vcmw7XG5cbiAgaWYoIW1hdGNoZXMpIHtcbiAgICAvL3RoZXJlJ3Mgbm8gZm9ybSwgd2UgYXJlIGluLiBob29yYXkhXG4gICAgcmV0dXJuIGZhbHNlO1xuICB9IGVsc2Uge1xuICAgIHZhciBhY3Rpb25VcmwgPSBtYXRjaGVzWzFdLnJlcGxhY2UoL1xcPy4qLywgJycpO1xuICAgIGlmKGFjdGlvblVybC5jaGFyQXQoMCkgPT09ICcvJykge1xuICAgICAgbmV3TG9naW5VcmwgPSB0aGlzLmhvc3RVcmwgPyB0aGlzLmhvc3RVcmwgKyBhY3Rpb25VcmwgOiBhY3Rpb25Vcmw7XG4gICAgICBpZihuZXdMb2dpblVybCAhPT0gdGhpcy5sb2dpblVybCkge1xuICAgICAgICB0aGlzLl9sb2dpbkNoYW5nZWQgPSB0cnVlO1xuICAgICAgICB0aGlzLmxvZ2luVXJsID0gbmV3TG9naW5Vcmw7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vcmVsYXRpdmUgcGF0aFxuXG4gICAgICB2YXIgbGFzdEluZE9mU2xhc2ggPSByZXNwb25zZU9iai5yZXNwb25zZVVSTC5sYXN0SW5kZXhPZignLycpICsgMTtcbiAgICAgIC8vcmVtb3ZlIGV2ZXJ5dGhpbmcgYWZ0ZXIgdGhlIGxhc3Qgc2xhc2gsIGFuZCBldmVyeXRoaW5nIHVudGlsIHRoZSBmaXJzdFxuICAgICAgdmFyIHJlbGF0aXZlTG9naW5VcmwgPSByZXNwb25zZU9iai5yZXNwb25zZVVSTC5zdWJzdHIoMCwgbGFzdEluZE9mU2xhc2gpLnJlcGxhY2UoLy4qXFwvezJ9W15cXC9dKi8sICcnKSArIGFjdGlvblVybDtcbiAgICAgIG5ld0xvZ2luVXJsID0gdGhpcy5ob3N0VXJsID8gdGhpcy5ob3N0VXJsICsgcmVsYXRpdmVMb2dpblVybCA6IHJlbGF0aXZlTG9naW5Vcmw7XG4gICAgICBpZihuZXdMb2dpblVybCAhPT0gdGhpcy5sb2dpblVybCkge1xuICAgICAgICB0aGlzLl9sb2dpbkNoYW5nZWQgPSB0cnVlO1xuICAgICAgICB0aGlzLmxvZ2luVXJsID0gbmV3TG9naW5Vcmw7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy9zYXZlIHBhcmFtZXRlcnMgZnJvbSBoaWRkZW4gZm9ybSBmaWVsZHNcbiAgICB2YXIgcGFyc2VyID0gbmV3IERPTVBhcnNlcigpO1xuICAgIHZhciBkb2MgPSBwYXJzZXIucGFyc2VGcm9tU3RyaW5nKHJlc3BvbnNlT2JqLnJlc3BvbnNlVGV4dCxcInRleHQvaHRtbFwiKTtcbiAgICB2YXIgcmVzID0gZG9jLnF1ZXJ5U2VsZWN0b3JBbGwoXCJpbnB1dFt0eXBlPSdoaWRkZW4nXVwiKTtcbiAgICB2YXIgaGlkZGVuRm9ybVBhcmFtcyA9IHt9O1xuICAgIGlmKHJlcykge1xuICAgICAgLy9pdCdzIG5ldyBsb2dpbiBwYWdlIGlmIHdlIGhhdmUgdGhlc2UgYWRkaXRpb25hbCBwYXJhbWV0ZXJzXG4gICAgICB0aGlzLl9pc05ld0xvZ2luUGFnZSA9IHRydWU7XG4gICAgICByZXMuZm9yRWFjaChmdW5jdGlvbihub2RlKSB7XG4gICAgICAgIGhpZGRlbkZvcm1QYXJhbXNbbm9kZS5uYW1lXSA9IG5vZGUudmFsdWU7XG4gICAgICB9KTtcbiAgICAgIHRoaXMuX2FkaXRpb25hbExvZ2luUGFyYW1zID0gaGlkZGVuRm9ybVBhcmFtcztcbiAgICB9XG5cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxufTtcblxuLyoqIFxuKiBHZXQgZnVsbCBwcm9ncmFtIHBhdGggZnJvbSBtZXRhZGF0YSByb290IGFuZCByZWxhdGl2ZSBwYXRoXG4qXG4qIEBwYXJhbSB7c3RyaW5nfSBtZXRhZGF0YVJvb3QgLSBNZXRhZGF0YSByb290IChwYXRoIHdoZXJlIGFsbCBwcm9ncmFtcyBmb3IgdGhlIHByb2plY3QgYXJlIGxvY2F0ZWQpXG4qIEBwYXJhbSB7c3RyaW5nfSBzYXNQcm9ncmFtUGF0aCAtIFNhcyBwcm9ncmFtIHBhdGhcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5nZXRGdWxsUHJvZ3JhbVBhdGggPSBmdW5jdGlvbihtZXRhZGF0YVJvb3QsIHNhc1Byb2dyYW1QYXRoKSB7XG4gIHJldHVybiBtZXRhZGF0YVJvb3QgPyBtZXRhZGF0YVJvb3QucmVwbGFjZSgvXFwvPyQvLCAnLycpICsgc2FzUHJvZ3JhbVBhdGgucmVwbGFjZSgvXlxcLy8sICcnKSA6IHNhc1Byb2dyYW1QYXRoO1xufTtcblxuLy8gUmV0dXJucyBvYmplY3Qgd2hlcmUgdGFibGUgcm93cyBhcmUgZ3JvdXBwZWQgYnkga2V5XG5tb2R1bGUuZXhwb3J0cy5nZXRPYmpPZlRhYmxlID0gZnVuY3Rpb24gKHRhYmxlLCBrZXksIHZhbHVlID0gbnVsbCkge1xuXHRjb25zdCBvYmogPSB7fVxuXHR0YWJsZS5mb3JFYWNoKHJvdyA9PiB7XG5cdFx0b2JqW3Jvd1trZXldXSA9IHZhbHVlID8gcm93W3ZhbHVlXSA6IHJvd1xuXHR9KVxuXHRyZXR1cm4gb2JqXG59XG5cbi8vIFJldHVybnMgc2VsZiB1cmkgb3V0IG9mIGxpbmtzIGFycmF5XG5tb2R1bGUuZXhwb3J0cy5nZXRTZWxmVXJpID0gZnVuY3Rpb24gKGxpbmtzKSB7XG5cdHJldHVybiBsaW5rc1xuXHRcdC5maWx0ZXIoZSA9PiBlLnJlbCA9PT0gJ3NlbGYnKVxuXHRcdC5tYXAoZSA9PiBlLnVyaSlcblx0XHQuc2hpZnQoKTtcbn1cbiIsInZhciBoNTRzRXJyb3IgPSByZXF1aXJlKCcuL2Vycm9yLmpzJyk7XG52YXIgbG9ncyAgICAgID0gcmVxdWlyZSgnLi9sb2dzLmpzJyk7XG52YXIgVGFibGVzICAgID0gcmVxdWlyZSgnLi90YWJsZXMnKTtcbnZhciBGaWxlcyAgICAgPSByZXF1aXJlKCcuL2ZpbGVzJyk7XG52YXIgdG9TYXNEYXRlVGltZSA9IHJlcXVpcmUoJy4vdGFibGVzL3V0aWxzLmpzJykudG9TYXNEYXRlVGltZTtcblxuLyoqXG4gKiBDaGVja3Mgd2hldGhlciBhIGdpdmVuIHRhYmxlIG5hbWUgaXMgYSB2YWxpZCBTQVMgbWFjcm8gbmFtZVxuICogQHBhcmFtIHtTdHJpbmd9IG1hY3JvTmFtZSBUaGUgU0FTIG1hY3JvIG5hbWUgdG8gYmUgZ2l2ZW4gdG8gdGhpcyB0YWJsZVxuICovXG5mdW5jdGlvbiB2YWxpZGF0ZU1hY3JvKG1hY3JvTmFtZSkge1xuICBpZihtYWNyb05hbWUubGVuZ3RoID4gMzIpIHtcbiAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1RhYmxlIG5hbWUgdG9vIGxvbmcuIE1heGltdW0gaXMgMzIgY2hhcmFjdGVycycpO1xuICB9XG5cbiAgdmFyIGNoYXJDb2RlQXQwID0gbWFjcm9OYW1lLmNoYXJDb2RlQXQoMCk7XG4gIC8vIHZhbGlkYXRlIGl0IHN0YXJ0cyB3aXRoIEEtWiwgYS16LCBvciBfXG4gIGlmKChjaGFyQ29kZUF0MCA8IDY1IHx8IGNoYXJDb2RlQXQwID4gOTApICYmIChjaGFyQ29kZUF0MCA8IDk3IHx8IGNoYXJDb2RlQXQwID4gMTIyKSAmJiBtYWNyb05hbWVbMF0gIT09ICdfJykge1xuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnVGFibGUgbmFtZSBzdGFydGluZyB3aXRoIG51bWJlciBvciBzcGVjaWFsIGNoYXJhY3RlcnMnKTtcbiAgfVxuXG4gIGZvcih2YXIgaSA9IDA7IGkgPCBtYWNyb05hbWUubGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgY2hhckNvZGUgPSBtYWNyb05hbWUuY2hhckNvZGVBdChpKTtcblxuICAgIGlmKChjaGFyQ29kZSA8IDQ4IHx8IGNoYXJDb2RlID4gNTcpICYmXG4gICAgICAoY2hhckNvZGUgPCA2NSB8fCBjaGFyQ29kZSA+IDkwKSAmJlxuICAgICAgKGNoYXJDb2RlIDwgOTcgfHwgY2hhckNvZGUgPiAxMjIpICYmXG4gICAgICBtYWNyb05hbWVbaV0gIT09ICdfJylcbiAgICB7XG4gICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1RhYmxlIG5hbWUgaGFzIHVuc3VwcG9ydGVkIGNoYXJhY3RlcnMnKTtcbiAgICB9XG4gIH1cbn1cblxuLyoqIFxuKiBoNTRzIFNBUyBkYXRhIG9iamVjdCBjb25zdHJ1Y3RvclxuKiBAY29uc3RydWN0b3JcbipcbiogQHBhcmFtIHthcnJheXxmaWxlfSBkYXRhIC0gVGFibGUgb3IgZmlsZSBhZGRlZCB3aGVuIG9iamVjdCBpcyBjcmVhdGVkXG4qIEBwYXJhbSB7U3RyaW5nfSBtYWNyb05hbWUgVGhlIFNBUyBtYWNybyBuYW1lIHRvIGJlIGdpdmVuIHRvIHRoaXMgdGFibGVcbiogQHBhcmFtIHtudW1iZXJ9IHBhcmFtZXRlclRocmVzaG9sZCAtIHNpemUgb2YgZGF0YSBvYmplY3RzIHNlbnQgdG8gU0FTIChsZWdhY3kpXG4qXG4qL1xuZnVuY3Rpb24gU2FzRGF0YShkYXRhLCBtYWNyb05hbWUsIHNwZWNzKSB7XG4gIGlmKGRhdGEgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgIHRoaXMuX2ZpbGVzID0ge307XG4gICAgdGhpcy5hZGRUYWJsZShkYXRhLCBtYWNyb05hbWUsIHNwZWNzKTtcbiAgfSBlbHNlIGlmKGRhdGEgaW5zdGFuY2VvZiBGaWxlIHx8IGRhdGEgaW5zdGFuY2VvZiBCbG9iKSB7XG4gICAgRmlsZXMuY2FsbCh0aGlzLCBkYXRhLCBtYWNyb05hbWUpO1xuICB9IGVsc2Uge1xuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnRGF0YSBhcmd1bWVudCB3cm9uZyB0eXBlIG9yIG1pc3NpbmcnKTtcbiAgfVxufVxuXG4vKiogXG4qIEFkZCB0YWJsZSB0byB0YWJsZXMgb2JqZWN0XG4qIEBwYXJhbSB7YXJyYXl9IHRhYmxlIC0gQXJyYXkgb2YgdGFibGUgb2JqZWN0c1xuKiBAcGFyYW0ge1N0cmluZ30gbWFjcm9OYW1lIFRoZSBTQVMgbWFjcm8gbmFtZSB0byBiZSBnaXZlbiB0byB0aGlzIHRhYmxlXG4qXG4qL1xuU2FzRGF0YS5wcm90b3R5cGUuYWRkVGFibGUgPSBmdW5jdGlvbih0YWJsZSwgbWFjcm9OYW1lLCBzcGVjcykge1xuICB2YXIgaXNTcGVjc1Byb3ZpZGVkID0gISFzcGVjcztcbiAgaWYodGFibGUgJiYgbWFjcm9OYW1lKSB7XG4gICAgaWYoISh0YWJsZSBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdGaXJzdCBhcmd1bWVudCBtdXN0IGJlIGFycmF5Jyk7XG4gICAgfVxuICAgIGlmKHR5cGVvZiBtYWNyb05hbWUgIT09ICdzdHJpbmcnKSB7XG4gICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1NlY29uZCBhcmd1bWVudCBtdXN0IGJlIHN0cmluZycpO1xuICAgIH1cblxuICAgIHZhbGlkYXRlTWFjcm8obWFjcm9OYW1lKTtcbiAgfSBlbHNlIHtcbiAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ01pc3NpbmcgYXJndW1lbnRzJyk7XG4gIH1cblxuICBpZiAodHlwZW9mIHRhYmxlICE9PSAnb2JqZWN0JyB8fCAhKHRhYmxlIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdUYWJsZSBhcmd1bWVudCBpcyBub3QgYW4gYXJyYXknKTtcbiAgfVxuXG4gIHZhciBrZXk7XG4gIGlmKHNwZWNzKSB7XG4gICAgaWYoc3BlY3MuY29uc3RydWN0b3IgIT09IE9iamVjdCkge1xuICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdTcGVjcyBkYXRhIHR5cGUgd3JvbmcuIE9iamVjdCBleHBlY3RlZC4nKTtcbiAgICB9XG4gICAgZm9yKGtleSBpbiB0YWJsZVswXSkge1xuICAgICAgaWYoIXNwZWNzW2tleV0pIHtcbiAgICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdNaXNzaW5nIGNvbHVtbnMgaW4gc3BlY3MgZGF0YS4nKTtcbiAgICAgIH1cbiAgICB9XG4gICAgZm9yKGtleSBpbiBzcGVjcykge1xuICAgICAgaWYoc3BlY3Nba2V5XS5jb25zdHJ1Y3RvciAhPT0gT2JqZWN0KSB7XG4gICAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnV3JvbmcgY29sdW1uIGRlc2NyaXB0b3IgaW4gc3BlY3MgZGF0YS4nKTtcbiAgICAgIH1cbiAgICAgIGlmKCFzcGVjc1trZXldLmNvbFR5cGUgfHwgIXNwZWNzW2tleV0uY29sTGVuZ3RoKSB7XG4gICAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnTWlzc2luZyBjb2x1bW5zIGluIHNwZWNzIGRlc2NyaXB0b3IuJyk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgdmFyIGksIGosIC8vY291bnRlcnMgdXNlZCBsYXR0ZXIgaW4gY29kZVxuICAgICAgcm93LCB2YWwsIHR5cGUsXG4gICAgICBzcGVjS2V5cyA9IFtdLFxuICAgICAgc3BlY2lhbENoYXJzID0gWydcIicsICdcXFxcJywgJy8nLCAnXFxuJywgJ1xcdCcsICdcXGYnLCAnXFxyJywgJ1xcYiddO1xuXG4gIGlmKCFzcGVjcykge1xuICAgIHNwZWNzID0ge307XG5cbiAgICBmb3IgKGkgPSAwOyBpIDwgdGFibGUubGVuZ3RoOyBpKyspIHtcbiAgICAgIHJvdyA9IHRhYmxlW2ldO1xuXG4gICAgICBpZih0eXBlb2Ygcm93ICE9PSAnb2JqZWN0Jykge1xuICAgICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1RhYmxlIGl0ZW0gaXMgbm90IGFuIG9iamVjdCcpO1xuICAgICAgfVxuXG4gICAgICBmb3Ioa2V5IGluIHJvdykge1xuICAgICAgICBpZihyb3cuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuICAgICAgICAgIHZhbCAgPSByb3dba2V5XTtcbiAgICAgICAgICB0eXBlID0gdHlwZW9mIHZhbDtcblxuICAgICAgICAgIGlmKHNwZWNzW2tleV0gPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgc3BlY0tleXMucHVzaChrZXkpO1xuICAgICAgICAgICAgc3BlY3Nba2V5XSA9IHt9O1xuXG4gICAgICAgICAgICBpZiAodHlwZSA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgICAgICAgaWYodmFsIDwgTnVtYmVyLk1JTl9TQUZFX0lOVEVHRVIgfHwgdmFsID4gTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVIpIHtcbiAgICAgICAgICAgICAgICBsb2dzLmFkZEFwcGxpY2F0aW9uTG9nKCdPYmplY3RbJyArIGkgKyAnXS4nICsga2V5ICsgJyAtIFRoaXMgdmFsdWUgZXhjZWVkcyBleHBlY3RlZCBudW1lcmljIHByZWNpc2lvbi4nKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBzcGVjc1trZXldLmNvbFR5cGUgICA9ICdudW0nO1xuICAgICAgICAgICAgICBzcGVjc1trZXldLmNvbExlbmd0aCA9IDg7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGUgPT09ICdzdHJpbmcnICYmICEodmFsIGluc3RhbmNlb2YgRGF0ZSkpIHsgLy8gc3RyYWlnaHRmb3J3YXJkIHN0cmluZ1xuICAgICAgICAgICAgICBzcGVjc1trZXldLmNvbFR5cGUgICAgPSAnc3RyaW5nJztcbiAgICAgICAgICAgICAgc3BlY3Nba2V5XS5jb2xMZW5ndGggID0gdmFsLmxlbmd0aDtcbiAgICAgICAgICAgIH0gZWxzZSBpZih2YWwgaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgICAgICAgICAgIHNwZWNzW2tleV0uY29sVHlwZSAgID0gJ2RhdGUnO1xuICAgICAgICAgICAgICBzcGVjc1trZXldLmNvbExlbmd0aCA9IDg7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGUgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICAgIHNwZWNzW2tleV0uY29sVHlwZSAgID0gJ2pzb24nO1xuICAgICAgICAgICAgICBzcGVjc1trZXldLmNvbExlbmd0aCA9IEpTT04uc3RyaW5naWZ5KHZhbCkubGVuZ3RoO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBzcGVjS2V5cyA9IE9iamVjdC5rZXlzKHNwZWNzKTtcbiAgfVxuXG4gIHZhciBzYXNDc3YgPSAnJztcblxuICAvLyB3ZSBuZWVkIHR3byBsb29wcyAtIHRoZSBmaXJzdCBvbmUgaXMgY3JlYXRpbmcgc3BlY3MgYW5kIHZhbGlkYXRpbmdcbiAgZm9yIChpID0gMDsgaSA8IHRhYmxlLmxlbmd0aDsgaSsrKSB7XG4gICAgcm93ID0gdGFibGVbaV07XG4gICAgZm9yKGogPSAwOyBqIDwgc3BlY0tleXMubGVuZ3RoOyBqKyspIHtcbiAgICAgIGtleSA9IHNwZWNLZXlzW2pdO1xuICAgICAgaWYocm93Lmhhc093blByb3BlcnR5KGtleSkpIHtcbiAgICAgICAgdmFsICA9IHJvd1trZXldO1xuICAgICAgICB0eXBlID0gdHlwZW9mIHZhbDtcblxuICAgICAgICBpZih0eXBlID09PSAnbnVtYmVyJyAmJiBpc05hTih2YWwpKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcigndHlwZUVycm9yJywgJ05hTiB2YWx1ZSBpbiBvbmUgb2YgdGhlIHZhbHVlcyAoY29sdW1ucykgaXMgbm90IGFsbG93ZWQnKTtcbiAgICAgICAgfVxuICAgICAgICBpZih2YWwgPT09IC1JbmZpbml0eSB8fCB2YWwgPT09IEluZmluaXR5KSB7XG4gICAgICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcigndHlwZUVycm9yJywgdmFsLnRvU3RyaW5nKCkgKyAnIHZhbHVlIGluIG9uZSBvZiB0aGUgdmFsdWVzIChjb2x1bW5zKSBpcyBub3QgYWxsb3dlZCcpO1xuICAgICAgICB9XG4gICAgICAgIGlmKHZhbCA9PT0gdHJ1ZSB8fCB2YWwgPT09IGZhbHNlKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcigndHlwZUVycm9yJywgJ0Jvb2xlYW4gdmFsdWUgaW4gb25lIG9mIHRoZSB2YWx1ZXMgKGNvbHVtbnMpIGlzIG5vdCBhbGxvd2VkJyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYodHlwZSA9PT0gJ3N0cmluZycgJiYgdmFsLmluZGV4T2YoJ1xcclxcbicpICE9PSAtMSkge1xuICAgICAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ3R5cGVFcnJvcicsICdOZXcgbGluZSBjaGFyYWN0ZXIgaXMgbm90IHN1cHBvcnRlZCcpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gY29udmVydCBudWxsIHRvICcuJyBmb3IgbnVtYmVycyBhbmQgdG8gJycgZm9yIHN0cmluZ3NcbiAgICAgICAgaWYodmFsID09PSBudWxsKSB7XG4gICAgICAgICAgaWYoc3BlY3Nba2V5XS5jb2xUeXBlID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgdmFsID0gJyc7XG4gICAgICAgICAgICB0eXBlID0gJ3N0cmluZyc7XG4gICAgICAgICAgfSBlbHNlIGlmKHNwZWNzW2tleV0uY29sVHlwZSA9PT0gJ251bScpIHtcbiAgICAgICAgICAgIHZhbCA9ICcuJztcbiAgICAgICAgICAgIHR5cGUgPSAnbnVtYmVyJztcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcigndHlwZUVycm9yJywgJ0Nhbm5vdCBjb252ZXJ0IG51bGwgdmFsdWUnKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuXG4gICAgICAgIGlmICgodHlwZSA9PT0gJ251bWJlcicgJiYgc3BlY3Nba2V5XS5jb2xUeXBlICE9PSAnbnVtJyAmJiB2YWwgIT09ICcuJykgfHxcbiAgICAgICAgICAoKHR5cGUgPT09ICdzdHJpbmcnICYmICEodmFsIGluc3RhbmNlb2YgRGF0ZSkgJiYgc3BlY3Nba2V5XS5jb2xUeXBlICE9PSAnc3RyaW5nJykgJiZcbiAgICAgICAgICAodHlwZSA9PT0gJ3N0cmluZycgJiYgc3BlY3Nba2V5XS5jb2xUeXBlID09ICdudW0nICYmIHZhbCAhPT0gJy4nKSkgfHxcbiAgICAgICAgICAodmFsIGluc3RhbmNlb2YgRGF0ZSAmJiBzcGVjc1trZXldLmNvbFR5cGUgIT09ICdkYXRlJykgfHxcbiAgICAgICAgICAoKHR5cGUgPT09ICdvYmplY3QnICYmIHZhbC5jb25zdHJ1Y3RvciAhPT0gRGF0ZSkgJiYgc3BlY3Nba2V5XS5jb2xUeXBlICE9PSAnanNvbicpKVxuICAgICAgICB7XG4gICAgICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcigndHlwZUVycm9yJywgJ1RoZXJlIGlzIGEgc3BlY3MgdHlwZSBtaXNtYXRjaCBpbiB0aGUgYXJyYXkgYmV0d2VlbiB2YWx1ZXMgKGNvbHVtbnMpIG9mIHRoZSBzYW1lIG5hbWUuJyArXG4gICAgICAgICAgICAnIHR5cGUvY29sVHlwZS92YWwgPSAnICsgdHlwZSArJy8nICsgc3BlY3Nba2V5XS5jb2xUeXBlICsgJy8nICsgdmFsICk7XG4gICAgICAgIH0gZWxzZSBpZighaXNTcGVjc1Byb3ZpZGVkICYmIHR5cGUgPT09ICdzdHJpbmcnICYmIHNwZWNzW2tleV0uY29sTGVuZ3RoIDwgdmFsLmxlbmd0aCkge1xuICAgICAgICAgIHNwZWNzW2tleV0uY29sTGVuZ3RoID0gdmFsLmxlbmd0aDtcbiAgICAgICAgfSBlbHNlIGlmKCh0eXBlID09PSAnc3RyaW5nJyAmJiBzcGVjc1trZXldLmNvbExlbmd0aCA8IHZhbC5sZW5ndGgpIHx8ICh0eXBlICE9PSAnc3RyaW5nJyAmJiBzcGVjc1trZXldLmNvbExlbmd0aCAhPT0gOCkpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCd0eXBlRXJyb3InLCAnVGhlcmUgaXMgYSBzcGVjcyBsZW5ndGggbWlzbWF0Y2ggaW4gdGhlIGFycmF5IGJldHdlZW4gdmFsdWVzIChjb2x1bW5zKSBvZiB0aGUgc2FtZSBuYW1lLicgK1xuICAgICAgICAgICAgJyB0eXBlL2NvbFR5cGUvdmFsID0gJyArIHR5cGUgKycvJyArIHNwZWNzW2tleV0uY29sVHlwZSArICcvJyArIHZhbCApO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHZhbCBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICAgICAgICB2YWwgPSB0b1Nhc0RhdGVUaW1lKHZhbCk7XG4gICAgICAgIH1cblxuICAgICAgICBzd2l0Y2goc3BlY3Nba2V5XS5jb2xUeXBlKSB7XG4gICAgICAgICAgY2FzZSAnbnVtJzpcbiAgICAgICAgICBjYXNlICdkYXRlJzpcbiAgICAgICAgICAgIHNhc0NzdiArPSB2YWw7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgICAgICAgc2FzQ3N2ICs9ICdcIicgKyB2YWwucmVwbGFjZSgvXCIvZywgJ1wiXCInKSArICdcIic7XG4gICAgICAgICAgICB2YXIgY29sTGVuZ3RoID0gdmFsLmxlbmd0aDtcbiAgICAgICAgICAgIGZvcih2YXIgayA9IDA7IGsgPCB2YWwubGVuZ3RoOyBrKyspIHtcbiAgICAgICAgICAgICAgaWYoc3BlY2lhbENoYXJzLmluZGV4T2YodmFsW2tdKSAhPT0gLTEpIHtcbiAgICAgICAgICAgICAgICBjb2xMZW5ndGgrKztcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB2YXIgY29kZSA9IHZhbC5jaGFyQ29kZUF0KGspO1xuICAgICAgICAgICAgICAgIGlmKGNvZGUgPiAweGZmZmYpIHtcbiAgICAgICAgICAgICAgICAgIGNvbExlbmd0aCArPSAzO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZihjb2RlID4gMHg3ZmYpIHtcbiAgICAgICAgICAgICAgICAgIGNvbExlbmd0aCArPSAyO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZihjb2RlID4gMHg3Zikge1xuICAgICAgICAgICAgICAgICAgY29sTGVuZ3RoICs9IDE7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyB1c2UgbWF4aW11bSB2YWx1ZSBiZXR3ZWVuIG1heCBwcmV2aW91cywgY3VycmVudCB2YWx1ZSBhbmQgMSAoZmlyc3QgdHdvIGNhbiBiZSAwIHdpY2ggaXMgbm90IHN1cHBvcnRlZClcbiAgICAgICAgICAgIHNwZWNzW2tleV0uY29sTGVuZ3RoID0gTWF0aC5tYXgoc3BlY3Nba2V5XS5jb2xMZW5ndGgsIGNvbExlbmd0aCwgMSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlICdvYmplY3QnOlxuICAgICAgICAgICAgc2FzQ3N2ICs9ICdcIicgKyBKU09OLnN0cmluZ2lmeSh2YWwpLnJlcGxhY2UoL1wiL2csICdcIlwiJykgKyAnXCInO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIC8vIGRvIG5vdCBpbnNlcnQgaWYgaXQncyB0aGUgbGFzdCBjb2x1bW5cbiAgICAgIGlmKGogPCBzcGVjS2V5cy5sZW5ndGggLSAxKSB7XG4gICAgICAgIHNhc0NzdiArPSAnLCc7XG4gICAgICB9XG4gICAgfVxuICAgIGlmKGkgPCB0YWJsZS5sZW5ndGggLSAxKSB7XG4gICAgICBzYXNDc3YgKz0gJ1xcclxcbic7XG4gICAgfVxuICB9XG5cbiAgLy9jb252ZXJ0IHNwZWNzIHRvIGNzdiB3aXRoIHBpcGVzXG4gIHZhciBzcGVjU3RyaW5nID0gc3BlY0tleXMubWFwKGZ1bmN0aW9uKGtleSkge1xuICAgIHJldHVybiBrZXkgKyAnLCcgKyBzcGVjc1trZXldLmNvbFR5cGUgKyAnLCcgKyBzcGVjc1trZXldLmNvbExlbmd0aDtcbiAgfSkuam9pbignfCcpO1xuXG4gIHRoaXMuX2ZpbGVzW21hY3JvTmFtZV0gPSBbXG4gICAgc3BlY1N0cmluZyxcbiAgICBuZXcgQmxvYihbc2FzQ3N2XSwge3R5cGU6ICd0ZXh0L2NzdjtjaGFyc2V0PVVURi04J30pXG4gIF07XG59O1xuXG4vKipcbiAqIEFkZCBmaWxlIGFzIGEgdmVyYmF0aW0gYmxvYiBmaWxlIHVwbGFvZCBcbiAqIEBwYXJhbSB7QmxvYn0gZmlsZSAtIHRoZSBibG9iIHRoYXQgd2lsbCBiZSB1cGxvYWRlZCBhcyBmaWxlXG4gKiBAcGFyYW0ge1N0cmluZ30gbWFjcm9OYW1lIC0gdGhlIFNBUyB3ZWJpbiBuYW1lIGdpdmVuIHRvIHRoaXMgZmlsZVxuICovXG5TYXNEYXRhLnByb3RvdHlwZS5hZGRGaWxlICA9IGZ1bmN0aW9uKGZpbGUsIG1hY3JvTmFtZSkge1xuICBGaWxlcy5wcm90b3R5cGUuYWRkLmNhbGwodGhpcywgZmlsZSwgbWFjcm9OYW1lKTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gU2FzRGF0YTtcbiIsInZhciBoNTRzRXJyb3IgPSByZXF1aXJlKCcuLi9lcnJvci5qcycpO1xuXG4vKlxuKiBoNTRzIHRhYmxlcyBvYmplY3QgY29uc3RydWN0b3JcbiogQGNvbnN0cnVjdG9yXG4qXG4qQHBhcmFtIHthcnJheX0gdGFibGUgLSBUYWJsZSBhZGRlZCB3aGVuIG9iamVjdCBpcyBjcmVhdGVkXG4qQHBhcmFtIHtzdHJpbmd9IG1hY3JvTmFtZSAtIG1hY3JvIG5hbWVcbipAcGFyYW0ge251bWJlcn0gcGFyYW1ldGVyVGhyZXNob2xkIC0gc2l6ZSBvZiBkYXRhIG9iamVjdHMgc2VudCB0byBTQVNcbipcbiovXG5mdW5jdGlvbiBUYWJsZXModGFibGUsIG1hY3JvTmFtZSwgcGFyYW1ldGVyVGhyZXNob2xkKSB7XG4gIHRoaXMuX3RhYmxlcyA9IHt9O1xuICB0aGlzLl9wYXJhbWV0ZXJUaHJlc2hvbGQgPSBwYXJhbWV0ZXJUaHJlc2hvbGQgfHwgMzAwMDA7XG5cbiAgVGFibGVzLnByb3RvdHlwZS5hZGQuY2FsbCh0aGlzLCB0YWJsZSwgbWFjcm9OYW1lKTtcbn1cblxuLypcbiogQWRkIHRhYmxlIHRvIHRhYmxlcyBvYmplY3RcbiogQHBhcmFtIHthcnJheX0gdGFibGUgLSBBcnJheSBvZiB0YWJsZSBvYmplY3RzXG4qIEBwYXJhbSB7c3RyaW5nfSBtYWNyb05hbWUgLSBTYXMgbWFjcm8gbmFtZVxuKlxuKi9cblRhYmxlcy5wcm90b3R5cGUuYWRkID0gZnVuY3Rpb24odGFibGUsIG1hY3JvTmFtZSkge1xuICBpZih0YWJsZSAmJiBtYWNyb05hbWUpIHtcbiAgICBpZighKHRhYmxlIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ0ZpcnN0IGFyZ3VtZW50IG11c3QgYmUgYXJyYXknKTtcbiAgICB9XG4gICAgaWYodHlwZW9mIG1hY3JvTmFtZSAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnU2Vjb25kIGFyZ3VtZW50IG11c3QgYmUgc3RyaW5nJyk7XG4gICAgfVxuICAgIGlmKCFpc05hTihtYWNyb05hbWVbbWFjcm9OYW1lLmxlbmd0aCAtIDFdKSkge1xuICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdNYWNybyBuYW1lIGNhbm5vdCBoYXZlIG51bWJlciBhdCB0aGUgZW5kJyk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnTWlzc2luZyBhcmd1bWVudHMnKTtcbiAgfVxuXG4gIHZhciByZXN1bHQgPSB0aGlzLl91dGlscy5jb252ZXJ0VGFibGVPYmplY3QodGFibGUsIHRoaXMuX3BhcmFtZXRlclRocmVzaG9sZCk7XG5cbiAgdmFyIHRhYmxlQXJyYXkgPSBbXTtcbiAgdGFibGVBcnJheS5wdXNoKEpTT04uc3RyaW5naWZ5KHJlc3VsdC5zcGVjKSk7XG4gIGZvciAodmFyIG51bWJlck9mVGFibGVzID0gMDsgbnVtYmVyT2ZUYWJsZXMgPCByZXN1bHQuZGF0YS5sZW5ndGg7IG51bWJlck9mVGFibGVzKyspIHtcbiAgICB2YXIgb3V0U3RyaW5nID0gSlNPTi5zdHJpbmdpZnkocmVzdWx0LmRhdGFbbnVtYmVyT2ZUYWJsZXNdKTtcbiAgICB0YWJsZUFycmF5LnB1c2gob3V0U3RyaW5nKTtcbiAgfVxuICB0aGlzLl90YWJsZXNbbWFjcm9OYW1lXSA9IHRhYmxlQXJyYXk7XG59O1xuXG5UYWJsZXMucHJvdG90eXBlLl91dGlscyA9IHJlcXVpcmUoJy4vdXRpbHMuanMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBUYWJsZXM7XG4iLCJ2YXIgaDU0c0Vycm9yID0gcmVxdWlyZSgnLi4vZXJyb3IuanMnKTtcbnZhciBsb2dzID0gcmVxdWlyZSgnLi4vbG9ncy5qcycpO1xuXG4vKlxuKiBDb252ZXJ0IHRhYmxlIG9iamVjdCB0byBTYXMgcmVhZGFibGUgb2JqZWN0XG4qXG4qIEBwYXJhbSB7b2JqZWN0fSBpbk9iamVjdCAtIE9iamVjdCB0byBjb252ZXJ0XG4qXG4qL1xubW9kdWxlLmV4cG9ydHMuY29udmVydFRhYmxlT2JqZWN0ID0gZnVuY3Rpb24oaW5PYmplY3QsIGNodW5rVGhyZXNob2xkKSB7XG4gIHZhciBzZWxmICAgICAgICAgICAgPSB0aGlzO1xuXG4gIGlmKGNodW5rVGhyZXNob2xkID4gMzAwMDApIHtcbiAgICBjb25zb2xlLndhcm4oJ1lvdSBzaG91bGQgbm90IHNldCB0aHJlc2hvbGQgbGFyZ2VyIHRoYW4gMzBrYiBiZWNhdXNlIG9mIHRoZSBTQVMgbGltaXRhdGlvbnMnKTtcbiAgfVxuXG4gIC8vIGZpcnN0IGNoZWNrIHRoYXQgdGhlIG9iamVjdCBpcyBhbiBhcnJheVxuICBpZiAodHlwZW9mIChpbk9iamVjdCkgIT09ICdvYmplY3QnKSB7XG4gICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdUaGUgcGFyYW1ldGVyIHBhc3NlZCB0byBjaGVja0FuZEdldFR5cGVPYmplY3QgaXMgbm90IGFuIG9iamVjdCcpO1xuICB9XG5cbiAgdmFyIGFycmF5TGVuZ3RoID0gaW5PYmplY3QubGVuZ3RoO1xuICBpZiAodHlwZW9mIChhcnJheUxlbmd0aCkgIT09ICdudW1iZXInKSB7XG4gICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdUaGUgcGFyYW1ldGVyIHBhc3NlZCB0byBjaGVja0FuZEdldFR5cGVPYmplY3QgZG9lcyBub3QgaGF2ZSBhIHZhbGlkIGxlbmd0aCBhbmQgaXMgbW9zdCBsaWtlbHkgbm90IGFuIGFycmF5Jyk7XG4gIH1cblxuICB2YXIgZXhpc3RpbmdDb2xzID0ge307IC8vIHRoaXMgaXMganVzdCB0byBtYWtlIGxvb2t1cCBlYXNpZXIgcmF0aGVyIHRoYW4gdHJhdmVyc2luZyBhcnJheSBlYWNoIHRpbWUuIFdpbGwgdHJhbnNmb3JtIGFmdGVyXG5cbiAgLy8gZnVuY3Rpb24gY2hlY2tBbmRTZXRBcnJheSAtIHRoaXMgd2lsbCBjaGVjayBhbiBpbk9iamVjdCBjdXJyZW50IGtleSBhZ2FpbnN0IHRoZSBleGlzdGluZyB0eXBlQXJyYXkgYW5kIGVpdGhlciByZXR1cm4gLTEgaWYgdGhlcmVcbiAgLy8gaXMgYSB0eXBlIG1pc21hdGNoIG9yIGFkZCBhbiBlbGVtZW50IGFuZCB1cGRhdGUvaW5jcmVtZW50IHRoZSBsZW5ndGggaWYgbmVlZGVkXG5cbiAgZnVuY3Rpb24gY2hlY2tBbmRJbmNyZW1lbnQoY29sU3BlYykge1xuICAgIGlmICh0eXBlb2YgKGV4aXN0aW5nQ29sc1tjb2xTcGVjLmNvbE5hbWVdKSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIGV4aXN0aW5nQ29sc1tjb2xTcGVjLmNvbE5hbWVdICAgICAgICAgICA9IHt9O1xuICAgICAgZXhpc3RpbmdDb2xzW2NvbFNwZWMuY29sTmFtZV0uY29sTmFtZSAgID0gY29sU3BlYy5jb2xOYW1lO1xuICAgICAgZXhpc3RpbmdDb2xzW2NvbFNwZWMuY29sTmFtZV0uY29sVHlwZSAgID0gY29sU3BlYy5jb2xUeXBlO1xuICAgICAgZXhpc3RpbmdDb2xzW2NvbFNwZWMuY29sTmFtZV0uY29sTGVuZ3RoID0gY29sU3BlYy5jb2xMZW5ndGggPiAwID8gY29sU3BlYy5jb2xMZW5ndGggOiAxO1xuICAgICAgcmV0dXJuIDA7IC8vIGFsbCBva1xuICAgIH1cbiAgICAvLyBjaGVjayB0eXBlIG1hdGNoXG4gICAgaWYgKGV4aXN0aW5nQ29sc1tjb2xTcGVjLmNvbE5hbWVdLmNvbFR5cGUgIT09IGNvbFNwZWMuY29sVHlwZSkge1xuICAgICAgcmV0dXJuIC0xOyAvLyB0aGVyZSBpcyBhIGZ1ZGdlIGluIHRoZSB0eXBpbmdcbiAgICB9XG4gICAgaWYgKGV4aXN0aW5nQ29sc1tjb2xTcGVjLmNvbE5hbWVdLmNvbExlbmd0aCA8IGNvbFNwZWMuY29sTGVuZ3RoKSB7XG4gICAgICBleGlzdGluZ0NvbHNbY29sU3BlYy5jb2xOYW1lXS5jb2xMZW5ndGggPSBjb2xTcGVjLmNvbExlbmd0aCA+IDAgPyBjb2xTcGVjLmNvbExlbmd0aCA6IDE7IC8vIGluY3JlbWVudCB0aGUgbWF4IGxlbmd0aCBvZiB0aGlzIGNvbHVtblxuICAgICAgcmV0dXJuIDA7XG4gICAgfVxuICB9XG4gIHZhciBjaHVua0FycmF5Q291bnQgICAgICAgICA9IDA7IC8vIHRoaXMgaXMgZm9yIGtlZXBpbmcgdGFicyBvbiBob3cgbG9uZyB0aGUgY3VycmVudCBhcnJheSBzdHJpbmcgd291bGQgYmVcbiAgdmFyIHRhcmdldEFycmF5ICAgICAgICAgICAgID0gW107IC8vIHRoaXMgaXMgdGhlIGFycmF5IG9mIHRhcmdldCBhcnJheXNcbiAgdmFyIGN1cnJlbnRUYXJnZXQgICAgICAgICAgID0gMDtcbiAgdGFyZ2V0QXJyYXlbY3VycmVudFRhcmdldF0gID0gW107XG4gIHZhciBqICAgICAgICAgICAgICAgICAgICAgICA9IDA7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgaW5PYmplY3QubGVuZ3RoOyBpKyspIHtcbiAgICB0YXJnZXRBcnJheVtjdXJyZW50VGFyZ2V0XVtqXSA9IHt9O1xuICAgIHZhciBjaHVua1Jvd0NvdW50ICAgICAgICAgICAgID0gMDtcblxuICAgIGZvciAodmFyIGtleSBpbiBpbk9iamVjdFtpXSkge1xuICAgICAgdmFyIHRoaXNTcGVjICA9IHt9O1xuICAgICAgdmFyIHRoaXNWYWx1ZSA9IGluT2JqZWN0W2ldW2tleV07XG5cbiAgICAgIC8vc2tpcCB1bmRlZmluZWQgdmFsdWVzXG4gICAgICBpZih0aGlzVmFsdWUgPT09IHVuZGVmaW5lZCB8fCB0aGlzVmFsdWUgPT09IG51bGwpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIC8vdGhyb3cgYW4gZXJyb3IgaWYgdGhlcmUncyBOYU4gdmFsdWVcbiAgICAgIGlmKHR5cGVvZiB0aGlzVmFsdWUgPT09ICdudW1iZXInICYmIGlzTmFOKHRoaXNWYWx1ZSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcigndHlwZUVycm9yJywgJ05hTiB2YWx1ZSBpbiBvbmUgb2YgdGhlIHZhbHVlcyAoY29sdW1ucykgaXMgbm90IGFsbG93ZWQnKTtcbiAgICAgIH1cblxuICAgICAgaWYodGhpc1ZhbHVlID09PSAtSW5maW5pdHkgfHwgdGhpc1ZhbHVlID09PSBJbmZpbml0eSkge1xuICAgICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCd0eXBlRXJyb3InLCB0aGlzVmFsdWUudG9TdHJpbmcoKSArICcgdmFsdWUgaW4gb25lIG9mIHRoZSB2YWx1ZXMgKGNvbHVtbnMpIGlzIG5vdCBhbGxvd2VkJyk7XG4gICAgICB9XG5cbiAgICAgIGlmKHRoaXNWYWx1ZSA9PT0gdHJ1ZSB8fCB0aGlzVmFsdWUgPT09IGZhbHNlKSB7XG4gICAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ3R5cGVFcnJvcicsICdCb29sZWFuIHZhbHVlIGluIG9uZSBvZiB0aGUgdmFsdWVzIChjb2x1bW5zKSBpcyBub3QgYWxsb3dlZCcpO1xuICAgICAgfVxuXG4gICAgICAvLyBnZXQgdHlwZS4uLiBpZiBpdCBpcyBhbiBvYmplY3QgdGhlbiBjb252ZXJ0IGl0IHRvIGpzb24gYW5kIHN0b3JlIGFzIGEgc3RyaW5nXG4gICAgICB2YXIgdGhpc1R5cGUgID0gdHlwZW9mICh0aGlzVmFsdWUpO1xuXG4gICAgICBpZiAodGhpc1R5cGUgPT09ICdudW1iZXInKSB7IC8vIHN0cmFpZ2h0Zm9yd2FyZCBudW1iZXJcbiAgICAgICAgaWYodGhpc1ZhbHVlIDwgTnVtYmVyLk1JTl9TQUZFX0lOVEVHRVIgfHwgdGhpc1ZhbHVlID4gTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVIpIHtcbiAgICAgICAgICBsb2dzLmFkZEFwcGxpY2F0aW9uTG9nKCdPYmplY3RbJyArIGkgKyAnXS4nICsga2V5ICsgJyAtIFRoaXMgdmFsdWUgZXhjZWVkcyBleHBlY3RlZCBudW1lcmljIHByZWNpc2lvbi4nKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzU3BlYy5jb2xOYW1lICAgICAgICAgICAgICAgICAgICA9IGtleTtcbiAgICAgICAgdGhpc1NwZWMuY29sVHlwZSAgICAgICAgICAgICAgICAgICAgPSAnbnVtJztcbiAgICAgICAgdGhpc1NwZWMuY29sTGVuZ3RoICAgICAgICAgICAgICAgICAgPSA4O1xuICAgICAgICB0aGlzU3BlYy5lbmNvZGVkTGVuZ3RoICAgICAgICAgICAgICA9IHRoaXNWYWx1ZS50b1N0cmluZygpLmxlbmd0aDtcbiAgICAgICAgdGFyZ2V0QXJyYXlbY3VycmVudFRhcmdldF1bal1ba2V5XSAgPSB0aGlzVmFsdWU7XG4gICAgICB9IGVsc2UgaWYgKHRoaXNUeXBlID09PSAnc3RyaW5nJykge1xuICAgICAgICB0aGlzU3BlYy5jb2xOYW1lICAgID0ga2V5O1xuICAgICAgICB0aGlzU3BlYy5jb2xUeXBlICAgID0gJ3N0cmluZyc7XG4gICAgICAgIHRoaXNTcGVjLmNvbExlbmd0aCAgPSB0aGlzVmFsdWUubGVuZ3RoO1xuXG4gICAgICAgIGlmICh0aGlzVmFsdWUgPT09IFwiXCIpIHtcbiAgICAgICAgICB0YXJnZXRBcnJheVtjdXJyZW50VGFyZ2V0XVtqXVtrZXldID0gXCIgXCI7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGFyZ2V0QXJyYXlbY3VycmVudFRhcmdldF1bal1ba2V5XSA9IGVuY29kZVVSSUNvbXBvbmVudCh0aGlzVmFsdWUpLnJlcGxhY2UoLycvZywgJyUyNycpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXNTcGVjLmVuY29kZWRMZW5ndGggPSB0YXJnZXRBcnJheVtjdXJyZW50VGFyZ2V0XVtqXVtrZXldLmxlbmd0aDtcbiAgICAgIH0gZWxzZSBpZih0aGlzVmFsdWUgaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgICBcdGNvbnNvbGUubG9nKFwiRVJST1IgVkFMVUUgXCIsIHRoaXNWYWx1ZSlcbiAgICAgIFx0Y29uc29sZS5sb2coXCJUWVBFT0YgVkFMVUUgXCIsIHR5cGVvZiB0aGlzVmFsdWUpXG4gICAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ3R5cGVFcnJvcicsICdEYXRlIHR5cGUgbm90IHN1cHBvcnRlZC4gUGxlYXNlIHVzZSBoNTRzLnRvU2FzRGF0ZVRpbWUgZnVuY3Rpb24gdG8gY29udmVydCBpdCcpO1xuICAgICAgfSBlbHNlIGlmICh0aGlzVHlwZSA9PSAnb2JqZWN0Jykge1xuICAgICAgICB0aGlzU3BlYy5jb2xOYW1lICAgICAgICAgICAgICAgICAgICA9IGtleTtcbiAgICAgICAgdGhpc1NwZWMuY29sVHlwZSAgICAgICAgICAgICAgICAgICAgPSAnanNvbic7XG4gICAgICAgIHRoaXNTcGVjLmNvbExlbmd0aCAgICAgICAgICAgICAgICAgID0gSlNPTi5zdHJpbmdpZnkodGhpc1ZhbHVlKS5sZW5ndGg7XG4gICAgICAgIHRhcmdldEFycmF5W2N1cnJlbnRUYXJnZXRdW2pdW2tleV0gID0gZW5jb2RlVVJJQ29tcG9uZW50KEpTT04uc3RyaW5naWZ5KHRoaXNWYWx1ZSkpLnJlcGxhY2UoLycvZywgJyUyNycpO1xuICAgICAgICB0aGlzU3BlYy5lbmNvZGVkTGVuZ3RoICAgICAgICAgICAgICA9IHRhcmdldEFycmF5W2N1cnJlbnRUYXJnZXRdW2pdW2tleV0ubGVuZ3RoO1xuICAgICAgfVxuXG4gICAgICBjaHVua1Jvd0NvdW50ID0gY2h1bmtSb3dDb3VudCArIDYgKyBrZXkubGVuZ3RoICsgdGhpc1NwZWMuZW5jb2RlZExlbmd0aDtcblxuICAgICAgaWYgKGNoZWNrQW5kSW5jcmVtZW50KHRoaXNTcGVjKSA9PSAtMSkge1xuICAgICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCd0eXBlRXJyb3InLCAnVGhlcmUgaXMgYSB0eXBlIG1pc21hdGNoIGluIHRoZSBhcnJheSBiZXR3ZWVuIHZhbHVlcyAoY29sdW1ucykgb2YgdGhlIHNhbWUgbmFtZS4nKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvL3JlbW92ZSBsYXN0IGFkZGVkIHJvdyBpZiBpdCdzIGVtcHR5XG4gICAgaWYoT2JqZWN0LmtleXModGFyZ2V0QXJyYXlbY3VycmVudFRhcmdldF1bal0pLmxlbmd0aCA9PT0gMCkge1xuICAgICAgdGFyZ2V0QXJyYXlbY3VycmVudFRhcmdldF0uc3BsaWNlKGosIDEpO1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgaWYgKGNodW5rUm93Q291bnQgPiBjaHVua1RocmVzaG9sZCkge1xuICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdSb3cgJyArIGogKyAnIGV4Y2VlZHMgc2l6ZSBsaW1pdCBvZiAzMmtiJyk7XG4gICAgfSBlbHNlIGlmKGNodW5rQXJyYXlDb3VudCArIGNodW5rUm93Q291bnQgPiBjaHVua1RocmVzaG9sZCkge1xuICAgICAgLy9jcmVhdGUgbmV3IGFycmF5IGlmIHRoaXMgb25lIGlzIGZ1bGwgYW5kIG1vdmUgdGhlIGxhc3QgaXRlbSB0byB0aGUgbmV3IGFycmF5XG4gICAgICB2YXIgbGFzdFJvdyA9IHRhcmdldEFycmF5W2N1cnJlbnRUYXJnZXRdLnBvcCgpOyAvLyBnZXQgcmlkIG9mIHRoYXQgbGFzdCByb3dcbiAgICAgIGN1cnJlbnRUYXJnZXQrKzsgLy8gbW92ZSBvbnRvIHRoZSBuZXh0IGFycmF5XG4gICAgICB0YXJnZXRBcnJheVtjdXJyZW50VGFyZ2V0XSAgPSBbbGFzdFJvd107IC8vIG1ha2UgaXQgYW4gYXJyYXlcbiAgICAgIGogICAgICAgICAgICAgICAgICAgICAgICAgICA9IDA7IC8vIGluaXRpYWxpc2UgbmV3IHJvdyBjb3VudGVyIGZvciBuZXcgYXJyYXkgLSBpdCB3aWxsIGJlIGluY3JlbWVudGVkIGF0IHRoZSBlbmQgb2YgdGhlIGZ1bmN0aW9uXG4gICAgICBjaHVua0FycmF5Q291bnQgICAgICAgICAgICAgPSBjaHVua1Jvd0NvdW50OyAvLyB0aGlzIGlzIHRoZSBuZXcgY2h1bmsgbWF4IHNpemVcbiAgICB9IGVsc2Uge1xuICAgICAgY2h1bmtBcnJheUNvdW50ID0gY2h1bmtBcnJheUNvdW50ICsgY2h1bmtSb3dDb3VudDtcbiAgICB9XG4gICAgaisrO1xuICB9XG5cbiAgLy8gcmVmb3JtYXQgZXhpc3RpbmdDb2xzIGludG8gYW4gYXJyYXkgc28gc2FzIGNhbiBwYXJzZSBpdDtcbiAgdmFyIHNwZWNBcnJheSA9IFtdO1xuICBmb3IgKHZhciBrIGluIGV4aXN0aW5nQ29scykge1xuICAgIHNwZWNBcnJheS5wdXNoKGV4aXN0aW5nQ29sc1trXSk7XG4gIH1cbiAgcmV0dXJuIHtcbiAgICBzcGVjOiAgICAgICBzcGVjQXJyYXksXG4gICAgZGF0YTogICAgICAgdGFyZ2V0QXJyYXksXG4gICAganNvbkxlbmd0aDogY2h1bmtBcnJheUNvdW50XG4gIH07IC8vIHRoZSBzcGVjIHdpbGwgYmUgdGhlIG1hY3JvWzBdLCB3aXRoIHRoZSBkYXRhIHNwbGl0IGludG8gYXJyYXlzIG9mIG1hY3JvWzEtbl1cbiAgLy8gbWVhbnMgaW4gdGVybXMgb2YgZG9qbyB4aHIgb2JqZWN0IGF0IGxlYXN0IHRoZXkgbmVlZCB0byBnbyBpbnRvIHRoZSBzYW1lIGFycmF5XG59O1xuXG4vKlxuKiBDb252ZXJ0IGphdmFzY3JpcHQgZGF0ZSB0byBzYXMgdGltZVxuKlxuKiBAcGFyYW0ge29iamVjdH0ganNEYXRlIC0gamF2YXNjcmlwdCBEYXRlIG9iamVjdFxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLnRvU2FzRGF0ZVRpbWUgPSBmdW5jdGlvbiAoanNEYXRlKSB7XG4gIHZhciBiYXNlZGF0ZSA9IG5ldyBEYXRlKFwiSmFudWFyeSAxLCAxOTYwIDAwOjAwOjAwXCIpO1xuICB2YXIgY3VycmRhdGUgPSBqc0RhdGU7XG5cbiAgLy8gb2Zmc2V0cyBmb3IgVVRDIGFuZCB0aW1lem9uZXMgYW5kIEJTVFxuICB2YXIgYmFzZU9mZnNldCA9IGJhc2VkYXRlLmdldFRpbWV6b25lT2Zmc2V0KCk7IC8vIGluIG1pbnV0ZXNcbiAgdmFyIGN1cnJPZmZzZXQgPSBjdXJyZGF0ZS5nZXRUaW1lem9uZU9mZnNldCgpOyAvLyBpbiBtaW51dGVzXG5cbiAgLy8gY29udmVydCBjdXJyZGF0ZSB0byBhIHNhcyBkYXRldGltZVxuICB2YXIgb2Zmc2V0U2VjcyAgICA9IChjdXJyT2Zmc2V0IC0gYmFzZU9mZnNldCkgKiA2MDsgLy8gb2Zmc2V0RGlmZiBpcyBpbiBtaW51dGVzIHRvIHN0YXJ0IHdpdGhcbiAgdmFyIGJhc2VEYXRlU2VjcyAgPSBiYXNlZGF0ZS5nZXRUaW1lKCkgLyAxMDAwOyAvLyBnZXQgcmlkIG9mIG1zXG4gIHZhciBjdXJyZGF0ZVNlY3MgID0gY3VycmRhdGUuZ2V0VGltZSgpIC8gMTAwMDsgLy8gZ2V0IHJpZCBvZiBtc1xuICB2YXIgc2FzRGF0ZXRpbWUgICA9IE1hdGgucm91bmQoY3VycmRhdGVTZWNzIC0gYmFzZURhdGVTZWNzIC0gb2Zmc2V0U2Vjcyk7IC8vIGFkanVzdFxuXG4gIHJldHVybiBzYXNEYXRldGltZTtcbn07XG4iXX0=
