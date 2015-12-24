describe('h54s unit -', function() {
  describe('Methods test:', function() {

    it('Should throw error if arguments are not provided', function(done) {
      var sasAdapter = new h54s();
      proclaim.throws(function() {
        sasAdapter.call();
      });
      proclaim.throws(function() {
        sasAdapter.call({});
      });
      proclaim.throws(function() {
        sasAdapter.call({
          sasProgram: 'test'
        });
      });
      proclaim.throws(function() {
        sasAdapter.call('test');
      });
      proclaim.throws(function() {
        new h54s.Tables([]);
      });
      sasAdapter.call('test', null, function() {});
      done();
    });

    it('Should throw error if credentials are missing', function(done) {
      var sasAdapter = new h54s({
        hostUrl: serverData.url
      });
      proclaim.throws(function() {
        sasAdapter.login();
      });
      proclaim.throws(function() {
        sasAdapter.login('username');
      });
      proclaim.throws(function() {
        sasAdapter.login('username', {}, function() {});
      });
      done();
    });

    it('Try to log in without credentials', function(done) {
      var sasAdapter = new h54s({
        hostUrl: serverData.url
      });
      proclaim.throws(function() {
        sasAdapter.login();
      });
      done();
    });

  });
});
