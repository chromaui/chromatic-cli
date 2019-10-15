module.exports = function() {
  var tagArgs = arguments
  return tagArgs[0].reduce(function(accumulator, string, index) {
    accumulator += string
    if (index + 1 in tagArgs) accumulator += tagArgs[index + 1]
    return accumulator
  }, '')
}
