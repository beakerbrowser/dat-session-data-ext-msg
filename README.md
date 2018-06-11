# dat-session-data-ext-msg

Methods for implementing [DEP-0006: Session Data (Extension Message)](https://www.datprotocol.com/deps/0006-session-data-extension/).

```js
const {DatSessionDataExtMsg} = require('@beaker/dat-session-data-ext-msg')
var datSessionDataExtMsg = new DatSessionDataExtMsg()

/**
 * Step 1. Register the 'session-data' extension in the protocol streams
 */
var mySwarm = discoverySwarm(swarmDefaults({
  stream (info) {
    // add to the the protocol stream
    var stream = hypercoreProtocol({
      extensions: ['session-data']
    })
    // ...
    return stream
  }
}))

/**
 * Step 2. Wire up each dat you create
 */
datSessionDataExtMsg.watchDat(archiveOrHypercore) // can give a hyperdrive or hypercore
// datSessionDataExtMsg.unwatchDat(archiveOrHypercore) when done

/**
 * Step 3. Listen to events
 */
datSessionDataExtMsg.on('session-data', (archiveOrHypercore, peer, sessionData) => {
  // `peer` as set `sessionData` for `archiveOrHypercore`
})

/**
 * Step 4. Use the API
 */
datSessionDataExtMsg.hasSupport(archiveOrHypercore, peerId)
datSessionDataExtMsg.getSessionDatas(archiveOrHypercore)
datSessionDataExtMsg.getSessionData(archiveOrHypercore, peerId)
datSessionDataExtMsg.getLocalSessionData(archiveOrHypercore)
datSessionDataExtMsg.setLocalSessionData(archiveOrHypercore, sessionData)
```
