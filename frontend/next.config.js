module.exports = { async rewrites() { return [ { source: '/api/:path*', destination: 'http://localhost:3500/api/:path*' } ] } } 
