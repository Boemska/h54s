app.controller('dashboardCtrl', ['$scope', '$location', 'sasAdapter', function($scope, $location, sasAdapter) {
  $scope.loaded = false;
  sasAdapter.call('/AJAX/h54s_test/startupService').then(function(res) {
    $scope.sasData = res;
    $scope.loaded = true;
  }, function(err) {
    if(err.type === 'notLoggedinError') {
      $location.path('/login');
    }
  });
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
