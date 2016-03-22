'use strict'

const Hapi = require('hapi')
const _ = require('highland')
const JSONStream = require('JSONStream')
const request = require('request')
const server = new Hapi.Server()
const ObjStream = require('objstream')

server.connection({ port: 3000, host: '0.0.0.0' })

// Create a highland stream of API requests
function makeRequest(endpoints) {
  return _(
    endpoints.map((path) => _(request(`http://jsonplaceholder.typicode.com/${path}`)))
  )
}

// Create a processing pipeline that handles incoming response streams
function processRequests() {
  return _.pipeline(
    // flatten the incoming array of streams into a single stream
    _.sequence(),
    // Parse JSON out of each stream
    JSONStream.parse(),
    // Do a special transform for certain payload content
    _.map(specialHello)
  )
}

// Example of detecting and touching an individual payload
function specialHello(payload) {
  if (payload.hello) {
    payload.hello += '!!!!!'
  }
  return payload
}

// Convert objectMode stream to a "normal" mode stream (necessary after JSONStream.parse())
//
// NB: this was tricky. Hapi will consume streams _only_ if they're in *not* in
// Object Mode, which our Highland streams get put into as a side effect of
// parsing them. Streams only contain strings or buffers by default
// (objectMode: false), so Hapi doesn't make any assumptions about how it
// should serialize a stream of objects for you, go figure. Issue documented
// here: https://github.com/hapijs/hapi/issues/2252
function readResultStream(results) {
  const stream = new ObjStream()
  results.pipe(stream)
  return stream
}

// Helper for making a pre method of API Request streams
function apiProxy(endpoints) {
  return (req, reply) => {
    const stream = makeRequest(endpoints)
      .pipe(processRequests())

    reply(null, stream)
  }
}

server.route({
  path: '/',
  method: 'GET',
  config: {
    pre: [
      {
        method: apiProxy([ 'users', 'todos', 'posts' ]),
        assign: 'stream'
      }
    ]
  },
  handler: (req, reply) => {
    reply(readResultStream(req.pre.stream))
  }
})


server.start((err) => {
  if (err) {
    throw err
  }

  console.log('Server running at:', server.info.uri)
})
