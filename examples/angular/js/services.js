app.factory('sasAdapter', function($q, $rootScope) {
  var sasAdapter = new h54s({
    hostUrl: serverData.url
  });
  return {
    login: function(user, pass) {
      var deferred = $q.defer();
      try {
        sasAdapter.login(user, pass, function(status) {
          if(status === -1) {
            deferred.reject(new Error("Wrong username or password"));
          } else {
            deferred.resolve();
          }
        });
      } catch(e) {
        deferred.reject(e);
      }
      return deferred.promise;
    },
    call: function(sasProgram) {
      var deferred = $q.defer();
      sasAdapter.call(sasProgram, function(err, res) {
        if(err) {
          deferred.reject(err);
        } else {
          deferred.resolve(res);
        }
      });
      return deferred.promise;
    },
    addTable: function(table, macro) {
      sasAdapter.addTable(table, macro);
    },
    setDebugMode: function() {
      if(!sasAdapter.debug) {
        sasAdapter.setDebugMode();
        $rootScope.debugMode = true;
      } else {
        sasAdapter.unsetDebugMode();
        $rootScope.debugMode = false;
      }
    },
    getDebugData: function() {
      return sasAdapter.getDebugData();
    },
    getApplicationLogs: function() {
      return sasAdapter.getApplicationLogs();
    },
    getSasErrors: function() {
      return sasAdapter.getSasErrors();
    },
    setCredentials: function(user, pass) {
      return sasAdapter.setCredentials(user, pass);
    }
  };
});

app.factory('stateData', function() {
  var libs = {
    librarylist: null,
    current: {
      name: null,
      rows: null
    }
  };
  return libs;
});
