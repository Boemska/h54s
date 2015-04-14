/* global describe, it, assert, serverData, h54s, proclaim */
describe('h54s', function() {
  describe('init:', function() {

    it('should throw error if config data is missing or empty', function(done) {
      proclaim.doesNotThrow(function() {
        var sasAdapter = new h54s(); // jshint ignore:line
      });
      proclaim.doesNotThrow(function() {
        var sasAdapter = new h54s({}); // jshint ignore:line
      });
      done();
    });

    it('test config settings', function(done) {
      var sasAdapter;
      sasAdapter = new h54s({
        url: '/SASStoredProcess/someValue'
      });
      assert.equal('/SASStoredProcess/someValue', sasAdapter.url, 'Url is not set with config');
      sasAdapter = new h54s({
        url: '/someValue',
        hostUrl: serverData.url
      });
      assert.equal(serverData.url + 'someValue', sasAdapter.url, 'Full url is not correct');
      assert.isFalse(sasAdapter.debug, 'Debug option is not correct');
      sasAdapter = new h54s({
        debug: true
      });
      assert.isTrue(sasAdapter.debug, 'Debug option is not set');
      done();
    });

    it('Test tables object', function(done) {
      var data = new h54s.Tables([
        {
          libname: 'WORK',
          memname: 'CHOSENLIB'
        }
      ], 'data1');

      assert.isDefined(data._tables.data1, 'data1 macro not inserted');

      data.add([
        {
          libname: 'Test',
          memname: 'chl'
        }
      ], 'data2');

      assert.isDefined(data._tables.data2, 'data2 macro not inserted');

      done();
    });

  });
});
