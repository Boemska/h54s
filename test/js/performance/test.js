/* global describe, it, assert, h54s, proclaim, response */
// response variable is defined in ./response.js
describe('h54s performance -', function() {
  it('Test performance with response.js data', function(done) {
    this.timeout(30000);
    var sasAdapter = new h54s();

    var ajaxPostDouble = td.replace(sasAdapter._ajax, 'post');
    td.when(ajaxPostDouble(sasAdapter.url, td.matchers.anything(), td.matchers.anything())).thenReturn({
      success: function(callback) {
        callback({
          responseText: response,
          status: 200
        });
        return this;
      },
      error: function() {}
    });

    var start = performance.now();
    sasAdapter.call('*', null, function(err, res) {
      var duration = Math.round(performance.now() - start);
      console.log(`Duration: ${duration}ms`);
      assert.ok(duration);
      td.reset();
      done();
    });
  });
});
