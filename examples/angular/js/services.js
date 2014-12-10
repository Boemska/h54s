app.factory('sasAdapter', function($q) {
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
    }
  }
});
