/**
 * Luma Autocomplete – Core: State Reducer
 * Alle State-Übergänge laufen durch diese reine Funktion.
 *
 * Inspiriert vom Algolia stateReducer Pattern.
 */

/**
 * @typedef {object} AutocompleteState
 * @property {string} query
 * @property {boolean} isOpen
 * @property {number|null} activeItemId
 * @property {'idle'|'loading'|'error'} status
 * @property {{ history: string[], related: string[], answer: object|null, wiki: object|null, holiday: object|null, password: object|null, aiAnswers: object[], products: object[], suggestions: object[] }} collections
 * @property {{ isQuestion: boolean, isPersonOrEntity: boolean, showProducts: boolean }} intent
 */

/** @type {AutocompleteState} */
export const initialState = {
    query: '',
    isOpen: false,
    activeItemId: null,
    status: 'idle',
    collections: {
        history:     [],
        related:     [],
        answer:      null,
        wiki:        null,
        chrono:      null,
        domainGuard: null,
        emoji:       null,
        watt:        null,
        holiday:     null,
        password:    null,
        aiAnswers:   [],
        products:    [],
        suggestions: []
    },
    intent: {
        isQuestion:       false,
        isPersonOrEntity: false,
        showProducts:     false
    }
};

/**
 * @param {AutocompleteState} state
 * @param {{ type: string, payload?: any }} action
 * @returns {AutocompleteState}
 */
export function stateReducer(state, action) {
    switch (action.type) {
        case 'SET_QUERY':
            return { ...state, query: action.payload };

        case 'SET_STATUS':
            return { ...state, status: action.payload };

        case 'SET_IS_OPEN':
            return { ...state, isOpen: action.payload };

        case 'SET_ACTIVE_ITEM':
            return { ...state, activeItemId: action.payload };

        case 'SET_COLLECTIONS':
            return { ...state, collections: { ...state.collections, ...action.payload } };

        case 'SET_INTENT':
            return { ...state, intent: { ...state.intent, ...action.payload } };

        case 'OPEN':
            return { ...state, isOpen: true };

        case 'CLOSE':
            return { ...state, isOpen: false, activeItemId: null };

        default:
            return state;
    }
}