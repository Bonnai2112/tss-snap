module.exports = function (app) {
  app.use((req, res, next) => {
    res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    if(req?.headers?.cookie) {
      res.setHeader("Cookie", req.headers.cookie.split('; ')?.find(row => row.startsWith('jwt=')))
    }
    next();
  });

};