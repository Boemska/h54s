/* global describe, it, assert, serverData, h54s */
describe('h54s unit -', function() {
  describe('Ajax test:', function() {

    it('Ajax object', function(done) {
      var sasAdapter = new h54s();
      assert.isDefined(sasAdapter._utils.ajax, 'Ajax is not defined');
      assert.isFunction(sasAdapter._utils.ajax.setTimeout, 'Ajax setTimeout method is not defined');

      assert.isFunction(sasAdapter._utils.ajax.get, 'Ajax get method is not defined');
      assert.isFunction(sasAdapter._utils.ajax.post, 'Ajax post method is not defined');
      done();
    });

    it('Test timeout', function(done) {
      var sasAdapter = new h54s({
        ajaxTimeout: 1 //1ms
      });

      sasAdapter._utils.ajax.get(serverData.url).success(function(res) {
        assert.notOk(res, 'Ajax response is undefined');
        done();
      }).error(function() {
        //it's supposed to throw an error
        done();
      });
    });

    it('Test get', function(done) {
      var sasAdapter = new h54s();

      sasAdapter._utils.ajax.get(serverData.url, {
        testParameter: 'test'
      }).success(function(res) {
        done();
      }).error(function(err) {
        assert.notOk(err, 'Ajax get error');
        done();
      });
    });

    it('Test post', function(done) {
      var sasAdapter = new h54s();

      sasAdapter._utils.ajax.post(serverData.url, {
        testParameter: 'test'
      }).success(function(res) {
        done();
      }).error(function(err) {
        assert.notOk(err, 'Ajax post error');
        done();
      });
    });

  });
});
