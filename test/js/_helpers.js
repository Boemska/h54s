/* exported getRandomAsciiChars */
function getRandomAsciiChars(count) {
  var str = '';

  for(var i = 0; i < count; i++) {
    var charCode = Math.floor((Math.random() * 95) + 32);
    var char = String.fromCharCode(charCode);
    str += char;
  }
  return str;
}

function getRandomAsciiLettersAndNumbers(count) {
  var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var str = '';

  for(var i = 0; i < count; i++) {
    str += possible[Math.floor((Math.random() * possible.length))];
  }
  return str;
}
