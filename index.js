const EventEmitter = require('events')
const {BufferTooLargeError} = require('./errors')

// exported api
// =

class DatSessionDataExtMsg extends EventEmitter {
  constructor () {
    super()
    this.datWatchers = {}
  }

  getWatcher (dat) {
    var key = toStr(dat.key)
    return {key, watcher: this.datWatchers[key]}
  }

  watchDat (dat) {
    var {key, watcher} = this.getWatcher(dat)
    if (!watcher) {
      watcher = this.datWatchers[key] = new DatWatcher(dat, this)
      watcher.listen()
    }
  }

  unwatchDat (dat) {
    var {key, watcher} = this.getWatcher(dat)
    if (watcher) {
      watcher.unlisten()
      delete this.datWatchers[key]
    }
  }

  // does the given peer have protocol support?
  hasSupport (dat, remoteId) {
    var {watcher} = this.getWatcher(dat)
    if (watcher) {
      var peer = watcher.getPeer(remoteId)
      if (peer) {
        return remoteSupports(peer, 'session-data')
      }
    }
    return false
  }

  // get all stored session datas
  getSessionDatas (dat) {
    var {watcher} = this.getWatcher(dat)
    return (watcher) ? watcher.sessionDatas : {}
  }

  // get a peer's session data
  getSessionData (dat, remoteId) {
    remoteId = toRemoteId(remoteId)
    var sessionDatas = this.getSessionDatas(dat)
    return sessionDatas[toStr(remoteId)]
  }

  // get my session data
  getLocalSessionData (dat) {
    var {watcher} = this.getWatcher(dat)
    if (watcher) {
      return watcher.localSessionData
    }
  }

  // set and broadcast my session data
  setLocalSessionData (dat, sessionData) {
    var {watcher} = this.getWatcher(dat)
    if (watcher) {
      watcher.setLocalSessionData(sessionData)
      watcher.broadcastLocalSessionData()
    }
  }

  // send my session data to the given peer
  sendLocalSessionData (dat, remoteId) {
    var {watcher} = this.getWatcher(dat)
    if (watcher) {
      watcher.sendLocalSessionData(remoteId)
    }
  }
}
exports.DatSessionDataExtMsg = DatSessionDataExtMsg

// internal
// =

// helper class to track individual dats
class DatWatcher {
  constructor (dat, emitter) {
    this.dat = dat
    this.emitter = emitter
    this.localSessionData = undefined
    this.sessionDatas = {}

    this.onPeerAdd = this.onPeerAdd.bind(this)
    this.onPeerRemove = this.onPeerRemove.bind(this)
  }

  setLocalSessionData (sessionData) {
    if (typeof sessionData === 'string') {
      sessionData = Buffer.from(sessionData, 'utf8')
    }

    // validate
    if (sessionData) {
      if (Buffer.byteLength(sessionData) > 256) {
        throw new BufferTooLargeError()
      }
    } else {
      sessionData = Buffer.from([])
    }

    // store locally
    this.localSessionData = sessionData
  }

  broadcastLocalSessionData () {
    // send to peers
    var peers = this.hypercore.peers
    for (let i = 0; i < peers.length; i++) {
      if (remoteSupports(peers[i], 'session-data')) {
        getPeerFeedStream(peers[i]).extension('session-data', this.localSessionData)
      }
    }
  }

  sendLocalSessionData (remoteId) {
    var peer = this.getPeer(remoteId)
    if (remoteSupports(peer, 'session-data')) {
      getPeerFeedStream(peer).extension('session-data', this.localSessionData)
    }
  }

  listen () {
    this.hypercore.on('peer-add', this.onPeerAdd)
    this.hypercore.on('peer-remove', this.onPeerRemove)
  }

  unlisten () {
    this.hypercore.removeListener('peer-add', this.onPeerAdd)
    this.hypercore.removeListener('peer-remove', this.onPeerRemove)
  }

  get hypercore () {
    // if dat is a hyperdrive, use the metadata hypercore
    // otherwise assume dat is a hypercore already
    return this.dat.metadata ? this.dat.metadata : this.dat
  }

  getPeer (remoteId) {
    remoteId = toRemoteId(remoteId)
    return this.hypercore.peers.find(p => isSameId(remoteId, toRemoteId(p)))
  }

  onPeerAdd (peer) {
    getPeerFeedStream(peer).on('extension', (type, payload) => {
      // handle session-data messages only
      if (type !== 'session-data') return

      // enforce 256-byte limit
      if (payload) {
        if (Buffer.byteLength(payload) > 256) {
          // truncate
          payload = payload.slice(0, 256)
        }
      }

      // store
      this.sessionDatas[toStr(toRemoteId(peer))] = payload

      // emit
      this.emitter.emit('session-data', this.dat, peer, payload)
    })
  }

  onPeerRemove (peer) {
    // unstore session data
    delete this.sessionDatas[toStr(toRemoteId(peer))]
  }
}

function getPeerFeedStream (peer) {
  if (!peer) return null
  return peer.stream
}

function getPeerProtocolStream (peer) {
  var feedStream = getPeerFeedStream(peer)
  if (!feedStream) return null
  return feedStream.stream
}

function getPeerRemoteId (peer) {
  var protocolStream = getPeerProtocolStream(peer)
  if (!protocolStream) return null
  return protocolStream.remoteId
}

function remoteSupports (peer, ext) {
  var protocolStream = getPeerProtocolStream(peer)
  if (!protocolStream) return false
  return protocolStream.remoteSupports(ext)
}

function toRemoteId (peer) {
  if (peer && typeof peer === 'object') {
    return getPeerRemoteId(peer)
  }
  return peer
}

function toStr (buf) {
  if (!buf) return buf
  if (Buffer.isBuffer(buf)) return buf.toString('hex')
  return buf
}

function isSameId (a, b) {
  if (!a || !b) return false
  if (Buffer.isBuffer(a) && Buffer.isBuffer(b)) {
    return a.equals(b)
  }
  return toStr(a) === toStr(b)
}
