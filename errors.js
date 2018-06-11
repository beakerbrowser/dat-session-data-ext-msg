class BufferTooLargeError extends Error {
  constructor () {
    super()
    this.name = 'BufferTooLargeError'
    this.message = 'The session data can not exceed 256 bytes in length'
    this.bufferTooLarge = true
  }
}
exports.BufferTooLargeError = BufferTooLargeError