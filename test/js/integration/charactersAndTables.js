/* global describe, it, assert, serverData, h54s, getRandomAsciiChars, proclaim */
describe('h54s integration -', function () {
	describe('Characters and tables tests:', function () {

		 it('Test json character escape', function (done) {
		 	this.timeout(10000);
		 	var sasAdapter = new h54s({
		 		hostUrl: serverData.hostUrl
		 	});

		 	var data0 = "\\\"/\/\?''";
		 	var data1 = "asd\nasd\tasd\nasdasd" + String.fromCharCode(10) + "asd";

		 	var table = new h54s.SasData([
		 		{
		 			"data0": data0,
		 			"data1": data1
		 		}
		 	], 'data');

		 	sasAdapter.login(serverData.user, serverData.pass, function () {
		 		sasAdapter.call('/AJAX/h54s_test/bounceData', table, function (err, res) {
		 			assert.isUndefined(err, 'We got error on sas program ajax call');
		 			assert.isDefined(res, 'Response is undefined');
		 			assert.equal(res.outputdata[0].DATA0, data0, 'Bounce data is different - data0');
		 			assert.equal(res.outputdata[0].DATA1, data1, 'Bounce data is different - data1');
		 			done();
		 		});
		 	});
		 });


		 it('Test ascii characters', function (done) {
		 	this.timeout(10000);

		 	var sasAdapter = new h54s({
		 		hostUrl: serverData.hostUrl,
		 		debug: true
		 	});

			 var chars = {};
			 chars['data'] = '';
		 	for (var i = 33; i < 128; i++) {
		 		chars['data'] = chars['data'].concat(String.fromCharCode(i));
		 	}

		 	var table = new h54s.SasData([chars], 'data');

		 	sasAdapter.login(serverData.user, serverData.pass, function () {
		 		sasAdapter.call('/AJAX/h54s_test/bounceData', table, function (err, res) {
		 			assert.isUndefined(err, 'We got error on sas program ajax call');
					 assert.isDefined(res, 'Response is undefined');
					 returnString = ''
		 			for (var i = 33; i < 128; i++) {
						returnString = returnString.concat(String.fromCharCode(i));
					}
					assert.equal(res.outputdata[0]['DATA'], returnString, 'Some characters are not the same in response');
		 			done();
		 		});
		 	})
		 });


		it('Test long ascii string', function (done) {
			this.timeout(30000000);
			var sasAdapter = new h54s({
				hostUrl: serverData.hostUrl
			});

			var data = getRandomAsciiChars(25000);

			proclaim.doesNotThrow(function () {
				var rows = [
					{
						"data": 0 + ' ' + data
					}, {
						"data": 1 + ' ' + data
					}, {
						"data": 2 + ' ' + data
					}, {
						"data": 3 + ' ' + data
					}, {
						"data": 4 + ' ' + data
					}, {
						"data": 5 + ' ' + data
					}, {
						"data": 6 + ' ' + data
					}, {
						"data": 7 + ' ' + data
					}, {
						"data": 8 + ' ' + data
					}, {
						"data": 9 + ' ' + data
					}, {
						"data": 10 + ' ' + data
					}, {
						"data": 11 + ' ' + data
					}
				];

				var table = new h54s.SasData(rows, 'data');

				sasAdapter.login(serverData.user, serverData.pass, function () {
					sasAdapter.call('/AJAX/h54s_test/bounceData', table, function (err, res) {
						assert.isUndefined(err, 'We got error on sas program ajax call');
						assert.isDefined(res, 'Response is undefined');
						assert.equal(res.outputdata.length, 12, 'Received fewer rows than sent');
						for (var i = 0; i < res.outputdata.length; i++) {
							for (var j = 0; j < res.outputdata[i].DATA.length; j++) {
								// debugging before assertion
								if (res.outputdata[i].DATA.charAt(j) != rows[i].data.charAt(j)) {
									console.log('Issue is in char ' + j);
									console.log(res.outputdata[i].DATA.charAt(j), rows[i].data.charAt(j))
									break;
								}
							}
							assert.equal(res.outputdata[i].DATA, rows[i].data, 'Row ' + i + ' is not the same in response');
						}
						done();
					});
				})
			});
		});


		it('Test big table', function (done) {
			this.timeout(30000);
			var sasAdapter = new h54s({
				hostUrl: serverData.hostUrl
			});

			var str = getRandomAsciiChars(1000);
			var rows = [];

			//70kb
			for (var i = 0; i < 700; i++) {
				rows.push({
					data: i + str
				});
			}

			var table = new h54s.SasData(rows, 'data');

			sasAdapter.login(serverData.user, serverData.pass, function () {
				sasAdapter.call('/AJAX/h54s_test/bounceData', table, function (err, res) {
					assert.isUndefined(err, 'We got error on sas program ajax call');
					assert.isDefined(res, 'Response is undefined');
					assert.equal(res.outputdata.length, 700, 'Received less rows than sent');
					done();
				});
			})
		});

	});
});
