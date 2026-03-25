/**
 * Routen-Registrierung: Bindet alle Feature-Router an die Express-App
 */
module.exports = function registerAllRoutes(app) {
    require('./collections-api')(app);
    app.use(require('./search'));
    app.use(require('./admin'));
    app.use(require('./admin-moderation'));
    app.use(require('./feedback'));
    app.use(require('./paywall'));
    app.use(require('./community'));
    app.use(require('./auth'));
    app.use(require('./user'));
    app.use(require('./tracking'));
    app.use(require('./nutzer-blocker'));
};