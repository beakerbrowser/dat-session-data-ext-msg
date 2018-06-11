var tape = require('tape')
var hyperdrive = require('hyperdrive')
var ram = require('random-access-memory')
var {DatSessionDataExtMsg} = require('./')

tape('exchange session data', function (t) {
  // must use 2 instances to represent 2 different nodes
  var srcSessionData = new DatSessionDataExtMsg()
  var cloneSessionData = new DatSessionDataExtMsg()

  var src = hyperdrive(ram)
  var clone
  src.on('ready', function () {
    // generate source archive
    t.ok(src.writable)
    t.ok(src.metadata.writable)
    t.ok(src.content.writable)
    src.writeFile('/first.txt', 'number 1', function (err) {
      t.error(err, 'no error')
      src.writeFile('/second.txt', 'number 2', function (err) {
        t.error(err, 'no error')
        src.writeFile('/third.txt', 'number 3', function (err) {
          t.error(err, 'no error')
          t.same(src.version, 3, 'version correct')

          // generate clone instance
          clone = hyperdrive(ram, src.key)
          clone.on('ready', startReplication)
        })
      })
    })
  })

  function startReplication () {
    // wire up archives
    srcSessionData.watchDat(src)
    cloneSessionData.watchDat(clone)

    // listen to events
    var sessionDataEventCount1 = 0
    srcSessionData.on('session-data', onSessionDataEvent1)
    cloneSessionData.on('session-data', onSessionDataEvent1)
    function onSessionDataEvent1 (archive, peer, sessionData) {
      t.ok(archive)
      if (archive === src) {
        // received clone's data
        t.same(sessionData.toString('utf8'), 'bar', 'received clone data')
      }
      if (archive === clone) {
        // received src's data
        t.same(sessionData.toString('utf8'), 'foo', 'received src data')
      }
      if (++sessionDataEventCount1 === 2) {
        hasReceivedEvents1()
      }
    }

    // start replication
    var stream1 = clone.replicate({
      id: new Buffer('clone-stream'),
      live: true,
      extensions: ['session-data']
    })
    var stream2 = src.replicate({
      id: new Buffer('src-stream'),
      live: true,
      extensions: ['session-data']
    })
    stream1.pipe(stream2).pipe(stream1)

    // wait for handshakes
    var handshakeCount = 0
    stream1.on('handshake', gotHandshake)
    stream2.on('handshake', gotHandshake)

    function gotHandshake () {
      if (++handshakeCount !== 2) return

      // has support
      t.ok(srcSessionData.hasSupport(src, src.metadata.peers[0]), 'clone has support')
      t.ok(cloneSessionData.hasSupport(clone, clone.metadata.peers[0]), 'src has support')

      // no values set yet
      t.is(srcSessionData.getLocalSessionData(src), undefined, 'no session data set')
      t.is(cloneSessionData.getLocalSessionData(clone), undefined, 'no session data set')

      // set session values
      srcSessionData.setLocalSessionData(src, 'foo')
      cloneSessionData.setLocalSessionData(clone, 'bar')
    }

    function hasReceivedEvents1 () {
      srcSessionData.removeListener('session-data', onSessionDataEvent1)
      cloneSessionData.removeListener('session-data', onSessionDataEvent1)

      // examine all data
      t.ok(srcSessionData.hasSupport(src, src.metadata.peers[0]), 'clone supports')
      t.ok(cloneSessionData.hasSupport(clone, clone.metadata.peers[0]), 'src supports')
      t.is(srcSessionData.getLocalSessionData(src).toString('utf8'), 'foo', 'have local src data stored')
      t.is(cloneSessionData.getLocalSessionData(clone).toString('utf8'), 'bar', 'have local clone data stored')
      t.is(srcSessionData.getSessionData(src, src.metadata.peers[0]).toString('utf8'), 'bar', 'have remote clone data stored')
      t.is(cloneSessionData.getSessionData(clone, clone.metadata.peers[0]).toString('utf8'), 'foo', 'have remote src data stored')
      t.is(Object.keys(srcSessionData.getSessionDatas(src)).length, 1, 'only 1 remote session')
      t.is(Object.keys(cloneSessionData.getSessionDatas(clone)).length, 1, 'only 1 remote session')

      // listen to new events
      var sessionDataEventCount2 = 0
      srcSessionData.on('session-data', onSessionDataEvent2)
      cloneSessionData.on('session-data', onSessionDataEvent2)
      function onSessionDataEvent2 (archive, peer, sessionData) {
        t.ok(archive)
        if (archive === src) {
          // received clone's data
          t.same(sessionData.toString('utf8'), 'baz', 'got new remote clone session data')
        }
        if (archive === clone) {
          // received src's data
          t.same(sessionData.toString('utf8'), '', 'got new remote src session data')
        }
        if (++sessionDataEventCount2 === 2) {
          hasReceivedEvents2()
        }
      }

      // set values again
      srcSessionData.setLocalSessionData(src, undefined)
      cloneSessionData.setLocalSessionData(clone, 'baz')
    }

    function hasReceivedEvents2 () {
      // examine all data
      t.ok(srcSessionData.hasSupport(src, src.metadata.peers[0]), 'clone supports')
      t.ok(cloneSessionData.hasSupport(clone, clone.metadata.peers[0]), 'src supports')
      t.is(srcSessionData.getLocalSessionData(src).toString('utf8'), '', 'have local src data stored')
      t.is(cloneSessionData.getLocalSessionData(clone).toString('utf8'), 'baz', 'have local clone data stored')
      t.is(srcSessionData.getSessionData(src, src.metadata.peers[0]).toString('utf8'), 'baz', 'have remote clone data stored')
      t.is(cloneSessionData.getSessionData(clone, clone.metadata.peers[0]).toString('utf8'), '', 'have remote src data stored')
      t.is(Object.keys(srcSessionData.getSessionDatas(src)).length, 1, 'only 1 remote session')
      t.is(Object.keys(cloneSessionData.getSessionDatas(clone)).length, 1, 'only 1 remote session')

      // unwatch
      srcSessionData.unwatchDat(src)
      cloneSessionData.unwatchDat(clone)

      t.end()
    }
  }
})

tape('no peers causes no issue', function (t) {
  var sessionData = new DatSessionDataExtMsg()

  var src = hyperdrive(ram)
  src.on('ready', function () {
    sessionData.watchDat(src)
    sessionData.setLocalSessionData(src, 'test')
    t.is(sessionData.getLocalSessionData(src).toString('utf8'), 'test', 'got local session data')
    t.end()
  })
})

tape('throws if too large', function (t) {
  var sessionData = new DatSessionDataExtMsg()

  var src = hyperdrive(ram)
  src.on('ready', function () {
    sessionData.watchDat(src)
    try {
      sessionData.setLocalSessionData(src, 'f'.repeat(300))
      t.fail('Should have thrown')
    } catch (e) {
      t.is(e.name, 'BufferTooLargeError', 'threw BufferTooLargeError')
    }
    t.end()
  })
})
