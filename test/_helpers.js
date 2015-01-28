function getRandomAsciiChars(count) {
  var str = '';

  for(var i = 0; i < count; i++) {
    var charCode = Math.floor((Math.random() * 95) + 32);
    var char = String.fromCharCode(charCode);
    str += char;
  }
  return str;
}
