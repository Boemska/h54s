// TODO: NM this needs _some_ explanation probably

module.exports = function () {
  let timeout = 30000;
  let timeoutHandle;

  const xhr = function (type, url, data, multipartFormData, headers = {}) {
    const methods = {
      success: function () {
      },
      error: function () {
      }
    };

    const XHR = XMLHttpRequest;
    const request = new XHR('MSXML2.XMLHTTP.3.0');

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
    const str = [];
    for (let p in obj) {
      if (obj.hasOwnProperty(p)) {
        if (obj[p] instanceof Array) {
          for (let i = 0, n = obj[p].length; i < n; i++) {
            str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p][i]));
          }
        } else {
          str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p]));
        }
      }
    }
    return str.join("&");
  };

  const createMultipartFormDataPayload = function (obj) {
    let data = new FormData();
    for (let p in obj) {
      if (obj.hasOwnProperty(p)) {
        if (obj[p] instanceof Array && p !== 'file') {
          for (let i = 0, n = obj[p].length; i < n; i++) {
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
      let dataStr;
      if (typeof data === 'object') {
        dataStr = serialize(data);
      }
      const urlWithParams = dataStr ? (url + '?' + dataStr) : url;
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
