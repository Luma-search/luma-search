/**
 * Luma Autocomplete – Backend Entry Point
 * Registriert alle Autocomplete-Routen auf der Express-App.
 *
 * Verwendung in server.js:
 *   require('./autocomplete/server/index')(app, { 
 *       loadDatabase, calculator, convertCurrency, searchDbForAutocomplete, 
 *       searchQADatabase, queryTrendEngine, getClientIp 
 *   });
 */

'use strict';

const registerAutocompleteRoute   = require('./routes/autocomplete');
const registerKeywordDatabaseRoute = require('./routes/keywordDatabase');
const registerCalculatorRoute    = require('./routes/calculator');
const registerCurrencyRoute      = require('./routes/currency');
const registerProductRoute       = require('./routes/product');
const registerAnswerRoute        = require('./routes/answer');
const registerRelatedRoute       = require('./routes/related');
const registerQueryTrendRoute    = require('./routes/queryTrends');
const registerDomainGuardRoute   = require('./routes/domainGuard');
const registerChronoRoute        = require('./routes/chrono');
const registerEmojiRoute         = require('./routes/emoji');
const registerWattRoute          = require('./routes/watt');

/**
 * @param {import('express').Application} app
 * @param {{ loadDatabase: Function, calculator: object, convertCurrency: Function, searchDbForAutocomplete: Function, searchQADatabase: Function, saveQAAnswer: Function, queryTrendEngine: QueryTrendEngine, getClientIp: Function, pool: object }} deps
 */
module.exports = function registerAllAutocompleteRoutes(app, deps) {
    registerAutocompleteRoute(app, deps);
    registerKeywordDatabaseRoute(app, deps);
    registerCalculatorRoute(app, deps);
    registerCurrencyRoute(app, deps);
    registerProductRoute(app, deps);
    registerAnswerRoute(app, deps);
    registerRelatedRoute(app);
    registerQueryTrendRoute(app, deps);
    registerDomainGuardRoute(app);
    registerChronoRoute(app);
    registerEmojiRoute(app);
    registerWattRoute(app);
};
