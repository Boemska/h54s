app.controller('dashboardCtrl', ['$scope', '$location', 'sasAdapter', function($scope, $location, sasAdapter) {
  $scope.loaded = false;
  sasAdapter.call('/AJAX/h54s_test/libraryList').then(function(res) {
    $scope.libraryList = res.librarylist;
    $scope.loaded = true;
  }, function(err) {
    if(err.type === 'notLoggedinError') {
      $location.path('/login');
    }
  });

  $scope.rowCollection = [];
  $scope.displayedCollection = [].concat($scope.rowCollection);

  $scope.loadLib = function(lib) {
    $scope.libname = lib.libname;
    sasAdapter.addTable([
      {
        libraryName: lib.libname
      }
    ], 'lib');
    sasAdapter.call('/AJAX/h54s_test/datasetList').then(function(res) {
      $scope.rowCollection = res.tablelist;
    }, function(err) {
      alert(err.message);
    });
  };

  $scope.go = function(libname, memname) {
    var path = '/data/' + libname + '/' + memname;
    $location.path(path);
  };

}]);


app.controller('loginCtrl', ['$scope', '$location', 'sasAdapter', function($scope, $location, sasAdapter) {
  $scope.login = function(e) {
    if(!$scope.user)
      return;

    sasAdapter.login($scope.user.username, $scope.user.password).then(function() {
      $location.path('/');
    }, function(err) {
      $scope.error = err.message;
    });
  }
}]);

app.controller('dataCtrl', ['$scope', '$location', '$routeParams', 'sasAdapter', function($scope, $location, $routeParams, sasAdapter) {
  $scope.loaded = false;
  sasAdapter.addTable([
    {
      libname: $routeParams.libname,
      memname: $routeParams.memname
    }
  ], 'data');

  $scope.rowCollection = [];
  $scope.displayedCollection = [].concat($scope.rowCollection);
  $scope.keys = [];

  sasAdapter.call('/AJAX/h54s_test/getData').then(function(res) {
    $scope.rowCollection = res.outputdata;
    $scope.keys = Object.keys(res.outputdata[0]);
    $scope.loaded = true;
  }, function(err) {
    if(err.type === 'notLoggedinError') {
      $location.path('/login');
    } else {
      $location.path('/');
      alert(err.message);
    }
  })
}]);
